import { Router } from "express";
import { eq, lte, sql, desc } from "drizzle-orm";
import {
  db, ingredientsTable, suppliersTable, purchaseOrdersTable, purchaseOrderItemsTable,
  wasteLogsTable, recipesTable, recipeIngredientsTable, usersTable,
  stockMovementsTable, supplierPaymentsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function formatIngredient(i: any) {
  return {
    ...i,
    currentStock: parseFloat(i.currentStock ?? "0"),
    reorderThreshold: parseFloat(i.reorderThreshold ?? "0"),
    costPerUnit: parseFloat(i.costPerUnit ?? "0"),
    isLowStock: parseFloat(i.currentStock ?? "0") <= parseFloat(i.reorderThreshold ?? "0"),
    isOutOfStock: parseFloat(i.currentStock ?? "0") <= 0,
  };
}

// ── Stock deduction helper (used by orders route too) ─────────────────────────
export async function deductStockForOrder(
  orderId: number,
  items: { menuItemId: number; quantity: number }[],
  staffId: number | null
) {
  for (const item of items) {
    const recipes = await db.select().from(recipesTable).where(eq(recipesTable.menuItemId, item.menuItemId));
    if (!recipes.length) continue;
    const recipeIngredients = await db.select({
      ingredientId: recipeIngredientsTable.ingredientId,
      quantity: recipeIngredientsTable.quantity,
    }).from(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, recipes[0].id));

    for (const ri of recipeIngredients) {
      const needed = parseFloat(ri.quantity as string) * item.quantity;
      const [ing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ri.ingredientId));
      if (!ing) continue;
      const before = parseFloat(ing.currentStock as string);
      const after = Math.max(0, before - needed);
      await db.update(ingredientsTable)
        .set({ currentStock: String(after) })
        .where(eq(ingredientsTable.id, ri.ingredientId));
      await db.insert(stockMovementsTable).values({
        ingredientId: ri.ingredientId,
        type: "sale",
        quantityBefore: String(before),
        quantityChange: String(-needed),
        quantityAfter: String(after),
        referenceType: "order",
        referenceId: orderId,
        notes: `Order sale deduction`,
        staffId,
      });
    }
  }
}

// ── INGREDIENTS ───────────────────────────────────────────────────────────────
router.get("/inventory/ingredients", requireAuth, async (req, res): Promise<void> => {
  const { lowStock } = req.query;
  const rows = await db.select({
    id: ingredientsTable.id, name: ingredientsTable.name, unit: ingredientsTable.unit,
    currentStock: ingredientsTable.currentStock, reorderThreshold: ingredientsTable.reorderThreshold,
    costPerUnit: ingredientsTable.costPerUnit, supplierId: ingredientsTable.supplierId,
    supplierName: suppliersTable.name, branchId: ingredientsTable.branchId, updatedAt: ingredientsTable.updatedAt,
  }).from(ingredientsTable).leftJoin(suppliersTable, eq(ingredientsTable.supplierId, suppliersTable.id));
  let filtered = rows.map(formatIngredient);
  if (lowStock === "true") filtered = filtered.filter(r => r.isLowStock);
  res.json(filtered);
});

router.post("/inventory/ingredients", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { name, unit, currentStock, reorderThreshold, costPerUnit, supplierId, branchId } = req.body;
  if (!name || !unit) { res.status(400).json({ error: "name and unit required" }); return; }
  const [row] = await db.insert(ingredientsTable).values({ name, unit, currentStock: String(currentStock ?? 0), reorderThreshold: String(reorderThreshold ?? 0), costPerUnit: String(costPerUnit ?? 0), supplierId: supplierId ?? null, branchId: branchId ?? null }).returning();
  await logAudit(user, "create_ingredient", "ingredient", row.id, `name=${name}`);
  res.status(201).json(formatIngredient({ ...row, supplierName: null }));
});

router.patch("/inventory/ingredients/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const { name, unit, currentStock, reorderThreshold, costPerUnit, supplierId } = req.body;
  const [before] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, id));
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (unit !== undefined) updates.unit = unit;
  if (currentStock !== undefined) updates.currentStock = String(currentStock);
  if (reorderThreshold !== undefined) updates.reorderThreshold = String(reorderThreshold);
  if (costPerUnit !== undefined) updates.costPerUnit = String(costPerUnit);
  if (supplierId !== undefined) updates.supplierId = supplierId;
  const [row] = await db.update(ingredientsTable).set(updates).where(eq(ingredientsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Log manual stock adjustment if stock changed
  if (currentStock !== undefined && before) {
    const qBefore = parseFloat(before.currentStock as string);
    const qAfter = parseFloat(String(currentStock));
    const diff = qAfter - qBefore;
    if (Math.abs(diff) > 0.001) {
      await db.insert(stockMovementsTable).values({
        ingredientId: id, type: "manual",
        quantityBefore: String(qBefore),
        quantityChange: String(diff),
        quantityAfter: String(qAfter),
        referenceType: "adjustment", notes: "Manual stock adjustment",
        staffId: user.userId,
      });
    }
  }
  await logAudit(user, "update_ingredient", "ingredient", id);
  res.json(formatIngredient({ ...row, supplierName: null }));
});

router.delete("/inventory/ingredients/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(ingredientsTable).where(eq(ingredientsTable.id, id));
  res.sendStatus(204);
});

router.get("/inventory/low-stock-alerts", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: ingredientsTable.id, name: ingredientsTable.name, unit: ingredientsTable.unit,
    currentStock: ingredientsTable.currentStock, reorderThreshold: ingredientsTable.reorderThreshold,
    costPerUnit: ingredientsTable.costPerUnit, supplierId: ingredientsTable.supplierId,
    supplierName: suppliersTable.name, branchId: ingredientsTable.branchId, updatedAt: ingredientsTable.updatedAt,
  }).from(ingredientsTable).leftJoin(suppliersTable, eq(ingredientsTable.supplierId, suppliersTable.id));
  const lowStock = rows.map(formatIngredient).filter(r => r.isLowStock);
  res.json(lowStock);
});

// ── STOCK MOVEMENTS ───────────────────────────────────────────────────────────
router.get("/inventory/stock-movements", requireAuth, async (req, res): Promise<void> => {
  const { ingredientId, type, limit } = req.query;
  const rows = await db.select({
    id: stockMovementsTable.id,
    ingredientId: stockMovementsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    unit: ingredientsTable.unit,
    type: stockMovementsTable.type,
    quantityBefore: stockMovementsTable.quantityBefore,
    quantityChange: stockMovementsTable.quantityChange,
    quantityAfter: stockMovementsTable.quantityAfter,
    referenceType: stockMovementsTable.referenceType,
    referenceId: stockMovementsTable.referenceId,
    notes: stockMovementsTable.notes,
    staffId: stockMovementsTable.staffId,
    staffName: usersTable.username,
    createdAt: stockMovementsTable.createdAt,
  }).from(stockMovementsTable)
    .leftJoin(ingredientsTable, eq(stockMovementsTable.ingredientId, ingredientsTable.id))
    .leftJoin(usersTable, eq(stockMovementsTable.staffId, usersTable.id))
    .orderBy(desc(stockMovementsTable.createdAt));

  let filtered = rows;
  if (ingredientId) filtered = filtered.filter(r => r.ingredientId === parseInt(ingredientId as string, 10));
  if (type) filtered = filtered.filter(r => r.type === type);
  const lim = limit ? parseInt(limit as string, 10) : 100;
  res.json(filtered.slice(0, lim).map(r => ({
    ...r,
    quantityBefore: parseFloat(r.quantityBefore as string),
    quantityChange: parseFloat(r.quantityChange as string),
    quantityAfter: parseFloat(r.quantityAfter as string),
  })));
});

// ── SUPPLIERS ────────────────────────────────────────────────────────────────
router.get("/inventory/suppliers", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(rows.map(s => ({ ...s, balance: parseFloat(s.balance as string ?? "0"), creditLimit: s.creditLimit ? parseFloat(s.creditLimit as string) : null })));
});

router.post("/inventory/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, contactPerson, phone, email, address, creditLimit, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(suppliersTable).values({ name, contactPerson: contactPerson ?? null, phone: phone ?? null, email: email ?? null, address: address ?? null, creditLimit: creditLimit ? String(creditLimit) : null, notes: notes ?? null }).returning();
  res.status(201).json(row);
});

router.patch("/inventory/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, contactPerson, phone, email, address, creditLimit, notes } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (contactPerson !== undefined) updates.contactPerson = contactPerson;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  if (creditLimit !== undefined) updates.creditLimit = String(creditLimit);
  if (notes !== undefined) updates.notes = notes;
  const [row] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, balance: parseFloat(row.balance as string ?? "0") });
});

router.delete("/inventory/suppliers/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.sendStatus(204);
});

// Supplier payments (record payment made to supplier)
router.get("/inventory/suppliers/:id/payments", requireAuth, async (req, res): Promise<void> => {
  const supplierId = parseInt(req.params.id, 10);
  const rows = await db.select({
    id: supplierPaymentsTable.id, supplierId: supplierPaymentsTable.supplierId,
    amount: supplierPaymentsTable.amount, method: supplierPaymentsTable.method,
    reference: supplierPaymentsTable.reference, notes: supplierPaymentsTable.notes,
    staffName: usersTable.username, createdAt: supplierPaymentsTable.createdAt,
  }).from(supplierPaymentsTable)
    .leftJoin(usersTable, eq(supplierPaymentsTable.staffId, usersTable.id))
    .where(eq(supplierPaymentsTable.supplierId, supplierId))
    .orderBy(desc(supplierPaymentsTable.createdAt));
  res.json(rows.map(r => ({ ...r, amount: parseFloat(r.amount as string) })));
});

router.post("/inventory/suppliers/:id/payments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const supplierId = parseInt(req.params.id, 10);
  const { amount, method, reference, notes } = req.body;
  if (!amount) { res.status(400).json({ error: "amount required" }); return; }
  // Record payment and reduce balance
  const [payment] = await db.insert(supplierPaymentsTable).values({ supplierId, amount: String(amount), method: method ?? "cash", reference: reference ?? null, notes: notes ?? null, staffId: user.userId }).returning();
  await db.update(suppliersTable).set({ balance: sql`balance - ${parseFloat(String(amount))}` }).where(eq(suppliersTable.id, supplierId));
  await logAudit(user, "supplier_payment", "supplier", supplierId, `amount=${amount}`);
  res.status(201).json({ ...payment, amount: parseFloat(payment.amount as string) });
});

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────
router.get("/inventory/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const { supplierId } = req.query;
  const rows = await db.select({ id: purchaseOrdersTable.id, supplierId: purchaseOrdersTable.supplierId, supplierName: suppliersTable.name, totalCost: purchaseOrdersTable.totalCost, status: purchaseOrdersTable.status, notes: purchaseOrdersTable.notes, receivedAt: purchaseOrdersTable.receivedAt, createdAt: purchaseOrdersTable.createdAt }).from(purchaseOrdersTable).leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id)).orderBy(sql`${purchaseOrdersTable.createdAt} DESC`);
  let filtered = rows;
  if (supplierId) filtered = filtered.filter(r => r.supplierId === parseInt(supplierId as string, 10));
  const result = await Promise.all(filtered.map(async (po) => {
    const items = await db.select({ ingredientId: purchaseOrderItemsTable.ingredientId, ingredientName: ingredientsTable.name, unit: ingredientsTable.unit, quantity: purchaseOrderItemsTable.quantity, unitCost: purchaseOrderItemsTable.unitCost }).from(purchaseOrderItemsTable).leftJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id)).where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id));
    return { ...po, totalCost: parseFloat(po.totalCost as string), items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity as string), unitCost: parseFloat(i.unitCost as string) })) };
  }));
  res.json(result);
});

router.post("/inventory/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { supplierId, notes, items } = req.body;
  if (!supplierId || !items?.length) { res.status(400).json({ error: "supplierId and items required" }); return; }
  const totalCost = items.reduce((sum: number, i: any) => sum + parseFloat(String(i.quantity)) * parseFloat(String(i.unitCost)), 0);
  const [po] = await db.insert(purchaseOrdersTable).values({ supplierId, totalCost: String(totalCost), notes: notes ?? null }).returning();
  await db.insert(purchaseOrderItemsTable).values(items.map((i: any) => ({ purchaseOrderId: po.id, ingredientId: i.ingredientId, quantity: String(i.quantity), unitCost: String(i.unitCost) })));
  // Add to supplier balance (we owe them)
  await db.update(suppliersTable).set({ balance: sql`balance + ${totalCost}` }).where(eq(suppliersTable.id, supplierId));
  await logAudit(user, "create_po", "purchase_order", po.id, `total=${totalCost}`);
  res.status(201).json({ ...po, totalCost, items });
});

// RECEIVE purchase order → update stock + log movements
router.patch("/inventory/purchase-orders/:id/receive", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (po.status !== "pending") { res.status(400).json({ error: `Cannot receive a ${po.status} order` }); return; }

  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));

  // Update each ingredient's stock and log movement
  for (const item of items) {
    const qty = parseFloat(item.quantity as string);
    const [ing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, item.ingredientId));
    if (!ing) continue;
    const before = parseFloat(ing.currentStock as string);
    const after = before + qty;
    await db.update(ingredientsTable).set({ currentStock: String(after) }).where(eq(ingredientsTable.id, item.ingredientId));
    await db.insert(stockMovementsTable).values({
      ingredientId: item.ingredientId, type: "purchase",
      quantityBefore: String(before), quantityChange: String(qty), quantityAfter: String(after),
      referenceType: "purchase_order", referenceId: id,
      notes: `PO #${id} received`, staffId: user.userId,
    });
  }

  const [updated] = await db.update(purchaseOrdersTable)
    .set({ status: "received", receivedAt: new Date(), receivedById: user.userId })
    .where(eq(purchaseOrdersTable.id, id)).returning();

  await logAudit(user, "receive_po", "purchase_order", id, `items=${items.length}`);
  res.json({ ...updated, totalCost: parseFloat(updated.totalCost as string) });
});

// CANCEL purchase order
router.patch("/inventory/purchase-orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Not found" }); return; }
  if (po.status !== "pending") { res.status(400).json({ error: "Only pending orders can be cancelled" }); return; }
  // Remove from supplier balance
  await db.update(suppliersTable).set({ balance: sql`balance - ${parseFloat(po.totalCost as string)}` }).where(eq(suppliersTable.id, po.supplierId));
  const [updated] = await db.update(purchaseOrdersTable).set({ status: "cancelled" }).where(eq(purchaseOrdersTable.id, id)).returning();
  await logAudit(user, "cancel_po", "purchase_order", id);
  res.json({ ...updated, totalCost: parseFloat(updated.totalCost as string) });
});

// ── WASTE LOGS ────────────────────────────────────────────────────────────────
router.get("/inventory/waste-logs", requireAuth, async (req, res): Promise<void> => {
  const { date } = req.query;
  const rows = await db.select({ id: wasteLogsTable.id, ingredientId: wasteLogsTable.ingredientId, ingredientName: ingredientsTable.name, unit: ingredientsTable.unit, quantity: wasteLogsTable.quantity, reason: wasteLogsTable.reason, loggedById: wasteLogsTable.loggedById, loggedByName: usersTable.username, createdAt: wasteLogsTable.createdAt }).from(wasteLogsTable).leftJoin(ingredientsTable, eq(wasteLogsTable.ingredientId, ingredientsTable.id)).leftJoin(usersTable, eq(wasteLogsTable.loggedById, usersTable.id)).orderBy(sql`${wasteLogsTable.createdAt} DESC`);
  let filtered = rows;
  if (date) filtered = filtered.filter(r => r.createdAt.toISOString().startsWith(date as string));
  res.json(filtered.map(r => ({ ...r, quantity: parseFloat(r.quantity as string) })));
});

router.post("/inventory/waste-logs", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { ingredientId, quantity, reason } = req.body;
  if (!ingredientId || quantity === undefined || !reason) { res.status(400).json({ error: "ingredientId, quantity, reason required" }); return; }
  const [ing] = await db.select().from(ingredientsTable).where(eq(ingredientsTable.id, ingredientId));
  if (!ing) { res.status(404).json({ error: "Ingredient not found" }); return; }
  const before = parseFloat(ing.currentStock as string);
  const deduct = parseFloat(String(quantity));
  const after = Math.max(0, before - deduct);
  const [row] = await db.insert(wasteLogsTable).values({ ingredientId, quantity: String(quantity), reason, loggedById: user.userId }).returning();
  await db.update(ingredientsTable).set({ currentStock: String(after) }).where(eq(ingredientsTable.id, ingredientId));
  await db.insert(stockMovementsTable).values({ ingredientId, type: "waste", quantityBefore: String(before), quantityChange: String(-deduct), quantityAfter: String(after), referenceType: "waste_log", referenceId: row.id, notes: reason, staffId: user.userId });
  res.status(201).json({ ...row, quantity: parseFloat(row.quantity as string) });
});

// ── RECIPES ───────────────────────────────────────────────────────────────────
router.get("/inventory/recipes", requireAuth, async (_req, res): Promise<void> => {
  const recipes = await db.select().from(recipesTable);
  const result = await Promise.all(recipes.map(async (r) => {
    const ings = await db.select({ ingredientId: recipeIngredientsTable.ingredientId, ingredientName: ingredientsTable.name, quantity: recipeIngredientsTable.quantity, unit: ingredientsTable.unit }).from(recipeIngredientsTable).leftJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id)).where(eq(recipeIngredientsTable.recipeId, r.id));
    return { ...r, ingredients: ings.map(i => ({ ...i, quantity: parseFloat(i.quantity as string) })) };
  }));
  res.json(result);
});

router.post("/inventory/recipes", requireAuth, async (req, res): Promise<void> => {
  const { menuItemId, ingredients } = req.body;
  if (!menuItemId || !ingredients?.length) { res.status(400).json({ error: "menuItemId and ingredients required" }); return; }
  const existing = await db.select().from(recipesTable).where(eq(recipesTable.menuItemId, menuItemId));
  let recipeId: number;
  if (existing.length) {
    recipeId = existing[0].id;
    await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, recipeId));
  } else {
    const [recipe] = await db.insert(recipesTable).values({ menuItemId }).returning();
    recipeId = recipe.id;
  }
  await db.insert(recipeIngredientsTable).values(ingredients.map((i: any) => ({ recipeId, ingredientId: i.ingredientId, quantity: String(i.quantity) })));
  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, recipeId));
  const ings = await db.select({ ingredientId: recipeIngredientsTable.ingredientId, ingredientName: ingredientsTable.name, quantity: recipeIngredientsTable.quantity, unit: ingredientsTable.unit }).from(recipeIngredientsTable).leftJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id)).where(eq(recipeIngredientsTable.recipeId, recipeId));
  res.status(201).json({ ...recipe, ingredients: ings.map(i => ({ ...i, quantity: parseFloat(i.quantity as string) })) });
});

export default router;
