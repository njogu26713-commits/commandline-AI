import { Router } from "express";
import { db } from "@workspace/db";
import { deploymentsTable, deploymentLogsTable, projectsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/deployments", async (req, res) => {
  try {
    const deployments = await db.select().from(deploymentsTable).orderBy(desc(deploymentsTable.createdAt));
    res.json(
      deployments.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/deployments", async (req, res) => {
  try {
    const { projectId, environment, provider, branch } = req.body;
    if (!projectId || !environment || !provider) {
      return res.status(400).json({ error: "projectId, environment, provider are required" });
    }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    const projectName = project?.name ?? `Project ${projectId}`;

    const [deployment] = await db
      .insert(deploymentsTable)
      .values({
        projectId,
        projectName,
        status: "building",
        environment: environment ?? "production",
        provider: provider ?? "vercel",
        branch: branch ?? "main",
        duration: Math.floor(Math.random() * 60) + 30,
        url: provider === "vercel" ? `https://${projectName.toLowerCase()}.vercel.app` : null,
      })
      .returning();

    // Add some mock logs
    await db.insert(deploymentLogsTable).values([
      { deploymentId: deployment.id, level: "info", message: "Starting deployment...", timestamp: new Date() },
      { deploymentId: deployment.id, level: "info", message: "Installing dependencies...", timestamp: new Date() },
      { deploymentId: deployment.id, level: "info", message: "Building application...", timestamp: new Date() },
      { deploymentId: deployment.id, level: "info", message: "Running type checks...", timestamp: new Date() },
      { deploymentId: deployment.id, level: "info", message: "Deployment successful!", timestamp: new Date() },
    ]);

    // Mark as success
    await db.update(deploymentsTable).set({ status: "success" }).where(eq(deploymentsTable.id, deployment.id));

    res.status(201).json({
      ...deployment,
      status: "success",
      createdAt: deployment.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/deployments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, id));
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    res.json({
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/deployments/:id/logs", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const logs = await db.select().from(deploymentLogsTable).where(eq(deploymentLogsTable.deploymentId, id)).orderBy(deploymentLogsTable.timestamp);

    res.json(
      logs.map((l) => ({
        ...l,
        timestamp: l.timestamp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
