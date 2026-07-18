import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";

export const tradeExecutionsTable = pgTable("trade_executions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  signalId: integer("signal_id"),
  // Trade details
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),   // BUY | SELL
  volume: real("volume").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  takeProfit: real("take_profit").notNull(),
  // Result
  orderId: text("order_id"),
  status: text("status").notNull().default("executed"), // executed | failed
  error: text("error"),
  devMode: text("dev_mode").notNull().default("true"),  // "true" | "false"
  riskAmount: real("risk_amount"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

export type TradeExecution = typeof tradeExecutionsTable.$inferSelect;
