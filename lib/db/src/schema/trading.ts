import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradingSignalsTable = pgTable("trading_signals", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: text("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  status: text("status").notNull().default("active"),
  confidence: real("confidence").notNull(),
  pnl: real("pnl"),
  category: text("category").notNull().default("crypto"), // "crypto" | "forex"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTradingSignalSchema = createInsertSchema(tradingSignalsTable).omit({ id: true, createdAt: true, status: true, pnl: true });
export type InsertTradingSignal = z.infer<typeof insertTradingSignalSchema>;
export type TradingSignal = typeof tradingSignalsTable.$inferSelect;

export const subscribersTable = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("basic"),
  status: text("status").notNull().default("active"),
  signalType: text("signal_type").notNull().default("both"), // "crypto" | "forex" | "both"
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export type Subscriber = typeof subscribersTable.$inferSelect;

export const tradingPerformanceTable = pgTable("trading_performance", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  winRate: real("win_rate").notNull(),
  signals: integer("signals").notNull(),
  pnl: real("pnl").notNull(),
});

export type TradingPerformance = typeof tradingPerformanceTable.$inferSelect;
