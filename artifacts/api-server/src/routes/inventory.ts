import { Router } from "express";
import { eq, lte, sql } from "drizzle-orm";
import { db, ingredientsTable, suppliersTable, purchaseOrdersTable, purchaseOrderItemsTable, wasteLogsTable, recipesTable, recipeIngredientsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function formatIngredient(i: any) {
  return {
    ...i,
    currentStock: parseFloat(i.currentStock ?? "0"),
    reorderThreshold: parseFloat(i.reorderThreshold ?? "0"),
    costPerUnit: parseFloat(i.costPerUnit ?? "0"),
    isLowStock: parseFloat(i.currentStock ?? "0") <= parseFloat(i.reorderThreshold ?? "0"),
  };
}

// ── INGREDIENTS ───────────────────────────────────────────────────────────────
router.get("/inventory/ingredients", async (req, res): Promise<void> => {
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
  const { name, unit, currentStock, reorderThreshold, costPerUnit, supplierId, branchId } = req.body;
  if (!name || !unit) { res.status(400).json({ error: "name and unit required" }); return; }
  const [row] = await db.insert(ingredientsTable).values({ name, unit, currentStock: String(currentStock ?? 0), reorderThreshold: String(reorderThreshold ?? 0), costPerUnit: String(costPerUnit ?? 0), supplierId: supplierId ?? null, branchId: branchId ?? null }).returning();
  res.status(201).json(formatIngredient({ ...row, supplierName: null }));
});

router.patch("/inventory/ingredients/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { name, unit, currentStock, reorderThreshold, costPerUnit, supplierId } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (unit !== undefined) updates.unit = unit;
  if (currentStock !== undefined) updates.currentStock = String(currentStock);
  if (reorderThreshold !== undefined) updates.reorderThreshold = String(reorderThreshold);
  if (costPerUnit !== undefined) updates.costPerUnit = String(costPerUnit);
  if (supplierId !== undefined) updates.supplierId = supplierId;
  const [row] = await db.update(ingredientsTable).set(updates).where(eq(ingredientsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatIngredient({ ...row, supplierName: null }));
});

router.delete("/inventory/ingredients/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
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

// ── SUPPLIERS ────────────────────────────────────────────────────────────────
router.get("/inventory/suppliers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(rows);
});

router.post("/inventory/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, contactPerson, phone, email, address } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(suppliersTable).values({ name, contactPerson: contactPerson ?? null, phone: phone ?? null, email: email ?? null, address: address ?? null }).returning();
  res.status(201).json(row);
});

router.patch("/inventory/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { name, contactPerson, phone, email, address } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (contactPerson !== undefined) updates.contactPerson = contactPerson;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  const [row] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/inventory/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.sendStatus(204);
});

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────
router.get("/inventory/purchase-orders", async (req, res): Promise<void> => {
  const { supplierId } = req.query;
  const rows = await db.select({ id: purchaseOrdersTable.id, supplierId: purchaseOrdersTable.supplierId, supplierName: suppliersTable.name, totalCost: purchaseOrdersTable.totalCost, status: purchaseOrdersTable.status, notes: purchaseOrdersTable.notes, createdAt: purchaseOrdersTable.createdAt }).from(purchaseOrdersTable).leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id)).orderBy(sql`${purchaseOrdersTable.createdAt} DESC`);
  let filtered = rows;
  if (supplierId) filtered = filtered.filter(r => r.supplierId === parseInt(supplierId as string, 10));
  const result = await Promise.all(filtered.map(async (po) => {
    const items = await db.select({ ingredientId: purchaseOrderItemsTable.ingredientId, ingredientName: ingredientsTable.name, quantity: purchaseOrderItemsTable.quantity, unitCost: purchaseOrderItemsTable.unitCost }).from(purchaseOrderItemsTable).leftJoin(ingredientsTable, eq(purchaseOrderItemsTable.ingredientId, ingredientsTable.id)).where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id));
    return { ...po, totalCost: parseFloat(po.totalCost as string), items: items.map(i => ({ ...i, quantity: parseFloat(i.quantity as string), unitCost: parseFloat(i.unitCost as string) })) };
  }));
  res.json(result);
});

router.post("/inventory/purchase-orders", requireAuth, async (req, res): Promise<void> => {
  const { supplierId, notes, items } = req.body;
  if (!supplierId || !items?.length) { res.status(400).json({ error: "supplierId and items required" }); return; }
  const totalCost = items.reduce((sum: number, i: any) => sum + parseFloat(String(i.quantity)) * parseFloat(String(i.unitCost)), 0);
  const [po] = await db.insert(purchaseOrdersTable).values({ supplierId, totalCost: String(totalCost), notes: notes ?? null }).returning();
  await db.insert(purchaseOrderItemsTable).values(items.map((i: any) => ({ purchaseOrderId: po.id, ingredientId: i.ingredientId, quantity: String(i.quantity), unitCost: String(i.unitCost) })));
  res.status(201).json({ ...po, totalCost, items });
});

// ── WASTE LOGS ────────────────────────────────────────────────────────────────
router.get("/inventory/waste-logs", async (req, res): Promise<void> => {
  const { date } = req.query;
  const rows = await db.select({ id: wasteLogsTable.id, ingredientId: wasteLogsTable.ingredientId, ingredientName: ingredientsTable.name, quantity: wasteLogsTable.quantity, reason: wasteLogsTable.reason, loggedById: wasteLogsTable.loggedById, loggedByName: usersTable.username, createdAt: wasteLogsTable.createdAt }).from(wasteLogsTable).leftJoin(ingredientsTable, eq(wasteLogsTable.ingredientId, ingredientsTable.id)).leftJoin(usersTable, eq(wasteLogsTable.loggedById, usersTable.id)).orderBy(sql`${wasteLogsTable.createdAt} DESC`);
  let filtered = rows;
  if (date) filtered = filtered.filter(r => r.createdAt.toISOString().startsWith(date as string));
  res.json(filtered.map(r => ({ ...r, quantity: parseFloat(r.quantity as string) })));
});

router.post("/inventory/waste-logs", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { ingredientId, quantity, reason } = req.body;
  if (!ingredientId || quantity === undefined || !reason) { res.status(400).json({ error: "ingredientId, quantity, reason required" }); return; }
  const [row] = await db.insert(wasteLogsTable).values({ ingredientId, quantity: String(quantity), reason, loggedById: user.userId }).returning();
  // Deduct stock
  await db.update(ingredientsTable).set({ currentStock: sql`current_stock - ${parseFloat(String(quantity))}` }).where(eq(ingredientsTable.id, ingredientId));
  res.status(201).json({ ...row, quantity: parseFloat(row.quantity as string) });
});

// ── RECIPES ───────────────────────────────────────────────────────────────────
router.get("/inventory/recipes", async (_req, res): Promise<void> => {
  const recipes = await db.select().from(recipesTable);
  const result = await Promise.all(recipes.map(async (r) => {
    const ings = await db.select({ ingredientId: recipeIngredientsTable.ingredientId, ingredientName: ingredientsTable.name, quantity: recipeIngredientsTable.quantity, unit: ingredientsTable.unit }).from(recipeIngredientsTable).leftJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id)).where(eq(recipeIngredientsTable.recipeId, r.id));
    return { ...r, menuItemName: null, ingredients: ings.map(i => ({ ...i, quantity: parseFloat(i.quantity as string) })) };
  }));
  res.json(result);
});

router.post("/inventory/recipes", requireAuth, async (req, res): Promise<void> => {
  const { menuItemId, ingredients } = req.body;
  if (!menuItemId || !ingredients?.length) { res.status(400).json({ error: "menuItemId and ingredients required" }); return; }
  // Upsert recipe
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
  res.status(201).json({ ...recipe, menuItemName: null, ingredients: ings.map(i => ({ ...i, quantity: parseFloat(i.quantity as string) })) });
});

export default router;
