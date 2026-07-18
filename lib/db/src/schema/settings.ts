import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";

export const restaurantSettingsTable = pgTable("restaurant_settings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Coffee Land"),
  nameAm: text("name_am"),
  logoUrl: text("logo_url"),
  phone: text("phone"),
  address: text("address"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("15"),
  loyaltyPointsPerEtb: numeric("loyalty_points_per_etb", { precision: 6, scale: 2 }).notNull().default("1"),
  receiptFooterText: text("receipt_footer_text"),
  primaryColor: text("primary_color"),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRestaurantSettingsSchema = createInsertSchema(restaurantSettingsTable).omit({ id: true, updatedAt: true });
export type InsertRestaurantSettings = z.infer<typeof insertRestaurantSettingsSchema>;
export type RestaurantSettings = typeof restaurantSettingsTable.$inferSelect;
