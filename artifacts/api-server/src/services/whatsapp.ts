import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { toDataURL } from "qrcode";
import P from "pino";

const waLogger = P({ level: "silent" });

interface WAState {
  connected: boolean;
  qr: string | null;
  phone: string | null;
  sock: ReturnType<typeof makeWASocket> | null;
  connecting: boolean;
}

const state: WAState = {
  connected: false,
  qr: null,
  phone: null,
  sock: null,
  connecting: false,
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function connectWhatsApp() {
  if (state.connecting || state.connected) return;
  state.connecting = true;
  state.qr = null;

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState("/tmp/wa-auth");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      browser: Browsers.macOS("CommandLine AI"),
      printQRInTerminal: false,
      logger: waLogger as any,
    });

    state.sock = sock;

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qr = await toDataURL(qr);
        state.connecting = false;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        state.connected = false;
        state.qr = null;
        state.connecting = false;
        state.sock = null;
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => connectWhatsApp(), 3000);
        }
      }

      if (connection === "open") {
        state.connected = true;
        state.qr = null;
        state.connecting = false;
        state.phone = (sock.user?.id ?? "").split(":")[0] || null;

        // Send confirmation message to the connected number
        if (state.phone) {
          await delay(2000);
          const confirmMsg = [
            `✅ *CommandLine AI Bot Connected!*`,
            ``,
            `🤖 Your WhatsApp bot is now live and ready.`,
            `📲 You will receive trading signals on this number.`,
            ``,
            `*Bot status:* Active`,
            `*Platform:* CommandLine AI`,
            ``,
            `_Reply STOP at any time to disconnect._`,
          ].join("\n");
          try {
            const jid = state.phone + "@s.whatsapp.net";
            await sock.sendMessage(jid, { text: confirmMsg });
          } catch {}
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (err) {
    state.connecting = false;
    throw err;
  }
}

export function getWAStatus() {
  return {
    connected: state.connected,
    qr: state.qr,
    phone: state.phone,
    connecting: state.connecting,
  };
}

export async function sendWAMessage(phone: string, message: string) {
  if (!state.sock || !state.connected) {
    throw new Error("WhatsApp not connected");
  }
  const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  await state.sock.sendMessage(jid, { text: message });
}

// ── Message formatters ────────────────────────────────────────────────────────

export function formatPrepMessage(signal: {
  pair: string;
  direction: string;
  category?: string;
  confidence: number;
}) {
  const dirEmoji  = signal.direction === "BUY" ? "🟢" : "🔴";
  const mktEmoji  = signal.category === "forex" ? "💱" : "₿";
  const mktLabel  = signal.category === "forex" ? "FOREX" : "CRYPTO";
  const lines = [
    `⚡ *SIGNAL INCOMING* ⚡`,
    ``,
    `${dirEmoji} *${signal.pair}* — ${signal.direction}`,
    `${mktEmoji} Market: ${mktLabel}`,
    `🤖 AI Confidence: *${signal.confidence}%*`,
    ``,
    `📋 Prepare your chart and trading account.`,
    `⏳ _Full signal with entry, TP & SL dropping now…_`,
  ];
  return lines.join("\n");
}

export function formatSignalMessage(signal: {
  pair: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  reasoning?: string;
  category?: string;
}) {
  const dirEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const arrow    = signal.direction === "BUY" ? "⬆️" : "⬇️";
  const mktEmoji = signal.category === "forex" ? "💱" : "₿";

  // Risk/reward ratio
  const risk   = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.targetPrice - signal.entryPrice);
  const rr     = risk > 0 ? (reward / risk).toFixed(1) : "—";

  // For forex show as-is; for crypto add $ prefix
  const fmt = (n: number) =>
    signal.category === "forex"
      ? n.toFixed(n < 10 ? 5 : 2)
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

  const lines = [
    `${dirEmoji} *CommandLine AI — ${signal.direction} Signal* ${arrow}`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `${mktEmoji} *${signal.pair}*`,
    ``,
    `💰 *Entry:*     ${fmt(signal.entryPrice)}`,
    `🎯 *Take Profit:* ${fmt(signal.targetPrice)}`,
    `🛑 *Stop Loss:*  ${fmt(signal.stopLoss)}`,
    `📐 *Risk/Reward:* 1 : ${rr}`,
    ``,
    `🤖 *AI Confidence:* ${signal.confidence}%`,
    ...(signal.reasoning ? [`\n📝 _${signal.reasoning}_`] : []),
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ _Powered by CommandLine AI_`,
    `Reply *STOP* to unsubscribe`,
  ];
  return lines.join("\n");
}

// ── Broadcast with preparation signal ─────────────────────────────────────────

export async function broadcastSignal(
  signal: {
    pair: string;
    direction: string;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
    reasoning?: string;
    category?: string;
  },
  subscribers: Array<{ phone: string; name: string; status: string }>
) {
  if (!state.sock || !state.connected) {
    throw new Error("WhatsApp not connected");
  }

  const prepMsg  = formatPrepMessage(signal);
  const fullMsg  = formatSignalMessage(signal);
  const active   = subscribers.filter((s) => s.status === "active");
  let sent = 0;

  for (const sub of active) {
    try {
      // 1️⃣  Preparation signal
      await sendWAMessage(sub.phone, prepMsg);

      // 2️⃣  Short suspense delay (3 seconds)
      await delay(3000);

      // 3️⃣  Full signal
      await sendWAMessage(sub.phone, fullMsg);

      sent++;

      // Polite gap between subscribers (avoid WA rate-limit)
      await delay(800);
    } catch {
      // continue even if one subscriber fails
    }
  }

  return { sent, total: active.length };
}

export function disconnectWA() {
  try {
    state.sock?.logout();
  } catch {}
  state.connected = false;
  state.qr = null;
  state.phone = null;
  state.sock = null;
  state.connecting = false;
}
