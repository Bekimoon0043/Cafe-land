import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import type { JwtPayload } from "./auth";

export async function logAudit(
  user: JwtPayload,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: user.userId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? null,
    });
  } catch {
    // Non-critical — don't break the main flow
  }
}
