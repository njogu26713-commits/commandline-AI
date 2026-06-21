import { Router } from "express";
import { db } from "@workspace/db";
import { aiSessionsTable, aiMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/ai/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(aiSessionsTable).orderBy(desc(aiSessionsTable.updatedAt));
    res.json(
      sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai/sessions", async (req, res) => {
  try {
    const { title, projectId } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const [session] = await db
      .insert(aiSessionsTable)
      .values({ title, projectId: projectId ?? null })
      .returning();

    res.status(201).json({
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const messages = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.sessionId, id))
      .orderBy(aiMessagesTable.createdAt);

    res.json(
      messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const AI_RESPONSES = [
  "I've analyzed your codebase and found a few optimization opportunities. Here's a refactored version:\n\n```typescript\nexport async function optimizedHandler(req, res) {\n  const { data } = await fetchData();\n  return res.json({ success: true, data });\n}\n```\n\nThis reduces unnecessary async overhead and improves error handling.",
  "Here's the generated component:\n\n```tsx\nimport React from 'react';\n\ninterface CardProps {\n  title: string;\n  description: string;\n}\n\nexport const Card: React.FC<CardProps> = ({ title, description }) => (\n  <div className=\"rounded-lg border p-4\">\n    <h3 className=\"font-semibold\">{title}</h3>\n    <p className=\"text-muted-foreground\">{description}</p>\n  </div>\n);\n```",
  "I found the bug in your authentication flow. The issue is in the token validation — the expiry check is using UTC+0 instead of the server timezone. Here's the fix:\n\n```typescript\nconst isValid = token.exp > Date.now() / 1000;\n```",
  "Documentation generated successfully! Here's the JSDoc for your API:\n\n```typescript\n/**\n * @route GET /api/users/:id\n * @description Fetch a user by their unique ID\n * @param {string} id - User's UUID\n * @returns {User} The user object\n * @throws {404} If user not found\n */\n```",
];

router.post("/ai/sessions/:id/messages", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const [userMsg] = await db
      .insert(aiMessagesTable)
      .values({ sessionId: id, role: "user", content })
      .returning();

    const aiContent = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)];
    const [aiMsg] = await db
      .insert(aiMessagesTable)
      .values({ sessionId: id, role: "assistant", content: aiContent })
      .returning();

    await db
      .update(aiSessionsTable)
      .set({ messageCount: (await db.select().from(aiMessagesTable).where(eq(aiMessagesTable.sessionId, id))).length, updatedAt: new Date() })
      .where(eq(aiSessionsTable.id, id));

    res.status(201).json({
      ...aiMsg,
      createdAt: aiMsg.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
