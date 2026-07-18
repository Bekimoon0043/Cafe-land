import { Router } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, paymentsTable, paymentProvidersTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { verifyCBE, verifyTelebirr } from "../lib/payment-verify";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function formatPayment(p: any) {
  return {
    ...p,
    totalAmount: parseFloat(p.totalAmount ?? "0"),
  };
}

// ── PROVIDERS ────────────────────────────────────────────────────────────────
router.get("/payments/providers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(paymentProvidersTable).orderBy(paymentProvidersTable.name);
  res.json(rows);
});

router.post("/payments/providers", requireAuth, async (req, res): Promise<void> => {
  const { name, providerType, baseVerificationUrl, receiverAccountNo, isActive } = req.body;
  if (!name || !providerType) { res.status(400).json({ error: "name and providerType required" }); return; }
  const [row] = await db.insert(paymentProvidersTable).values({ name, providerType, baseVerificationUrl: baseVerificationUrl ?? null, receiverAccountNo: receiverAccountNo ?? null, isActive: isActive ?? true }).returning();
  res.status(201).json(row);
});

router.patch("/payments/providers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { name, baseVerificationUrl, receiverAccountNo, isActive } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (baseVerificationUrl !== undefined) updates.baseVerificationUrl = baseVerificationUrl;
  if (receiverAccountNo !== undefined) updates.receiverAccountNo = receiverAccountNo;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db.update(paymentProvidersTable).set(updates).where(eq(paymentProvidersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit((req as any).user, "update_provider", "payment_provider", id);
  res.json(row);
});

// ── PAYMENTS ────────────────────────────────────────────────────────────────
router.get("/payments", async (req, res): Promise<void> => {
  const { method, status, dateFrom, dateTo, orderId } = req.query;
  const rows = await db.select({
    id: paymentsTable.id, orderId: paymentsTable.orderId, orderNumber: ordersTable.orderNumber,
    providerType: paymentsTable.providerType, totalAmount: paymentsTable.totalAmount,
    paymentMode: paymentsTable.paymentMode, payerName: paymentsTable.payerName,
    payerAccountNo: paymentsTable.payerAccountNo, receiverName: paymentsTable.receiverName,
    receiverAccountNo: paymentsTable.receiverAccountNo, paymentDate: paymentsTable.paymentDate,
    invoiceNo: paymentsTable.invoiceNo, receiptId: paymentsTable.receiptId,
    status: paymentsTable.status, failureReason: paymentsTable.failureReason,
    createdAt: paymentsTable.createdAt,
    providerName: paymentProvidersTable.name,
  }).from(paymentsTable)
    .leftJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .leftJoin(paymentProvidersTable, eq(paymentsTable.providerType, paymentProvidersTable.providerType))
    .orderBy(sql`${paymentsTable.createdAt} DESC`);

  let filtered = rows;
  if (method) filtered = filtered.filter(r => r.providerType === method);
  if (status) filtered = filtered.filter(r => r.status === status);
  if (orderId) filtered = filtered.filter(r => r.orderId === parseInt(orderId as string, 10));
  if (dateFrom) filtered = filtered.filter(r => r.createdAt.toISOString() >= (dateFrom as string));
  if (dateTo) filtered = filtered.filter(r => r.createdAt.toISOString() <= (dateTo as string) + "T23:59:59");
  res.json(filtered.map(formatPayment));
});

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as JwtPayload;
  const { orderId, providerType, totalAmount, receiptId } = req.body;
  if (!orderId || !providerType || totalAmount === undefined) {
    res.status(400).json({ error: "orderId, providerType, totalAmount required" });
    return;
  }
  const status = providerType === "cash" ? "verified" : "pending";
  const [payment] = await db.insert(paymentsTable).values({
    orderId, providerType, totalAmount: String(totalAmount),
    receiptId: receiptId ?? null, status,
  }).returning();

  // If cash, mark order as completed
  if (providerType === "cash") {
    await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, orderId));
  }

  await logAudit(user, "create_payment", "payment", payment.id, `method=${providerType},amount=${totalAmount}`);
  res.status(201).json(formatPayment({ ...payment, orderNumber: null, providerName: null }));
});

router.post("/payments/:id/verify", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const user = (req as any).user as JwtPayload;
  const { receiptId } = req.body;
  if (!receiptId) { res.status(400).json({ error: "receiptId required" }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  // Get the provider config
  const [provider] = await db.select().from(paymentProvidersTable)
    .where(eq(paymentProvidersTable.providerType, payment.providerType));

  if (!provider?.baseVerificationUrl) {
    res.status(400).json({ error: "No verification URL configured for this provider" });
    return;
  }

  // Get the order to compare amount
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, payment.orderId));

  try {
    let verified;
    if (payment.providerType === "telebirr") {
      verified = await verifyTelebirr(provider.baseVerificationUrl, receiptId);
    } else if (payment.providerType === "cbe") {
      verified = await verifyCBE(provider.baseVerificationUrl, receiptId);
    } else {
      res.status(400).json({ error: "Cash payments do not need verification" });
      return;
    }

    // Auto-match: compare extracted amount and receiver account to our records
    const orderTotal = parseFloat(order?.totalAmount as string ?? "0");
    const extractedAmount = verified.totalAmount ?? 0;
    const expectedReceiver = provider.receiverAccountNo;

    const amountMatch = extractedAmount > 0 && Math.abs(extractedAmount - orderTotal) < 1; // within 1 ETB tolerance
    const accountMatch = !expectedReceiver || !verified.receiverAccountNo ||
      verified.receiverAccountNo.includes(expectedReceiver) || expectedReceiver.includes(verified.receiverAccountNo);

    const autoApproved = amountMatch && accountMatch;
    const status = autoApproved ? "verified" : "manual_review";

    const [updated] = await db.update(paymentsTable).set({
      receiptId,
      payerName: verified.payerName,
      payerAccountNo: verified.payerAccountNo,
      receiverName: verified.receiverName,
      receiverAccountNo: verified.receiverAccountNo,
      paymentDate: verified.paymentDate,
      invoiceNo: verified.invoiceNo,
      totalAmount: verified.totalAmount ? String(verified.totalAmount) : payment.totalAmount,
      paymentMode: verified.paymentMode,
      status,
      failureReason: autoApproved ? null : `Amount match: ${amountMatch}, Account match: ${accountMatch}. Extracted amount: ${extractedAmount}, Expected: ${orderTotal}`,
    }).where(eq(paymentsTable.id, id)).returning();

    if (autoApproved && order) {
      await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, payment.orderId));
    }

    await logAudit(user, "verify_payment", "payment", id, `status=${status},receipt=${receiptId}`);
    res.json(formatPayment({ ...updated, orderNumber: order?.orderNumber ?? null, providerName: provider.name }));
  } catch (err: any) {
    const [updated] = await db.update(paymentsTable).set({
      receiptId, status: "failed", failureReason: err.message,
    }).where(eq(paymentsTable.id, id)).returning();
    res.json(formatPayment({ ...updated, orderNumber: null, providerName: null }));
  }
});

router.post("/payments/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const user = (req as any).user as JwtPayload;
  const [payment] = await db.update(paymentsTable).set({ status: "verified", failureReason: null }).where(eq(paymentsTable.id, id)).returning();
  if (!payment) { res.status(404).json({ error: "Not found" }); return; }
  // Mark order paid
  await db.update(ordersTable).set({ status: "completed" }).where(eq(ordersTable.id, payment.orderId));
  await logAudit(user, "manual_approve_payment", "payment", id);
  res.json(formatPayment({ ...payment, orderNumber: null, providerName: null }));
});

export default router;
