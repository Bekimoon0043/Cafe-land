import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";

export const tablesTable = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status", { enum: ["free", "occupied", "reserved", "cleaning"] }).notNull().default("free"),
  currentOrderId: integer("current_order_id"),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTableSchema = createInsertSchema(tablesTable).omit({ id: true, createdAt: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tablesTable.$inferSelect;
