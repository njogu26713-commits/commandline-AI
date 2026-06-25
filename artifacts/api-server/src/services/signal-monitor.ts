import { db } from "@workspace/db";
import { tradingSignalsTable, subscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTicker, getForexRate } from "./binance.js";
import {
  getWAStatus,
  sendTypingMessagesToGroup,
  sendTypingMessages,
  getSignalGroupInfo,
} from "./whatsapp.js";
import { logger } from "../lib/logger.js";

function isForexPair(pair: string): boolean {
  const clean = pair.replace(/[\/\-]/g, "").toUpperCase();
  return !["USDT", "USDC", "BTC", "ETH", "BNB"].some((s) => clean.endsWith(s));
}

async function generateResultMessage(signal: {
  pair: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  tp1: number;
  sl: number;
  pnl: number;
  status: "won" | "lost";
}): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY;
  const pnlStr = `${signal.pnl > 0 ? "+" : ""}${signal.pnl}%`;

  if (apiKey) {
    try {
      const Groq = (await import("groq-sdk")).default;
      const groq = new Groq({ apiKey });

      const prompt =
        signal.status === "won"
          ? `You are the admin of a WhatsApp trading signals group called CommandLine Signals. A signal just hit its target — it's a WIN! Post 2 short, hype messages to the group the way a real human admin would type, not a bot.

Signal result:
- Pair: ${signal.pair}
- Direction: ${signal.direction}
- Entry: ${signal.entryPrice}
- Target hit: ${signal.tp1}
- PNL: ${pnlStr}

Rules:
- Exactly 2 messages. Each one 1–3 lines max.
- Message 1: Explosive win celebration. Build hype. Use emojis naturally.
- Message 2: Brief stats recap (pair, direction, PNL). Remind them the bot is watching and more signals are coming.
- Sound human and excited, not formal or robotic.
- Do NOT use markdown headers or bullet lists.

Respond ONLY with a valid JSON array of strings:
["msg1", "msg2"]`
          : `You are the admin of a WhatsApp trading signals group called CommandLine Signals. A signal just hit its stop-loss — it's a LOSS. Post 2 short, composed messages to the group the way a calm, professional human admin would type.

Signal result:
- Pair: ${signal.pair}
- Direction: ${signal.direction}
- Entry: ${signal.entryPrice}
- Stop hit: ${signal.sl}
- PNL: ${pnlStr}

Rules:
- Exactly 2 messages. Each one 1–3 lines max.
- Message 1: Acknowledge the stop loss calmly. No panic. Losses are part of the game.
- Message 2: Reassure the group — risk was managed, next setup is coming. Keep morale up.
- Sound human and grounded, not robotic or over-apologetic.
- Do NOT use markdown headers or bullet lists.

Respond ONLY with a valid JSON array of strings:
["msg1", "msg2"]`;

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const msgs: unknown = JSON.parse(match[0]);
        if (
          Array.isArray(msgs) &&
          msgs.length >= 1 &&
          (msgs as any[]).every((m: unknown) => typeof m === "string")
        ) {
          return msgs as string[];
        }
      }
    } catch (e) {
      logger.warn(
        { err: (e as any)?.message },
        "Groq unavailable for result message — using template",
      );
    }
  }

  if (signal.status === "won") {
    return [
      `✅ TARGET HIT! ${signal.pair} ${signal.direction} — ${pnlStr} profit! 🔥`,
      `📍 Entry: ${signal.entryPrice} → TP: ${signal.tp1}\nBot stays watching. Next signal incoming 👀`,
    ];
  }
  return [
    `🛑 Stop loss hit on ${signal.pair} ${signal.direction} (${pnlStr}). Part of the game.`,
    `Risk was managed. Stay focused — next setup is loading 💪`,
  ];
}

export async function checkActiveSignals(): Promise<void> {
  try {
    const activeSignals = await db
      .select()
      .from(tradingSignalsTable)
      .where(eq(tradingSignalsTable.status, "active"));

    if (activeSignals.length === 0) return;

    logger.info(
      { count: activeSignals.length },
      "Signal monitor: checking active signals against live prices",
    );

    for (const signal of activeSignals) {
      try {
        const ticker = isForexPair(signal.pair)
          ? await getForexRate(signal.pair)
          : await getTicker(signal.pair);

        const price = ticker.price;
        const tp1 = signal.targetPrice;
        const sl = signal.stopLoss;

        const hitTP =
          signal.direction === "BUY" ? price >= tp1 : price <= tp1;
        const hitSL =
          signal.direction === "BUY" ? price <= sl : price >= sl;

        if (!hitTP && !hitSL) continue;

        const status: "won" | "lost" = hitTP ? "won" : "lost";
        const exitPrice = hitTP ? tp1 : sl;
        const pnl = parseFloat(
          (signal.direction === "BUY"
            ? ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100
            : ((signal.entryPrice - exitPrice) / signal.entryPrice) * 100
          ).toFixed(2),
        );

        await db
          .update(tradingSignalsTable)
          .set({ status, pnl })
          .where(eq(tradingSignalsTable.id, signal.id));

        const emoji = status === "won" ? "✅" : "❌";
        const pnlStr = `${pnl > 0 ? "+" : ""}${pnl}%`;
        logger.info(
          { pair: signal.pair, direction: signal.direction, status, pnl, exitPrice },
          `${emoji} Signal ${status.toUpperCase()}: ${signal.pair} ${signal.direction} (PNL: ${pnlStr})`,
        );

        if (!getWAStatus().connected) continue;

        const msgs = await generateResultMessage({
          pair: signal.pair,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          exitPrice,
          tp1,
          sl,
          pnl,
          status,
        });

        try {
          const groupInfo = await getSignalGroupInfo();
          if (groupInfo.exists) await sendTypingMessagesToGroup(msgs, 1000);
        } catch (e: any) {
          logger.warn({ err: e?.message }, "Group result notification failed");
        }

        try {
          const subs = await db
            .select()
            .from(subscribersTable)
            .where(eq(subscribersTable.status, "active"));
          for (const sub of subs) {
            try {
              await sendTypingMessages(sub.phone, msgs, 600);
            } catch {}
          }
        } catch (e: any) {
          logger.warn({ err: e?.message }, "Subscriber result notification failed");
        }
      } catch (e: any) {
        logger.warn(
          { pair: signal.pair, err: e?.message },
          "Could not check signal result",
        );
      }
    }
  } catch (e: any) {
    logger.error({ err: e?.message }, "Signal monitor error");
  }
}

let monitorTimer: NodeJS.Timeout | null = null;

export function startSignalMonitor(intervalMs = 2 * 60 * 1000): void {
  if (monitorTimer) clearInterval(monitorTimer);

  checkActiveSignals().catch((e) =>
    logger.error({ err: e?.message }, "Signal monitor: initial check failed"),
  );

  monitorTimer = setInterval(() => {
    checkActiveSignals().catch((e) =>
      logger.error({ err: e?.message }, "Signal monitor: tick failed"),
    );
  }, intervalMs);

  logger.info({ intervalMs }, "Signal monitor: started — checking every 2 minutes");
}

export function stopSignalMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  logger.info("Signal monitor: stopped");
}
