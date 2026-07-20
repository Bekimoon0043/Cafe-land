import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { paymentsTable } from "./payments";
import { usersTable } from "./users";

export const refundsTable = pgTable("refunds", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  paymentId: integer("payment_id").references(() => paymentsTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  method: text("method", { enum: ["cash", "transfer", "original_method"] }).notNull().default("cash"),
  status: text("status", { enum: ["pending", "completed", "cancelled"] }).notNull().default("completed"),
  notes: text("notes"),
  staffId: integer("staff_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRefundSchema = createInsertSchema(refundsTable).omit({ id: true, createdAt: true });
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refundsTable.$inferSelect;
