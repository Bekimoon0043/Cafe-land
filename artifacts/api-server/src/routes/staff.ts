import { Router } from "express";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { db, employeesTable, usersTable, shiftsTable, auditLogsTable, branchesTable, ordersTable } from "@workspace/db";
import { requireAuth, requireRole, hashPassword } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

// ── EMPLOYEES ─────────────────────────────────────────────────────────────────
router.get("/staff/employees", ...requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: employeesTable.id, fullName: employeesTable.fullName, role: employeesTable.role,
    phone: employeesTable.phone, email: employeesTable.email, hireDate: employeesTable.hireDate,
    salary: employeesTable.salary, isActive: employeesTable.isActive,
    branchId: employeesTable.branchId, userId: employeesTable.userId, createdAt: employeesTable.createdAt,
  }).from(employeesTable).orderBy(employeesTable.fullName);
  res.json(rows.map(e => ({ ...e, salary: e.salary ? parseFloat(e.salary as string) : null })));
});

router.post("/staff/employees", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { fullName, role, phone, email, hireDate, salary, branchId, username, password } = req.body;
  if (!fullName || !role || !hireDate || !username || !password) {
    res.status(400).json({ error: "fullName, role, hireDate, username, password required" }); return;
  }
  const passwordHash = await hashPassword(password);
  const [newUser] = await db.insert(usersTable).values({ username, passwordHash, role, branchId: branchId ?? null }).returning();
  const [emp] = await db.insert(employeesTable).values({ fullName, role, phone: phone ?? null, email: email ?? null, hireDate, salary: salary ? String(salary) : null, isActive: true, branchId: branchId ?? null, userId: newUser.id }).returning();
  await logAudit(user, "create_employee", "employee", emp.id, `role=${role}`);
  res.status(201).json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

router.get("/staff/employees/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

router.patch("/staff/employees/:id", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const user = (req as any).user as JwtPayload;
  const { fullName, role, phone, email, salary, isActive, branchId } = req.body;
  const updates: any = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (role !== undefined) updates.role = role;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (salary !== undefined) updates.salary = String(salary);
  if (isActive !== undefined) updates.isActive = isActive;
  if (branchId !== undefined) updates.branchId = branchId;
  const [emp] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
  if (!emp) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit(user, "update_employee", "employee", id);
  res.json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

// ── CLOCK IN/OUT with cash management ────────────────────────────────────────
router.post("/staff/clock-in", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { employeeId, openingCash, notes } = req.body;
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
  // Check if already has open shift
  const openShifts = await db.select().from(shiftsTable)
    .where(and(eq(shiftsTable.employeeId, employeeId), eq(shiftsTable.status, "open")));
  if (openShifts.length > 0) {
    res.status(400).json({ error: "Employee already has an open shift. Clock out first." }); return;
  }
  const [shift] = await db.insert(shiftsTable).values({
    employeeId, clockIn: new Date(), status: "open",
    openingCash: openingCash !== undefined ? String(openingCash) : "0",
    notes: notes ?? null,
  }).returning();
  await logAudit(user, "clock_in", "shift", shift.id, `employee=${employeeId},openingCash=${openingCash ?? 0}`);
  res.status(201).json(formatShift(shift));
});

router.post("/staff/clock-out", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { employeeId, closingCash, notes } = req.body;
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
  const [openShift] = await db.select().from(shiftsTable)
    .where(and(eq(shiftsTable.employeeId, employeeId), eq(shiftsTable.status, "open")))
    .orderBy(desc(shiftsTable.clockIn));
  if (!openShift) { res.status(400).json({ error: "No open shift found for this employee" }); return; }
  const clockOut = new Date();
  const totalHours = (clockOut.getTime() - openShift.clockIn.getTime()) / 3600000;
  const opening = parseFloat(openShift.openingCash as string ?? "0");
  const closing = closingCash !== undefined ? parseFloat(String(closingCash)) : null;
  const difference = closing !== null ? closing - opening : null;
  const [shift] = await db.update(shiftsTable).set({
    clockOut, totalHours: String(Math.round(totalHours * 100) / 100),
    closingCash: closing !== null ? String(closing) : null,
    cashDifference: difference !== null ? String(difference) : null,
    status: "closed",
    notes: notes ?? openShift.notes,
  }).where(eq(shiftsTable.id, openShift.id)).returning();
  await logAudit(user, "clock_out", "shift", shift.id, `hours=${totalHours.toFixed(2)},cashDiff=${difference}`);
  res.json(formatShift(shift));
});

function formatShift(s: any) {
  return {
    ...s,
    totalHours: s.totalHours ? parseFloat(s.totalHours as string) : null,
    openingCash: s.openingCash ? parseFloat(s.openingCash as string) : 0,
    closingCash: s.closingCash ? parseFloat(s.closingCash as string) : null,
    cashDifference: s.cashDifference ? parseFloat(s.cashDifference as string) : null,
  };
}

// ── SHIFTS ────────────────────────────────────────────────────────────────────
router.get("/staff/shifts", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, date, status } = req.query;
  const rows = await db.select({
    id: shiftsTable.id, employeeId: shiftsTable.employeeId, employeeName: employeesTable.fullName,
    clockIn: shiftsTable.clockIn, clockOut: shiftsTable.clockOut, totalHours: shiftsTable.totalHours,
    openingCash: shiftsTable.openingCash, closingCash: shiftsTable.closingCash,
    cashDifference: shiftsTable.cashDifference, status: shiftsTable.status, notes: shiftsTable.notes,
  }).from(shiftsTable).leftJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id)).orderBy(desc(shiftsTable.clockIn));
  let filtered = rows;
  if (employeeId) filtered = filtered.filter(r => r.employeeId === parseInt(employeeId as string, 10));
  if (date) filtered = filtered.filter(r => r.clockIn.toISOString().startsWith(date as string));
  if (status) filtered = filtered.filter(r => r.status === status);
  res.json(filtered.map(formatShift));
});

// Shift report — includes sales during the shift period
router.get("/staff/shifts/:id/report", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [shift] = await db.select({
    id: shiftsTable.id, employeeId: shiftsTable.employeeId, employeeName: employeesTable.fullName,
    clockIn: shiftsTable.clockIn, clockOut: shiftsTable.clockOut, totalHours: shiftsTable.totalHours,
    openingCash: shiftsTable.openingCash, closingCash: shiftsTable.closingCash,
    cashDifference: shiftsTable.cashDifference, status: shiftsTable.status, notes: shiftsTable.notes,
  }).from(shiftsTable).leftJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id)).where(eq(shiftsTable.id, id));
  if (!shift) { res.status(404).json({ error: "Shift not found" }); return; }

  // Sales during this shift window
  const shiftEnd = shift.clockOut ?? new Date();
  const orders = await db.select().from(ordersTable)
    .where(and(
      gte(ordersTable.createdAt, shift.clockIn),
      lte(ordersTable.createdAt, shiftEnd),
      sql`${ordersTable.status} != 'cancelled'`
    ));
  const totalSales = orders.reduce((s, o) => s + parseFloat(o.totalAmount as string), 0);
  const totalOrders = orders.length;

  res.json({
    ...formatShift(shift),
    sales: { totalOrders, totalSales: Math.round(totalSales * 100) / 100 },
    expectedCash: (shift.openingCash ? parseFloat(shift.openingCash as string) : 0) + totalSales,
  });
});

// Active shifts (for dashboard)
router.get("/staff/shifts/active", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: shiftsTable.id, employeeId: shiftsTable.employeeId, employeeName: employeesTable.fullName,
    clockIn: shiftsTable.clockIn, openingCash: shiftsTable.openingCash,
  }).from(shiftsTable).leftJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id))
    .where(eq(shiftsTable.status, "open"));
  res.json(rows.map(r => ({ ...r, openingCash: r.openingCash ? parseFloat(r.openingCash as string) : 0 })));
});

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────
router.get("/staff/audit-logs", ...requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const { userId, action, limit } = req.query;
  const rows = await db.select({ id: auditLogsTable.id, userId: auditLogsTable.userId, username: usersTable.username, action: auditLogsTable.action, entityType: auditLogsTable.entityType, entityId: auditLogsTable.entityId, details: auditLogsTable.details, createdAt: auditLogsTable.createdAt }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id)).orderBy(desc(auditLogsTable.createdAt));
  let filtered = rows;
  if (userId) filtered = filtered.filter(r => r.userId === parseInt(userId as string, 10));
  if (action) filtered = filtered.filter(r => r.action.includes(action as string));
  const lim = limit ? parseInt(limit as string, 10) : 100;
  res.json(filtered.slice(0, lim));
});

export default router;
