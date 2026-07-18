import { Router } from "express";
import { eq, ilike, desc, sql } from "drizzle-orm";
import { db, customersTable, loyaltyTransactionsTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

function formatCustomer(c: any) {
  return {
    ...c,
    loyaltyPoints: c.loyaltyPoints ?? 0,
    totalOrders: c.totalOrders ?? 0,
    totalSpent: parseFloat(c.totalSpent ?? "0"),
  };
}

router.get("/customers", async (req, res): Promise<void> => {
  const { search } = req.query;
  const rows = await db.select().from(customersTable).orderBy(desc(customersTable.totalSpent));
  let filtered = rows;
  if (search) {
    const s = (search as string).toLowerCase();
    filtered = filtered.filter(r => r.name.toLowerCase().includes(s) || r.phone.includes(search as string));
  }
  res.json(filtered.map(formatCustomer));
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email } = req.body;
  if (!name || !phone) { res.status(400).json({ error: "name and phone required" }); return; }
  try {
    const [c] = await db.insert(customersTable).values({ name, phone, email: email ?? null }).returning();
    res.status(201).json(formatCustomer(c));
  } catch {
    res.status(400).json({ error: "Phone number already registered" });
  }
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  const recentOrders = await db.select().from(ordersTable).where(eq(ordersTable.customerId, id)).orderBy(desc(ordersTable.createdAt)).limit(10);
  const loyaltyHistory = await db.select().from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.customerId, id)).orderBy(desc(loyaltyTransactionsTable.createdAt)).limit(20);
  res.json({
    ...formatCustomer(c),
    recentOrders: recentOrders.map(o => ({ ...o, totalAmount: parseFloat(o.totalAmount as string), discountAmount: parseFloat(o.discountAmount as string), taxAmount: parseFloat(o.taxAmount as string) })),
    loyaltyHistory,
  });
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { name, phone, email } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  const [c] = await db.update(customersTable).set(updates).where(eq(customersTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatCustomer(c));
});

router.post("/customers/:id/redeem-points", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { points, orderId } = req.body;
  if (!points || !orderId) { res.status(400).json({ error: "points and orderId required" }); return; }
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  if (c.loyaltyPoints < points) { res.status(400).json({ error: "Insufficient loyalty points" }); return; }
  await db.update(customersTable).set({ loyaltyPoints: sql`loyalty_points - ${points}` }).where(eq(customersTable.id, id));
  const [tx] = await db.insert(loyaltyTransactionsTable).values({ customerId: id, points: -points, type: "redeemed", orderId, note: "Points redeemed at POS" }).returning();
  res.json(tx);
});

export default router;
