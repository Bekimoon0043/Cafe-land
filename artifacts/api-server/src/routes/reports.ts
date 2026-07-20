import { Router } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, menuItemsTable, categoriesTable, paymentsTable,
  employeesTable, usersTable, ingredientsTable, expensesTable, expenseCategoriesTable,
  recipeIngredientsTable, recipesTable, purchaseOrdersTable, purchaseOrderItemsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get("/reports/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const todayOrders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as string), 0);
  const posOrders = todayOrders.filter(o => o.staffId !== null);
  const qrOrders  = todayOrders.filter(o => o.staffId === null);
  const posRevenue = posOrders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
  const qrRevenue  = qrOrders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);

  // Today's expenses
  const todayExpenses = await db.select().from(expensesTable).where(gte(expensesTable.createdAt, today));
  const todayExpenseTotal = todayExpenses.reduce((s, e) => s + parseFloat(e.amount as string), 0);

  const activeOrders = await db.select().from(ordersTable)
    .where(sql`${ordersTable.status} IN ('pending', 'preparing', 'ready')`);
  const allIngredients = await db.select().from(ingredientsTable);
  const lowStockCount = allIngredients.filter(i => parseFloat(i.currentStock as string) <= parseFloat(i.reorderThreshold as string)).length;
  const avgOrderValue = todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0;
  const statusCounts = ["pending", "preparing", "ready", "served", "completed", "cancelled"].map(status => ({ status, count: todayOrders.filter(o => o.status === status).length }));

  const todayItems = await db.select({
    menuItemId: orderItemsTable.menuItemId, nameEn: orderItemsTable.nameEn, nameAm: orderItemsTable.nameAm,
    qty: sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(orderItemsTable.menuItemId, orderItemsTable.nameEn, orderItemsTable.nameAm)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`).limit(5);

  const recentOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(5);

  const weekRevenue = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOrders = await db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, d), lte(ordersTable.createdAt, next), sql`${ordersTable.status} != 'cancelled'`));
    const dayExpenses = await db.select().from(expensesTable).where(and(gte(expensesTable.createdAt, d), lte(expensesTable.createdAt, next)));
    const rev = dayOrders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
    const exp = dayExpenses.reduce((s, e) => s + parseFloat(e.amount as string), 0);
    weekRevenue.push({ date: d.toISOString().slice(0, 10), revenue: Math.round(rev * 100) / 100, expenses: Math.round(exp * 100) / 100, profit: Math.round((rev - exp) * 100) / 100, orders: dayOrders.length });
  }

  res.json({
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    todayOrders: todayOrders.length,
    posRevenue: Math.round(posRevenue * 100) / 100,
    posOrders: posOrders.length,
    qrRevenue: Math.round(qrRevenue * 100) / 100,
    qrOrders: qrOrders.length,
    todayExpenses: Math.round(todayExpenseTotal * 100) / 100,
    todayProfit: Math.round((todayRevenue - todayExpenseTotal) * 100) / 100,
    activeOrders: activeOrders.length,
    lowStockCount,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    topItemsToday: todayItems.map(i => ({ menuItemId: i.menuItemId, nameEn: i.nameEn, nameAm: i.nameAm, totalSold: Number(i.qty), revenue: Math.round(Number(i.revenue) * 100) / 100 })),
    recentOrders: recentOrders.map(o => ({ ...o, totalAmount: parseFloat(o.totalAmount as string), discountAmount: parseFloat(o.discountAmount as string), taxAmount: parseFloat(o.taxAmount as string) })),
    ordersByStatus: statusCounts,
    revenueThisWeek: weekRevenue,
  });
});

// ── SALES ─────────────────────────────────────────────────────────────────────
router.get("/reports/sales", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const orders = await db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`));
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { revenue: 0, orders: 0 };
    byDay.set(day, { revenue: cur.revenue + parseFloat(o.totalAmount as string), orders: cur.orders + 1 });
  }
  const data = Array.from(byDay.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders }));

  const catRevenue = await db.select({
    categoryName: categoriesTable.nameEn,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
    orderCount: sql<number>`COUNT(DISTINCT ${orderItemsTable.orderId})`,
  }).from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .innerJoin(categoriesTable, eq(menuItemsTable.categoryId, categoriesTable.id))
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(categoriesTable.nameEn).orderBy(sql`SUM(${orderItemsTable.totalPrice}::numeric) DESC`);

  res.json({ totalRevenue: Math.round(totalRevenue * 100) / 100, totalOrders, avgOrderValue: Math.round(avgOrderValue * 100) / 100, data, topCategories: catRevenue.map(c => ({ categoryName: c.categoryName, revenue: Math.round(Number(c.revenue) * 100) / 100, orders: Number(c.orderCount) })) });
});

// ── TOP ITEMS ─────────────────────────────────────────────────────────────────
router.get("/reports/top-items", requireAuth, async (req, res): Promise<void> => {
  const { limit, dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();
  const lim  = limit ? parseInt(limit as string, 10) : 10;
  const rows = await db.select({
    menuItemId: orderItemsTable.menuItemId, nameEn: orderItemsTable.nameEn, nameAm: orderItemsTable.nameAm,
    totalSold: sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(orderItemsTable.menuItemId, orderItemsTable.nameEn, orderItemsTable.nameAm)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`).limit(lim);
  res.json(rows.map(r => ({ menuItemId: r.menuItemId, nameEn: r.nameEn, nameAm: r.nameAm, totalSold: Number(r.totalSold), revenue: Math.round(Number(r.revenue) * 100) / 100 })));
});

// ── PAYMENT BREAKDOWN ─────────────────────────────────────────────────────────
router.get("/reports/payment-breakdown", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();
  const payments = await db.select().from(paymentsTable).where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to)));
  const byMethod = new Map<string, { count: number; amount: number }>();
  let total = 0;
  for (const p of payments) {
    const amt = parseFloat(p.totalAmount as string);
    total += amt;
    const cur = byMethod.get(p.providerType) ?? { count: 0, amount: 0 };
    byMethod.set(p.providerType, { count: cur.count + 1, amount: cur.amount + amt });
  }
  const breakdown = Array.from(byMethod.entries()).map(([method, v]) => ({ method, count: v.count, amount: Math.round(v.amount * 100) / 100, percentage: total > 0 ? Math.round((v.amount / total) * 10000) / 100 : 0 }));
  res.json({ total: Math.round(total * 100) / 100, breakdown });
});

// ── PROFIT & LOSS ─────────────────────────────────────────────────────────────
router.get("/reports/profit-loss", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();

  // Revenue
  const orders = await db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`));
  const revenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);

  // COGS — cost of ingredients used in sold items (via recipes)
  const soldItems = await db.select({
    menuItemId: orderItemsTable.menuItemId,
    totalQty: sql<number>`SUM(${orderItemsTable.quantity})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(orderItemsTable.menuItemId);

  let cogs = 0;
  for (const si of soldItems) {
    const recipes = await db.select().from(recipesTable).where(eq(recipesTable.menuItemId, si.menuItemId));
    if (!recipes.length) continue;
    const rIngredients = await db.select({
      quantity: recipeIngredientsTable.quantity,
      costPerUnit: ingredientsTable.costPerUnit,
    }).from(recipeIngredientsTable)
      .leftJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id))
      .where(eq(recipeIngredientsTable.recipeId, recipes[0].id));
    for (const ri of rIngredients) {
      cogs += parseFloat(ri.quantity as string) * parseFloat(ri.costPerUnit as string ?? "0") * Number(si.totalQty);
    }
  }

  // Expenses
  const expenses = await db.select({
    categoryId: expensesTable.categoryId,
    categoryName: expenseCategoriesTable.name,
    total: sql<number>`SUM(${expensesTable.amount}::numeric)`,
    count: sql<number>`COUNT(*)`,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
    .where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)))
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total), 0);

  const grossProfit = revenue - cogs;
  const netProfit   = grossProfit - totalExpenses;

  // Daily breakdown for chart
  const dayMap = new Map<string, { revenue: number; expenses: number; cogs: number }>();
  for (const o of orders) {
    const d = o.createdAt.toISOString().slice(0, 10);
    const cur = dayMap.get(d) ?? { revenue: 0, expenses: 0, cogs: 0 };
    dayMap.set(d, { ...cur, revenue: cur.revenue + parseFloat(o.totalAmount as string) });
  }
  const allExpenseRows = await db.select().from(expensesTable).where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)));
  for (const e of allExpenseRows) {
    const d = e.expenseDate;
    const cur = dayMap.get(d) ?? { revenue: 0, expenses: 0, cogs: 0 };
    dayMap.set(d, { ...cur, expenses: cur.expenses + parseFloat(e.amount as string) });
  }
  const dailyData = Array.from(dayMap.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, v]) => ({
    date, revenue: Math.round(v.revenue*100)/100, expenses: Math.round(v.expenses*100)/100,
    grossProfit: Math.round((v.revenue - v.cogs) * 100) / 100,
    netProfit: Math.round((v.revenue - v.cogs - v.expenses) * 100) / 100,
  }));

  res.json({
    revenue: Math.round(revenue * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
    netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0,
    expensesByCategory: expenses.map(e => ({ categoryId: e.categoryId, categoryName: e.categoryName, total: Math.round(Number(e.total) * 100) / 100, count: Number(e.count) })),
    dailyData,
  });
});

// ── EXPENSE REPORT ────────────────────────────────────────────────────────────
router.get("/reports/expenses", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();
  const rows = await db.select({
    categoryId: expensesTable.categoryId, categoryName: expenseCategoriesTable.name,
    categoryColor: expenseCategoriesTable.color,
    total: sql<number>`SUM(${expensesTable.amount}::numeric)`,
    count: sql<number>`COUNT(*)`,
  }).from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
    .where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)))
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name, expenseCategoriesTable.color)
    .orderBy(sql`SUM(${expensesTable.amount}::numeric) DESC`);
  const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);

  const allExp = await db.select().from(expensesTable).where(and(gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)));
  const byDay = new Map<string, number>();
  for (const e of allExp) { byDay.set(e.expenseDate, (byDay.get(e.expenseDate) ?? 0) + parseFloat(e.amount as string)); }
  const dailyData = Array.from(byDay.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,amount])=>({ date, amount: Math.round(amount*100)/100 }));

  res.json({ grandTotal: Math.round(grandTotal*100)/100, byCategory: rows.map(r => ({ categoryId: r.categoryId, categoryName: r.categoryName, categoryColor: r.categoryColor, total: Math.round(Number(r.total)*100)/100, count: Number(r.count), percentage: grandTotal > 0 ? Math.round((Number(r.total)/grandTotal)*10000)/100 : 0 })), dailyData });
});

// ── STAFF PERFORMANCE ─────────────────────────────────────────────────────────
router.get("/reports/staff-performance", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to   = dateTo   ? new Date((dateTo as string) + "T23:59:59") : new Date();
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));
  const result = await Promise.all(employees.map(async (emp) => {
    if (!emp.userId) return { employeeId: emp.id, employeeName: emp.fullName, role: emp.role, ordersHandled: 0, totalRevenue: 0, avgOrderTime: 0 };
    const orders = await db.select().from(ordersTable).where(and(eq(ordersTable.staffId, emp.userId), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`));
    const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
    const avgOrderTime = orders.length > 0 ? orders.reduce((s, o) => s + (o.updatedAt.getTime() - o.createdAt.getTime()) / 60000, 0) / orders.length : 0;
    return { employeeId: emp.id, employeeName: emp.fullName, role: emp.role, ordersHandled: orders.length, totalRevenue: Math.round(totalRevenue * 100) / 100, avgOrderTime: Math.round(avgOrderTime * 100) / 100 };
  }));
  res.json(result.sort((a, b) => b.ordersHandled - a.ordersHandled));
});

// ── HOURLY SALES ──────────────────────────────────────────────────────────────
router.get("/reports/hourly-sales", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date(); today.setHours(0,0,0,0);
  const orders = await db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));
  const byHour = new Array(24).fill(null).map((_, h) => ({ hour: h, revenue: 0, orders: 0 }));
  for (const o of orders) {
    const h = o.createdAt.getHours();
    byHour[h].revenue += parseFloat(o.totalAmount as string);
    byHour[h].orders += 1;
  }
  res.json(byHour.map(h => ({ ...h, revenue: Math.round(h.revenue * 100) / 100 })));
});

// ── INVENTORY VALUATION ───────────────────────────────────────────────────────
router.get("/reports/inventory-valuation", requireAuth, async (_req, res): Promise<void> => {
  const ingredients = await db.select().from(ingredientsTable);
  const items = ingredients.map(i => {
    const stock = parseFloat(i.currentStock as string);
    const cost  = parseFloat(i.costPerUnit as string ?? "0");
    return { ingredientId: i.id, name: i.name, unit: i.unit, currentStock: stock, costPerUnit: cost, totalValue: Math.round(stock * cost * 100) / 100 };
  });
  const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
  res.json({ totalValue: Math.round(totalValue * 100) / 100, items });
});

export default router;
