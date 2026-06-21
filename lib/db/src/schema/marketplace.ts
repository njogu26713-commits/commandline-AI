import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketplaceItemsTable = pgTable("marketplace_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: real("price").notNull().default(0),
  author: text("author").notNull(),
  downloads: integer("downloads").notNull().default(0),
  rating: real("rating").notNull().default(0),
  tags: text("tags").array().notNull().default([]),
  previewUrl: text("preview_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMarketplaceItemSchema = createInsertSchema(marketplaceItemsTable).omit({ id: true, createdAt: true, downloads: true, rating: true });
export type InsertMarketplaceItem = z.infer<typeof insertMarketplaceItemSchema>;
export type MarketplaceItem = typeof marketplaceItemsTable.$inferSelect;
