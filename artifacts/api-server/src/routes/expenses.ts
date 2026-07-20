import { Router } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db, expenseCategoriesTable, expensesTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

// ── Seed default categories if none exist ────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: "Rent",          nameAm: "ቤት ኪራይ",   color: "#ef4444", icon: "building",    isDefault: true },
  { name: "Electricity",   nameAm: "ኤሌክትሪክ",   color: "#f59e0b", icon: "zap",         isDefault: true },
  { name: "Water",         nameAm: "ውሃ",        color: "#3b82f6", icon: "droplets",    isDefault: true },
  { name: "Internet",      nameAm: "ኢንተርኔት",   color: "#8b5cf6", icon: "wifi",        isDefault: true },
  { name: "Salaries",      nameAm: "ደሞዝ",       color: "#10b981", icon: "users",       isDefault: true },
  { name: "Coffee Beans",  nameAm: "ቡና",         color: "#92400e", icon: "coffee",      isDefault: true },
  { name: "Milk",          nameAm: "ወተት",        color: "#e5e7eb", icon: "milk",        isDefault: true },
  { name: "Sugar",         nameAm: "ስኳር",        color: "#fbbf24", icon: "cube",        isDefault: true },
  { name: "Cleaning",      nameAm: "ማፅዳት",      color: "#06b6d4", icon: "sparkles",    isDefault: true },
  { name: "Maintenance",   nameAm: "ጥገና",        color: "#6b7280", icon: "wrench",      isDefault: true },
  { name: "Miscellaneous", nameAm: "ሌሎች",        color: "#64748b", icon: "tag",         isDefault: true },
];

async function ensureDefaultCategories() {
  const existing = await db.select().from(expenseCategoriesTable).limit(1);
  if (existing.length === 0) {
    await db.insert(expenseCategoriesTable).values(DEFAULT_CATEGORIES);
  }
}

// ── CATEGORIES ────────────────────────────────────────────────────────────────
router.get("/expenses/categories", requireAuth, async (_req, res): Promise<void> => {
  await ensureDefaultCategories();
  const rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
  res.json(rows);
});

router.post("/expenses/categories", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { name, nameAm, color, icon } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(expenseCategoriesTable).values({
    name, nameAm: nameAm ?? null, color: color ?? "#6b7280", icon: icon ?? "tag", isDefault: false,
  }).returning();
  res.status(201).json(row);
});

router.patch("/expenses/categories/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, nameAm, color, icon } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (nameAm !== undefined) updates.nameAm = nameAm;
  if (color !== undefined) updates.color = color;
  if (icon !== undefined) updates.icon = icon;
  const [row] = await db.update(expenseCategoriesTable).set(updates).where(eq(expenseCategoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/expenses/categories/:id", ...requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
  if (cat?.isDefault) { res.status(400).json({ error: "Cannot delete default categories" }); return; }
  await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
  res.sendStatus(204);
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
function formatExpense(e: any) {
  return { ...e, amount: parseFloat(e.amount ?? "0") };
}

router.get("/expenses", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, categoryId, limit } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const rows = await db.select({
    id: expensesTable.id,
    categoryId: expensesTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    categoryColor: expenseCategoriesTable.color,
    categoryIcon: expenseCategoriesTable.icon,
    amount: expensesTable.amount,
    description: expensesTable.description,
    paymentMethod: expensesTable.paymentMethod,
    receiptNo: expensesTable.receiptNo,
    expenseDate: expensesTable.expenseDate,
    staffId: expensesTable.staffId,
    staffName: usersTable.username,
    branchId: expensesTable.branchId,
    notes: expensesTable.notes,
    createdAt: expensesTable.createdAt,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
    .leftJoin(usersTable, eq(expensesTable.staffId, usersTable.id))
    .where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)))
    .orderBy(desc(expensesTable.createdAt));

  let filtered = rows;
  if (categoryId) filtered = filtered.filter(r => r.categoryId === parseInt(categoryId as string, 10));
  const lim = limit ? parseInt(limit as string, 10) : 200;
  res.json(filtered.slice(0, lim).map(formatExpense));
});

router.get("/expenses/summary", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const rows = await db.select({
    categoryId: expensesTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    categoryColor: expenseCategoriesTable.color,
    categoryIcon: expenseCategoriesTable.icon,
    total: sql<number>`SUM(${expensesTable.amount}::numeric)`,
    count: sql<number>`COUNT(*)`,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
    .where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)))
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name, expenseCategoriesTable.color, expenseCategoriesTable.icon)
    .orderBy(sql`SUM(${expensesTable.amount}::numeric) DESC`);

  const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);

  // Daily totals for chart
  const allExpenses = await db.select().from(expensesTable)
    .where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)));
  const byDay = new Map<string, number>();
  for (const e of allExpenses) {
    const day = e.expenseDate;
    byDay.set(day, (byDay.get(day) ?? 0) + parseFloat(e.amount as string));
  }
  const dailyData = Array.from(byDay.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  res.json({
    grandTotal: Math.round(grandTotal * 100) / 100,
    byCategory: rows.map(r => ({
      categoryId: r.categoryId, categoryName: r.categoryName,
      categoryColor: r.categoryColor, categoryIcon: r.categoryIcon,
      total: Math.round(Number(r.total) * 100) / 100,
      count: Number(r.count),
      percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 10000) / 100 : 0,
    })),
    dailyData,
  });
});

router.post("/expenses", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { categoryId, amount, description, paymentMethod, receiptNo, expenseDate, branchId, notes } = req.body;
  if (!categoryId || amount === undefined || !description || !expenseDate) {
    res.status(400).json({ error: "categoryId, amount, description, expenseDate required" });
    return;
  }
  const [row] = await db.insert(expensesTable).values({
    categoryId, amount: String(amount), description,
    paymentMethod: paymentMethod ?? "cash",
    receiptNo: receiptNo ?? null,
    expenseDate,
    staffId: user.userId,
    branchId: branchId ?? user.branchId ?? null,
    notes: notes ?? null,
  }).returning();
  await logAudit(user, "create_expense", "expense", row.id, `amount=${amount},category=${categoryId}`);
  res.status(201).json(formatExpense(row));
});

router.patch("/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const { categoryId, amount, description, paymentMethod, receiptNo, expenseDate, notes } = req.body;
  const updates: any = {};
  if (categoryId !== undefined) updates.categoryId = categoryId;
  if (amount !== undefined) updates.amount = String(amount);
  if (description !== undefined) updates.description = description;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (receiptNo !== undefined) updates.receiptNo = receiptNo;
  if (expenseDate !== undefined) updates.expenseDate = expenseDate;
  if (notes !== undefined) updates.notes = notes;
  const [row] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(user, "update_expense", "expense", id);
  res.json(formatExpense(row));
});

router.delete("/expenses/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  await logAudit(user, "delete_expense", "expense", id);
  res.sendStatus(204);
});

export default router;
