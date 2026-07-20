import { pgTable, serial, text, integer, boolean, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["admin", "manager", "cashier", "kitchen", "waiter"] }).notNull(),
  phone: text("phone"),
  email: text("email"),
  hireDate: date("hire_date", { mode: "string" }).notNull(),
  salary: numeric("salary", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  branchId: integer("branch_id").references(() => branchesTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shiftsTable = pgTable("shifts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull().defaultNow(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  totalHours: numeric("total_hours", { precision: 6, scale: 2 }),
  openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).default("0"),
  closingCash: numeric("closing_cash", { precision: 12, scale: 2 }),
  cashDifference: numeric("cash_difference", { precision: 12, scale: 2 }),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  notes: text("notes"),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
