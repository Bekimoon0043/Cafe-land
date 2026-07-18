import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, restaurantSettingsTable, branchesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const [s] = await db.select().from(restaurantSettingsTable);
  if (!s) { res.status(404).json({ error: "Settings not configured" }); return; }
  res.json({ ...s, vatRate: parseFloat(s.vatRate as string), loyaltyPointsPerEtb: parseFloat(s.loyaltyPointsPerEtb as string) });
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const { name, nameAm, logoUrl, phone, address, vatRate, loyaltyPointsPerEtb, receiptFooterText, primaryColor } = req.body;
  const [existing] = await db.select().from(restaurantSettingsTable);
  if (!existing) { res.status(404).json({ error: "Settings not found" }); return; }
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (nameAm !== undefined) updates.nameAm = nameAm;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  if (vatRate !== undefined) updates.vatRate = String(vatRate);
  if (loyaltyPointsPerEtb !== undefined) updates.loyaltyPointsPerEtb = String(loyaltyPointsPerEtb);
  if (receiptFooterText !== undefined) updates.receiptFooterText = receiptFooterText;
  if (primaryColor !== undefined) updates.primaryColor = primaryColor;
  const [s] = await db.update(restaurantSettingsTable).set(updates).where(eq(restaurantSettingsTable.id, existing.id)).returning();
  res.json({ ...s, vatRate: parseFloat(s.vatRate as string), loyaltyPointsPerEtb: parseFloat(s.loyaltyPointsPerEtb as string) });
});

router.get("/settings/branches", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(rows);
});

router.post("/settings/branches", requireAuth, async (req, res): Promise<void> => {
  const { name, address, phone, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(branchesTable).values({ name, address: address ?? null, phone: phone ?? null, isActive: isActive ?? true }).returning();
  res.status(201).json(row);
});

export default router;
