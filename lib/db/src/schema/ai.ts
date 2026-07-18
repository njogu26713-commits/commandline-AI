import { Schema, model } from "mongoose";

// ── AI Session ────────────────────────────────────────────────────────────────
export interface AiSession {
  id: string;
  title: string;
  projectId?: number | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const aiSessionSchema = new Schema(
  {
    title:        { type: String, required: true },
    projectId:    { type: Number, default: null },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const AiSessionModel = model("AiSession", aiSessionSchema);

// ── AI Message ─────────────────────────────────────────────────────────────────
export interface AiMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}

const aiMessageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true, ref: "AiSession" },
    role:      { type: String, required: true },
    content:   { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AiMessageModel = model("AiMessage", aiMessageSchema);
