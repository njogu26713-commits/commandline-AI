import { Router } from "express";
import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";
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

router.post("/whatsapp/broadcast", async (req, res) => {
  try {
    const { signal } = req.body;
    if (!signal) return res.status(400).json({ error: "signal is required" });

    const subscribers = await db.select().from(subscribersTable);
    const result = await broadcastSignal(signal, subscribers as any);
    res.json(result);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Broadcast failed" });
  }
});

export default router;
