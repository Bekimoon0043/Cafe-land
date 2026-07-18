import { Router } from "express";
import { eq, and, ilike, isNull } from "drizzle-orm";
import { db, categoriesTable, menuItemsTable, modifierGroupsTable, modifiersTable, menuItemModifierGroupsTable, combosTable, comboItemsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

// ── CATEGORIES ────────────────────────────────────────────────────────────────
router.get("/menu/categories", async (_req, res): Promise<void> => {
  const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.sortOrder);
  res.json(rows);
});

router.post("/menu/categories", requireAuth, async (req, res): Promise<void> => {
  const { nameEn, nameAm, parentId, icon, sortOrder } = req.body;
  if (!nameEn || !nameAm) { res.status(400).json({ error: "nameEn and nameAm required" }); return; }
  const [cat] = await db.insert(categoriesTable).values({ nameEn, nameAm, parentId: parentId ?? null, icon: icon ?? null, sortOrder: sortOrder ?? 0 }).returning();
  await logAudit((req as any).user, "create", "category", cat.id);
  res.status(201).json(cat);
});

router.get("/menu/categories/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!cat) { res.status(404).json({ error: "Not found" }); return; }
  res.json(cat);
});

router.patch("/menu/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { nameEn, nameAm, parentId, icon, sortOrder } = req.body;
  const [cat] = await db.update(categoriesTable).set({ ...(nameEn && { nameEn }), ...(nameAm && { nameAm }), ...(parentId !== undefined && { parentId }), ...(icon !== undefined && { icon }), ...(sortOrder !== undefined && { sortOrder }) }).where(eq(categoriesTable.id, id)).returning();
  if (!cat) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit((req as any).user, "update", "category", id);
  res.json(cat);
});

router.delete("/menu/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  await logAudit((req as any).user, "delete", "category", id);
  res.sendStatus(204);
});

// ── MENU ITEMS ────────────────────────────────────────────────────────────────
router.get("/menu/items", async (req, res): Promise<void> => {
  const { categoryId, available, search } = req.query;
  const rows = await db.select({
    id: menuItemsTable.id, nameEn: menuItemsTable.nameEn, nameAm: menuItemsTable.nameAm,
    descriptionEn: menuItemsTable.descriptionEn, descriptionAm: menuItemsTable.descriptionAm,
    categoryId: menuItemsTable.categoryId, categoryName: categoriesTable.nameEn,
    price: menuItemsTable.price, imageUrl: menuItemsTable.imageUrl,
    isAvailable: menuItemsTable.isAvailable, prepTimeMinutes: menuItemsTable.prepTimeMinutes,
    branchId: menuItemsTable.branchId, createdAt: menuItemsTable.createdAt,
  }).from(menuItemsTable).leftJoin(categoriesTable, eq(menuItemsTable.categoryId, categoriesTable.id));

  let filtered = rows;
  if (categoryId) filtered = filtered.filter(r => r.categoryId === parseInt(categoryId as string, 10));
  if (available !== undefined) filtered = filtered.filter(r => r.isAvailable === (available === "true"));
  if (search) {
    const s = (search as string).toLowerCase();
    filtered = filtered.filter(r => r.nameEn.toLowerCase().includes(s) || r.nameAm.toLowerCase().includes(s));
  }
  res.json(filtered.map(r => ({ ...r, price: parseFloat(r.price as string) })));
});

router.post("/menu/items", requireAuth, async (req, res): Promise<void> => {
  const { nameEn, nameAm, categoryId, price, descriptionEn, descriptionAm, imageUrl, isAvailable, prepTimeMinutes, branchId } = req.body;
  if (!nameEn || !nameAm || !categoryId || price === undefined) { res.status(400).json({ error: "nameEn, nameAm, categoryId, price required" }); return; }
  const [item] = await db.insert(menuItemsTable).values({ nameEn, nameAm, categoryId, price: String(price), descriptionEn: descriptionEn ?? null, descriptionAm: descriptionAm ?? null, imageUrl: imageUrl ?? null, isAvailable: isAvailable ?? true, prepTimeMinutes: prepTimeMinutes ?? 10, branchId: branchId ?? null }).returning();
  await logAudit((req as any).user, "create", "menu_item", item.id, `price=${price}`);
  res.status(201).json({ ...item, price: parseFloat(item.price as string) });
});

router.get("/menu/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [item] = await db.select({ id: menuItemsTable.id, nameEn: menuItemsTable.nameEn, nameAm: menuItemsTable.nameAm, descriptionEn: menuItemsTable.descriptionEn, descriptionAm: menuItemsTable.descriptionAm, categoryId: menuItemsTable.categoryId, categoryName: categoriesTable.nameEn, price: menuItemsTable.price, imageUrl: menuItemsTable.imageUrl, isAvailable: menuItemsTable.isAvailable, prepTimeMinutes: menuItemsTable.prepTimeMinutes, branchId: menuItemsTable.branchId, createdAt: menuItemsTable.createdAt }).from(menuItemsTable).leftJoin(categoriesTable, eq(menuItemsTable.categoryId, categoriesTable.id)).where(eq(menuItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  // Get modifier groups
  const junctionRows = await db.select().from(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.menuItemId, id));
  const modifierGroups = await Promise.all(junctionRows.map(async (j) => {
    const [grp] = await db.select().from(modifierGroupsTable).where(eq(modifierGroupsTable.id, j.modifierGroupId));
    const mods = await db.select().from(modifiersTable).where(eq(modifiersTable.groupId, j.modifierGroupId));
    const junctionAll = await db.select().from(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.modifierGroupId, j.modifierGroupId));
    return { ...grp, menuItemIds: junctionAll.map(x => x.menuItemId), modifiers: mods.map(m => ({ ...m, priceDelta: parseFloat(m.priceDelta as string) })) };
  }));

  res.json({ ...item, price: parseFloat(item.price as string), modifierGroups });
});

router.patch("/menu/items/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { nameEn, nameAm, categoryId, price, descriptionEn, descriptionAm, imageUrl, isAvailable, prepTimeMinutes } = req.body;
  const updates: any = {};
  if (nameEn !== undefined) updates.nameEn = nameEn;
  if (nameAm !== undefined) updates.nameAm = nameAm;
  if (categoryId !== undefined) updates.categoryId = categoryId;
  if (price !== undefined) updates.price = String(price);
  if (descriptionEn !== undefined) updates.descriptionEn = descriptionEn;
  if (descriptionAm !== undefined) updates.descriptionAm = descriptionAm;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (isAvailable !== undefined) updates.isAvailable = isAvailable;
  if (prepTimeMinutes !== undefined) updates.prepTimeMinutes = prepTimeMinutes;
  const [item] = await db.update(menuItemsTable).set(updates).where(eq(menuItemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (price !== undefined) await logAudit((req as any).user, "update_price", "menu_item", id, `price=${price}`);
  else await logAudit((req as any).user, "update", "menu_item", id);
  res.json({ ...item, price: parseFloat(item.price as string) });
});

router.delete("/menu/items/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, id));
  await logAudit((req as any).user, "delete", "menu_item", id);
  res.sendStatus(204);
});

router.post("/menu/items/:id/toggle-availability", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [current] = await db.select().from(menuItemsTable).where(eq(menuItemsTable.id, id));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(menuItemsTable).set({ isAvailable: !current.isAvailable }).where(eq(menuItemsTable.id, id)).returning();
  await logAudit((req as any).user, "toggle_availability", "menu_item", id, `available=${!current.isAvailable}`);
  res.json({ ...updated, price: parseFloat(updated.price as string) });
});

// ── MODIFIER GROUPS ───────────────────────────────────────────────────────────
router.get("/menu/modifier-groups", async (_req, res): Promise<void> => {
  const groups = await db.select().from(modifierGroupsTable);
  const result = await Promise.all(groups.map(async (g) => {
    const mods = await db.select().from(modifiersTable).where(eq(modifiersTable.groupId, g.id));
    const junctions = await db.select().from(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.modifierGroupId, g.id));
    return { ...g, menuItemIds: junctions.map(j => j.menuItemId), modifiers: mods.map(m => ({ ...m, priceDelta: parseFloat(m.priceDelta as string) })) };
  }));
  res.json(result);
});

router.post("/menu/modifier-groups", requireAuth, async (req, res): Promise<void> => {
  const { nameEn, nameAm, minSelect, maxSelect, modifiers, menuItemIds } = req.body;
  if (!nameEn || !nameAm) { res.status(400).json({ error: "nameEn and nameAm required" }); return; }
  const [grp] = await db.insert(modifierGroupsTable).values({ nameEn, nameAm, minSelect: minSelect ?? 0, maxSelect: maxSelect ?? 1 }).returning();
  if (modifiers?.length) {
    await db.insert(modifiersTable).values(modifiers.map((m: any) => ({ groupId: grp.id, nameEn: m.nameEn, nameAm: m.nameAm, priceDelta: String(m.priceDelta ?? 0) })));
  }
  if (menuItemIds?.length) {
    await db.insert(menuItemModifierGroupsTable).values(menuItemIds.map((mid: number) => ({ menuItemId: mid, modifierGroupId: grp.id })));
  }
  const mods = await db.select().from(modifiersTable).where(eq(modifiersTable.groupId, grp.id));
  res.status(201).json({ ...grp, menuItemIds: menuItemIds ?? [], modifiers: mods.map(m => ({ ...m, priceDelta: parseFloat(m.priceDelta as string) })) });
});

router.patch("/menu/modifier-groups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { nameEn, nameAm, minSelect, maxSelect, modifiers, menuItemIds } = req.body;
  const updates: any = {};
  if (nameEn !== undefined) updates.nameEn = nameEn;
  if (nameAm !== undefined) updates.nameAm = nameAm;
  if (minSelect !== undefined) updates.minSelect = minSelect;
  if (maxSelect !== undefined) updates.maxSelect = maxSelect;
  const [grp] = await db.update(modifierGroupsTable).set(updates).where(eq(modifierGroupsTable.id, id)).returning();
  if (!grp) { res.status(404).json({ error: "Not found" }); return; }
  if (modifiers !== undefined) {
    await db.delete(modifiersTable).where(eq(modifiersTable.groupId, id));
    if (modifiers.length) await db.insert(modifiersTable).values(modifiers.map((m: any) => ({ groupId: id, nameEn: m.nameEn, nameAm: m.nameAm, priceDelta: String(m.priceDelta ?? 0) })));
  }
  if (menuItemIds !== undefined) {
    await db.delete(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.modifierGroupId, id));
    if (menuItemIds.length) await db.insert(menuItemModifierGroupsTable).values(menuItemIds.map((mid: number) => ({ menuItemId: mid, modifierGroupId: id })));
  }
  const mods = await db.select().from(modifiersTable).where(eq(modifiersTable.groupId, id));
  const junctions = await db.select().from(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.modifierGroupId, id));
  res.json({ ...grp, menuItemIds: junctions.map(j => j.menuItemId), modifiers: mods.map(m => ({ ...m, priceDelta: parseFloat(m.priceDelta as string) })) });
});

router.delete("/menu/modifier-groups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(modifiersTable).where(eq(modifiersTable.groupId, id));
  await db.delete(menuItemModifierGroupsTable).where(eq(menuItemModifierGroupsTable.modifierGroupId, id));
  await db.delete(modifierGroupsTable).where(eq(modifierGroupsTable.id, id));
  res.sendStatus(204);
});

// ── COMBOS ────────────────────────────────────────────────────────────────────
router.get("/menu/combos", async (_req, res): Promise<void> => {
  const rows = await db.select().from(combosTable);
  const result = await Promise.all(rows.map(async (c) => {
    const items = await db.select({ menuItemId: comboItemsTable.menuItemId, quantity: comboItemsTable.quantity, menuItemName: menuItemsTable.nameEn }).from(comboItemsTable).leftJoin(menuItemsTable, eq(comboItemsTable.menuItemId, menuItemsTable.id)).where(eq(comboItemsTable.comboId, c.id));
    return { ...c, price: parseFloat(c.price as string), items };
  }));
  res.json(result);
});

router.post("/menu/combos", requireAuth, async (req, res): Promise<void> => {
  const { nameEn, nameAm, price, items, descriptionEn, descriptionAm, imageUrl, isAvailable } = req.body;
  if (!nameEn || !nameAm || price === undefined || !items) { res.status(400).json({ error: "nameEn, nameAm, price, items required" }); return; }
  const [combo] = await db.insert(combosTable).values({ nameEn, nameAm, price: String(price), descriptionEn: descriptionEn ?? null, descriptionAm: descriptionAm ?? null, imageUrl: imageUrl ?? null, isAvailable: isAvailable ?? true }).returning();
  if (items.length) await db.insert(comboItemsTable).values(items.map((i: any) => ({ comboId: combo.id, menuItemId: i.menuItemId, quantity: i.quantity ?? 1 })));
  const comboItems = await db.select({ menuItemId: comboItemsTable.menuItemId, quantity: comboItemsTable.quantity, menuItemName: menuItemsTable.nameEn }).from(comboItemsTable).leftJoin(menuItemsTable, eq(comboItemsTable.menuItemId, menuItemsTable.id)).where(eq(comboItemsTable.comboId, combo.id));
  res.status(201).json({ ...combo, price: parseFloat(combo.price as string), items: comboItems });
});

router.patch("/menu/combos/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { nameEn, nameAm, price, items, descriptionEn, descriptionAm, imageUrl, isAvailable } = req.body;
  const updates: any = {};
  if (nameEn !== undefined) updates.nameEn = nameEn;
  if (nameAm !== undefined) updates.nameAm = nameAm;
  if (price !== undefined) updates.price = String(price);
  if (descriptionEn !== undefined) updates.descriptionEn = descriptionEn;
  if (descriptionAm !== undefined) updates.descriptionAm = descriptionAm;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (isAvailable !== undefined) updates.isAvailable = isAvailable;
  const [combo] = await db.update(combosTable).set(updates).where(eq(combosTable.id, id)).returning();
  if (!combo) { res.status(404).json({ error: "Not found" }); return; }
  if (items !== undefined) {
    await db.delete(comboItemsTable).where(eq(comboItemsTable.comboId, id));
    if (items.length) await db.insert(comboItemsTable).values(items.map((i: any) => ({ comboId: id, menuItemId: i.menuItemId, quantity: i.quantity ?? 1 })));
  }
  const comboItems = await db.select({ menuItemId: comboItemsTable.menuItemId, quantity: comboItemsTable.quantity, menuItemName: menuItemsTable.nameEn }).from(comboItemsTable).leftJoin(menuItemsTable, eq(comboItemsTable.menuItemId, menuItemsTable.id)).where(eq(comboItemsTable.comboId, id));
  res.json({ ...combo, price: parseFloat(combo.price as string), items: comboItems });
});

router.delete("/menu/combos/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(comboItemsTable).where(eq(comboItemsTable.comboId, id));
  await db.delete(combosTable).where(eq(combosTable.id, id));
  res.sendStatus(204);
});

export default router;
