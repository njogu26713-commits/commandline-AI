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

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Personality phrase pools ──────────────────────────────────────────────────
const SIGNAL_INTROS = [
  "🚨 NEW SIGNAL", "⚡ SIGNAL ALERT", "🔔 SIGNAL INCOMING", "🎯 SIGNAL DETECTED",
];
const ENTRY_PHRASES = [
  "📍 Sweet spot alert.", "📍 This is your lane.", "📍 Get in here.",
  "📍 The door is open.", "📍 Entry zone identified.",
];
const TP_PHRASES = [
  "🎯 Time to eat.", "💰 Lunch money secured.", "🚀 We have liftoff.",
  "🎯 Destination locked.", "💎 Diamond hands target.",
];
const SL_PHRASES = [
  "🛑 Don't be a hero.", "🛑 Know when to fold.", "🫡 Retreat successful.",
  "🛑 Protect the bag.", "🛑 Live to trade another day.",
];
const CONF_PHRASES = [
  "📊 Crystal ball says...", "🤖 AI has spoken.", "📊 The numbers don't lie.",
  "🔮 Confidence check:", "📡 Signal strength:",
];
const RISK_PHRASES = [
  "⚠️ Grandma would approve.", "⚠️ Risk assessment:", "🧠 Trade wisely.",
  "⚠️ Manage your risk.", "🎲 Calculated move:",
];
const CLOSE_PHRASES = [
  "🔥 Chef's kiss. Let's get it! 💪",
  "📈 Trust the process. Stick to the plan.",
  "😤 We move. No feelings, only pips.",
  "🤝 You asked, the AI delivered. Good luck!",
  "⚡ Signal active. Set your alerts!",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Format price for display ──────────────────────────────────────────────────
function fmtPrice(price: number, category?: string): string {
  if (category === "forex") {
    return price < 10 ? price.toFixed(5) : price.toFixed(2);
  }
  return price >= 1000
    ? price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : price >= 1
    ? price.toFixed(2)
    : price.toFixed(6);
}

// ── Build the 6 conversational messages ──────────────────────────────────────
export function buildSignalMessages(signal: {
  pair: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  riskLevel?: string;
  category?: string;
  reasoning?: string;
}): string[] {
  const dirEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const cat = signal.category ?? "crypto";

  // Entry range ±0.15%
  const spread = signal.entryPrice * 0.0015;
  const entryLow  = fmtPrice(signal.entryPrice - spread, cat);
  const entryHigh = fmtPrice(signal.entryPrice + spread, cat);

  const risk = signal.riskLevel ?? (
    signal.confidence >= 80 ? "Low" : signal.confidence >= 65 ? "Medium" : "High"
  );

  const riskEmoji = risk === "Low" ? "🟢" : risk === "Medium" ? "🟡" : "🔴";

  return [
    // 1 - Pair + Direction
    `${pick(SIGNAL_INTROS)}\n\n*${signal.pair}*\n\n*${signal.direction} ${dirEmoji}*`,

    // 2 - Entry
    `${pick(ENTRY_PHRASES)}\n\n*Entry:* ${entryLow} - ${entryHigh}`,

    // 3 - Take Profit
    `${pick(TP_PHRASES)}\n\n*Take Profit:* ${fmtPrice(signal.targetPrice, cat)}`,

    // 4 - Stop Loss
    `${pick(SL_PHRASES)}\n\n*Stop Loss:* ${fmtPrice(signal.stopLoss, cat)}`,

    // 5 - Confidence
    `${pick(CONF_PHRASES)}\n\n*Confidence:* ${signal.confidence}%`,

    // 6 - Risk + Close
    `${pick(RISK_PHRASES)}\n\n*Risk Level:* ${riskEmoji} ${risk}\n\n${pick(CLOSE_PHRASES)}`,
  ];
}

// ── WhatsApp connection ───────────────────────────────────────────────────────
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
      browser: Browsers.macOS("CodeMind Signals"),
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
        state.connected  = false;
        state.qr         = null;
        state.connecting = false;
        state.sock       = null;
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => connectWhatsApp(), 3000);
        }
      }

      if (connection === "open") {
        state.connected  = true;
        state.qr         = null;
        state.connecting = false;
        state.phone      = (sock.user?.id ?? "").split(":")[0] || null;

        // Send connection confirmation
        if (state.phone) {
          await delay(2000);
          const jid = state.phone + "@s.whatsapp.net";
          const msg = [
            `✅ *CodeMind Signals — Bot Connected!*`,
            ``,
            `🤖 Your AI trading bot is live.`,
            `📲 Signals will be delivered to subscribers instantly.`,
            ``,
            `*Platform:* CodeMind Signals`,
            `*Status:* 🟢 Active`,
            ``,
            `_Reply STOP to disconnect._`,
          ].join("\n");
          try { await sock.sendMessage(jid, { text: msg }); } catch {}
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
    qr:        state.qr,
    phone:     state.phone,
    connecting: state.connecting,
  };
}

export async function sendWAMessage(phone: string, message: string) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  await state.sock.sendMessage(jid, { text: message });
}

// ── Broadcast with conversational flow ────────────────────────────────────────
export async function broadcastSignal(
  signal: {
    pair: string;
    direction: string;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
    riskLevel?: string;
    reasoning?: string;
    category?: string;
  },
  subscribers: Array<{ phone: string; name: string; status: string }>
) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");

  const messages = buildSignalMessages(signal);
  const active   = subscribers.filter((s) => s.status === "active");
  let sent = 0;

  for (const sub of active) {
    try {
      for (let i = 0; i < messages.length; i++) {
        await sendWAMessage(sub.phone, messages[i]);
        if (i < messages.length - 1) await delay(1200); // 1.2s between each message
      }
      sent++;
      await delay(1000); // 1s between subscribers
    } catch {
      // continue on failure
    }
  }

  return { sent, total: active.length };
}

export function disconnectWA() {
  try { state.sock?.logout(); } catch {}
  state.connected  = false;
  state.qr         = null;
  state.phone      = null;
  state.sock       = null;
  state.connecting = false;
}
