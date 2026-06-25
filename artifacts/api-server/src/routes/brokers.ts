import { Router } from "express";
import { db } from "@workspace/db";
import { brokersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const DEFAULT_BROKERS = [
  {
    name: "Binance",
    description: "World's largest crypto exchange by trading volume. Low fees, deep liquidity, and 350+ trading pairs.",
    logo: "🟡",
    category: "crypto",
    referralLink: "https://www.binance.com/en/register?ref=YOUR_REF_CODE",
    commission: "Up to 40% commission",
    features: JSON.stringify(["350+ crypto pairs", "0.1% spot fee", "Futures trading", "Earn & staking", "Mobile app"]),
    isActive: "true",
  },
  {
    name: "Exness",
    description: "Top-tier forex & CFD broker with instant withdrawals, tight spreads, and 24/7 support.",
    logo: "🔵",
    category: "forex",
    referralLink: "https://www.exness.com/a/YOUR_REF_CODE",
    commission: "Up to $1,850 per client",
    features: JSON.stringify(["200+ forex pairs", "Ultra-low spreads", "Instant withdrawals", "MT4 & MT5", "Crypto deposits"]),
    isActive: "true",
  },
  {
    name: "IC Markets",
    description: "Australia's largest CFD broker. True ECN pricing with institutional-grade liquidity.",
    logo: "🟢",
    category: "forex",
    referralLink: "https://www.icmarkets.com/?camp=YOUR_REF_CODE",
    commission: "Up to $200 per client",
    features: JSON.stringify(["Raw ECN spreads", "2,250+ instruments", "MT4 / MT5 / cTrader", "VPS hosting", "24/7 support"]),
    isActive: "true",
  },
  {
    name: "Bybit",
    description: "Leading crypto derivatives exchange with up to 100x leverage and a robust trading ecosystem.",
    logo: "🟠",
    category: "crypto",
    referralLink: "https://www.bybit.com/en/invite?ref=YOUR_REF_CODE",
    commission: "Up to 30% commission",
    features: JSON.stringify(["Spot & derivatives", "Copy trading", "NFT marketplace", "Launchpad access", "P2P trading"]),
    isActive: "true",
  },
  {
    name: "OANDA",
    description: "Trusted forex broker since 1996. Regulated in 6 jurisdictions with award-winning platforms.",
    logo: "⚪",
    category: "forex",
    referralLink: "https://www.oanda.com/register/?referral=YOUR_REF_CODE",
    commission: "Competitive CPA",
    features: JSON.stringify(["No minimum deposit", "FCA & ASIC regulated", "TradingView charts", "MT4 integration", "API access"]),
    isActive: "true",
  },
];

router.get("/brokers", async (req, res) => {
  try {
    let brokers = await db.select().from(brokersTable).where(eq(brokersTable.isActive, "true")).orderBy(desc(brokersTable.createdAt));
    if (brokers.length === 0) {
      const inserted = await db.insert(brokersTable).values(DEFAULT_BROKERS).returning();
      brokers = inserted;
    }
    res.json(brokers.map(b => ({ ...b, features: JSON.parse(b.features || "[]"), createdAt: b.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/brokers/all", async (req, res) => {
  try {
    const brokers = await db.select().from(brokersTable).orderBy(desc(brokersTable.createdAt));
    res.json(brokers.map(b => ({ ...b, features: JSON.parse(b.features || "[]"), createdAt: b.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/brokers", async (req, res) => {
  try {
    const { name, description, logo, category, referralLink, commission, features } = req.body;
    if (!name || !referralLink) return res.status(400).json({ error: "name and referralLink are required" });
    const [broker] = await db.insert(brokersTable).values({
      name, description: description ?? "", logo: logo ?? "🏦",
      category: category ?? "both", referralLink, commission: commission ?? "",
      features: JSON.stringify(features ?? []), isActive: "true",
    }).returning();
    res.status(201).json({ ...broker, features: JSON.parse(broker.features), createdAt: broker.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/brokers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, logo, category, referralLink, commission, features, isActive } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (logo !== undefined) updates.logo = logo;
    if (category !== undefined) updates.category = category;
    if (referralLink !== undefined) updates.referralLink = referralLink;
    if (commission !== undefined) updates.commission = commission;
    if (features !== undefined) updates.features = JSON.stringify(features);
    if (isActive !== undefined) updates.isActive = isActive;
    const [broker] = await db.update(brokersTable).set(updates).where(eq(brokersTable.id, id)).returning();
    if (!broker) return res.status(404).json({ error: "Broker not found" });
    res.json({ ...broker, features: JSON.parse(broker.features), createdAt: broker.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/brokers/:id", async (req, res) => {
  try {
    await db.delete(brokersTable).where(eq(brokersTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
