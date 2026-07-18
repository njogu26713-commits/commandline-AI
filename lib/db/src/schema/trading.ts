import { Schema, model } from "mongoose";

// ── Trading Signal ────────────────────────────────────────────────────────────
export interface TradingSignal {
  id: string;
  pair: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  status: string;
  confidence: number;
  pnl?: number | null;
  category: string;
  createdAt: Date;
}

const tradingSignalSchema = new Schema(
  {
    pair:        { type: String, required: true },
    direction:   { type: String, required: true },
    entryPrice:  { type: Number, required: true },
    targetPrice: { type: Number, required: true },
    stopLoss:    { type: Number, required: true },
    status:      { type: String, default: "active" },
    confidence:  { type: Number, required: true },
    pnl:         { type: Number, default: null },
    category:    { type: String, default: "crypto" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TradingSignalModel = model("TradingSignal", tradingSignalSchema);

// ── Subscriber ─────────────────────────────────────────────────────────────────
export interface Subscriber {
  id: string;
  phone: string;
  name: string;
  plan: string;
  status: string;
  signalType: string;
  joinedAt: Date;
  subscriptionEndsAt?: Date | null;
  botConnectedAt?: Date | null;
}

const subscriberSchema = new Schema({
  phone:               { type: String, required: true },
  name:                { type: String, required: true },
  plan:                { type: String, default: "basic" },
  status:              { type: String, default: "active" },
  signalType:          { type: String, default: "both" },
  joinedAt:            { type: Date,   default: Date.now },
  subscriptionEndsAt:  { type: Date,   default: null },
  botConnectedAt:      { type: Date,   default: null },
});

export const SubscriberModel = model("Subscriber", subscriberSchema);

// ── Trading Performance ────────────────────────────────────────────────────────
export interface TradingPerformance {
  id: string;
  date: string;
  winRate: number;
  signals: number;
  pnl: number;
}

const tradingPerformanceSchema = new Schema({
  date:    { type: String, required: true },
  winRate: { type: Number, required: true },
  signals: { type: Number, required: true },
  pnl:     { type: Number, required: true },
});

export const TradingPerformanceModel = model("TradingPerformance", tradingPerformanceSchema);

// ── Broker ─────────────────────────────────────────────────────────────────────
export interface Broker {
  id: string;
  name: string;
  description: string;
  logo: string;
  category: string;
  referralLink: string;
  commission: string;
  features: string[];
  isActive: string;
  createdAt: Date;
}

const brokerSchema = new Schema(
  {
    name:         { type: String, required: true },
    description:  { type: String, default: "" },
    logo:         { type: String, default: "🏦" },
    category:     { type: String, default: "both" },
    referralLink: { type: String, required: true },
    commission:   { type: String, default: "" },
    features:     { type: [String], default: [] },
    isActive:     { type: String, default: "true" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const BrokerModel = model("Broker", brokerSchema);
