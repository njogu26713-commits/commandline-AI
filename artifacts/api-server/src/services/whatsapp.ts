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

// ── AI auto-reply ─────────────────────────────────────────────────────────────
const replyCooldowns = new Map<string, number>(); // jid → last reply timestamp ms

const AI_REPLY_SYSTEM = `You are CommandLine AI — the friendly assistant for CommandLine Signals, an elite AI-powered crypto & forex trading signal service.

Your role in this group/chat:
- Answer members' questions about trading concepts, the signals service, how signals work, risk management, etc.
- Keep replies SHORT (2–4 sentences max) and use emojis naturally.
- If someone asks about a specific active signal or wants full entry/TP/SL details, tell them to check their personal DMs from the bot.
- Never post specific buy/sell signal prices in the group — those are delivered privately.
- If someone asks something totally off-topic, politely redirect to trading.
- Be encouraging, hype the community, and keep the vibe professional but fun.
- Do NOT reveal that you are Gemini or Google AI. You are "CommandLine AI".`;

async function handleIncomingMessage(
  sock: ReturnType<typeof makeWASocket>,
  jid: string,
  text: string,
  originalMsg?: any,
) {
  if (!text?.trim()) return;

  // 15-second cooldown per sender (group member or DM) to avoid rapid-fire replies
  const cooldownKey = originalMsg?.key?.participant ?? jid;
  const now = Date.now();
  if ((replyCooldowns.get(cooldownKey) ?? 0) + 15_000 > now) return;
  replyCooldowns.set(cooldownKey, now);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[AI-reply] No GEMINI_API_KEY set — skipping reply");
    return;
  }

  console.log(`[AI-reply] Generating reply for jid=${jid} text="${text.slice(0, 80)}"`);

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI  = new GoogleGenerativeAI(apiKey);
    const model  = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: AI_REPLY_SYSTEM,
    });
    const result = await model.generateContent(text);
    const reply  = result.response.text().trim();
    if (!reply) { console.warn("[AI-reply] Empty response from Gemini"); return; }

    console.log(`[AI-reply] Sending reply to ${jid}: "${reply.slice(0, 80)}"`);

    // Human-like typing delay (1–2.5 s)
    await delay(1000 + Math.random() * 1500);
    try { await sock.sendPresenceUpdate("composing", jid); } catch {}
    await delay(800);
    try { await sock.sendPresenceUpdate("paused", jid); } catch {}
    await delay(200);

    // In groups, quote-reply so the member knows the AI is talking to them
    const sendOpts: any = { text: reply };
    if (originalMsg?.key && jid.endsWith("@g.us")) {
      sendOpts.quoted = originalMsg;
    }
    await sock.sendMessage(jid, sendOpts);
  } catch (err: any) {
    console.error("[AI-reply] Failed to generate/send reply:", err?.message ?? err);
  }
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

    // ── Listen for incoming messages and reply with AI ────────────────────────
    sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
      // Only handle real-time messages; "append" is history sync — skip to avoid replaying old msgs
      if (type !== "notify") return;
      console.log(`[WA-msg] messages.upsert type=${type} count=${msgs.length}`);
      for (const msg of msgs) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue; // don't reply to own messages
        const jid = msg.key.remoteJid;
        if (!jid || jid === "status@broadcast") continue;

        // Unwrap ephemeral / viewOnce wrappers that Baileys uses in group chats
        const innerMsg =
          msg.message.ephemeralMessage?.message ??
          msg.message.viewOnceMessage?.message ??
          msg.message.viewOnceMessageV2?.message ??
          msg.message;

        // Extract text from all common message types (groups use extendedTextMessage most often)
        const text =
          innerMsg.conversation ??
          innerMsg.extendedTextMessage?.text ??
          innerMsg.imageMessage?.caption ??
          innerMsg.videoMessage?.caption ??
          innerMsg.buttonsResponseMessage?.selectedDisplayText ??
          innerMsg.listResponseMessage?.singleSelectReply?.selectedRowId ??
          "";

        const isGroup = jid.endsWith("@g.us");
        const sender  = msg.key.participant ?? jid; // participant = actual sender in groups
        console.log(`[WA-msg] From ${jid} | sender=${sender} | group=${isGroup} | type=${type} | text="${text.slice(0, 60)}"`);

        if (!text.trim()) continue;

        // Group chats: quote-reply to the member's message so it's clear who AI is talking to
        // DMs: always reply
        await handleIncomingMessage(sock, jid, text, msg);
      }
    });
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
  if (phones.length === 0) throw new Error("NO_SUBSCRIBERS");
  const participants = phones.map(toJid);
  let groupJid: string;
  try {
    const res = await state.sock.groupCreate(name, participants);
    groupJid = res.id;
  } catch (e: any) {
    // Translate raw Baileys/WA errors into human-readable messages
    const msg: string = e?.message ?? String(e);
    if (msg.includes("not-authorized") || msg.includes("403"))
      throw new Error("WhatsApp rejected the request — make sure your number can create groups");
    if (msg.includes("not-on-whatsapp") || msg.includes("invalid-participants"))
      throw new Error("One or more subscriber numbers are not on WhatsApp");
    throw new Error(`WhatsApp group creation failed: ${msg}`);
  }
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

export async function linkGroupByInvite(inviteLink: string) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");

  // Accept full URL like https://chat.whatsapp.com/ABC123XYZ or just the code
  const match = inviteLink.trim().match(/(?:chat\.whatsapp\.com\/|^)([A-Za-z0-9]+)$/);
  if (!match) throw new Error("Invalid invite link — paste a link like https://chat.whatsapp.com/XXXXXX");
  const code = match[1];

  let meta: any;
  try {
    meta = await state.sock.groupGetInviteInfo(code);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("invalid") || msg.includes("404") || msg.includes("gone"))
      throw new Error("Invite link is invalid or expired — generate a new one from the group");
    throw new Error(`Could not fetch group info: ${msg}`);
  }

  state.groupJid       = meta.id;
  state.groupName      = meta.subject ?? "Signal Group";
  state.groupInviteCode = code;

  return {
    groupJid: state.groupJid,
    name:     state.groupName,
    size:     meta.participants?.length ?? 0,
    inviteLink: `https://chat.whatsapp.com/${code}`,
  };
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

// Send multiple short messages to the group with human-like typing delays
export async function sendTypingMessagesToGroup(messages: string[], typingMs = 1200) {
  if (!state.sock || !state.connected) throw new Error("WhatsApp not connected");
  if (!state.groupJid) throw new Error("No signal group created yet");
  for (let i = 0; i < messages.length; i++) {
    if (!state.connected) throw new Error("WhatsApp disconnected mid-send");
    const jid = state.groupJid;
    // Show typing indicator for a natural-feeling duration
    try { await state.sock.sendPresenceUpdate("composing", jid); } catch {}
    await delay(typingMs + Math.floor(Math.random() * 600));
    try { await state.sock.sendPresenceUpdate("paused", jid); } catch {}
    await delay(180 + Math.floor(Math.random() * 120));
    await state.sock.sendMessage(jid, { text: messages[i] });
    // Pause between messages like a human would
    if (i < messages.length - 1) await delay(700 + Math.floor(Math.random() * 500));
  }
}

// Ask Gemini to write the group messages fresh for every signal.
// Falls back to the template pool if Gemini is unavailable.
export async function generateGroupSignalMessages(signal: {
  pair: string;
  direction: string;
  confidence: number;
  riskLevel?: string;
  reasoning?: string;
  category?: string;
}, inviteLink?: string | null): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const inviteInstruction = inviteLink
        ? `\n- If you want, you can add a 4th message inviting people to join with this link: ${inviteLink}`
        : "";

      const prompt = `You are the admin of a WhatsApp trading signals group called CommandLine Signals. A new ${signal.category ?? "trading"} signal just fired. Post 3 short, casual messages to the group — the way a real human admin would type them, not a bot.

Signal:
- Pair: ${signal.pair}
- Direction: ${signal.direction}
- Confidence: ${signal.confidence}%
- Risk: ${signal.riskLevel ?? "Medium"}
${signal.reasoning ? `- Why: ${signal.reasoning}` : ""}

Rules:
- Exactly 3 messages (or 4 if you add an invite). Each one short — 1 to 3 lines max.
- Message 1: One-liner teaser that builds curiosity. Don't give everything away.
- Message 2: Casually reveal the pair, direction, confidence and risk. Sound excited but real, not robotic. Use emojis naturally.
- Message 3: Tell them to check their personal DMs from the bot for the full entry, TP and SL. Be punchy.
- NEVER share the actual entry price, TP or SL in the group — only in DMs.
- No formal language, no bullet-point lists, no markdown headers.${inviteInstruction}

Respond ONLY with a valid JSON array of strings — no explanation, no extra text:
["msg1", "msg2", "msg3"]`;

      const result = await model.generateContent(prompt);
      const text   = result.response.text().trim();
      const match  = text.match(/\[[\s\S]*\]/);
      if (match) {
        const msgs: unknown = JSON.parse(match[0]);
        if (Array.isArray(msgs) && msgs.length >= 3 && (msgs as any[]).every((m: unknown) => typeof m === "string")) {
          return msgs as string[];
        }
      }
    } catch (e) {
      console.warn("[WA-group] Gemini unavailable — falling back to templates:", (e as any)?.message ?? e);
    }
  }

  // ── Fallback: template pools ────────────────────────────────────────────────
  return buildGroupSignalMessages(signal, inviteLink);
}

// Build short, human-style group notification messages for a signal.
// Every section is drawn from a pool so no two broadcasts look the same.
export function buildGroupSignalMessages(signal: {
  pair: string;
  direction: string;
  confidence: number;
  riskLevel?: string;
}, inviteLink?: string | null): string[] {
  const { pair, direction: dir, confidence, riskLevel } = signal;
  const emoji = dir === "BUY" ? "🟢" : "🔴";
  const risk  = riskLevel ?? "Medium";

  // ── MSG 1: teaser / opener ────────────────────────────────────────────────
  const openers = [
    `👀 *${pair} just lit up...*`,
    `🚨 New signal incoming — *${pair}*`,
    `⚡ The AI just flagged something on *${pair}*`,
    `🔔 *${pair}* — fresh setup just confirmed`,
    `💡 Our scanner just locked onto *${pair}*`,
    `📡 Signal detected — *${pair}* is moving`,
  ];

  // ── MSG 2: the actual signal detail ──────────────────────────────────────
  const confLabel = confidence >= 82 ? "very strong 💎" : confidence >= 72 ? "solid 📊" : "decent 👀";
  const detailMsgs = [
    `${emoji} *${pair} ${dir}*\nConfidence: *${confidence}%* | Risk: *${risk}* — ${confLabel} setup`,
    `The setup is *${pair} ${dir}* ${emoji}\n📊 AI confidence: *${confidence}%* | Risk level: *${risk}*`,
    `${emoji} *${dir}* on *${pair}* — ${confLabel}\n🤖 Confidence: *${confidence}%* | Risk: *${risk}*`,
    `Bot says *${dir}* on *${pair}* ${emoji}\nConfidence sitting at *${confidence}%* — ${confLabel} setup. Risk: *${risk}*`,
    `*${pair} ${dir}* ${emoji} — AI locked in at *${confidence}%* confidence\nRisk rating: *${risk}* | ${confLabel} setup`,
  ];

  // ── MSG 3: DM call-to-action ──────────────────────────────────────────────
  const ctaMsgs = [
    `📲 Full details (entry, TP1, TP2 & SL) sent to your DMs.\nCheck your private messages from the bot now 👇`,
    `📩 I've dropped the full signal in your DMs — entry price, both take profits and the stop loss are there.\nDon't sleep on it 👀`,
    `The entry, targets and stop loss are waiting in your personal DMs 🔔\nOpen your chat with the bot to see the full breakdown 👇`,
    `📲 Your DMs just got a full trade plan — entry, TP1, TP2 & stop loss.\nCheck now before the move starts 🚀`,
    `Everything you need is in your DMs right now.\nEntry • TP1 • TP2 • Stop Loss — all there. Open your bot chat 👇`,
  ];

  // ── MSG 4 (optional): invite / FOMO closer ────────────────────────────────
  const inviteMsgs = inviteLink ? [
    `Not subscribed yet? You're missing live signals 😅\nJoin the VIP list 👇\n${inviteLink}`,
    `If you haven't signed up yet, now's the time 👀\nGet access here 👇\n${inviteLink}`,
    `Share this with your trading crew 💪\nAnyone can join here 👇\n${inviteLink}`,
  ] : [];

  return [
    pick(openers),
    pick(detailMsgs),
    pick(ctaMsgs),
    ...(inviteMsgs.length ? [pick(inviteMsgs)] : []),
  ];
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
