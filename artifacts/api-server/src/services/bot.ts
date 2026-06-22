import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMarketData, getKlines, buildMarketContext, computeTA, type Kline } from "./binance.js";
import { broadcastSignal } from "./whatsapp.js";
import { logger } from "../lib/logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BotState {
  active: boolean;
  mode: "conservative" | "balanced" | "aggressive";
  intervalMinutes: number;
  pairs: string[];
  lastSignalAt: string | null;
  lastScanAt: string | null;
  signalsToday: number;
  nextScanAt: string | null;
}

// ── Internal state ────────────────────────────────────────────────────────────
let state: BotState = {
  active: false,
  mode: "balanced",
  intervalMinutes: 30,
  pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
  lastSignalAt: null,
  lastScanAt: null,
  signalsToday: 0,
  nextScanAt: null,
};

let timerId: NodeJS.Timeout | null = null;
let pairIndex = 0;

interface TaSignal {
  direction: "BUY" | "SELL";
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskLevel: "Low" | "Medium" | "High";
}

// Multi-indicator TA signal using RSI + MACD + EMA + BB + volume confluence
function analyzeTA(klines: Kline[], currentPrice: number, mode: string): TaSignal | null {
  if (klines.length < 50) return null;

  const ticker = { price: currentPrice } as any;
  const ta = computeTA(klines, ticker);

  // Score bullish/bearish signals
  let bullScore = 0;
  let bearScore = 0;

  // RSI
  if (ta.rsi14 < 35) bullScore += 2;
  else if (ta.rsi14 < 45) bullScore += 1;
  if (ta.rsi14 > 65) bearScore += 2;
  else if (ta.rsi14 > 55) bearScore += 1;

  // EMA trend alignment
  if (ta.ema9 > ta.ema21 && ta.ema21 > ta.ema50) bullScore += 2;
  else if (ta.ema9 > ta.ema21) bullScore += 1;
  if (ta.ema9 < ta.ema21 && ta.ema21 < ta.ema50) bearScore += 2;
  else if (ta.ema9 < ta.ema21) bearScore += 1;

  // MACD
  if (ta.macdHistogram > 0 && ta.macdLine > ta.macdSignal) bullScore += 2;
  else if (ta.macdHistogram > 0) bullScore += 1;
  if (ta.macdHistogram < 0 && ta.macdLine < ta.macdSignal) bearScore += 2;
  else if (ta.macdHistogram < 0) bearScore += 1;

  // Bollinger Band position
  if (ta.priceVsBB === "NEAR_LOWER" || ta.priceVsBB === "BELOW_LOWER") bullScore += 2;
  if (ta.priceVsBB === "NEAR_UPPER" || ta.priceVsBB === "ABOVE_UPPER") bearScore += 2;

  // Volume confirmation
  if (ta.volumeSignal === "HIGH_SPIKE" || ta.volumeSignal === "ABOVE_AVG") {
    if (bullScore > bearScore) bullScore += 1;
    else bearScore += 1;
  }

  const minScore = mode === "conservative" ? 7 : mode === "balanced" ? 5 : 4;
  let direction: "BUY" | "SELL" | null = null;
  let confidence = 0;

  if (bullScore >= minScore && bullScore > bearScore + 1) {
    direction  = "BUY";
    confidence = Math.min(55 + bullScore * 4, 90);
  } else if (bearScore >= minScore && bearScore > bullScore + 1) {
    direction  = "SELL";
    confidence = Math.min(55 + bearScore * 4, 90);
  }

  if (!direction) return null;

  // ATR-based TP/SL
  const atr = ta.atr14;
  let targetPrice: number;
  let stopLoss: number;

  if (direction === "BUY") {
    stopLoss    = Math.max(currentPrice - atr * 1.5, ta.support * 0.999);
    targetPrice = currentPrice + atr * 3;
  } else {
    stopLoss    = Math.min(currentPrice + atr * 1.5, ta.resistance * 1.001);
    targetPrice = currentPrice - atr * 3;
  }

  const riskLevel: "Low" | "Medium" | "High" =
    confidence >= 82 ? "Low" : confidence >= 72 ? "Medium" : "High";

  return {
    direction,
    confidence: Math.round(confidence),
    entryPrice:  Math.round(currentPrice * 10000) / 10000,
    targetPrice: Math.round(targetPrice * 10000) / 10000,
    stopLoss:    Math.round(stopLoss * 10000) / 10000,
    riskLevel,
  };
}

// ── Generate with Gemini + multi-indicator TA, else pure TA ──────────────────
async function generateSignal(pair: string): Promise<TaSignal | null> {
  try {
    const [ticker, klines] = await Promise.all([
      getMarketData(pair, "crypto"),
      getKlines(pair, "1h", 100),
    ]);

    const marketContext = buildMarketContext(ticker, klines);
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const mode    = state.mode;
        const minConf = mode === "conservative" ? 80 : mode === "balanced" ? 72 : 65;

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are an elite crypto trading signal engine for CommandLine Signals bot.

## LIVE MULTI-INDICATOR MARKET DATA (Binance):
${marketContext}

## TASK:
Perform a professional technical analysis on ${pair}. Risk mode: ${mode}. Min confidence: ${minConf}%.

Rules:
- Only generate a signal if RSI + MACD + EMA ALL agree on direction (3-indicator confluence)
- Use ATR for realistic TP/SL placement, minimum 1.5:1 risk/reward ratio
- Entry must be within 0.5% of current price (${ticker.price})
- If no clear high-probability setup exists, return {"skip": true}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "direction": "BUY" or "SELL",
  "entryPrice": <number within 0.5% of ${ticker.price}>,
  "targetPrice": <number, min 1.5x the risk distance away>,
  "stopLoss": <number, based on key support/resistance level>,
  "confidence": <integer ${minConf}-92>,
  "riskLevel": "Low" or "Medium" or "High"
}`;

        const result = await model.generateContent(prompt);
        const text   = result.response.text().trim();
        const match  = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON in response");
        const parsed = JSON.parse(match[0]);
        if (parsed.skip) return null;

        // Validate parsed values are numbers
        if (typeof parsed.direction !== "string" || typeof parsed.confidence !== "number") throw new Error("Invalid JSON shape");

        return {
          direction:   parsed.direction as "BUY" | "SELL",
          confidence:  Math.min(Math.round(parsed.confidence), 92),
          entryPrice:  parseFloat(parsed.entryPrice),
          targetPrice: parseFloat(parsed.targetPrice),
          stopLoss:    parseFloat(parsed.stopLoss),
          riskLevel:   (parsed.riskLevel ?? "Medium") as "Low" | "Medium" | "High",
        };
      } catch (e) {
        logger.warn({ err: e }, "Gemini failed, falling back to TA");
      }
    }

    return analyzeTA(klines, ticker.price, state.mode);
  } catch (e) {
    logger.error({ err: e, pair }, "Signal generation error");
    return null;
  }
}

// ── Core scan loop ────────────────────────────────────────────────────────────
async function scanOnce() {
  if (!state.active) return;

  const pair = state.pairs[pairIndex % state.pairs.length];
  pairIndex++;
  state.lastScanAt = new Date().toISOString();
  state.nextScanAt = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();

  logger.info({ pair, mode: state.mode }, "Bot: scanning pair");

  const signal = await generateSignal(pair);
  if (!signal) {
    logger.info({ pair }, "Bot: no signal this scan");
    return;
  }

  // Save to DB
  const [saved] = await db.insert(tradingSignalsTable).values({
    pair,
    direction:   signal.direction,
    entryPrice:  signal.entryPrice,
    targetPrice: signal.targetPrice,
    stopLoss:    signal.stopLoss,
    confidence:  signal.confidence,
    category:    "crypto",
    status:      "active",
  }).returning();

  state.lastSignalAt = new Date().toISOString();
  state.signalsToday++;

  logger.info({ pair, direction: signal.direction, confidence: signal.confidence }, "Bot: signal generated & saved");

  // Broadcast if WhatsApp connected
  try {
    const subs = await db.select().from(subscribersTable).where(eq(subscribersTable.status, "active"));
    const targets = subs.filter(s => s.signalType === "both" || s.signalType === "crypto");
    if (targets.length > 0) {
      await broadcastSignal({ ...saved, createdAt: saved.createdAt.toISOString() }, targets as any);
      logger.info({ count: targets.length }, "Bot: signal broadcast to subscribers");
    }
  } catch (e) {
    logger.warn({ err: e }, "Bot: WhatsApp broadcast failed (continuing)");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getBotState(): BotState {
  return { ...state };
}

export function startBot(opts: {
  mode?: "conservative" | "balanced" | "aggressive";
  intervalMinutes?: number;
  pairs?: string[];
}) {
  if (state.active) stopBot();

  state.active          = true;
  state.mode            = opts.mode ?? state.mode;
  state.intervalMinutes = opts.intervalMinutes ?? state.intervalMinutes;
  state.pairs           = opts.pairs ?? state.pairs;
  state.signalsToday    = 0;
  state.nextScanAt      = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();

  // Run first scan immediately
  scanOnce().catch(e => logger.error({ err: e }, "Bot: first scan error"));

  timerId = setInterval(() => {
    scanOnce().catch(e => logger.error({ err: e }, "Bot: scan error"));
  }, state.intervalMinutes * 60 * 1000);

  logger.info(state, "Bot: started");
}

export function stopBot() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  state.active     = false;
  state.nextScanAt = null;
  logger.info("Bot: stopped");
}
