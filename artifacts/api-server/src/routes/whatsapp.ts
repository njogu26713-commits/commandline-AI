import { Router } from "express";
import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  connectWhatsApp,
  disconnectWA,
  getWAStatus,
  broadcastSignal,
  createSignalGroup,
  linkGroupByInvite,
  addToSignalGroup,
  removeFromSignalGroup,
  getSignalGroupInfo,
  checkNumbersOnWhatsApp,
} from "../services/whatsapp.js";

const router = Router();

router.get("/whatsapp/status", (_req, res) => {
  res.json(getWAStatus());
});

router.post("/whatsapp/connect", async (req, res) => {
  try {
    connectWhatsApp();
    res.json({ message: "Connecting…" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to start WhatsApp connection" });
  }
});

router.post("/whatsapp/disconnect", (_req, res) => {
  disconnectWA();
  res.json({ message: "Disconnected" });
});

router.post("/whatsapp/test", async (req, res) => {
  try {
    const status = getWAStatus();
    if (!status.connected || !status.phone) {
      return res.status(400).json({ error: "WhatsApp not connected" });
    }
    const { sendWAMessage } = await import("../services/whatsapp.js");
    const testMsg = [
      `🧪 *Test Message — CommandLine AI*`,
      ``,
      `✅ Your WhatsApp bot connection is working perfectly!`,
      ``,
      `📊 When you broadcast a signal from the dashboard, your subscribers will receive:`,
      `  1️⃣  A preparation alert (incoming signal warning)`,
      `  2️⃣  The full signal with Entry, TP & Stop Loss`,
      ``,
      `🤖 _CommandLine AI is ready to send live trading signals._`,
    ].join("\n");
    await sendWAMessage(status.phone, testMsg);
    res.json({ success: true, sentTo: status.phone });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Test message failed" });
  }
});

router.post("/whatsapp/broadcast", async (req, res) => {
  try {
    const { signal } = req.body;
    if (!signal) return res.status(400).json({ error: "signal is required" });

    // Filter subscribers by their signal path preference
    const category: string = signal.category ?? "crypto";
    const allSubscribers = await db
      .select()
      .from(subscribersTable)
      .where(eq(subscribersTable.status, "active"));

    const targetSubscribers = allSubscribers.filter((s) => {
      const t = s.signalType ?? "both";
      return t === "both" || t === category;
    });

    const result = await broadcastSignal(signal, targetSubscribers as any);
    res.json({ ...result, category, filtered: targetSubscribers.length, total: allSubscribers.length });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Broadcast failed" });
  }
});

// ── Number Validator ─────────────────────────────────────────────────────────
router.get("/whatsapp/validate", async (_req, res) => {
  try {
    const status = getWAStatus();
    if (!status.connected) return res.status(400).json({ error: "WhatsApp not connected" });
    const subs = await db.select().from(subscribersTable);
    const phones = subs.map(s => s.phone);
    const results = await checkNumbersOnWhatsApp(phones);
    const payload = subs.map(s => ({
      id: s.id,
      phone: s.phone,
      name: s.name,
      onWhatsApp: results[s.phone] ?? null,
    }));
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Validation failed" });
  }
});

// ── WhatsApp Group routes ─────────────────────────────────────────────────────
router.get("/whatsapp/groups/info", async (_req, res) => {
  try {
    const info = await getSignalGroupInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to get group info" });
  }
});

router.post("/whatsapp/groups/link", async (req, res) => {
  try {
    const status = getWAStatus();
    if (!status.connected) return res.status(400).json({ error: "WhatsApp not connected" });
    const { inviteLink } = req.body;
    if (!inviteLink) return res.status(400).json({ error: "inviteLink is required" });
    const result = await linkGroupByInvite(inviteLink);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to link group" });
  }
});

router.post("/whatsapp/groups/create", async (req, res) => {
  try {
    const status = getWAStatus();
    if (!status.connected) return res.status(400).json({ error: "WhatsApp not connected" });
    const name = req.body.name ?? "CommandLine Signals 🔥";
    const allSubs = await db.select().from(subscribersTable).where(eq(subscribersTable.status, "active"));
    const phones = allSubs.map(s => s.phone);
    if (phones.length === 0) {
      return res.status(400).json({
        error: "no_subscribers",
        message: "You have no active subscribers yet. Add at least one subscriber first, then create the group.",
      });
    }
    const result = await createSignalGroup(name, phones);
    res.json({ ...result, members: phones.length });
  } catch (err: any) {
    const msg = err.message ?? "Group creation failed";
    res.status(500).json({ error: msg });
  }
});

router.post("/whatsapp/groups/add", async (req, res) => {
  try {
    const { phones } = req.body;
    if (!phones?.length) return res.status(400).json({ error: "phones array is required" });
    const result = await addToSignalGroup(phones);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to add members" });
  }
});

router.post("/whatsapp/groups/remove", async (req, res) => {
  try {
    const { phones } = req.body;
    if (!phones?.length) return res.status(400).json({ error: "phones array is required" });
    const result = await removeFromSignalGroup(phones);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to remove members" });
  }
});

export default router;
