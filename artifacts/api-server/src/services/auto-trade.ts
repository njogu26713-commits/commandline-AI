/**
 * Auto-Trade Service
 * Executes trades on connected MT5 accounts when a signal fires.
 * Dev mode (no METAAPI_TOKEN): saves a simulated trade to the DB so it's visible in the UI.
 * Live mode: places a real order via MetaApi and saves the result.
 */

import { db } from "@workspace/db";
import { tradingAccountsTable, tradeExecutionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const METAAPI_TOKEN = process.env.METAAPI_TOKEN;

function toMT5Symbol(pair: string, category: string): string {
  if (category === "crypto") return pair.replace("USDT", "USD");
  return pair.replace("/", "");
}

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
      headers: { "Content-Type": "application/json", "auth-token": METAAPI_TOKEN! },
      body: JSON.stringify({
        actionType, symbol: opts.symbol, volume: opts.volume,
        stopLoss: opts.stopLoss, takeProfit: opts.takeProfit,
      }),
    },
  );
  if (!res.ok) throw new Error(`MetaApi: ${await res.text()}`);
  const data = await res.json();
  return { orderId: data.orderId ?? data.positionId ?? "unknown" };
}

export interface SignalToTrade {
  pair: string; category: string; direction: string;
  entryPrice: number; targetPrice: number; stopLoss: number; confidence: number;
  signalId?: number;
}

export interface TradeResult {
  accountId: number; broker: string | null; accountNumber: string;
  symbol: string; direction: string; volume: number; riskAmount: number;
  orderId: string | null; success: boolean; error: string | null; devMode: boolean;
}

export async function executeOnConnectedAccounts(signal: SignalToTrade): Promise<TradeResult[]> {
  const accounts = await db
    .select().from(tradingAccountsTable)
    .where(and(eq(tradingAccountsTable.status, "connected"), eq(tradingAccountsTable.autoTrade, "true")));

  if (accounts.length === 0) return [];

  const results: TradeResult[] = [];
  const symbol = toMT5Symbol(signal.pair, signal.category);

  for (const account of accounts) {
    const balance     = account.balance ?? 1000;
    const riskPercent = account.riskPercent ?? 1.0;
    const tradeAmount = account.tradeAmount ?? null;
    const volume      = calcLotSize(balance, riskPercent, signal.entryPrice, signal.stopLoss, tradeAmount);
    const riskAmount  = tradeAmount && tradeAmount > 0 ? tradeAmount : balance * (riskPercent / 100);

    const base = { accountId: account.id, broker: account.broker, accountNumber: account.accountNumber, symbol, direction: signal.direction, volume, riskAmount };

    if (!METAAPI_TOKEN || !account.metaApiAccountId) {
      // ── Dev mode: simulate execution and save to DB ────────────────────────
      const orderId = `DEV-${Date.now()}`;
      await db.insert(tradeExecutionsTable).values({
        accountId:  account.id,
        signalId:   signal.signalId ?? null,
        symbol,
        direction:  signal.direction,
        volume,
        entryPrice: signal.entryPrice,
        stopLoss:   signal.stopLoss,
        takeProfit: signal.targetPrice,
        orderId,
        status:     "executed",
        devMode:    "true",
        riskAmount,
      });
      console.info(`[auto-trade DEV] ${signal.direction} ${symbol} ×${volume} @ ${signal.entryPrice} | SL ${signal.stopLoss} | TP ${signal.targetPrice} | Risk $${riskAmount.toFixed(2)} | Order ${orderId}`);
      results.push({ ...base, orderId, success: true, error: null, devMode: true });
      continue;
    }

    // ── Live MetaApi trade ─────────────────────────────────────────────────
    try {
      const { orderId } = await placeOrder({
        metaApiAccountId: account.metaApiAccountId,
        symbol, direction: signal.direction, volume,
        stopLoss: signal.stopLoss, takeProfit: signal.targetPrice,
      });
      await db.insert(tradeExecutionsTable).values({
        accountId: account.id, signalId: signal.signalId ?? null,
        symbol, direction: signal.direction, volume,
        entryPrice: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.targetPrice,
        orderId, status: "executed", devMode: "false", riskAmount,
      });
      results.push({ ...base, orderId, success: true, error: null, devMode: false });
    } catch (err: any) {
      await db.insert(tradeExecutionsTable).values({
        accountId: account.id, signalId: signal.signalId ?? null,
        symbol, direction: signal.direction, volume,
        entryPrice: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.targetPrice,
        orderId: null, status: "failed", error: err.message, devMode: "false", riskAmount,
      });
      results.push({ ...base, orderId: null, success: false, error: err.message, devMode: false });
    }
  }

  return results;
}
