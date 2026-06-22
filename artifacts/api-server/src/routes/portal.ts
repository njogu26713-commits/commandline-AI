import { Router } from "express";
import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const PLANS: Record<string, { name: string; amount: number; duration: number; signals: string; description: string; perks: string[] }> = {
  basic:   { name: "Basic",   amount: 500,  duration: 30, signals: "Crypto only",     description: "5 crypto signals/day", perks: ["5 signals/day", "BTC · ETH · SOL", "WhatsApp delivery", "Entry · TP · SL"] },
  premium: { name: "Premium", amount: 1000, duration: 30, signals: "Crypto + Forex",  description: "15 signals/day",       perks: ["15 signals/day", "All crypto pairs", "Forex pairs", "AI analysis", "Priority delivery"] },
  vip:     { name: "VIP",     amount: 2000, duration: 30, signals: "All + Priority",  description: "Unlimited signals",    perks: ["Unlimited signals", "All markets", "Earliest delivery", "Dedicated support", "Performance reports"] },
};

// GET /api/portal/plans
router.get("/portal/plans", (_req, res) => {
  res.json(PLANS);
});

// POST /api/portal/check  { phone }
router.post("/portal/check", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "phone required" });

    const clean = phone.replace(/[^0-9+]/g, "");
    const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.phone, clean));

    if (!sub) return res.json({ registered: false });

    const now = new Date();
    const endsAt = sub.subscriptionEndsAt ? new Date(sub.subscriptionEndsAt) : null;
    const active = sub.status === "active" && (!endsAt || endsAt > now);
    const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86400000)) : null;

    res.json({
      registered: true,
      id: sub.id,
      name: sub.name,
      plan: sub.plan,
      status: sub.status,
      active,
      daysLeft,
      subscriptionEndsAt: endsAt?.toISOString() ?? null,
      botConnected: !!sub.botConnectedAt,
      botConnectedAt: sub.botConnectedAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portal/register  { phone, name, plan }
router.post("/portal/register", async (req, res) => {
  try {
    const { phone, name, plan = "basic" } = req.body;
    if (!phone || !name) return res.status(400).json({ error: "phone and name required" });
    if (!PLANS[plan]) return res.status(400).json({ error: "invalid plan" });

    const clean = phone.replace(/[^0-9+]/g, "");
    const planData = PLANS[plan];
    const endsAt = new Date(Date.now() + planData.duration * 24 * 60 * 60 * 1000);

    const existing = await db.select().from(subscribersTable).where(eq(subscribersTable.phone, clean));
    if (existing.length > 0) {
      const [updated] = await db.update(subscribersTable)
        .set({ name, plan, status: "active", subscriptionEndsAt: endsAt })
        .where(eq(subscribersTable.phone, clean))
        .returning();
      return res.json({ success: true, subscriber: updated, renewed: true });
    }

    const signalType = plan === "basic" ? "crypto" : "both";
    const [sub] = await db.insert(subscribersTable).values({
      phone: clean, name, plan, status: "active",
      signalType, subscriptionEndsAt: endsAt,
    }).returning();

    res.status(201).json({ success: true, subscriber: sub, renewed: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portal/connect  { phone }  — sends WhatsApp welcome message
router.post("/portal/connect", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "phone required" });

    const clean = phone.replace(/[^0-9+]/g, "");
    const [sub] = await db.select().from(subscribersTable).where(eq(subscribersTable.phone, clean));
    if (!sub) return res.status(404).json({ error: "Subscriber not found. Please register first." });

    // Try to send a WhatsApp welcome message via Baileys
    let waConnected = false;
    try {
      const { sendWAMessage, getWAStatus } = await import("../services/whatsapp.js");
      const waState = getWAStatus();
      if (waState.connected) {
        // Format phone for WhatsApp JID
        const jid = clean.replace(/^\+/, "").replace(/^0/, "254");
        const planData = PLANS[sub.plan];
        const endsAt = sub.subscriptionEndsAt ? new Date(sub.subscriptionEndsAt) : null;
        const endsStr = endsAt ? endsAt.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";

        const msg = `╔══════════════════════════╗
║  ⚡ COMMANDLINE SIGNALS   ║
║     BOT CONNECTED ✅      ║
╚══════════════════════════╝

Hey ${sub.name}! 👋

Your bot is now *LIVE* and connected to this number.

📦 Plan: *${planData.name.toUpperCase()}*
📅 Expires: *${endsStr}*
📡 Signals: *${planData.signals}*

You'll receive real-time trading signals directly here on WhatsApp.

Each signal includes:
• Entry price
• Take Profit targets (TP1 & TP2)
• Stop Loss level
• Confidence % + Risk rating

Stay sharp. Stay profitable. 🎯

_CommandLine Signals — AI-Powered Trading Bot_`;

        await sendWAMessage(jid, msg);
        waConnected = true;
      }
    } catch (e) {
      // WhatsApp send failed — still mark as connected
    }

    // Update botConnectedAt in DB
    await db.update(subscribersTable)
      .set({ botConnectedAt: new Date() })
      .where(eq(subscribersTable.phone, clean));

    res.json({
      success: true,
      waMessageSent: waConnected,
      message: waConnected
        ? "Bot connected! Welcome message sent to your WhatsApp."
        : "Bot connected! WhatsApp admin not online — you'll receive signals when the bot is active.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
