import { Router } from "express";
import { db } from "@workspace/db";
import { aiSessionsTable, aiMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getMarketData, getKlines, buildMarketContext } from "../services/binance.js";

const router = Router();

// ── Known crypto pairs to auto-detect in user messages ───────────────────────
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
  BNBUSDT: "BNBUSDT", XRPUSDT: "XRPUSDT",
};

function detectPairs(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const [keyword, symbol] of Object.entries(KNOWN_PAIRS)) {
    if (upper.includes(keyword)) found.add(symbol);
  }
  return Array.from(found).slice(0, 3);
}

async function fetchLiveContext(pairs: string[]): Promise<string> {
  if (pairs.length === 0) pairs = ["BTCUSDT", "ETHUSDT"];
  const results = await Promise.allSettled(
    pairs.map(async (pair) => {
      const [ticker, klines] = await Promise.all([
        getMarketData(pair, "crypto"),
        getKlines(pair, "1h", 20),
      ]);
      return buildMarketContext(ticker, klines);
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .join("\n\n---\n\n");
}

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get("/ai/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(aiSessionsTable).orderBy(desc(aiSessionsTable.updatedAt));
    res.json(sessions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai/sessions", async (req, res) => {
  try {
    const { title, projectId } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const [session] = await db.insert(aiSessionsTable).values({ title, projectId: projectId ?? null }).returning();
    res.status(201).json({ ...session, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const messages = await db.select().from(aiMessagesTable).where(eq(aiMessagesTable.sessionId, id)).orderBy(aiMessagesTable.createdAt);
    res.json(messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Messages — real Gemini AI + live Binance data ─────────────────────────────
router.post("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    // Save user message
    await db.insert(aiMessagesTable).values({ sessionId: id, role: "user", content }).returning();

    // Load conversation history for context
    const history = await db.select().from(aiMessagesTable)
      .where(eq(aiMessagesTable.sessionId, id))
      .orderBy(aiMessagesTable.createdAt);

    let aiContent: string;

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      // Detect which pairs the user is asking about
      const pairs   = detectPairs(content);
      const liveCtx = await fetchLiveContext(pairs).catch(() => "");

      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `You are CommandLine AI — an expert cryptocurrency and forex market analyst for the CommandLine Signals trading bot platform.

Your role:
- Analyze live market data and give clear, actionable trading insights
- Suggest BUY/SELL signals with entry, target, and stop-loss levels when asked
- Explain market conditions, trends, and price action in plain English
- Be direct and confident — traders need clear answers, not vague hedging
- Format numbers clearly (e.g. BTC at $67,420, TP at $69,000, SL at $66,500)
- Use emojis sparingly to highlight key points (🟢 BUY, 🔴 SELL, ⚠️ caution, 📊 data)
- Keep responses concise but complete — no fluff

When you have live market data, always reference actual prices in your analysis.
Always remind users to use proper risk management (1-2% per trade).`,
      });

      const chatHistory = history.slice(0, -1).slice(-10).map((m) => ({
        role: m.role === "user" ? "user" as const : "model" as const,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: chatHistory });

      const userPrompt = liveCtx
        ? `${content}\n\n## LIVE MARKET DATA (Binance, just fetched):\n${liveCtx}`
        : content;

      const result = await chat.sendMessage(userPrompt);
      aiContent = result.response.text();

      // Auto-title session on first message
      if (history.length <= 2) {
        const titleResult = await model.generateContent(
          `Generate a very short session title (max 5 words) for this trading chat. User said: "${content}". Reply with ONLY the title, no quotes.`
        );
        const newTitle = titleResult.response.text().trim().slice(0, 50);
        await db.update(aiSessionsTable).set({ title: newTitle, updatedAt: new Date() }).where(eq(aiSessionsTable.id, id));
      }
    } else {
      aiContent = `⚠️ **Gemini AI not configured.**\n\nTo enable real market analysis, add your \`GEMINI_API_KEY\` to the environment variables.\n\nWithout it, the AI Analyst cannot generate live insights or trading suggestions.`;
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
