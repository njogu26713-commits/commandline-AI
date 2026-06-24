import { Router } from "express";
import { getBotState, getBotLogs, startBot, stopBot } from "../services/bot.js";
import { getWAStatus } from "../services/whatsapp.js";

const router = Router();

router.get("/bot/status", (_req, res) => {
  res.json(getBotState());
});

router.get("/bot/logs", (_req, res) => {
  res.json(getBotLogs());
});

router.post("/bot/start", (req, res) => {
  const wa = getWAStatus();
  if (!wa.connected) {
    return res.status(400).json({ error: "WhatsApp must be connected before starting the bot. Scan the QR code first." });
  }
  const { mode, intervalMinutes, pairs } = req.body;
  startBot({ mode, intervalMinutes, pairs });
  res.json({ success: true, state: getBotState() });
});

router.post("/bot/stop", (_req, res) => {
  stopBot();
  res.json({ success: true, state: getBotState() });
});

export default router;
