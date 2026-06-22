import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDeepAnalysis, computeTA, getKlines, getMarketData, buildMarketContext } from "./binance.js";
import { sendTypingMessages, broadcastSignal } from "./whatsapp.js";
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
  currentAction: string | null;
  scannedPairs: number;
  lastSignalPair: string | null;
}

interface ScoredSignal {
  pair: string;
  direction: "BUY" | "SELL";
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  targetPrice2: number;
  stopLoss: number;
  riskLevel: "Low" | "Medium" | "High";
  reasoning: string;
  taScore: number;
}

// ── Internal state ────────────────────────────────────────────────────────────
let state: BotState = {
  active: false,
  mode: "balanced",
  intervalMinutes: 30,
  pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT"],
  lastSignalAt: null,
  lastScanAt: null,
  signalsToday: 0,
  nextScanAt: null,
  currentAction: null,
  scannedPairs: 0,
  lastSignalPair: null,
};

let timerId: NodeJS.Timeout | null = null;

// ── Fetch recent signal history for context ───────────────────────────────────
async function getSignalHistory(pair: string, limit = 5) {
  try {
    const recent = await db.select()
      .from(tradingSignalsTable)
      .where(eq(tradingSignalsTable.pair, pair))
      .orderBy(desc(tradingSignalsTable.createdAt))
      .limit(limit);
    return recent;
  } catch { return []; }
}

async function getRecentSignals(limit = 10) {
  try {
    return await db.select()
      .from(tradingSignalsTable)
      .orderBy(desc(tradingSignalsTable.createdAt))
      .limit(limit);
  } catch { return []; }
}

// ── Deep analysis + Gemini signal for ONE pair ────────────────────────────────
async function analyzeOnePair(pair: string, apiKey: string | undefined): Promise<ScoredSignal | null> {
  try {
    const { ticker, ta, context } = await getDeepAnalysis(pair, "crypto");
    const history = await getSignalHistory(pair, 5);

    // TA-based scoring (used as baseline and fallback)
    let bullScore = 0, bearScore = 0;
    if (ta.rsi14 < 30) bullScore += 3; else if (ta.rsi14 < 40) bullScore += 2; else if (ta.rsi14 < 48) bullScore += 1;
    if (ta.rsi14 > 70) bearScore += 3; else if (ta.rsi14 > 60) bearScore += 2; else if (ta.rsi14 > 52) bearScore += 1;
    if (ta.ema9 > ta.ema21 && ta.ema21 > ta.ema50) bullScore += 3;
    else if (ta.ema9 > ta.ema21) bullScore += 1;
    if (ta.ema9 < ta.ema21 && ta.ema21 < ta.ema50) bearScore += 3;
    else if (ta.ema9 < ta.ema21) bearScore += 1;
    if (ta.macdHistogram > 0 && ta.macdLine > ta.macdSignal) bullScore += 2; else if (ta.macdHistogram > 0) bullScore += 1;
    if (ta.macdHistogram < 0 && ta.macdLine < ta.macdSignal) bearScore += 2; else if (ta.macdHistogram < 0) bearScore += 1;
    if (ta.priceVsBB === "NEAR_LOWER" || ta.priceVsBB === "BELOW_LOWER") bullScore += 2;
    if (ta.priceVsBB === "NEAR_UPPER" || ta.priceVsBB === "ABOVE_UPPER") bearScore += 2;
    if (ta.volumeSignal === "HIGH_SPIKE" || ta.volumeSignal === "ABOVE_AVG") {
      if (bullScore > bearScore) bullScore += 2; else bearScore += 2;
    }

    const taScore = Math.max(bullScore, bearScore);
    const minTaScore = state.mode === "conservative" ? 7 : state.mode === "balanced" ? 5 : 4;
    if (taScore < minTaScore || Math.abs(bullScore - bearScore) < 2) return null; // no confluence

    const taBiasDirection: "BUY" | "SELL" = bullScore > bearScore ? "BUY" : "SELL";
    const atr = ta.atr14;

    // ── Gemini deep analysis ────────────────────────────────────────────────
    if (apiKey) {
      try {
        const minConf = state.mode === "conservative" ? 78 : state.mode === "balanced" ? 70 : 62;
        const histSummary = history.length > 0
          ? history.map(h => `${h.direction} @ ${h.entryPrice} → ${h.status}${h.pnl ? ` (PNL: ${h.pnl}%)` : ""}`).join("; ")
          : "No recent history for this pair";

        const winRate = history.filter(h => h.status === "won").length / (history.filter(h => ["won","lost"].includes(h.status)).length || 1) * 100;

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are an elite autonomous crypto signal engine for CommandLine Signals.

## LIVE MULTI-TIMEFRAME MARKET DATA (Binance):
${context}

## SIGNAL HISTORY FOR ${pair}:
Recent: ${histSummary}
Win rate on this pair: ${Math.round(winRate)}%
TA bias (from indicators): ${taBiasDirection} (score: ${taScore}/12)

## YOUR TASK:
1. Cross-validate the TA bias with your analysis of ALL timeframes provided
2. Identify the highest-probability trade setup
3. Consider price action context + historical performance
4. Only signal if you have STRONG multi-timeframe confluence

Rules:
- DO NOT duplicate the last signal direction if the last one is still "active" and price hasn't moved significantly
- Minimum confidence: ${minConf}%
- Use ATR(${ta.atr14.toFixed(4)}) for TP/SL sizing. Min R:R = 2:1
- Entry must be within 0.3% of current price (${ticker.price})
- Give TWO take-profit targets (TP1 = 1:1.5, TP2 = 1:2.5+ R:R)
- If NO clear high-probability setup: return {"skip": true, "reason": "<why>"}

Respond ONLY with valid JSON:
{
  "skip": false,
  "direction": "BUY" or "SELL",
  "entryPrice": <within 0.3% of ${ticker.price}>,
  "targetPrice": <TP1>,
  "targetPrice2": <TP2>,
  "stopLoss": <key S/R level>,
  "confidence": <integer ${minConf}-94>,
  "riskLevel": "Low" or "Medium" or "High",
  "reasoning": "<2-3 sentence summary of why this setup is valid>"
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON");
        const parsed = JSON.parse(match[0]);
        if (parsed.skip) {
          logger.info({ pair, reason: parsed.reason }, "Bot: Gemini skipped — no setup");
          return null;
        }

        const direction = parsed.direction as "BUY" | "SELL";
        const entry = parseFloat(parsed.entryPrice);
        const tp1   = parseFloat(parsed.targetPrice);
        const tp2   = parseFloat(parsed.targetPrice2) || (direction === "BUY" ? entry + atr * 4 : entry - atr * 4);
        const sl    = parseFloat(parsed.stopLoss);

        // Sanity check
        if (isNaN(entry) || isNaN(tp1) || isNaN(sl)) throw new Error("Invalid prices");

        return {
          pair, direction,
          confidence: Math.min(Math.round(parsed.confidence), 94),
          entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
          riskLevel: parsed.riskLevel ?? "Medium",
          reasoning: parsed.reasoning ?? "",
          taScore,
        };
      } catch (e) {
        logger.warn({ err: e, pair }, "Gemini failed for pair, using TA fallback");
      }
    }

    // ── TA-only fallback ────────────────────────────────────────────────────
    const dir = taBiasDirection;
    const entry = ticker.price;
    const tp1  = dir === "BUY" ? entry + atr * 2.5 : entry - atr * 2.5;
    const tp2  = dir === "BUY" ? entry + atr * 4.0 : entry - atr * 4.0;
    const sl   = dir === "BUY" ? Math.max(entry - atr * 1.5, ta.support * 0.999) : Math.min(entry + atr * 1.5, ta.resistance * 1.001);
    const conf = Math.min(55 + taScore * 4, 88);

    const minConf = state.mode === "conservative" ? 78 : state.mode === "balanced" ? 68 : 60;
    if (conf < minConf) return null;

    return {
      pair, direction: dir, confidence: Math.round(conf),
      entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
      riskLevel: conf >= 82 ? "Low" : conf >= 72 ? "Medium" : "High",
      reasoning: `RSI=${ta.rsi14} · MACD ${ta.macdHistogram > 0 ? "positive" : "negative"} · EMA ${ta.ema9 > ta.ema21 ? "bullish" : "bearish"} · BB ${ta.priceVsBB} · Volume ${ta.volumeSignal}`,
      taScore,
    };
  } catch (e) {
    logger.error({ err: e, pair }, "analyzeOnePair error");
    return null;
  }
}

// ── Build WhatsApp messages with typing feel ──────────────────────────────────
function buildMessages(signal: ScoredSignal): string[] {
  const { pair, direction, entryPrice, targetPrice, targetPrice2, stopLoss, confidence, riskLevel, reasoning } = signal;
  const emoji = direction === "BUY" ? "🟢" : "🔴";
  const arrow  = direction === "BUY" ? "📈" : "📉";
  const rr1  = Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLoss);
  const rr2  = Math.abs(targetPrice2 - entryPrice) / Math.abs(entryPrice - stopLoss);
  const pct1 = ((Math.abs(targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
  const pct2 = ((Math.abs(targetPrice2 - entryPrice) / entryPrice) * 100).toFixed(2);
  const slPct = ((Math.abs(entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
  const fmt = (n: number) => n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
  const riskEmoji = riskLevel === "Low" ? "🟢" : riskLevel === "Medium" ? "🟡" : "🔴";

  const now = new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
  const date = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });

  return [
    // 1 — Alert header
    `⚡ *SIGNAL ALERT* ⚡\n${arrow} *${pair}* — *${direction}*\n\n🕐 ${date} · ${now} EAT\n\n_CommandLine Signals Bot is scanning and found a high-probability setup..._`,

    // 2 — The signal
    `━━━━━━━━━━━━━━━━━━━━━━━━\n${emoji} *${pair} ${direction}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n📍 *Entry:*     ${fmt(entryPrice)}\n🎯 *TP1:*       ${fmt(targetPrice)} (+${pct1}%)\n💎 *TP2:*       ${fmt(targetPrice2)} (+${pct2}%)\n🛑 *Stop Loss:* ${fmt(stopLoss)} (-${slPct}%)\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Confidence: *${confidence}%*\n${riskEmoji} Risk Level: *${riskLevel}*\n⚖️ R:R → TP1: *${rr1.toFixed(1)}:1* · TP2: *${rr2.toFixed(1)}:1*`,

    // 3 — AI reasoning
    `🤖 *AI Analysis:*\n\n${reasoning}\n\n📡 Source: Multi-timeframe (15m + 1h + 4h)\nRSI · MACD · EMA · Bollinger Bands · ATR`,

    // 4 — Risk management reminder
    `⚠️ *Risk Management:*\n\n• Use only 1–2% of your capital per trade\n• Set your SL at ${fmt(stopLoss)} *before* entry\n• Take partial profits at TP1 (${fmt(targetPrice)})\n• Let the rest run to TP2 (${fmt(targetPrice2)})\n\n🎯 Signal is *invalidated* if price closes the wrong side of your SL.`,

    // 5 — Closing
    `Stay sharp. Manage your risk. 💪\n\n_This signal was generated automatically by CommandLine AI after deep market analysis._\n_Reply STOP to unsubscribe._`,
  ];
}

// ── Core scan — ALL pairs in parallel, pick best ──────────────────────────────
async function scanOnce() {
  if (!state.active) return;

  state.lastScanAt   = new Date().toISOString();
  state.nextScanAt   = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
  state.currentAction = "Scanning all pairs…";
  state.scannedPairs  = 0;

  logger.info({ mode: state.mode, pairs: state.pairs }, "Bot: starting full-market scan");

  const apiKey = process.env.GEMINI_API_KEY;

  // Scan ALL pairs in parallel
  const results = await Promise.allSettled(
    state.pairs.map(async (pair) => {
      const sig = await analyzeOnePair(pair, apiKey);
      state.scannedPairs++;
      state.currentAction = `Analyzed ${state.scannedPairs}/${state.pairs.length} pairs…`;
      return sig;
    })
  );

  const signals: ScoredSignal[] = results
    .filter((r): r is PromiseFulfilledResult<ScoredSignal | null> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value as ScoredSignal)
    .sort((a, b) => b.confidence - a.confidence); // highest confidence first

  logger.info({ found: signals.length, pairs: signals.map(s => `${s.pair}:${s.direction}:${s.confidence}%`) }, "Bot: scan complete");

  if (signals.length === 0) {
    state.currentAction = "No high-probability setups found this scan";
    logger.info("Bot: no qualifying signals — will retry next interval");
    return;
  }

  // Pick the single best signal
  const best = signals[0];

  // Avoid sending a signal for a pair that already has an active signal unless it reversed direction
  const recentSignals = await getRecentSignals(5);
  const existingActive = recentSignals.find(s => s.pair === best.pair && s.status === "active");
  if (existingActive && existingActive.direction === best.direction) {
    logger.info({ pair: best.pair }, "Bot: skipping — duplicate active signal for same pair & direction");
    // Try second-best if available
    const alt = signals.find(s => !(recentSignals.find(r => r.pair === s.pair && r.status === "active" && r.direction === s.direction)));
    if (!alt) {
      state.currentAction = `No new setups — ${best.pair} already has active ${best.direction}`;
      return;
    }
    Object.assign(best, alt);
  }

  // Save to DB
  const [saved] = await db.insert(tradingSignalsTable).values({
    pair:        best.pair,
    direction:   best.direction,
    entryPrice:  best.entryPrice,
    targetPrice: best.targetPrice,
    stopLoss:    best.stopLoss,
    confidence:  best.confidence,
    category:    "crypto",
    status:      "active",
  }).returning();

  state.lastSignalAt  = new Date().toISOString();
  state.lastSignalPair = best.pair;
  state.signalsToday++;
  state.currentAction = `Signal sent: ${best.pair} ${best.direction} ${best.confidence}%`;

  logger.info({ pair: best.pair, direction: best.direction, confidence: best.confidence, riskLevel: best.riskLevel }, "Bot: best signal selected & saved");

  // Broadcast to subscribers with typing indicators
  try {
    const subs = await db.select().from(subscribersTable).where(eq(subscribersTable.status, "active"));
    const targets = subs.filter(s => s.signalType === "both" || s.signalType === "crypto");

    if (targets.length > 0) {
      const messages = buildMessages(best);

      for (const sub of targets) {
        try {
          await sendTypingMessages(sub.phone, messages, 3000);
          await new Promise(r => setTimeout(r, 1500)); // gap between subscribers
        } catch (e) {
          logger.warn({ err: e, phone: sub.phone }, "Bot: failed to send to subscriber");
        }
      }

      logger.info({ sent: targets.length }, "Bot: signals broadcast with typing indicators");
    } else {
      logger.info("Bot: signal saved but no active subscribers to broadcast to");
    }
  } catch (e) {
    logger.warn({ err: e }, "Bot: broadcast failed (signal saved to DB)");
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
  state.currentAction   = "Starting — running first market scan…";
  state.nextScanAt      = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();

  // Run first scan immediately
  scanOnce().catch(e => logger.error({ err: e }, "Bot: first scan error"));

  timerId = setInterval(() => {
    scanOnce().catch(e => logger.error({ err: e }, "Bot: scan error"));
  }, state.intervalMinutes * 60 * 1000);

  logger.info(state, "Bot: started in autonomous mode");
}

export function stopBot() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  state.active        = false;
  state.nextScanAt    = null;
  state.currentAction = null;
  logger.info("Bot: stopped");
}
