import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// JWT_SECRET must be set in production via environment variable.
// If not set, we throw at startup rather than silently using a weak key.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable must be set in production");
    }
    logger.warn("JWT_SECRET not set — using insecure dev-only fallback. Set JWT_SECRET before going to production.");
    return "coffee-land-dev-secret-DO-NOT-USE-IN-PRODUCTION";
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

export type UserRole = "admin" | "manager" | "cashier" | "kitchen" | "waiter";

export interface JwtPayload {
  userId: number;
  username: string;
  role: UserRole;
  employeeId: number | null;
  branchId: number | null;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Middleware ─────────────────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).user = payload;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return [
    requireAuth,
    (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user as JwtPayload;
      if (!user || !roles.includes(user.role)) {
        res.status(403).json({ error: `Forbidden — requires role: ${roles.join(" or ")}` });
        return;
      }
      next();
    },
  ];
}

// Convenience role groups
export const adminOnly       = () => requireRole("admin");
export const adminOrManager  = () => requireRole("admin", "manager");
export const staffAccess     = () => requireRole("admin", "manager", "cashier", "waiter");
