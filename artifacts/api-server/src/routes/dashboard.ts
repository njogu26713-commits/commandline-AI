import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, deploymentsTable, aiSessionsTable, aiMessagesTable, activityTable } from "@workspace/db";
import { count, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  try {
    const [projectCount] = await db.select({ count: count() }).from(projectsTable);
    const [deploymentCount] = await db.select({ count: count() }).from(deploymentsTable);
    const [messageCount] = await db.select({ count: count() }).from(aiMessagesTable);

    res.json({
      totalProjects: projectCount.count,
      activeDeployments: deploymentCount.count,
      aiTokensUsed: messageCount.count * 450,
      totalRevenue: 4820.50,
      projectsThisMonth: Math.min(projectCount.count, 8),
      deploymentsToday: Math.min(deploymentCount.count, 5),
      revenueChange: 12.4,
      deploymentSuccessRate: 96.8,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/activity", async (req, res) => {
  try {
    const activities = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.createdAt))
      .limit(20);

    res.json(
      activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        projectName: a.projectName,
        createdAt: a.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/ai-usage", async (req, res) => {
  try {
    const [messageCount] = await db.select({ count: count() }).from(aiMessagesTable);

    const dailyUsage = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyUsage.push({
        date: d.toISOString().split("T")[0],
        tokens: Math.floor(Math.random() * 8000) + 2000,
      });
    }

    res.json({
      totalTokens: messageCount.count * 450,
      tokensThisMonth: messageCount.count * 220,
      requestsToday: Math.max(messageCount.count, 12),
      dailyUsage,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/revenue", async (req, res) => {
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      monthlyData.push({
        month: months[d.getMonth()],
        revenue: Math.floor(Math.random() * 2000) + 500,
      });
    }

    res.json({
      totalRevenue: 24820.5,
      monthlyRevenue: 4820.5,
      activeSubscriptions: 42,
      monthlyData,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
