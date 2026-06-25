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
  groupJid: string | null;
  groupName: string | null;
  groupInviteCode: string | null;
}

const state: WAState = {
  connected: false,
  qr: null,
  phone: null,
  sock: null,
  connecting: false,
  groupJid: null,
  groupName: null,
  groupInviteCode: null,
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

// ── Build the 6 terminal-style messages ──────────────────────────────────────
// WhatsApp supports code blocks via triple backticks — gives monospace terminal look
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
  const cat      = signal.category ?? "crypto";
  const dir      = signal.direction;
  const dirTag   = dir === "BUY" ? "BUY  🟢" : "SELL 🔴";
  const dirArrow = dir === "BUY" ? "▲" : "▼";

  // Entry range ±0.15%
  const spread    = signal.entryPrice * 0.0015;
  const entryLow  = fmtPrice(signal.entryPrice - spread, cat);
  const entryHigh = fmtPrice(signal.entryPrice + spread, cat);

  const risk      = signal.riskLevel ?? (signal.confidence >= 80 ? "Low" : signal.confidence >= 65 ? "Medium" : "High");
  const riskEmoji = risk === "Low" ? "🟢" : risk === "Medium" ? "🟡" : "🔴";

  // R:R ratio
  const rr = Math.abs(signal.targetPrice - signal.entryPrice) /
             Math.abs(signal.entryPrice  - signal.stopLoss);
  const rrStr = rr.toFixed(1) + "x";

  // Confidence bar (10 chars)
  const bars    = Math.round(signal.confidence / 10);
  const confBar = "█".repeat(bars) + "░".repeat(10 - bars);

  // Pad helper for alignment
  const pad = (s: string, n: number) => s.padEnd(n, " ");

  return [
    // ── MSG 1: Signal header ─────────────────────────────────────────────────
    `\`\`\`
╔══════════════════════════╗
║   CODEMIND  SIGNALS  ⚡  ║
║   [ NEW SIGNAL ALERT ]   ║
╚══════════════════════════╝

> PAIR......: ${pad(signal.pair, 12)}
> ACTION....: ${dirTag}
> MARKET....: ${cat.toUpperCase()}
> STATUS....: ✅ SIGNAL CONFIRMED
\`\`\`
${pick(SIGNAL_INTROS)} — *${signal.pair}* ${dirArrow}`,

    // ── MSG 2: Entry zone ────────────────────────────────────────────────────
    `\`\`\`
[ ENTRY ZONE DETECTED ]
────────────────────────

${pick(["SCANNING..... DONE ✓", "ANALYSIS.... DONE ✓", "PROCESSING.. DONE ✓"])}
ZONE TYPE...: ${dir === "BUY" ? "SUPPORT ZONE" : "RESISTANCE ZONE"}

ENTRY LOW...: ${pad(entryLow, 14)}
ENTRY HIGH..: ${pad(entryHigh, 14)}
\`\`\`
📍 ${pick(ENTRY_PHRASES.map(p => p.replace("📍 ", "")))}`,

    // ── MSG 3: Take profit ───────────────────────────────────────────────────
    `\`\`\`
[ TARGET LOCKED 🎯 ]
────────────────────────

TAKE PROFIT.: ${pad(fmtPrice(signal.targetPrice, cat), 14)}
R:R RATIO...: ${pad(rrStr, 14)}
DIRECTION...: ${dir === "BUY" ? "LONG  ↑" : "SHORT ↓"}
\`\`\`
🎯 ${pick(TP_PHRASES.map(p => p.replace("🎯 ", "")))}`,

    // ── MSG 4: Stop loss ─────────────────────────────────────────────────────
    `\`\`\`
[ RISK PROTOCOL 🛡️ ]
────────────────────────

STOP LOSS...: ${pad(fmtPrice(signal.stopLoss, cat), 14)}
MAX DRAWDOWN: ${Math.abs(((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)}%
PROTOCOL....: HARD STOP
\`\`\`
🛑 ${pick(SL_PHRASES.map(p => p.replace("🛑 ", "")))}`,

    // ── MSG 5: AI analysis ───────────────────────────────────────────────────
    `\`\`\`
[ AI ANALYSIS 🤖 ]
────────────────────────

CONFIDENCE..: [${confBar}] ${signal.confidence}%
MODEL.......: GEMINI 2.5 FLASH
DATA SRC....: BINANCE LIVE
SIGNAL STR..: ${signal.confidence >= 80 ? "STRONG" : signal.confidence >= 65 ? "MODERATE" : "SPECULATIVE"}
\`\`\`
📊 ${pick(CONF_PHRASES.map(p => p.replace("📊 ", "")))} *${signal.confidence}% confidence*`,

    // ── MSG 6: Risk + close ──────────────────────────────────────────────────
    `\`\`\`
[ RISK ASSESSMENT ⚠️ ]
────────────────────────

RISK LEVEL..: ${riskEmoji} ${risk.toUpperCase()}
RISK/REWARD.: ${rrStr}
EXECUTE.....: ${signal.confidence >= 70 ? "✅ YES — GO FOR IT" : "⚠️  OPTIONAL"}

> BOT ID: CODEMIND-${Date.now().toString(36).toUpperCase().slice(-6)}
\`\`\`
${riskEmoji} ${pick(RISK_PHRASES.map(p => p.replace("⚠️ ", "").replace("🧠 ", "")))} — *Risk: ${risk}*

${pick(CLOSE_PHRASES)}`,
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

// Send multiple messages with typing indicator — feels human, stays fast
export async function sendTypingMessages(
  phone: string,
  messages: string[],
  typingMs = 700,
) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  for (let i = 0; i < messages.length; i++) {
    if (!state.connected) throw new Error("WhatsApp disconnected mid-send");
    try { await state.sock.sendPresenceUpdate("composing", jid); } catch {} // non-fatal
    await delay(typingMs);
    try { await state.sock.sendPresenceUpdate("paused", jid); } catch {}
    await delay(150);
    await state.sock.sendMessage(jid, { text: messages[i] });
    if (i < messages.length - 1) await delay(800);
  }
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

  const failed: string[] = [];
  for (const sub of active) {
    if (!state.connected) {
      console.warn(`[broadcast] WhatsApp disconnected — skipping remaining ${active.length - sent - failed.length} subscriber(s)`);
      break;
    }
    try {
      for (let i = 0; i < messages.length; i++) {
        await sendWAMessage(sub.phone, messages[i]);
        if (i < messages.length - 1) await delay(800);
      }
      sent++;
      await delay(800);
    } catch (err: any) {
      failed.push(sub.phone);
      console.error(`[broadcast] Failed to send to +${sub.phone} (${sub.name}): ${err?.message ?? err}`);
      await delay(500); // brief pause before next subscriber
    }
  }

  if (failed.length > 0) console.warn(`[broadcast] ${failed.length} failed: ${failed.join(", ")}`);
  return { sent, total: active.length, failed: failed.length };
}

// ── Number Validator ─────────────────────────────────────────────────────────
export async function checkNumbersOnWhatsApp(phones: string[]): Promise<Record<string, boolean | null>> {
  const result: Record<string, boolean | null> = {};
  if (!state.sock || !state.connected) {
    for (const p of phones) result[p] = null; // null = unknown (WA not connected)
    return result;
  }
  for (const phone of phones) {
    const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    try {
      const [info] = await (state.sock as any).onWhatsApp(jid);
      result[phone] = info?.exists ?? false;
    } catch {
      // onWhatsApp may fail for some numbers — treat as unknown
      result[phone] = null;
    }
    await delay(400); // avoid hammering WA servers
  }
  return result;
}

// ── WhatsApp Group Management ─────────────────────────────────────────────────
function toJid(phone: string) {
  return phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
}

export async function createSignalGroup(name: string, phones: string[]) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  // WhatsApp requires at least 1 participant; use a placeholder if none exist yet
  const participants = phones.length > 0 ? phones.map(toJid) : [];
  const { id: groupJid } = await state.sock.groupCreate(name, participants);
  state.groupJid  = groupJid;
  state.groupName = name;
  try {
    const code = await state.sock.groupInviteCode(groupJid);
    state.groupInviteCode = code;
  } catch {}
  return { groupJid, name, inviteCode: state.groupInviteCode };
}

export async function addToSignalGroup(phones: string[]) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  if (!state.groupJid) throw new Error("No signal group created yet");
  const participants = phones.map(toJid);
  await state.sock.groupParticipantsUpdate(state.groupJid, participants, "add");
  return { added: phones.length };
}

export async function removeFromSignalGroup(phones: string[]) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  if (!state.groupJid) throw new Error("No signal group exists");
  const participants = phones.map(toJid);
  await state.sock.groupParticipantsUpdate(state.groupJid, participants, "remove");
  return { removed: phones.length };
}

export async function getSignalGroupInfo() {
  if (!state.groupJid || !state.sock || !state.connected) {
    return { groupJid: null, name: null, inviteLink: null, size: 0, exists: false };
  }
  try {
    const meta = await state.sock.groupMetadata(state.groupJid);
    if (!state.groupInviteCode) {
      try { state.groupInviteCode = await state.sock.groupInviteCode(state.groupJid); } catch {}
    }
    return {
      exists: true,
      groupJid: state.groupJid,
      name: meta.subject ?? state.groupName,
      size: meta.participants?.length ?? 0,
      inviteLink: state.groupInviteCode ? `https://chat.whatsapp.com/${state.groupInviteCode}` : null,
    };
  } catch {
    return { groupJid: state.groupJid, name: state.groupName, inviteLink: null, size: 0, exists: false };
  }
}

export async function sendMessageToGroup(text: string) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  if (!state.groupJid) throw new Error("No signal group created yet");
  await state.sock.sendMessage(state.groupJid, { text });
}

export function disconnectWA() {
  try { state.sock?.logout(); } catch {}
  state.connected  = false;
  state.qr         = null;
  state.phone      = null;
  state.sock       = null;
  state.connecting = false;
  state.groupJid   = null;
  state.groupName  = null;
  state.groupInviteCode = null;
}
