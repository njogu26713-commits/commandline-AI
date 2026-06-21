import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, issuesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// Mock file structure for a project
function generateFiles(projectId: number) {
  return [
    { name: "src", path: "src", type: "directory", size: 0, lastCommit: "Initial commit", lastCommitDate: new Date(Date.now() - 86400000).toISOString() },
    { name: "package.json", path: "package.json", type: "file", size: 1240, lastCommit: "Update dependencies", lastCommitDate: new Date(Date.now() - 3600000).toISOString() },
    { name: "README.md", path: "README.md", type: "file", size: 2048, lastCommit: "Update README", lastCommitDate: new Date(Date.now() - 7200000).toISOString() },
    { name: "tsconfig.json", path: "tsconfig.json", type: "file", size: 512, lastCommit: "Initial commit", lastCommitDate: new Date(Date.now() - 86400000 * 3).toISOString() },
    { name: ".gitignore", path: ".gitignore", type: "file", size: 200, lastCommit: "Initial commit", lastCommitDate: new Date(Date.now() - 86400000 * 3).toISOString() },
    { name: "index.ts", path: "src/index.ts", type: "file", size: 3200, lastCommit: "Add main entry point", lastCommitDate: new Date(Date.now() - 1800000).toISOString() },
    { name: "routes.ts", path: "src/routes.ts", type: "file", size: 4800, lastCommit: "Add API routes", lastCommitDate: new Date(Date.now() - 3600000 * 2).toISOString() },
  ];
}

function generateCommits(projectId: number) {
  const messages = [
    "feat: add authentication middleware",
    "fix: resolve CORS issue in API",
    "refactor: optimize database queries",
    "docs: update API documentation",
    "chore: bump dependencies",
    "feat: implement rate limiting",
    "fix: handle edge case in user validation",
    "test: add unit tests for auth module",
  ];
  return messages.map((msg, i) => ({
    id: i + 1,
    sha: Math.random().toString(36).substring(2, 10),
    message: msg,
    author: "dev",
    date: new Date(Date.now() - i * 86400000 * (i + 1)).toISOString(),
    additions: Math.floor(Math.random() * 100) + 10,
    deletions: Math.floor(Math.random() * 30),
  }));
}

function generateBranches() {
  return [
    { name: "main", isDefault: true, lastCommit: "feat: add authentication middleware", updatedAt: new Date().toISOString(), aheadBy: 0, behindBy: 0 },
    { name: "feature/ai-builder", isDefault: false, lastCommit: "WIP: AI code generation", updatedAt: new Date(Date.now() - 3600000).toISOString(), aheadBy: 3, behindBy: 1 },
    { name: "fix/cors-issue", isDefault: false, lastCommit: "fix: resolve CORS issue", updatedAt: new Date(Date.now() - 7200000).toISOString(), aheadBy: 1, behindBy: 0 },
  ];
}

router.get("/projects/:id/files", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    res.json(generateFiles(id));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:id/commits", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    res.json(generateCommits(id));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:id/branches", async (req, res) => {
  try {
    res.json(generateBranches());
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:id/issues", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, id)).orderBy(desc(issuesTable.createdAt));
    res.json(
      issues.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/issues", async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { title, description, priority, labels } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const [issue] = await db
      .insert(issuesTable)
      .values({ projectId, title, description, priority: priority ?? "medium", labels: labels ?? [] })
      .returning();

    res.status(201).json({
      ...issue,
      createdAt: issue.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
