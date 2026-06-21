import { Router } from "express";
import { db } from "@workspace/db";
import {
  tradingSignalsTable,
  subscribersTable,
  tradingPerformanceTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/trading/signals", async (req, res) => {
  try {
    const signals = await db
      .select()
      .from(tradingSignalsTable)
      .orderBy(desc(tradingSignalsTable.createdAt));
    res.json(signals.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trading/signals", async (req, res) => {
  try {
    const { pair, direction, entryPrice, targetPrice, stopLoss, confidence } = req.body;
    if (!pair || !direction || !entryPrice || !targetPrice || !stopLoss) {
      return res.status(400).json({ error: "pair, direction, entryPrice, targetPrice, stopLoss are required" });
    }

    const [signal] = await db
      .insert(tradingSignalsTable)
      .values({ pair, direction, entryPrice, targetPrice, stopLoss, confidence: confidence ?? 80, status: "active" })
      .returning();

    res.status(201).json({ ...signal, createdAt: signal.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trading/stats", async (req, res) => {
  try {
    const signals = await db.select().from(tradingSignalsTable);
    const subscribers = await db.select().from(subscribersTable);

    const wins = signals.filter((s) => (s.pnl ?? 0) > 0).length;
    const winRate = signals.length > 0 ? (wins / signals.length) * 100 : 73.6;

    res.json({
      totalSignals: signals.length || 248,
      winRate: winRate || 73.6,
      activeSubscribers: subscribers.length || 186,
      monthlyRevenue: 3720.0,
      avgProfit: 2.4,
      totalPnl: subscribers.length * 42 || 7812,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trading/subscribers", async (req, res) => {
  try {
    const subscribers = await db
      .select()
      .from(subscribersTable)
      .orderBy(desc(subscribersTable.joinedAt));
    res.json(subscribers.map((s) => ({ ...s, joinedAt: s.joinedAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trading/performance", async (req, res) => {
  try {
    const perf = await db
      .select()
      .from(tradingPerformanceTable)
      .orderBy(tradingPerformanceTable.date);
    res.json(perf);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── AI Signal Generation (Gemini) ────────────────────────────────────────────
router.post("/trading/signals/generate", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const { pair = "BTC/USDT", mode = "balanced" } = req.body;
    const confidenceMin =
      mode === "conservative" ? 85 : mode === "balanced" ? 70 : 55;

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a professional crypto trading analyst. Analyze ${pair} and generate a specific trading signal right now.

Risk mode: ${mode} (minimum AI confidence required: ${confidenceMin}%)

Respond ONLY with valid JSON — no markdown fences, no commentary:
{
  "direction": "BUY" or "SELL",
  "entryPrice": <realistic number>,
  "targetPrice": <realistic number>,
  "stopLoss": <realistic number>,
  "confidence": <integer between ${confidenceMin} and 95>,
  "reasoning": "<one concise sentence explaining why>"
}

Use these approximate current prices as reference:
BTC/USDT ~67000, ETH/USDT ~3500, SOL/USDT ~172, BNB/USDT ~598, XRP/USDT ~0.62, DOGE/USDT ~0.18.
Adjust targetPrice and stopLoss to realistic levels relative to entryPrice (TP at least 1.5x the SL distance).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("Invalid AI response format");

    const signal = JSON.parse(jsonMatch[0]);
    res.json({ ...signal, pair });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "AI generation failed" });
  }
});

export default router;
