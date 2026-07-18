import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, tablesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/tables", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tablesTable).orderBy(tablesTable.label);
  res.json(rows);
});

router.post("/tables", requireAuth, async (req, res): Promise<void> => {
  const { label, capacity, branchId } = req.body;
  if (!label || !branchId) { res.status(400).json({ error: "label and branchId required" }); return; }
  const [t] = await db.insert(tablesTable).values({ label, capacity: capacity ?? 4, branchId }).returning();
  res.status(201).json(t);
});

router.patch("/tables/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { label, capacity, status } = req.body;
  const updates: any = {};
  if (label !== undefined) updates.label = label;
  if (capacity !== undefined) updates.capacity = capacity;
  if (status !== undefined) updates.status = status;
  const [t] = await db.update(tablesTable).set(updates).where(eq(tablesTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.json(t);
});

router.delete("/tables/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(tablesTable).where(eq(tablesTable.id, id));
  res.sendStatus(204);
});

export default router;
