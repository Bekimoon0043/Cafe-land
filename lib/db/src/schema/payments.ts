import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentProvidersTable = pgTable("payment_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type", { enum: ["cash", "cbe", "telebirr"] }).notNull(),
  baseVerificationUrl: text("base_verification_url"),
  receiverAccountNo: text("receiver_account_no"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  providerType: text("provider_type", { enum: ["cash", "cbe", "telebirr"] }).notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentMode: text("payment_mode"),
  payerName: text("payer_name"),
  payerAccountNo: text("payer_account_no"),
  receiverName: text("receiver_name"),
  receiverAccountNo: text("receiver_account_no"),
  paymentDate: text("payment_date"),
  invoiceNo: text("invoice_no"),
  receiptId: text("receipt_id"),
  status: text("status", { enum: ["pending", "verified", "failed", "manual_review", "rejected"] }).notNull().default("pending"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;

export const insertPaymentProviderSchema = createInsertSchema(paymentProvidersTable).omit({ id: true, createdAt: true });
export type InsertPaymentProvider = z.infer<typeof insertPaymentProviderSchema>;
export type PaymentProvider = typeof paymentProvidersTable.$inferSelect;
