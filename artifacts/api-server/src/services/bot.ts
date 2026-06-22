import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMarketData, getKlines, buildMarketContext, type Kline } from "./binance.js";
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

// ── Simple TA helpers ─────────────────────────────────────────────────────────
function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? -c : 0));
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

interface TaSignal {
  direction: "BUY" | "SELL";
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskLevel: "Low" | "Medium" | "High";
}

function analyzeTA(klines: Kline[], currentPrice: number, mode: string): TaSignal | null {
  if (klines.length < 25) return null;

  const closes = klines.map(k => k.close);
  const rsi    = calcRSI(closes, 14);
  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);

  const lastEma9  = ema9[ema9.length - 1];
  const prevEma9  = ema9[ema9.length - 2];
  const lastEma21 = ema21[ema21.length - 1];
  const prevEma21 = ema21[ema21.length - 2];

  const emaCrossBull = prevEma9 <= prevEma21 && lastEma9 > lastEma21;
  const emaCrossBear = prevEma9 >= prevEma21 && lastEma9 < lastEma21;

  const rsiOversold    = rsi < (mode === "aggressive" ? 40 : 35);
  const rsiOverbought  = rsi > (mode === "aggressive" ? 60 : 65);
  const rsiNeutralBull = rsi > 45 && rsi < 60;
  const rsiNeutralBear = rsi > 40 && rsi < 55;

  let direction: "BUY" | "SELL" | null = null;
  let confidence = 70;

  if (emaCrossBull && (rsiOversold || rsiNeutralBull)) {
    direction  = "BUY";
    confidence = rsiOversold ? 82 : 73;
  } else if (emaCrossBear && (rsiOverbought || rsiNeutralBear)) {
    direction  = "SELL";
    confidence = rsiOverbought ? 82 : 73;
  } else if (rsiOversold && mode === "aggressive") {
    direction  = "BUY";
    confidence = 68;
  } else if (rsiOverbought && mode === "aggressive") {
    direction  = "SELL";
    confidence = 68;
  }

  if (!direction) return null;

  const minConf = mode === "conservative" ? 80 : mode === "balanced" ? 70 : 65;
  if (confidence < minConf) return null;

  const atr = klines.slice(-14).reduce((sum, k) => sum + (k.high - k.low), 0) / 14;

  let targetPrice: number;
  let stopLoss: number;

  if (direction === "BUY") {
    stopLoss    = currentPrice - atr * 1.2;
    targetPrice = currentPrice + atr * 2.5;
  } else {
    stopLoss    = currentPrice + atr * 1.2;
    targetPrice = currentPrice - atr * 2.5;
  }

  const riskLevel: "Low" | "Medium" | "High" =
    confidence >= 80 ? "Low" : confidence >= 70 ? "Medium" : "High";

  return {
    direction,
    confidence: Math.round(confidence),
    entryPrice:  Math.round(currentPrice * 10000) / 10000,
    targetPrice: Math.round(targetPrice * 10000) / 10000,
    stopLoss:    Math.round(stopLoss * 10000) / 10000,
    riskLevel,
  };
}

// ── Generate with Gemini (if key available), else pure TA ─────────────────────
async function generateSignal(pair: string): Promise<TaSignal | null> {
  try {
    const [ticker, klines] = await Promise.all([
      getMarketData(pair, "crypto"),
      getKlines(pair, "1h", 50),
    ]);

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const marketContext = buildMarketContext(ticker, klines);
        const mode          = state.mode;
        const minConf       = mode === "conservative" ? 82 : mode === "balanced" ? 68 : 55;

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are a professional cryptocurrency trader for CommandLine Signals.

## LIVE MARKET DATA (Binance):
${marketContext}

## TASK:
Analyze and generate a crypto trading signal. Risk mode: ${mode} (min confidence: ${minConf}%).

If there is NO clear signal with at least ${minConf}% confidence, respond with: {"skip": true}

Otherwise respond ONLY with valid JSON (no markdown):
{
  "direction": "BUY" or "SELL",
  "entryPrice": <within 0.3% of current price ${ticker.price}>,
  "targetPrice": <take profit, min 1.5:1 RR>,
  "stopLoss": <tight, support/resistance based>,
  "confidence": <integer ${minConf}-95>,
  "riskLevel": "Low" or "Medium" or "High"
}`;

        const result = await model.generateContent(prompt);
        const text   = result.response.text().trim();
        const match  = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON");
        const parsed = JSON.parse(match[0]);
        if (parsed.skip) return null;

        return {
          direction:   parsed.direction,
          confidence:  parsed.confidence,
          entryPrice:  parsed.entryPrice,
          targetPrice: parsed.targetPrice,
          stopLoss:    parsed.stopLoss,
          riskLevel:   parsed.riskLevel ?? "Medium",
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
