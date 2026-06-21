import { Router } from "express";
import { db } from "@workspace/db";
import { marketplaceItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/marketplace/items", async (req, res) => {
  try {
    const items = await db.select().from(marketplaceItemsTable).orderBy(desc(marketplaceItemsTable.downloads));
    res.json(
      items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/marketplace/items", async (req, res) => {
  try {
    const { title, description, category, price, tags } = req.body;
    if (!title || !description || !category) {
      return res.status(400).json({ error: "title, description, category are required" });
    }

    const [item] = await db
      .insert(marketplaceItemsTable)
      .values({ title, description, category, price: price ?? 0, author: "You", tags: tags ?? [] })
      .returning();

    res.status(201).json({
      ...item,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/marketplace/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [item] = await db.select().from(marketplaceItemsTable).where(eq(marketplaceItemsTable.id, id));
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({
      ...item,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
