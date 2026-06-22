import { Router } from "express";
import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const MPESA_BASE = process.env.MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

// In-memory store for pending payments (use DB in production)
const pendingPayments = new Map<string, { phone: string; plan: string; amount: number; subscriberId?: number }>();

async function getMpesaToken(): Promise<string> {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("M-Pesa credentials not configured");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res  = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`M-Pesa auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// Subscription plans
const PLANS = {
  basic:   { name: "Basic",   amount: 500,  signals: "Crypto only",      description: "Up to 5 crypto signals/day" },
  premium: { name: "Premium", amount: 1000, signals: "Crypto + Forex",   description: "Up to 15 signals/day + Forex" },
  vip:     { name: "VIP",     amount: 2000, signals: "All markets + priority", description: "Unlimited signals, priority delivery" },
};

router.get("/mpesa/plans", (_req, res) => {
  res.json(PLANS);
});

// Initiate STK Push
router.post("/mpesa/stkpush", async (req, res) => {
  try {
    const { phone, plan = "basic", subscriberId } = req.body;
    if (!phone) return res.status(400).json({ error: "phone is required" });

    const planData = PLANS[plan as keyof typeof PLANS];
    if (!planData) return res.status(400).json({ error: "Invalid plan" });

    const consumerKey    = process.env.MPESA_CONSUMER_KEY;
    const shortcode      = process.env.MPESA_SHORTCODE;
    const passkey        = process.env.MPESA_PASSKEY;
    const callbackUrl    = process.env.MPESA_CALLBACK_URL;

    if (!consumerKey || !shortcode || !passkey || !callbackUrl) {
      // Return a mock response if credentials aren't configured (dev mode)
      const mockCheckoutId = `MOCK_${Date.now()}`;
      pendingPayments.set(mockCheckoutId, { phone, plan, amount: planData.amount, subscriberId });
      return res.json({
        success: true,
        checkoutRequestId: mockCheckoutId,
        message: `STK Push sent to ${phone}. Enter M-Pesa PIN to complete payment of KES ${planData.amount}`,
        mock: true,
      });
    }

    const token     = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const cleanPhone = phone.replace(/[^0-9]/g, "").replace(/^0/, "254");

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: planData.amount,
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: callbackUrl,
      AccountReference: "CodeMindSignals",
      TransactionDesc: `${planData.name} Plan - CodeMind Signals`,
    };

    const stkRes = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const stkData = await stkRes.json();
    if (stkData.ResponseCode !== "0") {
      return res.status(400).json({ error: stkData.ResponseDescription ?? "STK Push failed" });
    }

    pendingPayments.set(stkData.CheckoutRequestID, { phone, plan, amount: planData.amount, subscriberId });

    res.json({
      success: true,
      checkoutRequestId: stkData.CheckoutRequestID,
      message: `STK Push sent to ${phone}. Enter M-Pesa PIN to complete payment of KES ${planData.amount}`,
    });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message ?? "M-Pesa error" });
  }
});

// Simulate successful payment (dev/demo)
router.post("/mpesa/simulate", async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    const payment = pendingPayments.get(checkoutRequestId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    // Update subscriber plan if linked
    if (payment.subscriberId) {
      await db.update(subscribersTable).set({ plan: payment.plan, status: "active" }).where(eq(subscribersTable.id, payment.subscriberId));
    }
    pendingPayments.delete(checkoutRequestId);
    res.json({ success: true, message: "Payment confirmed", plan: payment.plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real M-Pesa callback
router.post("/mpesa/callback", async (req, res) => {
  try {
    const { Body } = req.body;
    const stk = Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: "ok" });

    const checkoutId = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;

    if (resultCode === 0) {
      // Payment successful
      const payment = pendingPayments.get(checkoutId);
      if (payment?.subscriberId) {
        await db.update(subscribersTable).set({ plan: payment.plan, status: "active" }).where(eq(subscribersTable.id, payment.subscriberId));
      }
      pendingPayments.delete(checkoutId);
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (err) {
    res.json({ ResultCode: 0, ResultDesc: "ok" });
  }
});

// Check payment status
router.get("/mpesa/status/:checkoutId", async (req, res) => {
  const { checkoutId } = req.params;
  const payment = pendingPayments.get(checkoutId);
  res.json({ pending: !!payment, payment: payment ?? null });
});

export default router;
