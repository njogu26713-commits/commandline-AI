const BINANCE = "https://api.binance.us/api/v3";

export interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume: number;
}

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalAnalysis {
  rsi14: number;
  ema9: number;
  ema21: number;
  ema50: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  atr14: number;
  trend: string;        // "STRONG_UP" | "UP" | "NEUTRAL" | "DOWN" | "STRONG_DOWN"
  volumeSignal: string; // "HIGH_SPIKE" | "ABOVE_AVG" | "NORMAL" | "LOW"
  support: number;
  resistance: number;
  priceVsBB: string;   // "ABOVE_UPPER" | "NEAR_UPPER" | "MIDDLE" | "NEAR_LOWER" | "BELOW_LOWER"
}

export function toSymbol(pair: string) {
  return pair.replace("/", "").replace("-", "").toUpperCase();
}

// ── TA Calculations ───────────────────────────────────────────────────────────
function calcEMAArr(values: number[], period: number): number[] {
  if (values.length < period) return values.map(() => values[values.length - 1]);
  const k = 2 / (period + 1);
  const result: number[] = new Array(period - 1).fill(NaN);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calcEMAArr(closes, 12);
  const ema26 = calcEMAArr(closes, 26);
  const macdLine = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i]) ? NaN : v - ema26[i]));
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalArr = calcEMAArr(validMacd, 9);
  const lastMacd   = validMacd[validMacd.length - 1] ?? 0;
  const lastSignal = signalArr[signalArr.length - 1] ?? 0;
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

function calcBollingerBands(closes: number[], period = 20, mult = 2): { upper: number; middle: number; lower: number } {
  const slice = closes.slice(-period);
  const avg   = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std   = Math.sqrt(slice.reduce((s, v) => s + (v - avg) ** 2, 0) / slice.length);
  return { upper: avg + mult * std, middle: avg, lower: avg - mult * std };
}

function calcATR(klines: Kline[], period = 14): number {
  const trs = klines.slice(-period - 1).map((k, i, arr) => {
    if (i === 0) return k.high - k.low;
    const prevClose = arr[i - 1].close;
    return Math.max(k.high - k.low, Math.abs(k.high - prevClose), Math.abs(k.low - prevClose));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSupportResistance(klines: Kline[]): { support: number; resistance: number } {
  const recent = klines.slice(-30);
  const highs  = recent.map(k => k.high);
  const lows   = recent.map(k => k.low);
  return {
    resistance: Math.max(...highs),
    support:    Math.min(...lows),
  };
}

function detectTrend(ema9: number, ema21: number, ema50: number, pct: number): string {
  const bullish = ema9 > ema21 && ema21 > ema50;
  const bearish = ema9 < ema21 && ema21 < ema50;
  if (bullish && pct > 2)  return "STRONG_UP";
  if (bullish)             return "UP";
  if (bearish && pct < -2) return "STRONG_DOWN";
  if (bearish)             return "DOWN";
  return "NEUTRAL";
}

export function computeTA(klines: Kline[], ticker: TickerData): TechnicalAnalysis {
  const closes = klines.map(k => k.close);
  const rsi14  = calcRSI(closes, 14);

  const ema9Arr  = calcEMAArr(closes, 9);
  const ema21Arr = calcEMAArr(closes, 21);
  const ema50Arr = calcEMAArr(closes, 50);
  const ema9     = ema9Arr[ema9Arr.length - 1];
  const ema21    = ema21Arr[ema21Arr.length - 1];
  const ema50    = ema50Arr[ema50Arr.length - 1];

  const { macd, signal, histogram } = calcMACD(closes);
  const bb = calcBollingerBands(closes, 20);
  const atr14 = calcATR(klines, 14);
  const { support, resistance } = calcSupportResistance(klines);

  const price = ticker.price;
  const bbRange = bb.upper - bb.lower;
  const bbWidth = bbRange / bb.middle * 100;
  let priceVsBB = "MIDDLE";
  if (price > bb.upper)                    priceVsBB = "ABOVE_UPPER";
  else if (price > bb.middle + bbRange * 0.35) priceVsBB = "NEAR_UPPER";
  else if (price < bb.lower)               priceVsBB = "BELOW_LOWER";
  else if (price < bb.middle - bbRange * 0.35) priceVsBB = "NEAR_LOWER";

  const avgVol  = klines.slice(-20).reduce((s, k) => s + k.volume, 0) / 20;
  const lastVol = klines[klines.length - 1]?.volume ?? 0;
  let volumeSignal = "NORMAL";
  if (lastVol > avgVol * 2)      volumeSignal = "HIGH_SPIKE";
  else if (lastVol > avgVol * 1.3) volumeSignal = "ABOVE_AVG";
  else if (lastVol < avgVol * 0.5) volumeSignal = "LOW";

  const trend = detectTrend(ema9, ema21, ema50, ticker.priceChangePct);

  return {
    rsi14: Math.round(rsi14 * 10) / 10,
    ema9:  Math.round(ema9 * 100) / 100,
    ema21: Math.round(ema21 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    macdLine:      Math.round(macd * 10000) / 10000,
    macdSignal:    Math.round(signal * 10000) / 10000,
    macdHistogram: Math.round(histogram * 10000) / 10000,
    bbUpper:  Math.round(bb.upper * 100) / 100,
    bbMiddle: Math.round(bb.middle * 100) / 100,
    bbLower:  Math.round(bb.lower * 100) / 100,
    bbWidth:  Math.round(bbWidth * 10) / 10,
    atr14:    Math.round(atr14 * 100) / 100,
    trend,
    volumeSignal,
    support:    Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
    priceVsBB,
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
export async function getTicker(pair: string): Promise<TickerData> {
  const symbol = toSymbol(pair);
  const res = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ticker error for ${symbol}: ${res.status}`);
  const d = await res.json();
  return {
    symbol,
    price:          parseFloat(d.lastPrice),
    priceChange:    parseFloat(d.priceChange),
    priceChangePct: parseFloat(d.priceChangePercent),
    high24h:        parseFloat(d.highPrice),
    low24h:         parseFloat(d.lowPrice),
    volume24h:      parseFloat(d.volume),
    quoteVolume:    parseFloat(d.quoteVolume),
  };
}

export async function getKlines(pair: string, interval = "1h", limit = 100): Promise<Kline[]> {
  const symbol = toSymbol(pair);
  const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`Binance klines error for ${symbol}: ${res.status}`);
  const data: any[] = await res.json();
  return data.map((k) => ({
    time:   k[0],
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function getForexRate(pair: string): Promise<TickerData> {
  const clean = pair.replace("/", "").toUpperCase();
  const base  = clean.slice(0, 3);
  const quote = clean.slice(3, 6);
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`Forex rate error: ${res.status}`);
  const data = await res.json();
  const rate = data.rates?.[quote];
  if (!rate) throw new Error(`Rate not found for ${pair}`);
  return {
    symbol: clean, price: rate, priceChange: 0, priceChangePct: 0,
    high24h: rate * 1.005, low24h: rate * 0.995, volume24h: 0, quoteVolume: 0,
  };
}

export async function getMarketData(pair: string, category: "crypto" | "forex" = "crypto") {
  if (category === "forex") {
    const sym = toSymbol(pair);
    if (["XAU", "XAG"].some(s => sym.startsWith(s))) {
      return getTicker(pair).catch(() => getForexRate(pair));
    }
    return getForexRate(pair).catch(() => { throw new Error(`Could not fetch forex data for ${pair}`); });
  }
  return getTicker(pair);
}

// ── Rich multi-timeframe context for AI ──────────────────────────────────────
export function buildMarketContext(ticker: TickerData, klines: Kline[]): string {
  const ta = computeTA(klines, ticker);
  const p  = ticker.price;

  const candlePattern = klines.slice(-6).map(k => {
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    const bullish = k.close > k.open;
    if (body > range * 0.7) return bullish ? "BULL" : "BEAR";
    if (body < range * 0.1) return "DOJI";
    return bullish ? "bull" : "bear";
  }).join(" → ");

  return `
══════════════════════════════════════
SYMBOL: ${ticker.symbol}
CURRENT PRICE: ${p.toLocaleString("en-US", { maximumFractionDigits: 6 })}
24h Change: ${ticker.priceChangePct > 0 ? "+" : ""}${ticker.priceChangePct.toFixed(2)}%  |  High: ${ticker.high24h}  |  Low: ${ticker.low24h}
Volume (24h): ${ticker.quoteVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDT  |  Volume signal: ${ta.volumeSignal}

── TREND ────────────────────────────
Trend: ${ta.trend}
EMA9:  ${ta.ema9}  |  EMA21: ${ta.ema21}  |  EMA50: ${ta.ema50}
EMA9 vs EMA21: ${ta.ema9 > ta.ema21 ? "BULLISH CROSS ▲" : "BEARISH CROSS ▼"}
EMA21 vs EMA50: ${ta.ema21 > ta.ema50 ? "ABOVE (bullish)" : "BELOW (bearish)"}

── MOMENTUM ─────────────────────────
RSI(14): ${ta.rsi14} ${ta.rsi14 < 30 ? "⚡ OVERSOLD" : ta.rsi14 > 70 ? "🔥 OVERBOUGHT" : ta.rsi14 < 45 ? "(bearish zone)" : ta.rsi14 > 55 ? "(bullish zone)" : "(neutral)"}
MACD Line: ${ta.macdLine}  |  Signal: ${ta.macdSignal}  |  Histogram: ${ta.macdHistogram}
MACD: ${ta.macdHistogram > 0 ? "BULLISH (histogram positive)" : "BEARISH (histogram negative)"}

── VOLATILITY ───────────────────────
Bollinger Bands: Upper ${ta.bbUpper}  |  Mid ${ta.bbMiddle}  |  Lower ${ta.bbLower}
BB Width: ${ta.bbWidth}%  |  Price position: ${ta.priceVsBB}
ATR(14): ${ta.atr14} (average true range = volatility measure)

── LEVELS ───────────────────────────
Support:    ${ta.support}
Resistance: ${ta.resistance}
Distance to support:    ${((p - ta.support) / p * 100).toFixed(2)}%
Distance to resistance: ${((ta.resistance - p) / p * 100).toFixed(2)}%

── CANDLE PATTERN (last 6 candles) ──
${candlePattern}
══════════════════════════════════════`.trim();
}

// ── Full deep analysis for AI route ──────────────────────────────────────────
export async function getDeepAnalysis(pair: string, category: "crypto" | "forex" = "crypto") {
  const [ticker, klines1h, klines4h, klines15m] = await Promise.all([
    getMarketData(pair, category),
    getKlines(pair, "1h", 100),
    getKlines(pair, "4h", 60).catch(() => [] as Kline[]),
    getKlines(pair, "15m", 60).catch(() => [] as Kline[]),
  ]);

  const ta1h  = computeTA(klines1h, ticker);
  const ta4h  = klines4h.length >= 26 ? computeTA(klines4h, ticker) : null;
  const ta15m = klines15m.length >= 26 ? computeTA(klines15m, ticker) : null;

  const ctx1h  = buildMarketContext(ticker, klines1h);
  const ctx4h  = ta4h ? `\n\n[4H TIMEFRAME]\nTrend: ${ta4h.trend} | RSI: ${ta4h.rsi14} | MACD: ${ta4h.macdHistogram > 0 ? "BULLISH" : "BEARISH"} | EMA9 vs EMA21: ${ta4h.ema9 > ta4h.ema21 ? "BULLISH" : "BEARISH"} | Price vs BB: ${ta4h.priceVsBB}` : "";
  const ctx15m = ta15m ? `\n\n[15M TIMEFRAME]\nTrend: ${ta15m.trend} | RSI: ${ta15m.rsi14} | MACD: ${ta15m.macdHistogram > 0 ? "BULLISH" : "BEARISH"} | EMA9 vs EMA21: ${ta15m.ema9 > ta15m.ema21 ? "BULLISH" : "BEARISH"}` : "";

  return {
    ticker,
    ta: ta1h,
    context: ctx1h + ctx4h + ctx15m,
  };
}
