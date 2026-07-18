import { pgTable, serial, text, integer, numeric, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { tablesTable } from "./tables";
import { customersTable } from "./customers";
import { usersTable } from "./users";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  orderType: text("order_type", { enum: ["dine_in", "takeaway", "delivery"] }).notNull(),
  status: text("status", { enum: ["pending", "preparing", "ready", "served", "completed", "cancelled"] }).notNull().default("pending"),
  tableId: integer("table_id").references(() => tablesTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  staffId: integer("staff_id").references(() => usersTable.id),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  deliveryAddress: text("delivery_address"),
  cancelReason: text("cancel_reason"),
  branchId: integer("branch_id").references(() => branchesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orderNumberIdx: index("orders_order_number_idx").on(table.orderNumber),
  statusIdx: index("orders_status_idx").on(table.status),
  tableIdIdx: index("orders_table_id_idx").on(table.tableId),
  branchIdIdx: index("orders_branch_id_idx").on(table.branchId),
  createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
}));

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  menuItemId: integer("menu_item_id").notNull(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  selectedModifiers: jsonb("selected_modifiers").default("[]"),
  notes: text("notes"),
  status: text("status", { enum: ["pending", "preparing", "ready"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
