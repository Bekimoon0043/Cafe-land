import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, employeesTable } from "@workspace/db";
import { signToken, hashPassword, comparePassword, requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Find linked employee
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    employeeId: emp?.id ?? null,
    branchId: user.branchId ?? null,
  };

  const token = signToken(payload);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, employeeId: emp?.id ?? null, branchId: user.branchId ?? null, createdAt: user.createdAt },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.userId, dbUser.id));
  res.json({
    id: dbUser.id,
    username: dbUser.username,
    role: dbUser.role,
    employeeId: emp?.id ?? null,
    branchId: dbUser.branchId ?? null,
    createdAt: dbUser.createdAt,
  });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword required" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(currentPassword, dbUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, user.userId));
  res.json({ message: "Password changed successfully" });
});

export default router;
