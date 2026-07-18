import { pgTable, serial, text, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const combosTable = pgTable("combos", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  descriptionEn: text("description_en"),
  descriptionAm: text("description_am"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comboItemsTable = pgTable("combo_items", {
  id: serial("id").primaryKey(),
  comboId: integer("combo_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export const insertComboSchema = createInsertSchema(combosTable).omit({ id: true, createdAt: true });
export type InsertCombo = z.infer<typeof insertComboSchema>;
export type Combo = typeof combosTable.$inferSelect;
