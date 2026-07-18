import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";

export const tradingAccountsTable = pgTable("trading_accounts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),            // 'mt5' | 'ctrader' | 'binance' | 'bybit'
  broker: text("broker"),                           // 'Exness' | 'IC Markets' | etc.
  accountNumber: text("account_number").notNull(), // MT5 login / Binance UID
  serverName: text("server_name"),                 // MT5 server name
  metaApiAccountId: text("meta_api_account_id"),  // MetaApi account ID (used for reconnection)
  status: text("status").notNull().default("connected"), // 'connected' | 'disconnected' | 'error'
  // Cached live account data
  balance: real("balance"),
  equity: real("equity"),
  margin: real("margin"),
  freeMargin: real("free_margin"),
  marginLevel: real("margin_level"),
  openTrades: integer("open_trades").default(0),
  profit: real("profit"),
  currency: text("currency").default("USD"),
  leverage: integer("leverage"),
  lastSyncAt: timestamp("last_sync_at"),
  // Auto-trading settings
  autoTrade: text("auto_trade").notNull().default("false"),   // "true" | "false" (text for compat)
  riskPercent: real("risk_percent").notNull().default(1.0),   // % of balance risked per trade
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TradingAccount = typeof tradingAccountsTable.$inferSelect;
