const BINANCE = "https://api.binance.com/api/v3";

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

// Normalize pair → Binance symbol (e.g. BTC/USDT → BTCUSDT)
export function toSymbol(pair: string) {
  return pair.replace("/", "").replace("-", "").toUpperCase();
}

export async function getTicker(pair: string): Promise<TickerData> {
  const symbol = toSymbol(pair);
  const res = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ticker error for ${symbol}: ${res.status}`);
  const d = await res.json();
  return {
    symbol,
    price:           parseFloat(d.lastPrice),
    priceChange:     parseFloat(d.priceChange),
    priceChangePct:  parseFloat(d.priceChangePercent),
    high24h:         parseFloat(d.highPrice),
    low24h:          parseFloat(d.lowPrice),
    volume24h:       parseFloat(d.volume),
    quoteVolume:     parseFloat(d.quoteVolume),
  };
}

export async function getKlines(pair: string, interval = "1h", limit = 20): Promise<Kline[]> {
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

// For forex pairs, use ExchangeRate-API (free, no key)
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
    symbol:         clean,
    price:          rate,
    priceChange:    0,
    priceChangePct: 0,
    high24h:        rate * 1.005,
    low24h:         rate * 0.995,
    volume24h:      0,
    quoteVolume:    0,
  };
}

export async function getMarketData(pair: string, category: "crypto" | "forex" = "crypto") {
  if (category === "forex") {
    // Special cases with XAU/USD (gold) — Binance has XAUUSDT
    const binanceForex = ["XAUUSDT", "XAGUSD"];
    const sym = toSymbol(pair);
    if (binanceForex.some(s => sym.includes(s.slice(0, 3)))) {
      return getTicker(pair).catch(() => getForexRate(pair));
    }
    return getForexRate(pair).catch(() => {
      throw new Error(`Could not fetch forex data for ${pair}`);
    });
  }
  return getTicker(pair);
}

// Build a compact market summary string for the AI prompt
export function buildMarketContext(ticker: TickerData, klines: Kline[]) {
  const trend = klines.length >= 6
    ? klines.slice(-6).map(k => (k.close > k.open ? "↑" : "↓")).join("")
    : "unknown";
  const avgVol = klines.reduce((s, k) => s + k.volume, 0) / (klines.length || 1);
  const lastVol = klines[klines.length - 1]?.volume ?? 0;
  const volSignal = lastVol > avgVol * 1.5 ? "HIGH (spike)" : lastVol < avgVol * 0.5 ? "LOW" : "NORMAL";

  return [
    `Symbol: ${ticker.symbol}`,
    `Current Price: ${ticker.price}`,
    `24h Change: ${ticker.priceChangePct.toFixed(2)}% (${ticker.priceChange > 0 ? "+" : ""}${ticker.priceChange.toFixed(4)})`,
    `24h High: ${ticker.high24h}  |  24h Low: ${ticker.low24h}`,
    `Volume: ${ticker.quoteVolume.toLocaleString("en")} USDT`,
    `Last 6 candles (1h): ${trend}`,
    `Volume signal: ${volSignal}`,
  ].join("\n");
}
