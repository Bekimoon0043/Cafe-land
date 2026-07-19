import { Router } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, menuItemsTable, categoriesTable, paymentsTable, employeesTable, usersTable, ingredientsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/reports/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Today's revenue and orders
  const todayOrders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as string), 0);

  // POS revenue = staff-placed orders (staffId != null); QR = customer self-order (staffId = null)
  const posOrders = todayOrders.filter(o => o.staffId !== null);
  const qrOrders  = todayOrders.filter(o => o.staffId === null);
  const posRevenue = posOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as string), 0);
  const qrRevenue  = qrOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount as string), 0);

  // Active orders (pending + preparing + ready)
  const activeOrders = await db.select().from(ordersTable)
    .where(sql`${ordersTable.status} IN ('pending', 'preparing', 'ready')`);

  // Low stock count
  const allIngredients = await db.select().from(ingredientsTable);
  const lowStockCount = allIngredients.filter(i =>
    parseFloat(i.currentStock as string) <= parseFloat(i.reorderThreshold as string)
  ).length;

  // Avg order value
  const avgOrderValue = todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0;

  // Orders by status
  const statusCounts = ["pending", "preparing", "ready", "served", "completed", "cancelled"].map(status => ({
    status,
    count: todayOrders.filter(o => o.status === status).length,
  }));

  // Top 5 items today
  const todayItems = await db.select({
    menuItemId: orderItemsTable.menuItemId,
    nameEn: orderItemsTable.nameEn,
    nameAm: orderItemsTable.nameAm,
    qty: sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(orderItemsTable.menuItemId, orderItemsTable.nameEn, orderItemsTable.nameAm)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(5);

  // Recent 5 orders
  const recentOrders = await db.select().from(ordersTable)
    .orderBy(desc(ordersTable.createdAt)).limit(5);

  // This week's daily revenue (last 7 days)
  const weekRevenue = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayOrders = await db.select().from(ordersTable)
      .where(and(gte(ordersTable.createdAt, d), lte(ordersTable.createdAt, next), sql`${ordersTable.status} != 'cancelled'`));
    const rev = dayOrders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
    weekRevenue.push({ date: d.toISOString().slice(0, 10), revenue: Math.round(rev * 100) / 100, orders: dayOrders.length });
  }

  res.json({
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    todayOrders: todayOrders.length,
    posRevenue: Math.round(posRevenue * 100) / 100,
    posOrders: posOrders.length,
    qrRevenue: Math.round(qrRevenue * 100) / 100,
    qrOrders: qrOrders.length,
    activeOrders: activeOrders.length,
    lowStockCount,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    topItemsToday: todayItems.map(i => ({ menuItemId: i.menuItemId, nameEn: i.nameEn, nameAm: i.nameAm, totalSold: Number(i.qty), revenue: Math.round(Number(i.revenue) * 100) / 100 })),
    recentOrders: recentOrders.map(o => ({ ...o, totalAmount: parseFloat(o.totalAmount as string), discountAmount: parseFloat(o.discountAmount as string), taxAmount: parseFloat(o.taxAmount as string), tableLabel: null, customerName: null, staffName: null })),
    ordersByStatus: statusCounts,
    revenueThisWeek: weekRevenue,
  });
});

router.get("/reports/sales", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to = dateTo ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const orders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`));

  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Group by day
  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { revenue: 0, orders: 0 };
    byDay.set(day, { revenue: cur.revenue + parseFloat(o.totalAmount as string), orders: cur.orders + 1 });
  }
  const data = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders }));

  // Top categories
  const catRevenue = await db.select({
    categoryName: categoriesTable.nameEn,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
    orderCount: sql<number>`COUNT(DISTINCT ${orderItemsTable.orderId})`,
  }).from(orderItemsTable)
    .innerJoin(menuItemsTable, eq(orderItemsTable.menuItemId, menuItemsTable.id))
    .innerJoin(categoriesTable, eq(menuItemsTable.categoryId, categoriesTable.id))
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(categoriesTable.nameEn)
    .orderBy(sql`SUM(${orderItemsTable.totalPrice}::numeric) DESC`);

  res.json({
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    data,
    topCategories: catRevenue.map(c => ({ categoryName: c.categoryName, revenue: Math.round(Number(c.revenue) * 100) / 100, orders: Number(c.orderCount) })),
  });
});

router.get("/reports/top-items", requireAuth, async (req, res): Promise<void> => {
  const { limit, dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to = dateTo ? new Date((dateTo as string) + "T23:59:59") : new Date();
  const lim = limit ? parseInt(limit as string, 10) : 10;

  const rows = await db.select({
    menuItemId: orderItemsTable.menuItemId,
    nameEn: orderItemsTable.nameEn,
    nameAm: orderItemsTable.nameAm,
    totalSold: sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue: sql<number>`SUM(${orderItemsTable.totalPrice}::numeric)`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`))
    .groupBy(orderItemsTable.menuItemId, orderItemsTable.nameEn, orderItemsTable.nameAm)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(lim);

  res.json(rows.map(r => ({ menuItemId: r.menuItemId, nameEn: r.nameEn, nameAm: r.nameAm, totalSold: Number(r.totalSold), revenue: Math.round(Number(r.revenue) * 100) / 100 })));
});

router.get("/reports/payment-breakdown", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to = dateTo ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const payments = await db.select().from(paymentsTable)
    .where(and(gte(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to)));

  const byMethod = new Map<string, { count: number; amount: number }>();
  let total = 0;
  for (const p of payments) {
    const amt = parseFloat(p.totalAmount as string);
    total += amt;
    const cur = byMethod.get(p.providerType) ?? { count: 0, amount: 0 };
    byMethod.set(p.providerType, { count: cur.count + 1, amount: cur.amount + amt });
  }

  const breakdown = Array.from(byMethod.entries()).map(([method, v]) => ({
    method,
    count: v.count,
    amount: Math.round(v.amount * 100) / 100,
    percentage: total > 0 ? Math.round((v.amount / total) * 10000) / 100 : 0,
  }));

  res.json({ total: Math.round(total * 100) / 100, breakdown });
});

router.get("/reports/staff-performance", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query;
  const from = dateFrom ? new Date(dateFrom as string) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const to = dateTo ? new Date((dateTo as string) + "T23:59:59") : new Date();

  const employees = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));
  const result = await Promise.all(employees.map(async (emp) => {
    if (!emp.userId) return { employeeId: emp.id, employeeName: emp.fullName, role: emp.role, ordersHandled: 0, totalRevenue: 0, avgOrderTime: 0 };
    const orders = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.staffId, emp.userId), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.status} != 'cancelled'`));
    const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
    const avgOrderTime = orders.length > 0
      ? orders.reduce((s, o) => s + (o.updatedAt.getTime() - o.createdAt.getTime()) / 60000, 0) / orders.length
      : 0;
    return {
      employeeId: emp.id, employeeName: emp.fullName, role: emp.role,
      ordersHandled: orders.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderTime: Math.round(avgOrderTime * 100) / 100,
    };
  }));
  res.json(result.sort((a, b) => b.ordersHandled - a.ordersHandled));
});

router.get("/reports/hourly-sales", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const orders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, today), sql`${ordersTable.status} != 'cancelled'`));

  const byHour = new Array(24).fill(null).map((_, h) => ({ hour: h, revenue: 0, orders: 0 }));
  for (const o of orders) {
    const h = o.createdAt.getHours();
    byHour[h].revenue += parseFloat(o.totalAmount as string);
    byHour[h].orders += 1;
  }
  res.json(byHour.map(h => ({ ...h, revenue: Math.round(h.revenue * 100) / 100 })));
});

export default router;
