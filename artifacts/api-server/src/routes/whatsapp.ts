import { Router } from "express";
import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  connectWhatsApp,
  disconnectWA,
  getWAStatus,
  broadcastSignal,
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

export default router;
