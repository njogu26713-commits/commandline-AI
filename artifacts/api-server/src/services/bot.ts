import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDeepAnalysis } from "./binance.js";
import { sendTypingMessages } from "./whatsapp.js";
import { logger } from "../lib/logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BotLog {
  time: string;
  message: string;
  type: "info" | "signal" | "skip" | "error";
}

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
  intervalMinutes: 5,
  pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT"],
  lastSignalAt: null,
  lastScanAt: null,
  signalsToday: 0,
  nextScanAt: null,
  currentAction: null,
  scannedPairs: 0,
  lastSignalPair: null,
};

let logs: BotLog[] = [];
let timerId: NodeJS.Timeout | null = null;

// ── Logging helper ────────────────────────────────────────────────────────────
function addLog(message: string, type: BotLog["type"] = "info") {
  logs.unshift({ time: new Date().toISOString(), message, type });
  if (logs.length > 150) logs.pop();
}

// ── Fetch recent signal history ───────────────────────────────────────────────
async function getSignalHistory(pair: string, limit = 5) {
  try {
    return await db.select()
      .from(tradingSignalsTable)
      .where(eq(tradingSignalsTable.pair, pair))
      .orderBy(desc(tradingSignalsTable.createdAt))
      .limit(limit);
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
    addLog(`📡 Fetching live Binance data for ${pair}…`, "info");
    const { ticker, ta } = await getDeepAnalysis(pair, "crypto");
    const history = await getSignalHistory(pair, 5);

    addLog(`📊 ${pair} — RSI: ${ta.rsi14.toFixed(1)} | EMA trend: ${ta.ema9 > ta.ema21 ? "↑ Bullish" : "↓ Bearish"} | BB: ${ta.priceVsBB} | Vol: ${ta.volumeSignal}`, "info");

    // TA scoring
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
    if (taScore < minTaScore || Math.abs(bullScore - bearScore) < 2) {
      addLog(`⏭ ${pair} — TA score ${taScore}/${minTaScore} required, weak confluence — skipping`, "skip");
      return null;
    }

    const taBiasDirection: "BUY" | "SELL" = bullScore > bearScore ? "BUY" : "SELL";
    const atr = ta.atr14;
    addLog(`🔍 ${pair} — TA bias: ${taBiasDirection} (bull ${bullScore} vs bear ${bearScore}) — running Gemini deep analysis…`, "info");

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

PAIR: ${pair}
PRICE: ${ticker.price}
RSI(14): ${ta.rsi14.toFixed(2)}
EMA9/21/50: ${ta.ema9.toFixed(2)} / ${ta.ema21.toFixed(2)} / ${ta.ema50.toFixed(2)}
MACD histogram: ${ta.macdHistogram.toFixed(4)}
Bollinger: ${ta.priceVsBB}
ATR(14): ${atr.toFixed(4)}
Volume signal: ${ta.volumeSignal}
TA bias: ${taBiasDirection} (score ${taScore}/12)
Win rate on this pair: ${Math.round(winRate)}%
Recent signals: ${histSummary}

Generate a high-probability signal. Min confidence: ${minConf}%.
If NO clear setup, return {"skip":true,"reason":"..."}

Respond ONLY with valid JSON:
{"skip":false,"direction":"BUY","entryPrice":${ticker.price},"targetPrice":0,"targetPrice2":0,"stopLoss":0,"confidence":75,"riskLevel":"Medium","reasoning":"<2-3 sentences>"}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON in response");
        const parsed = JSON.parse(match[0]);

        if (parsed.skip) {
          addLog(`⏭ ${pair} — Gemini: ${parsed.reason ?? "no high-probability setup"}`, "skip");
          return null;
        }

        const direction = parsed.direction as "BUY" | "SELL";
        const entry = parseFloat(parsed.entryPrice);
        const tp1   = parseFloat(parsed.targetPrice);
        const tp2   = parseFloat(parsed.targetPrice2) || (direction === "BUY" ? entry + atr * 4 : entry - atr * 4);
        const sl    = parseFloat(parsed.stopLoss);

        if (isNaN(entry) || isNaN(tp1) || isNaN(sl)) throw new Error("Invalid prices from AI");

        addLog(`✅ ${pair} — Gemini: ${direction} @ ${entry.toFixed(2)} | Confidence: ${parsed.confidence}% | R/R: ${(Math.abs(tp1-entry)/Math.abs(entry-sl)).toFixed(1)}:1`, "signal");

        return {
          pair, direction,
          confidence: Math.min(Math.round(parsed.confidence), 94),
          entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
          riskLevel: parsed.riskLevel ?? "Medium",
          reasoning: parsed.reasoning ?? "",
          taScore,
        };
      } catch (e: any) {
        const isQuota = e?.status === 429;
        addLog(`⚠ ${pair} — Gemini ${isQuota ? "daily quota reached — using TA fallback" : `error: ${e?.message ?? "unknown"} — using TA fallback`}`, isQuota ? "skip" : "error");
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

    if (conf < minConf) {
      addLog(`⏭ ${pair} — TA fallback confidence ${conf}% below minimum ${minConf}% — skipping`, "skip");
      return null;
    }

    addLog(`📈 ${pair} — TA signal: ${dir} @ ${entry.toFixed(2)} | Conf: ${Math.round(conf)}% (TA-only)`, "signal");

    return {
      pair, direction: dir, confidence: Math.round(conf),
      entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
      riskLevel: conf >= 82 ? "Low" : conf >= 72 ? "Medium" : "High",
      reasoning: `RSI=${ta.rsi14.toFixed(1)} · MACD ${ta.macdHistogram > 0 ? "positive" : "negative"} · EMA ${ta.ema9 > ta.ema21 ? "bullish" : "bearish"} · BB ${ta.priceVsBB} · Volume ${ta.volumeSignal}`,
      taScore,
    };
  } catch (e: any) {
    addLog(`❌ ${pair} — analysis failed: ${e?.message ?? "unknown error"}`, "error");
    return null;
  }
}

// ── Build WhatsApp messages ───────────────────────────────────────────────────
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
    `⚡ *SIGNAL ALERT* ⚡\n${arrow} *${pair}* — *${direction}*\n\n🕐 ${date} · ${now} EAT\n\n_CommandLine Signals Bot found a high-probability setup..._`,
    `━━━━━━━━━━━━━━━━━━━━━━━━\n${emoji} *${pair} ${direction}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n📍 *Entry:*     ${fmt(entryPrice)}\n🎯 *TP1:*       ${fmt(targetPrice)} (+${pct1}%)\n💎 *TP2:*       ${fmt(targetPrice2)} (+${pct2}%)\n🛑 *Stop Loss:* ${fmt(stopLoss)} (-${slPct}%)\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Confidence: *${confidence}%*\n${riskEmoji} Risk Level: *${riskLevel}*\n⚖️ R:R → TP1: *${rr1.toFixed(1)}:1* · TP2: *${rr2.toFixed(1)}:1*`,
    `🤖 *AI Analysis:*\n\n${reasoning}\n\n📡 Source: Multi-timeframe RSI · MACD · EMA · Bollinger Bands · ATR`,
    `⚠️ *Risk Management:*\n\n• Use only 1–2% of your capital per trade\n• Set your SL at ${fmt(stopLoss)} *before* entry\n• Take partial profits at TP1 (${fmt(targetPrice)})\n• Let the rest run to TP2 (${fmt(targetPrice2)})\n\n🎯 Signal is *invalidated* if price closes past your SL.`,
    `Stay sharp. Manage your risk. 💪\n\n_This signal was generated automatically by CommandLine AI._\n_Reply STOP to unsubscribe._`,
  ];
}

// ── Core scan — ALL pairs in parallel, pick best ──────────────────────────────
async function scanOnce() {
  if (!state.active) return;

  state.lastScanAt    = new Date().toISOString();
  state.nextScanAt    = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
  state.currentAction = "Scanning all pairs…";
  state.scannedPairs  = 0;

  addLog(`🚀 Scan started — ${state.pairs.length} pairs | Mode: ${state.mode} | Interval: ${state.intervalMinutes} min`, "info");

  const apiKey = process.env.GEMINI_API_KEY;

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
    .sort((a, b) => b.confidence - a.confidence);

  addLog(`🔎 Scan complete — ${signals.length} qualifying setup${signals.length !== 1 ? "s" : ""} found out of ${state.pairs.length} pairs`, "info");

  if (signals.length === 0) {
    state.currentAction = "No high-probability setups found this scan";
    addLog("💤 No qualifying setups — waiting for next scan in " + state.intervalMinutes + " min", "skip");
    return;
  }

  const best = signals[0];
  addLog(`🏆 Best setup: ${best.pair} ${best.direction} @ ${best.entryPrice.toFixed(2)} | ${best.confidence}% confidence | Risk: ${best.riskLevel}`, "signal");

  const recentSignals = await getRecentSignals(5);
  const existingActive = recentSignals.find(s => s.pair === best.pair && s.status === "active");
  if (existingActive && existingActive.direction === best.direction) {
    addLog(`⚠ ${best.pair} already has active ${best.direction} signal — checking alternatives…`, "skip");
    const alt = signals.find(s => !(recentSignals.find(r => r.pair === s.pair && r.status === "active" && r.direction === s.direction)));
    if (!alt) {
      state.currentAction = `No new setups — ${best.pair} already has active ${best.direction}`;
      addLog("💤 All top setups duplicate active signals — will retry next scan", "skip");
      return;
    }
    Object.assign(best, alt);
    addLog(`↩ Using alternative: ${best.pair} ${best.direction} @ ${best.entryPrice.toFixed(2)}`, "info");
  }

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

  state.lastSignalAt   = new Date().toISOString();
  state.lastSignalPair = best.pair;
  state.signalsToday++;
  state.currentAction  = `Signal sent: ${best.pair} ${best.direction} ${best.confidence}%`;
  addLog(`💾 Signal #${saved.id} saved — ${best.pair} ${best.direction} @ ${best.entryPrice.toFixed(2)}`, "signal");

  try {
    const subs = await db.select().from(subscribersTable).where(eq(subscribersTable.status, "active"));
    const targets = subs.filter(s => s.signalType === "both" || s.signalType === "crypto");

    if (targets.length > 0) {
      addLog(`📲 Broadcasting to ${targets.length} WhatsApp subscriber${targets.length !== 1 ? "s" : ""}…`, "info");
      const messages = buildMessages(best);
      for (const sub of targets) {
        try {
          await sendTypingMessages(sub.phone, messages, 3000);
          await new Promise(r => setTimeout(r, 1500));
        } catch (e: any) {
          addLog(`⚠ Failed to send to +${sub.phone}: ${e?.message ?? "unknown"}`, "error");
        }
      }
      addLog(`✅ Broadcast complete — signal delivered to ${targets.length} subscriber${targets.length !== 1 ? "s" : ""}`, "signal");
    } else {
      addLog("📭 Signal saved to DB — no active WhatsApp subscribers yet", "info");
    }
  } catch (e: any) {
    addLog(`❌ Broadcast error: ${e?.message ?? "unknown"}`, "error");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getBotState(): BotState {
  return { ...state };
}

export function getBotLogs(): BotLog[] {
  return [...logs];
}

export function startBot(opts: {
  mode?: "conservative" | "balanced" | "aggressive";
  intervalMinutes?: number;
  pairs?: string[];
}) {
  if (state.active) stopBot();

  state.active          = true;
  state.mode            = opts.mode ?? state.mode;
  state.intervalMinutes = opts.intervalMinutes ?? 5;
  state.pairs           = opts.pairs ?? state.pairs;
  state.signalsToday    = 0;
  state.currentAction   = "Starting — running first market scan…";
  state.nextScanAt      = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();

  logs = [];
  addLog(`🤖 Bot activated — Mode: ${state.mode} | Interval: ${state.intervalMinutes} min | Watching ${state.pairs.length} pairs`, "info");
  addLog(`📋 Pairs: ${state.pairs.join(" · ")}`, "info");

  scanOnce().catch(e => {
    addLog(`❌ First scan failed: ${e?.message ?? "unknown error"}`, "error");
  });

  timerId = setInterval(() => {
    scanOnce().catch(e => {
      addLog(`❌ Scan error: ${e?.message ?? "unknown error"}`, "error");
    });
  }, state.intervalMinutes * 60 * 1000);

  logger.info(state, "Bot: started in autonomous mode");
}

export function stopBot() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  state.active        = false;
  state.nextScanAt    = null;
  state.currentAction = null;
  addLog("🔴 Bot stopped", "info");
  logger.info("Bot: stopped");
}
