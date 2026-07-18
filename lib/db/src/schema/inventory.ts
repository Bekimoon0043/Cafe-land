import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ingredientsTable = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit", { enum: ["kg", "g", "liter", "ml", "piece", "pack"] }).notNull(),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  reorderThreshold: numeric("reorder_threshold", { precision: 12, scale: 3 }).notNull().default("0"),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }).notNull().default("0"),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  branchId: integer("branch_id").references(() => branchesTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  menuItemId: integer("menu_item_id").notNull().unique(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull(),
  ingredientId: integer("ingredient_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
});

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status", { enum: ["pending", "received", "cancelled"] }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  ingredientId: integer("ingredient_id").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
});

export const wasteLogsTable = pgTable("waste_logs", {
  id: serial("id").primaryKey(),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  reason: text("reason").notNull(),
  loggedById: integer("logged_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIngredientSchema = createInsertSchema(ingredientsTable).omit({ id: true, updatedAt: true });
export type InsertIngredient = z.infer<typeof insertIngredientSchema>;
export type Ingredient = typeof ingredientsTable.$inferSelect;

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
