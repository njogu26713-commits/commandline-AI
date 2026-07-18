/**
 * Auto-Trade Service
 * When a signal is generated, this service places the trade on all connected
 * MT5 accounts that have auto-trading enabled.
 *
 * In dev mode (no METAAPI_TOKEN): logs the order details without placing it.
 * In production: places a real market order via MetaApi.
 */

import { db } from "@workspace/db";
import { tradingAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const METAAPI_TOKEN = process.env.METAAPI_TOKEN;

// ── Symbol mapping ────────────────────────────────────────────────────────────
// Binance uses BTCUSDT, MetaApi/MT5 uses BTCUSD. Forex: EUR/USD → EURUSD.
function toMT5Symbol(pair: string, category: string): string {
  if (category === "crypto") return pair.replace("USDT", "USD");
  return pair.replace("/", "");
}

// ── Lot size calculator ───────────────────────────────────────────────────────
// If tradeAmount is set: risk exactly that many dollars.
// Otherwise: risk riskPercent % of balance.
// lotSize = riskAmount / |entryPrice - stopLoss|
// Clamped to 0.01 – 10.00 lots, rounded to 2 dp.
function calcLotSize(
  balance: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
  tradeAmount?: number | null,
): number {
  const riskAmount = tradeAmount && tradeAmount > 0
    ? tradeAmount
    : balance * (riskPercent / 100);
  const priceDiff = Math.abs(entryPrice - stopLoss);
  if (priceDiff === 0) return 0.01;
  const raw = riskAmount / priceDiff;
  return Math.min(10.0, Math.max(0.01, Math.round(raw * 100) / 100));
}

// ── Place one trade on MetaApi ────────────────────────────────────────────────
async function placeOrder(opts: {
  metaApiAccountId: string;
  symbol: string;
  direction: string;
  volume: number;
  stopLoss: number;
  takeProfit: number;
}): Promise<{ orderId: string }> {
  const actionType = opts.direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";

  const res = await fetch(
    `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${opts.metaApiAccountId}/trade`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "auth-token": METAAPI_TOKEN!,
      },
      body: JSON.stringify({
        actionType,
        symbol:     opts.symbol,
        volume:     opts.volume,
        stopLoss:   opts.stopLoss,
        takeProfit: opts.takeProfit,
      }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MetaApi trade error: ${txt}`);
  }

  const data = await res.json();
  return { orderId: data.orderId ?? data.positionId ?? "unknown" };
}

// ── Public: execute signal on all auto-trade enabled accounts ─────────────────
export interface SignalToTrade {
  pair:        string;
  category:    string;
  direction:   string;   // "BUY" | "SELL"
  entryPrice:  number;
  targetPrice: number;
  stopLoss:    number;
  confidence:  number;
}

export interface TradeResult {
  accountId:  number;
  broker:     string | null;
  accountNumber: string;
  symbol:     string;
  direction:  string;
  volume:     number;
  orderId:    string | null;
  success:    boolean;
  error:      string | null;
  devMode:    boolean;
}

export async function executeOnConnectedAccounts(signal: SignalToTrade): Promise<TradeResult[]> {
  // Fetch all accounts with auto-trading ON
  const accounts = await db
    .select()
    .from(tradingAccountsTable)
    .where(
      and(
        eq(tradingAccountsTable.status, "connected"),
        eq(tradingAccountsTable.autoTrade, "true"),
      ),
    );

  if (accounts.length === 0) return [];

  const results: TradeResult[] = [];
  const symbol = toMT5Symbol(signal.pair, signal.category);

  for (const account of accounts) {
    const balance     = account.balance ?? 1000;
    const riskPercent = account.riskPercent ?? 1.0;
    const tradeAmount = account.tradeAmount ?? null;
    const volume      = calcLotSize(balance, riskPercent, signal.entryPrice, signal.stopLoss, tradeAmount);

    const base: Omit<TradeResult, "orderId" | "success" | "error" | "devMode"> = {
      accountId:     account.id,
      broker:        account.broker,
      accountNumber: account.accountNumber,
      symbol,
      direction: signal.direction,
      volume,
    };

    // ── Dev mode (no MetaApi token) ───────────────────────────────────────────
    if (!METAAPI_TOKEN || !account.metaApiAccountId) {
      const riskDesc = tradeAmount
        ? `${tradeAmount.toFixed(2)} fixed`
        : `${riskPercent}% of ${balance.toFixed(2)} = ${(balance * riskPercent / 100).toFixed(2)}`;
      console.info(
        `[auto-trade DEV] Would place ${signal.direction} ${symbol} ×${volume} lots` +
        ` on ${account.broker ?? "broker"} #${account.accountNumber}` +
        ` | SL ${signal.stopLoss} | TP ${signal.targetPrice}` +
        ` | Risk ${riskDesc}`,
      );
      results.push({ ...base, orderId: `DEV-${Date.now()}`, success: true, error: null, devMode: true });
      continue;
    }

    // ── Live MetaApi trade ────────────────────────────────────────────────────
    try {
      const { orderId } = await placeOrder({
        metaApiAccountId: account.metaApiAccountId,
        symbol,
        direction: signal.direction,
        volume,
        stopLoss:   signal.stopLoss,
        takeProfit: signal.targetPrice,
      });
      results.push({ ...base, orderId, success: true, error: null, devMode: false });
    } catch (err: any) {
      results.push({ ...base, orderId: null, success: false, error: err.message ?? "Unknown error", devMode: false });
    }
  }

  return results;
}
