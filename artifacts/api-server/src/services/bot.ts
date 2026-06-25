import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getDeepAnalysis, getForexRate, getTicker, getMarketData } from "./binance.js";
import { sendTypingMessages, getWAStatus, sendMessageToGroup, sendTypingMessagesToGroup, generateGroupSignalMessages, getSignalGroupInfo } from "./whatsapp.js";
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
  pairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "EURUSD", "GBPUSD", "XAUUSD"],
  lastSignalAt: null,
  lastScanAt: null,
  signalsToday: 0,
  nextScanAt: null,
  currentAction: null,
  scannedPairs: 0,
  lastSignalPair: null,
};

// How many minutes to wait for confirmation before broadcasting a signal
let confirmationWaitMinutes = 3;

// ── Market session detector ────────────────────────────────────────────────────
interface MarketSession {
  name: string;
  tradeable: boolean;
  quality: "peak" | "good" | "moderate" | "low";
  emoji: string;
  reason: string;
}

function getMarketSession(): MarketSession {
  const utcHour = new Date().getUTCHours();

  // London–NY overlap (peak): 13:00–16:00 UTC
  if (utcHour >= 13 && utcHour < 16) {
    return { name: "London–NY Overlap", tradeable: true, quality: "peak", emoji: "🔥",
      reason: "Peak liquidity — London & New York both active. Best time to trade." };
  }
  // New York session: 13:00–21:00 UTC
  if (utcHour >= 16 && utcHour < 21) {
    return { name: "New York Session", tradeable: true, quality: "good", emoji: "🟢",
      reason: "NY session in full swing — high crypto & forex volume." };
  }
  // London session: 08:00–13:00 UTC
  if (utcHour >= 8 && utcHour < 13) {
    return { name: "London Session", tradeable: true, quality: "good", emoji: "🟢",
      reason: "London session open — strong forex and crypto movement." };
  }
  // Asian session: 00:00–08:00 UTC (moderate)
  if (utcHour >= 0 && utcHour < 8) {
    return { name: "Asian Session", tradeable: true, quality: "moderate", emoji: "🟡",
      reason: "Asian session — moderate volume. Crypto pairs preferred. Signals may be smaller." };
  }
  // Dead zone: 21:00–24:00 UTC
  return { name: "Dead Zone", tradeable: false, quality: "low", emoji: "🔴",
    reason: "Low-volume window (NY close, London not yet open). Signals are unreliable — waiting." };
}

// Build the group session-status message
function buildSessionMessage(session: MarketSession, nextScanMin: number): string {
  const now = new Date();
  const utcTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;

  if (!session.tradeable) {
    return (
      `⚠️ *MARKET UPDATE — ${utcTime}*\n\n` +
      `${session.emoji} *${session.name}*\n` +
      `❌ *NOT a good time to trade right now.*\n\n` +
      `📋 ${session.reason}\n\n` +
      `⏰ Next check in ${nextScanMin} minute${nextScanMin !== 1 ? "s" : ""}. Stay patient — quality over quantity. 💪`
    );
  }
  const qualityLabel = session.quality === "peak" ? "🔥 PEAK CONDITIONS" :
                       session.quality === "good"  ? "✅ GOOD CONDITIONS" : "⚡ MODERATE CONDITIONS";
  return (
    `📊 *MARKET UPDATE — ${utcTime}*\n\n` +
    `${session.emoji} *${session.name}*\n` +
    `${qualityLabel}\n\n` +
    `📋 ${session.reason}\n\n` +
    `🤖 AI scanning ${state.pairs.length} pairs now... Next update in ${nextScanMin} min.`
  );
}

// Build the confirmation-wait message sent to group
function buildConfirmationMessage(pair: string, direction: string, confidence: number, waitMin: number): string {
  return (
    `⏳ *SIGNAL DETECTED — CONFIRMING...*\n\n` +
    `🎯 *${pair} ${direction}* | ${confidence}% confidence\n\n` +
    `🔍 AI is waiting *${waitMin} minute${waitMin !== 1 ? "s" : ""}* to confirm the setup holds before sending the full signal.\n\n` +
    `_Stay ready — signal incoming shortly._ 🚀`
  );
}

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


// ── Pair type detection ───────────────────────────────────────────────────────
function isForexPair(pair: string): boolean {
  const clean = pair.replace(/[\/\-]/g, "").toUpperCase();
  return !["USDT", "USDC", "BTC", "ETH", "BNB"].some(s => clean.endsWith(s));
}

// ── Forex-specific analysis (price from exchange rate API, Gemini analysis) ───
async function analyzeForexPair(pair: string, apiKey: string | undefined): Promise<ScoredSignal | null> {
  try {
    addLog(`📡 Fetching live forex rate for ${pair}…`, "info");
    const ticker = await getForexRate(pair);
    const range  = ticker.high24h - ticker.low24h;
    const atr    = range > 0 ? range / 2 : ticker.price * 0.005;
    const pricePos = range > 0 ? (ticker.price - ticker.low24h) / range : 0.5;
    const bias: "BUY" | "SELL" = pricePos < 0.4 ? "BUY" : "SELL";

    addLog(`📊 ${pair} — Rate: ${ticker.price.toFixed(5)} | 24h: ${ticker.low24h.toFixed(5)}–${ticker.high24h.toFixed(5)} | Position: ${(pricePos * 100).toFixed(0)}% of range | Bias: ${bias}`, "info");

    if (apiKey) {
      try {
        const minConf = state.mode === "conservative" ? 78 : state.mode === "balanced" ? 70 : 62;
        const history = await getSignalHistory(pair, 5);
        const histSummary = history.length > 0
          ? history.map(h => `${h.direction} @ ${h.entryPrice} → ${h.status}${h.pnl ? ` (PNL: ${h.pnl}%)` : ""}`).join("; ")
          : "No recent history for this pair";

        const Groq = (await import("groq-sdk")).default;
        const groq = new Groq({ apiKey });

        const prompt = `You are an elite autonomous forex signal engine for CommandLine Signals.

PAIR: ${pair}
CURRENT RATE: ${ticker.price.toFixed(5)}
24H HIGH: ${ticker.high24h.toFixed(5)}
24H LOW:  ${ticker.low24h.toFixed(5)}
24H RANGE: ${range.toFixed(5)} (${((range / ticker.price) * 100).toFixed(3)}%)
PRICE POSITION IN RANGE: ${(pricePos * 100).toFixed(0)}% from low
TREND BIAS: ${bias} (price near ${pricePos < 0.4 ? "daily low — potential reversal up" : pricePos > 0.6 ? "daily high — potential reversal down" : "mid-range"})
ATR PROXY (half daily range): ${atr.toFixed(5)}
Recent signals: ${histSummary}

Generate a high-probability forex signal. Min confidence: ${minConf}%.
If NO clear setup, return {"skip":true,"reason":"..."}

Respond ONLY with valid JSON:
{"skip":false,"direction":"BUY","entryPrice":${ticker.price},"targetPrice":0,"targetPrice2":0,"stopLoss":0,"confidence":72,"riskLevel":"Medium","reasoning":"<2-3 sentences>"}`;

        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        });
        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON in response");
        const parsed = JSON.parse(match[0]);

        if (parsed.skip) {
          addLog(`⏭ ${pair} — AI Forex: ${parsed.reason ?? "no high-probability setup"}`, "skip");
          return null;
        }

        const direction = parsed.direction as "BUY" | "SELL";
        const entry = parseFloat(parsed.entryPrice);
        const tp1   = parseFloat(parsed.targetPrice);
        const tp2   = parseFloat(parsed.targetPrice2) || (direction === "BUY" ? entry + atr * 2.5 : entry - atr * 2.5);
        const sl    = parseFloat(parsed.stopLoss);

        if (isNaN(entry) || isNaN(tp1) || isNaN(sl)) throw new Error("Invalid prices from AI");

        addLog(`✅ ${pair} — AI Forex: ${direction} @ ${entry.toFixed(5)} | Confidence: ${parsed.confidence}% | R/R: ${(Math.abs(tp1 - entry) / Math.abs(entry - sl)).toFixed(1)}:1`, "signal");

        return {
          pair, direction,
          confidence: Math.min(Math.round(parsed.confidence), 94),
          entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
          riskLevel: parsed.riskLevel ?? "Medium",
          reasoning: parsed.reasoning ?? "",
          taScore: 6,
        };
      } catch (e: any) {
        addLog(`⚠ ${pair} — AI Forex error: ${e?.message ?? "unknown"} — skipping pair`, "error");
        return null;
      }
    }

    addLog(`⏭ ${pair} — no GROQ_API_KEY configured — skipping`, "skip");
    return null;
  } catch (e: any) {
    addLog(`❌ ${pair} — Forex analysis failed: ${e?.message ?? "unknown error"}`, "error");
    return null;
  }
}

// ── Deep analysis + Gemini signal for ONE crypto pair ─────────────────────────
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
    const minTaScore = state.mode === "conservative" ? 6 : state.mode === "balanced" ? 3 : 2;
    const minGap    = state.mode === "conservative" ? 2 : 1;
    if (taScore < minTaScore || Math.abs(bullScore - bearScore) < minGap) {
      addLog(`⏭ ${pair} — TA score ${taScore}/${minTaScore} required, weak confluence — skipping`, "skip");
      return null;
    }

    const taBiasDirection: "BUY" | "SELL" = bullScore > bearScore ? "BUY" : "SELL";
    const atr = ta.atr14;
    addLog(`🔍 ${pair} — TA bias: ${taBiasDirection} (bull ${bullScore} vs bear ${bearScore}) — running AI deep analysis…`, "info");

    // ── Groq AI deep analysis ───────────────────────────────────────────────
    if (apiKey) {
      try {
        const minConf = state.mode === "conservative" ? 78 : state.mode === "balanced" ? 70 : 62;
        const histSummary = history.length > 0
          ? history.map(h => `${h.direction} @ ${h.entryPrice} → ${h.status}${h.pnl ? ` (PNL: ${h.pnl}%)` : ""}`).join("; ")
          : "No recent history for this pair";
        const winRate = history.filter(h => h.status === "won").length / (history.filter(h => ["won","lost"].includes(h.status)).length || 1) * 100;

        const Groq = (await import("groq-sdk")).default;
        const groq = new Groq({ apiKey });

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

        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        });
        const text = completion.choices[0]?.message?.content?.trim() ?? "";
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error("No JSON in response");
        const parsed = JSON.parse(match[0]);

        if (parsed.skip) {
          addLog(`⏭ ${pair} — AI: ${parsed.reason ?? "no high-probability setup"}`, "skip");
          return null;
        }

        const direction = parsed.direction as "BUY" | "SELL";
        const entry = parseFloat(parsed.entryPrice);
        const tp1   = parseFloat(parsed.targetPrice);
        const tp2   = parseFloat(parsed.targetPrice2) || (direction === "BUY" ? entry + atr * 4 : entry - atr * 4);
        const sl    = parseFloat(parsed.stopLoss);

        if (isNaN(entry) || isNaN(tp1) || isNaN(sl)) throw new Error("Invalid prices from AI");

        addLog(`✅ ${pair} — AI: ${direction} @ ${entry.toFixed(2)} | Confidence: ${parsed.confidence}% | R/R: ${(Math.abs(tp1-entry)/Math.abs(entry-sl)).toFixed(1)}:1`, "signal");

        return {
          pair, direction,
          confidence: Math.min(Math.round(parsed.confidence), 94),
          entryPrice: entry, targetPrice: tp1, targetPrice2: tp2, stopLoss: sl,
          riskLevel: parsed.riskLevel ?? "Medium",
          reasoning: parsed.reasoning ?? "",
          taScore,
        };
      } catch (e: any) {
        addLog(`⚠ ${pair} — AI error: ${e?.message ?? "unknown"} — skipping pair`, "error");
        return null;
      }
    }

    addLog(`⏭ ${pair} — no GROQ_API_KEY configured — skipping`, "skip");
    return null;
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

  // ── Market session check + group broadcast ──────────────────────────────────
  const session = getMarketSession();
  addLog(`📅 Market session: ${session.emoji} ${session.name} (${session.quality}) — tradeable: ${session.tradeable}`, "info");

  const waStatus = getWAStatus();
  if (waStatus.connected) {
    try {
      const groupInfo = await getSignalGroupInfo();
      if (groupInfo.exists) {
        const sessionMsg = buildSessionMessage(session, state.intervalMinutes);
        await sendMessageToGroup(sessionMsg);
        addLog(`📢 Session update sent to group: ${session.name}`, "info");
      }
    } catch (e: any) {
      addLog(`⚠ Could not send session update to group: ${e?.message ?? "unknown"}`, "error");
    }
  }

  // Skip scan entirely during dead zone (low volume, unreliable signals)
  if (!session.tradeable) {
    state.currentAction = `⏸ Dead zone — skipping scan until ${session.name} ends`;
    addLog(`⏸ Scan skipped — ${session.name}: ${session.reason}`, "skip");
    return;
  }

  addLog(`🚀 Scan started — ${state.pairs.length} pairs | Mode: ${state.mode} | Interval: ${state.intervalMinutes} min`, "info");

  const apiKey = process.env.GROQ_API_KEY;

  const results = await Promise.allSettled(
    state.pairs.map(async (pair) => {
      const sig = isForexPair(pair)
        ? await analyzeForexPair(pair, apiKey)
        : await analyzeOnePair(pair, apiKey);
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

  // ── Confirmation wait — notify group, then wait X min before broadcasting ───
  if (waStatus.connected && confirmationWaitMinutes > 0) {
    try {
      const groupInfo = await getSignalGroupInfo();
      if (groupInfo.exists) {
        const confirmMsg = buildConfirmationMessage(best.pair, best.direction, best.confidence, confirmationWaitMinutes);
        await sendMessageToGroup(confirmMsg);
        addLog(`⏳ Confirmation message sent — waiting ${confirmationWaitMinutes} min before broadcasting signal`, "info");
      }
    } catch {}
    state.currentAction = `⏳ Confirming ${best.pair} ${best.direction} — waiting ${confirmationWaitMinutes} min…`;
    await new Promise(r => setTimeout(r, confirmationWaitMinutes * 60 * 1000));
    if (!state.active) return; // bot was stopped during wait
    addLog(`✅ Confirmation wait complete — proceeding with ${best.pair} ${best.direction} broadcast`, "info");
  }

  const [saved] = await db.insert(tradingSignalsTable).values({
    pair:        best.pair,
    direction:   best.direction,
    entryPrice:  best.entryPrice,
    targetPrice: best.targetPrice,
    stopLoss:    best.stopLoss,
    confidence:  best.confidence,
    category:    isForexPair(best.pair) ? "forex" : "crypto",
    status:      "active",
  }).returning();

  state.lastSignalAt   = new Date().toISOString();
  state.lastSignalPair = best.pair;
  state.signalsToday++;
  state.currentAction  = `Signal sent: ${best.pair} ${best.direction} ${best.confidence}%`;
  addLog(`💾 Signal #${saved.id} saved — ${best.pair} ${best.direction} @ ${best.entryPrice.toFixed(2)}`, "signal");

  // ── Broadcast via WhatsApp ──────────────────────────────────────────────────
  if (!getWAStatus().connected) {
    addLog("⚠ WhatsApp not connected — signal saved to DB only. Connect WhatsApp to deliver signals to subscribers.", "info");
    return;
  }

  const signalCategory = "crypto"; // bot currently scans crypto pairs
  try {
    const subs = await db.select().from(subscribersTable).where(eq(subscribersTable.status, "active"));
    // Send to subscribers whose signalType matches — "both" always receives, others only if category matches
    const targets = subs.filter(s => {
      const t = s.signalType ?? "both";
      return t === "both" || t === signalCategory;
    });

    if (targets.length === 0) {
      addLog(`📭 Signal saved — no active subscribers for ${signalCategory} signals`, "info");
      return;
    }

    addLog(`📲 Broadcasting to ${targets.length}/${subs.length} subscriber${targets.length !== 1 ? "s" : ""} (${signalCategory} filter)…`, "info");
    const messages = buildMessages(best);
    let sent = 0;
    for (const sub of targets) {
      if (!getWAStatus().connected) {
        addLog(`⚠ WhatsApp disconnected mid-broadcast — ${sent}/${targets.length} delivered so far`, "error");
        break;
      }
      try {
        await sendTypingMessages(sub.phone, messages, 700);
        await new Promise(r => setTimeout(r, 800));
        sent++;
        addLog(`✔ Delivered to ${sub.name} (+${sub.phone})`, "info");
      } catch (e: any) {
        addLog(`⚠ Failed → ${sub.name} (+${sub.phone}): ${e?.message ?? "unknown"}`, "error");
        await new Promise(r => setTimeout(r, 500));
      }
    }
    addLog(`✅ Broadcast complete — ${sent}/${targets.length} delivered`, sent === targets.length ? "signal" : "error");

    // ── Notify group: human-style multi-message notification ─────────────────
    try {
      const groupInfo = await getSignalGroupInfo();
      if (groupInfo.exists) {
        const groupMsgs = await generateGroupSignalMessages(
          { pair: best.pair, direction: best.direction, confidence: best.confidence, riskLevel: best.riskLevel, reasoning: best.reasoning, category: isForexPair(best.pair) ? "forex" : "crypto" },
          groupInfo.inviteLink,
        );
        await sendTypingMessagesToGroup(groupMsgs);
        addLog(`📢 Group notified (${groupMsgs.length} messages) — members told to check DMs for the ${best.pair} signal`, "info");
      }
    } catch (e: any) {
      addLog(`⚠ Group notification failed: ${e?.message ?? "unknown"}`, "error");
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
  confirmationWaitMinutes?: number;
}) {
  if (state.active) stopBot();

  state.active          = true;
  state.mode            = opts.mode ?? state.mode;
  state.intervalMinutes = opts.intervalMinutes ?? 5;
  state.pairs           = opts.pairs ?? state.pairs;
  state.signalsToday    = 0;
  state.currentAction   = "Starting — running first market scan…";
  state.nextScanAt      = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
  confirmationWaitMinutes = opts.confirmationWaitMinutes ?? confirmationWaitMinutes;

  logs = [];
  addLog(`🤖 Bot activated — Mode: ${state.mode} | Interval: ${state.intervalMinutes} min | Watching ${state.pairs.length} pairs | Confirm wait: ${confirmationWaitMinutes} min`, "info");
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
