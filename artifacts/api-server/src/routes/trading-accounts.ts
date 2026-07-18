import { Router } from "express";
import { db } from "@workspace/db";
import { tradingAccountsTable, tradeExecutionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const METAAPI_TOKEN = process.env.METAAPI_TOKEN;

// ── MT5 broker → default server mapping ──────────────────────────────────────
const BROKER_SERVERS: Record<string, string> = {
  Exness:      "Exness-MT5Real",
  "IC Markets":"ICMarketsSC-MT5-1",
  XM:          "XM.COM-MT5 1",
  Pepperstone: "Pepperstone-MT5-Real01",
  Tickmill:    "Tickmill-MT5Live",
};

// ── Connect via MetaApi (or mock in dev mode) ─────────────────────────────────
async function connectMT5(
  login: string,
  password: string,
  server: string,
  broker: string,
): Promise<{
  metaApiAccountId: string | null;
  accountInfo: {
    balance: number; equity: number; margin: number;
    freeMargin: number; marginLevel: number;
    openTrades: number; profit: number;
    currency: string; leverage: number;
  };
}> {
  if (!METAAPI_TOKEN) {
    // Dev mode — generate realistic mock data seeded from the login number
    const seed = parseInt(login.replace(/\D/g, "").slice(-6)) || 123456;
    const balance    = 1000 + (seed % 49000);
    const profitRaw  = (seed % 2 === 0 ? 1 : -1) * (seed % 800);
    const equity     = balance + profitRaw;
    const margin     = (seed % 500) + 50;
    const freeMargin = equity - margin;
    const marginLvl  = margin > 0 ? (equity / margin) * 100 : 0;
    return {
      metaApiAccountId: null,
      accountInfo: {
        balance:     Math.round(balance * 100) / 100,
        equity:      Math.round(equity * 100) / 100,
        margin:      Math.round(margin * 100) / 100,
        freeMargin:  Math.round(freeMargin * 100) / 100,
        marginLevel: Math.round(marginLvl * 100) / 100,
        openTrades:  seed % 7,
        profit:      Math.round(profitRaw * 100) / 100,
        currency:    "USD",
        leverage:    [50, 100, 200, 500][seed % 4],
      },
    };
  }

  // ── Real MetaApi integration ──────────────────────────────────────────────
  const provRes = await fetch(
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "auth-token": METAAPI_TOKEN },
      body: JSON.stringify({
        login, password, server, platform: "mt5",
        name: `${broker} ${login}`, type: "cloud", magic: 0,
      }),
    },
  );
  if (!provRes.ok) {
    const txt = await provRes.text();
    throw new Error(`MetaApi error: ${txt}`);
  }
  const { id: metaApiAccountId } = await provRes.json();

  // Poll until connected (up to 30 s)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await fetch(
      `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}`,
      { headers: { "auth-token": METAAPI_TOKEN } },
    );
    const acc = await st.json();
    if (acc.connectionStatus === "connected") break;
    if (i === 9) throw new Error("MT5 account timed out connecting — check credentials and server name.");
  }

  const infoRes = await fetch(
    `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}/account-information`,
    { headers: { "auth-token": METAAPI_TOKEN } },
  );
  if (!infoRes.ok) throw new Error("Could not fetch account data from MT5.");
  const info = await infoRes.json();

  const posRes = await fetch(
    `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}/positions`,
    { headers: { "auth-token": METAAPI_TOKEN } },
  );
  const positions = posRes.ok ? await posRes.json() : [];

  return {
    metaApiAccountId,
    accountInfo: {
      balance:     info.balance,
      equity:      info.equity,
      margin:      info.margin,
      freeMargin:  info.freeMargin,
      marginLevel: info.marginLevel,
      openTrades:  positions.length,
      profit:      info.profit,
      currency:    info.currency,
      leverage:    info.leverage,
    },
  };
}

// ── Sync live data for an existing connection ─────────────────────────────────
async function syncMT5(metaApiAccountId: string | null, account: any) {
  if (!METAAPI_TOKEN || !metaApiAccountId) {
    // Dev mode: nudge the cached values slightly to simulate live data
    const delta = (Math.random() - 0.5) * 20;
    return {
      balance:     account.balance,
      equity:      Math.round(((account.equity ?? account.balance) + delta) * 100) / 100,
      margin:      account.margin,
      freeMargin:  Math.round(((account.freeMargin ?? 0) + delta) * 100) / 100,
      marginLevel: account.marginLevel,
      openTrades:  account.openTrades,
      profit:      Math.round(((account.profit ?? 0) + delta) * 100) / 100,
      currency:    account.currency,
      leverage:    account.leverage,
    };
  }

  const infoRes = await fetch(
    `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}/account-information`,
    { headers: { "auth-token": METAAPI_TOKEN } },
  );
  if (!infoRes.ok) return null;
  const info = await infoRes.json();

  const posRes = await fetch(
    `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}/positions`,
    { headers: { "auth-token": METAAPI_TOKEN } },
  );
  const positions = posRes.ok ? await posRes.json() : [];

  return {
    balance:     info.balance,
    equity:      info.equity,
    margin:      info.margin,
    freeMargin:  info.freeMargin,
    marginLevel: info.marginLevel,
    openTrades:  positions.length,
    profit:      info.profit,
    currency:    info.currency,
    leverage:    info.leverage,
  };
}

// ── GET /api/trading-accounts ─────────────────────────────────────────────────
router.get("/trading-accounts", async (req, res) => {
  try {
    const accounts = await db.select().from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.status, "connected"));
    res.json(accounts.map(a => ({
      ...a,
      createdAt:  a.createdAt.toISOString(),
      lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/trading-accounts/connect ───────────────────────────────────────
router.post("/trading-accounts/connect", async (req, res) => {
  try {
    const { platform, broker, login, password, server } = req.body;

    if (!platform) return res.status(400).json({ error: "platform is required" });
    if (platform === "mt5" && (!login || !password))
      return res.status(400).json({ error: "login and password are required for MT5" });

    if (platform !== "mt5")
      return res.status(400).json({ error: `${platform} connections are coming soon` });

    const resolvedServer = server || BROKER_SERVERS[broker] || "Exness-MT5Real";

    const { metaApiAccountId, accountInfo } = await connectMT5(login, password, resolvedServer, broker ?? "Other");

    const [saved] = await db.insert(tradingAccountsTable).values({
      platform,
      broker:           broker ?? null,
      accountNumber:    login,
      serverName:       resolvedServer,
      metaApiAccountId: metaApiAccountId ?? null,
      status:           "connected",
      balance:          accountInfo.balance,
      equity:           accountInfo.equity,
      margin:           accountInfo.margin,
      freeMargin:       accountInfo.freeMargin,
      marginLevel:      accountInfo.marginLevel,
      openTrades:       accountInfo.openTrades,
      profit:           accountInfo.profit,
      currency:         accountInfo.currency,
      leverage:         accountInfo.leverage,
      lastSyncAt:       new Date(),
    }).returning();

    res.status(201).json({
      ...saved,
      createdAt:  saved.createdAt.toISOString(),
      lastSyncAt: saved.lastSyncAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Connection failed" });
  }
});

// ── POST /api/trading-accounts/:id/sync ──────────────────────────────────────
router.post("/trading-accounts/:id/sync", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [account] = await db.select().from(tradingAccountsTable).where(eq(tradingAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "Account not found" });

    const live = await syncMT5(account.metaApiAccountId, account);
    if (!live) return res.status(503).json({ error: "Could not fetch live data" });

    const [updated] = await db.update(tradingAccountsTable)
      .set({ ...live, lastSyncAt: new Date() })
      .where(eq(tradingAccountsTable.id, id))
      .returning();

    res.json({
      ...updated,
      createdAt:  updated.createdAt.toISOString(),
      lastSyncAt: updated.lastSyncAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "Sync failed" });
  }
});

// ── GET /api/trading-accounts/:id/trades ─────────────────────────────────────
router.get("/trading-accounts/:id/trades", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const trades = await db.select().from(tradeExecutionsTable)
      .where(eq(tradeExecutionsTable.accountId, id))
      .orderBy(desc(tradeExecutionsTable.executedAt))
      .limit(50);
    res.json(trades.map(t => ({ ...t, executedAt: t.executedAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/trading-accounts/:id ──────────────────────────────────────────
router.patch("/trading-accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { autoTrade, riskPercent, tradeAmount } = req.body;
    const updates: Record<string, any> = {};
    if (typeof autoTrade === "boolean") updates.autoTrade = autoTrade ? "true" : "false";
    if (typeof riskPercent === "number") updates.riskPercent = Math.min(10, Math.max(0.1, riskPercent));
    if (tradeAmount === null) updates.tradeAmount = null;                                   // clear fixed amount
    else if (typeof tradeAmount === "number") updates.tradeAmount = Math.max(1, tradeAmount); // set fixed amount
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
    const [updated] = await db.update(tradingAccountsTable).set(updates).where(eq(tradingAccountsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Account not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), lastSyncAt: updated.lastSyncAt?.toISOString() ?? null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/trading-accounts/:id ─────────────────────────────────────────
router.delete("/trading-accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(tradingAccountsTable)
      .set({ status: "disconnected" })
      .where(eq(tradingAccountsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
