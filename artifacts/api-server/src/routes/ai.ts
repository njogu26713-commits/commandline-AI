import { Router } from "express";
import { db } from "@workspace/db";
import { aiSessionsTable, aiMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDeepAnalysis } from "../services/binance.js";

const router = Router();

const KNOWN_PAIRS: Record<string, string> = {
  BTC: "BTCUSDT", BITCOIN: "BTCUSDT",
  ETH: "ETHUSDT", ETHEREUM: "ETHUSDT",
  SOL: "SOLUSDT", SOLANA: "SOLUSDT",
  BNB: "BNBUSDT",
  XRP: "XRPUSDT",
  DOGE: "DOGEUSDT", DOGECOIN: "DOGEUSDT",
  ADA: "ADAUSDT", CARDANO: "ADAUSDT",
  MATIC: "MATICUSDT", POLYGON: "MATICUSDT",
  BTCUSDT: "BTCUSDT", ETHUSDT: "ETHUSDT", SOLUSDT: "SOLUSDT",
  BNBUSDT: "BNBUSDT", XRPUSDT: "XRPUSDT", DOGEUSDT: "DOGEUSDT",
};

function detectPairs(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const [keyword, symbol] of Object.entries(KNOWN_PAIRS)) {
    if (upper.includes(keyword)) found.add(symbol);
  }
  // Default to BTC + ETH if nothing mentioned
  if (found.size === 0) { found.add("BTCUSDT"); found.add("ETHUSDT"); }
  return Array.from(found).slice(0, 3);
}

const SYSTEM_PROMPT = `You are CommandLine AI — an elite cryptocurrency trading analyst and signal provider for the CommandLine Signals bot.

## Your expertise:
- Professional technical analysis using RSI, MACD, EMA crossovers, Bollinger Bands, ATR, support/resistance
- Multi-timeframe analysis (MTF confluence) — 15m, 1h, 4h alignment
- High-probability trade setups with minimum 75%+ confidence
- Risk management: proper position sizing, R:R ratios minimum 1.5:1

## Signal format (use this EXACTLY when giving a signal):
━━━━━━━━━━━━━━━━━━━━━━━
🎯 SIGNAL: [PAIR] [BUY/SELL]
━━━━━━━━━━━━━━━━━━━━━━━
📍 Entry:      [price]
🎯 Target 1:   [price] (+X%)
🎯 Target 2:   [price] (+X%)
🛑 Stop Loss:  [price] (-X%)
📊 Confidence: [X]%
⚖️ Risk/Reward: [X:1]
⏱️ Timeframe:  [15m / 1h / 4h]
━━━━━━━━━━━━━━━━━━━━━━━
📋 ANALYSIS:
• [Reason 1 — specific indicator/level]
• [Reason 2]
• [Reason 3]
⚠️ Invalidated if price closes below/above [level]
━━━━━━━━━━━━━━━━━━━━━━━

## Rules:
- ONLY give signals when at least 3 indicators align (RSI + MACD + EMA + volume)
- MTF confluence required: 2+ timeframes must agree on direction
- Never give a signal below 72% confidence — say "NO CLEAR SETUP" instead
- Always give 2 take-profit targets
- Entry must be within 0.5% of current price
- Stop loss must be below/above a key support/resistance level
- Use ATR to calculate realistic TP and SL distances
- Be concise and direct — traders need clarity, not essays
- When asked for market overview, scan all provided pairs and rank them`;

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get("/ai/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(aiSessionsTable).orderBy(desc(aiSessionsTable.updatedAt));
    res.json(sessions.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/ai/sessions", async (req, res) => {
  try {
    const { title, projectId } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const [session] = await db.insert(aiSessionsTable).values({ title, projectId: projectId ?? null }).returning();
    res.status(201).json({ ...session, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const messages = await db.select().from(aiMessagesTable).where(eq(aiMessagesTable.sessionId, id)).orderBy(aiMessagesTable.createdAt);
    res.json(messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── Messages — real Gemini AI + deep multi-timeframe Binance analysis ─────────
router.post("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    // Save user message
    await db.insert(aiMessagesTable).values({ sessionId: id, role: "user", content }).returning();

    // Load recent conversation history
    const history = await db.select().from(aiMessagesTable)
      .where(eq(aiMessagesTable.sessionId, id))
      .orderBy(aiMessagesTable.createdAt);

    let aiContent: string;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      aiContent = `⚠️ **Gemini AI key not configured.**\n\nAdd your GEMINI_API_KEY to environment secrets to enable live AI market analysis.`;
    } else {
      // Fetch deep multi-timeframe analysis for detected pairs
      const pairs = detectPairs(content);
      const analyses = await Promise.allSettled(
        pairs.map(p => getDeepAnalysis(p, "crypto"))
      );
      const marketContext = analyses
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(r => r.value.context)
        .join("\n\n");

      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT,
      });

      const chatHistory = history.slice(0, -1).slice(-8).map(m => ({
        role: m.role === "user" ? "user" as const : "model" as const,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: chatHistory });

      const userPrompt = marketContext
        ? `USER REQUEST: ${content}\n\n## LIVE MULTI-TIMEFRAME MARKET DATA (just fetched from Binance):\n\n${marketContext}\n\nBased on this data, provide your expert analysis and signal(s).`
        : content;

      const result = await chat.sendMessage(userPrompt);
      aiContent = result.response.text();

      // Auto-title on first user message
      if (history.length <= 2) {
        try {
          const titleRes = await model.generateContent(
            `Generate a very short session title (max 5 words, no quotes) for this trading chat. User said: "${content}"`
          );
          const newTitle = titleRes.response.text().trim().slice(0, 50);
          await db.update(aiSessionsTable).set({ title: newTitle, updatedAt: new Date() }).where(eq(aiSessionsTable.id, id));
        } catch {}
      }
    }

    const [aiMsg] = await db.insert(aiMessagesTable).values({ sessionId: id, role: "assistant", content: aiContent }).returning();
    const msgCount = await db.select().from(aiMessagesTable).where(eq(aiMessagesTable.sessionId, id));
    await db.update(aiSessionsTable).set({ messageCount: msgCount.length, updatedAt: new Date() }).where(eq(aiSessionsTable.id, id));

    res.status(201).json({ ...aiMsg, createdAt: aiMsg.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
