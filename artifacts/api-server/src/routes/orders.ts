import { Router } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, tablesTable, usersTable, customersTable, menuItemsTable, loyaltyTransactionsTable, restaurantSettingsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { deductStockForOrder } from "./inventory";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function formatOrder(order: any) {
  return {
    ...order,
    totalAmount: parseFloat(order.totalAmount ?? "0"),
    discountAmount: parseFloat(order.discountAmount ?? "0"),
    taxAmount: parseFloat(order.taxAmount ?? "0"),
  };
}

function generateOrderNumber(): string {
  const now = new Date();
  const prefix = "CL";
  const ts = now.getFullYear().toString().slice(-2) + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${ts}${rand}`;
}

router.get("/orders", async (req, res): Promise<void> => {
  const { status, orderType, tableId, date, limit } = req.query;
  const rows = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber, orderType: ordersTable.orderType,
    status: ordersTable.status, tableId: ordersTable.tableId, tableLabel: tablesTable.label,
    customerId: ordersTable.customerId, customerName: customersTable.name,
    staffId: ordersTable.staffId, staffName: usersTable.username,
    totalAmount: ordersTable.totalAmount, discountAmount: ordersTable.discountAmount,
    taxAmount: ordersTable.taxAmount, notes: ordersTable.notes, deliveryAddress: ordersTable.deliveryAddress,
    branchId: ordersTable.branchId, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
  }).from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(usersTable, eq(ordersTable.staffId, usersTable.id))
    .orderBy(desc(ordersTable.createdAt));

  let filtered = rows;
  if (status) filtered = filtered.filter(r => r.status === status);
  if (orderType) filtered = filtered.filter(r => r.orderType === orderType);
  if (tableId) filtered = filtered.filter(r => r.tableId === parseInt(tableId as string, 10));
  if (date) { const d = date as string; filtered = filtered.filter(r => r.createdAt.toISOString().startsWith(d)); }
  const lim = limit ? parseInt(limit as string, 10) : 50;
  res.json(filtered.slice(0, lim).map(formatOrder));
});

// ─── Public QR-menu order ────────────────────────────────────────────────────
router.post("/orders/public", async (req, res): Promise<void> => {
  const { tableId, notes, items } = req.body;
  if (!items?.length) { res.status(400).json({ error: "items required" }); return; }
  const [settings] = await db.select().from(restaurantSettingsTable);
  const vatRate = parseFloat(settings?.vatRate as string ?? "15") / 100;
  let subtotal = 0;
  const itemDetails = [];
  for (const item of items) {
    const [dbItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, item.menuItemId));
    if (!dbItem) { res.status(400).json({ error: `Item ${item.menuItemId} not found` }); return; }
    if (!dbItem.isAvailable) { res.status(400).json({ error: `Item ${dbItem.nameEn} is not available` }); return; }
    const price = parseFloat(dbItem.price);
    subtotal += price * item.quantity;
    itemDetails.push({ ...item, unitPrice: price, nameEn: dbItem.nameEn, nameAm: dbItem.nameAm });
  }
  const tax = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  let orderNumber = generateOrderNumber();
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
  if (existing) orderNumber = generateOrderNumber() + "Q";
  let branchId: number | null = null;
  if (tableId) {
    const [t] = await db.select().from(tablesTable).where(eq(tablesTable.id, tableId));
    branchId = t?.branchId ?? null;
  }
  const [order] = await db.insert(ordersTable).values({
    orderNumber, orderType: "dine_in", status: "awaiting_payment",
    tableId: tableId ?? null, customerId: null, staffId: null,
    notes: notes ?? "QR order", deliveryAddress: null,
    discountAmount: "0", taxAmount: String(tax), totalAmount: String(total), branchId,
  }).returning();
  for (const item of itemDetails) {
    await db.insert(orderItemsTable).values({ orderId: order.id, menuItemId: item.menuItemId, nameEn: item.nameEn, nameAm: item.nameAm, quantity: item.quantity, unitPrice: String(item.unitPrice), totalPrice: String(Math.round(item.unitPrice * item.quantity * 100) / 100), selectedModifiers: [], notes: null, status: "pending" });
  }
  if (tableId) {
    await db.update(tablesTable).set({ status: "occupied", currentOrderId: order.id }).where(eq(tablesTable.id, tableId));
  }
  res.status(201).json(formatOrder({ ...order, tableLabel: null, customerName: null, staffName: "QR Customer" }));
});

// ── POS / Staff order ─────────────────────────────────────────────────────────
router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { orderType, tableId, customerId, notes, deliveryAddress, discountAmount, branchId, items } = req.body;
  if (!orderType || !items?.length) { res.status(400).json({ error: "orderType and items required" }); return; }
  const [settings] = await db.select().from(restaurantSettingsTable);
  const vatRate = parseFloat(settings?.vatRate as string ?? "15") / 100;
  let subtotal = 0;
  const itemDetails = [];
  for (const item of items) {
    const [dbItem] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, item.menuItemId));
    if (!dbItem) { res.status(400).json({ error: `Item ${item.menuItemId} not found` }); return; }
    const price = parseFloat(dbItem.price);
    let itemTotal = price * item.quantity;
    for (const mod of item.selectedModifiers ?? []) {
      itemTotal += parseFloat(String(mod.priceDelta)) * item.quantity;
    }
    subtotal += itemTotal;
    itemDetails.push({ ...item, unitPrice: price, nameEn: dbItem.nameEn, nameAm: dbItem.nameAm });
  }
  const discount = parseFloat(String(discountAmount ?? 0));
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * vatRate * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  let orderNumber = generateOrderNumber();
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
  if (existing) orderNumber = generateOrderNumber() + "X";
  const [order] = await db.insert(ordersTable).values({
    orderNumber, orderType, status: "pending",
    tableId: tableId ?? null, customerId: customerId ?? null,
    staffId: user.userId, notes: notes ?? null,
    deliveryAddress: deliveryAddress ?? null,
    discountAmount: String(discount), taxAmount: String(tax), totalAmount: String(total),
    branchId: branchId ?? user.branchId ?? null,
  }).returning();
  for (const item of itemDetails) {
    let itemTotal = item.unitPrice * item.quantity;
    for (const mod of item.selectedModifiers ?? []) itemTotal += parseFloat(String(mod.priceDelta)) * item.quantity;
    await db.insert(orderItemsTable).values({ orderId: order.id, menuItemId: item.menuItemId, nameEn: item.nameEn, nameAm: item.nameAm, quantity: item.quantity, unitPrice: String(item.unitPrice), totalPrice: String(Math.round(itemTotal * 100) / 100), selectedModifiers: item.selectedModifiers ?? [], notes: item.notes ?? null, status: "pending" });
  }
  if (tableId) {
    await db.update(tablesTable).set({ status: "occupied", currentOrderId: order.id }).where(eq(tablesTable.id, tableId));
  }
  // ── Deduct stock based on recipes (POS orders go straight to kitchen) ───────
  try {
    await deductStockForOrder(order.id, itemDetails.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })), user.userId);
  } catch (err) {
    // Stock deduction failure is non-fatal — order still succeeds
    console.error("Stock deduction warning:", err);
  }
  // ── Update customer stats ─────────────────────────────────────────────────
  if (customerId) {
    await db.update(customersTable).set({ totalOrders: sql`total_orders + 1`, totalSpent: sql`total_spent + ${total}` }).where(eq(customersTable.id, customerId));
  }
  await logAudit(user, "create", "order", order.id, `total=${total},discount=${discount}`);
  res.status(201).json(formatOrder({ ...order, tableLabel: null, customerName: null, staffName: user.username }));
});

router.get("/orders/kds", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber, orderType: ordersTable.orderType,
    status: ordersTable.status, tableId: ordersTable.tableId, tableLabel: tablesTable.label,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .where(sql`${ordersTable.status} IN ('pending', 'preparing')`)
    .orderBy(ordersTable.createdAt);
  const result = await Promise.all(rows.map(async (o) => {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, o.id));
    const elapsed = Math.floor((Date.now() - o.createdAt.getTime()) / 60000);
    return { ...o, items: items.map(i => ({ ...i, unitPrice: parseFloat(i.unitPrice as string), totalPrice: parseFloat(i.totalPrice as string) })), elapsedMinutes: elapsed };
  }));
  res.json(result);
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [order] = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber, orderType: ordersTable.orderType,
    status: ordersTable.status, tableId: ordersTable.tableId, tableLabel: tablesTable.label,
    customerId: ordersTable.customerId, customerName: customersTable.name,
    staffId: ordersTable.staffId, staffName: usersTable.username,
    totalAmount: ordersTable.totalAmount, discountAmount: ordersTable.discountAmount,
    taxAmount: ordersTable.taxAmount, notes: ordersTable.notes, deliveryAddress: ordersTable.deliveryAddress,
    branchId: ordersTable.branchId, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
  }).from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(usersTable, eq(ordersTable.staffId, usersTable.id))
    .where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  res.json({ ...formatOrder(order), items: items.map(i => ({ ...i, unitPrice: parseFloat(i.unitPrice as string), totalPrice: parseFloat(i.totalPrice as string) })) });
});

router.patch("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { notes, tableId, customerId, discountAmount } = req.body;
  const updates: any = {};
  if (notes !== undefined) updates.notes = notes;
  if (tableId !== undefined) updates.tableId = tableId;
  if (customerId !== undefined) updates.customerId = customerId;
  if (discountAmount !== undefined) updates.discountAmount = String(discountAmount);
  const [order] = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatOrder({ ...order, tableLabel: null, customerName: null, staffName: null }));
});

router.patch("/orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "status required" }); return; }
  const [order] = await db.update(ordersTable).set({ status }).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if ((status === "completed" || status === "served") && order.tableId) {
    await db.update(tablesTable).set({ status: "free", currentOrderId: null }).where(eq(tablesTable.id, order.tableId));
  }
  if (status === "completed" && order.customerId) {
    const [settings] = await db.select().from(restaurantSettingsTable);
    const rate = parseFloat(settings?.loyaltyPointsPerEtb as string ?? "1");
    const total = parseFloat(order.totalAmount as string);
    const points = Math.floor(total * rate);
    if (points > 0) {
      await db.update(customersTable).set({ loyaltyPoints: sql`loyalty_points + ${points}`, totalOrders: sql`total_orders + 1`, totalSpent: sql`total_spent + ${total}` }).where(eq(customersTable.id, order.customerId));
      await db.insert(loyaltyTransactionsTable).values({ customerId: order.customerId, points, type: "earned", orderId: id });
    }
  }
  await logAudit(user, `status_${status}`, "order", id);
  res.json(formatOrder({ ...order, status, tableLabel: null, customerName: null, staffName: null }));
});

router.post("/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const { reason } = req.body;
  if (!reason) { res.status(400).json({ error: "reason required" }); return; }
  const [order] = await db.update(ordersTable).set({ status: "cancelled", cancelReason: reason }).where(eq(ordersTable.id, id)).returning();
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (order.tableId) await db.update(tablesTable).set({ status: "free", currentOrderId: null }).where(eq(tablesTable.id, order.tableId));
  await logAudit(user, "cancel", "order", id, reason);
  res.json(formatOrder({ ...order, tableLabel: null, customerName: null, staffName: null }));
});

router.get("/orders/:id/receipt", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [order] = await db.select({
    id: ordersTable.id, orderNumber: ordersTable.orderNumber, orderType: ordersTable.orderType,
    tableId: ordersTable.tableId, tableLabel: tablesTable.label,
    staffId: ordersTable.staffId, staffName: usersTable.username,
    totalAmount: ordersTable.totalAmount, discountAmount: ordersTable.discountAmount,
    taxAmount: ordersTable.taxAmount, createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .leftJoin(tablesTable, eq(ordersTable.tableId, tablesTable.id))
    .leftJoin(usersTable, eq(ordersTable.staffId, usersTable.id))
    .where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  const [settings] = await db.select().from(restaurantSettingsTable);
  const total = parseFloat(order.totalAmount as string);
  const discount = parseFloat(order.discountAmount as string ?? "0");
  const tax = parseFloat(order.taxAmount as string ?? "0");
  res.json({
    orderNumber: order.orderNumber, orderType: order.orderType,
    tableLabel: order.tableLabel, staffName: order.staffName,
    items: items.map(i => ({ ...i, unitPrice: parseFloat(i.unitPrice as string), totalPrice: parseFloat(i.totalPrice as string) })),
    subtotal: total - tax, discount, tax, total,
    paymentMethod: null,
    restaurantName: settings?.name ?? "Coffee Land",
    restaurantPhone: settings?.phone ?? null,
    footerText: settings?.receiptFooterText ?? null,
    createdAt: order.createdAt,
  });
});

export default router;
