import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, contributionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/users/me", async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).limit(1);
    if (!user) {
      return res.json({
        id: 1,
        username: "dev",
        displayName: "Developer",
        bio: "Building the future with AI",
        avatarUrl: null,
        location: "San Francisco, CA",
        website: "https://codevault.dev",
        totalProjects: 0,
        totalStars: 0,
        followers: 128,
        following: 64,
        achievements: ["Early Adopter", "AI Pioneer", "Deploy Master"],
        joinedAt: new Date().toISOString(),
      });
    }
    res.json({
      ...user,
      joinedAt: user.joinedAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/:username", async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, req.params.username));
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      ...user,
      joinedAt: user.joinedAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/me/contributions", async (req, res) => {
  try {
    const contributions = await db.select().from(contributionsTable).where(eq(contributionsTable.userId, 1)).orderBy(contributionsTable.date);
    res.json(contributions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
