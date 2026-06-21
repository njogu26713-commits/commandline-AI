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

export function formatSignalMessage(signal: {
  pair: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  reasoning?: string;
}) {
  const emoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const arrow = signal.direction === "BUY" ? "⬆️" : "⬇️";
  const pnlPct = (
    ((signal.targetPrice - signal.entryPrice) / signal.entryPrice) *
    100
  ).toFixed(2);
  return (
    `${emoji} *CommandLine AI Signal* ${arrow}\n\n` +
    `📊 *${signal.pair}* — ${signal.direction}\n` +
    `💰 Entry:    $${signal.entryPrice}\n` +
    `🎯 Target:   $${signal.targetPrice}  (+${pnlPct}%)\n` +
    `🛑 Stop Loss: $${signal.stopLoss}\n` +
    `🤖 AI Confidence: *${signal.confidence}%*\n` +
    (signal.reasoning ? `\n📝 ${signal.reasoning}\n` : "") +
    `\n⚡ _Powered by CommandLine AI_\n` +
    `Reply *STOP* to unsubscribe`
  );
}

export async function broadcastSignal(
  signal: {
    pair: string;
    direction: string;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
    reasoning?: string;
  },
  subscribers: Array<{ phone: string; name: string; status: string }>
) {
  if (!state.sock || !state.connected) {
    throw new Error("WhatsApp not connected");
  }

  const message = formatSignalMessage(signal);
  const active = subscribers.filter((s) => s.status === "active");
  let sent = 0;

  for (const sub of active) {
    try {
      await sendWAMessage(sub.phone, message);
      sent++;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      // continue even if one fails
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
