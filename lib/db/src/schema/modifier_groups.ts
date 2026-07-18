import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modifierGroupsTable = pgTable("modifier_groups", {
  id: serial("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModifierGroupSchema = createInsertSchema(modifierGroupsTable).omit({ id: true, createdAt: true });
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type ModifierGroup = typeof modifierGroupsTable.$inferSelect;

// Junction: modifier_groups <-> menu_items
export const menuItemModifierGroupsTable = pgTable("menu_item_modifier_groups", {
  id: serial("id").primaryKey(),
  menuItemId: integer("menu_item_id").notNull(),
  modifierGroupId: integer("modifier_group_id").notNull(),
});

export const modifiersTable = pgTable("modifiers", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  priceDelta: numeric("price_delta", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModifierSchema = createInsertSchema(modifiersTable).omit({ id: true, createdAt: true });
export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type Modifier = typeof modifiersTable.$inferSelect;
