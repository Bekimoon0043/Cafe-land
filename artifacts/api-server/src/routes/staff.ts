import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, employeesTable, usersTable, shiftsTable, auditLogsTable, branchesTable } from "@workspace/db";
import { requireAuth, hashPassword } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const router = Router();

// ── EMPLOYEES ─────────────────────────────────────────────────────────────────
router.get("/staff/employees", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({ id: employeesTable.id, fullName: employeesTable.fullName, role: employeesTable.role, phone: employeesTable.phone, email: employeesTable.email, hireDate: employeesTable.hireDate, salary: employeesTable.salary, isActive: employeesTable.isActive, branchId: employeesTable.branchId, userId: employeesTable.userId, createdAt: employeesTable.createdAt }).from(employeesTable).orderBy(employeesTable.fullName);
  res.json(rows.map(e => ({ ...e, salary: e.salary ? parseFloat(e.salary as string) : null })));
});

router.post("/staff/employees", requireAuth, async (req, res): Promise<void> => {
  const { fullName, role, phone, email, hireDate, salary, branchId, username, password } = req.body;
  if (!fullName || !role || !hireDate || !username || !password) {
    res.status(400).json({ error: "fullName, role, hireDate, username, password required" });
    return;
  }
  // Create user account
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({ username, passwordHash, role, branchId: branchId ?? null }).returning();
  // Create employee record
  const [emp] = await db.insert(employeesTable).values({ fullName, role, phone: phone ?? null, email: email ?? null, hireDate, salary: salary ? String(salary) : null, isActive: true, branchId: branchId ?? null, userId: user.id }).returning();
  res.status(201).json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

router.get("/staff/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  if (!emp) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

router.patch("/staff/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
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
  res.json({ ...emp, salary: emp.salary ? parseFloat(emp.salary as string) : null });
});

// ── CLOCK IN/OUT ──────────────────────────────────────────────────────────────
router.post("/staff/clock-in", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.body;
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
  const [shift] = await db.insert(shiftsTable).values({ employeeId, clockIn: new Date() }).returning();
  res.status(201).json({ ...shift, totalHours: null });
});

router.post("/staff/clock-out", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.body;
  if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
  // Find open shift
  const [openShift] = await db.select().from(shiftsTable).where(eq(shiftsTable.employeeId, employeeId)).orderBy(desc(shiftsTable.clockIn));
  if (!openShift || openShift.clockOut) {
    res.status(400).json({ error: "No open shift found" });
    return;
  }
  const clockOut = new Date();
  const totalHours = (clockOut.getTime() - openShift.clockIn.getTime()) / 3600000;
  const [shift] = await db.update(shiftsTable).set({ clockOut, totalHours: String(Math.round(totalHours * 100) / 100) }).where(eq(shiftsTable.id, openShift.id)).returning();
  res.json({ ...shift, totalHours: shift.totalHours ? parseFloat(shift.totalHours as string) : null });
});

// ── SHIFTS ────────────────────────────────────────────────────────────────────
router.get("/staff/shifts", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, date } = req.query;
  const rows = await db.select({ id: shiftsTable.id, employeeId: shiftsTable.employeeId, employeeName: employeesTable.fullName, clockIn: shiftsTable.clockIn, clockOut: shiftsTable.clockOut, totalHours: shiftsTable.totalHours }).from(shiftsTable).leftJoin(employeesTable, eq(shiftsTable.employeeId, employeesTable.id)).orderBy(desc(shiftsTable.clockIn));
  let filtered = rows;
  if (employeeId) filtered = filtered.filter(r => r.employeeId === parseInt(employeeId as string, 10));
  if (date) filtered = filtered.filter(r => r.clockIn.toISOString().startsWith(date as string));
  res.json(filtered.map(r => ({ ...r, totalHours: r.totalHours ? parseFloat(r.totalHours as string) : null })));
});

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────
router.get("/staff/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const { userId, action, limit } = req.query;
  const rows = await db.select({ id: auditLogsTable.id, userId: auditLogsTable.userId, username: usersTable.username, action: auditLogsTable.action, entityType: auditLogsTable.entityType, entityId: auditLogsTable.entityId, details: auditLogsTable.details, createdAt: auditLogsTable.createdAt }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id)).orderBy(desc(auditLogsTable.createdAt));
  let filtered = rows;
  if (userId) filtered = filtered.filter(r => r.userId === parseInt(userId as string, 10));
  if (action) filtered = filtered.filter(r => r.action.includes(action as string));
  const lim = limit ? parseInt(limit as string, 10) : 100;
  res.json(filtered.slice(0, lim));
});

export default router;
