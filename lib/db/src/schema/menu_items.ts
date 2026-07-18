import { pgTable, serial, text, integer, boolean, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { branchesTable } from "./branches";

export const menuItemsTable = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  descriptionEn: text("description_en"),
  descriptionAm: text("description_am"),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  prepTimeMinutes: integer("prep_time_minutes").notNull().default(10),
  branchId: integer("branch_id").references(() => branchesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  categoryIdIdx: index("category_id_idx").on(table.categoryId),
  isAvailableIdx: index("is_available_idx").on(table.isAvailable),
  branchIdIdx: index("branch_id_idx").on(table.branchId),
}));

export const insertMenuItemSchema = createInsertSchema(menuItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItemsTable.$inferSelect;
