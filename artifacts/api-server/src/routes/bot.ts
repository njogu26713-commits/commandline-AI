import { Router } from "express";
import { getBotState, getBotLogs, startBot, stopBot } from "../services/bot.js";

const router = Router();

router.get("/bot/status", (_req, res) => {
  res.json(getBotState());
});

router.get("/bot/logs", (_req, res) => {
  res.json(getBotLogs());
});

router.post("/bot/start", (req, res) => {
  const { mode, intervalMinutes, pairs } = req.body;
  startBot({ mode, intervalMinutes, pairs });
  res.json({ success: true, state: getBotState() });
});

router.post("/bot/stop", (_req, res) => {
  stopBot();
  res.json({ success: true, state: getBotState() });
});

export default router;
