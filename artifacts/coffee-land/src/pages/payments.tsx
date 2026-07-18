import { useState, useEffect, useRef } from "react";
import { CreditCard, CheckCircle, XCircle, Clock, Search, QrCode, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { toast, speak } from "@/lib/notify";
import {
  useListPayments, getListPaymentsQueryKey,
  useVerifyPayment, useApprovePayment,
  useListPaymentProviders, getListPaymentProvidersQueryKey,
  useUpdatePaymentProvider,
} from "@workspace/api-client-react";

const statusConfig: Record<string, { label: string; cls: string; icon: any }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  verified: { label: "Verified", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  manual_review: { label: "Review", cls: "bg-blue-100 text-blue-700 border-blue-200", icon: AlertCircle },
};

const methodIcon: Record<string, string> = { cash: "💵", cbe: "🏦", telebirr: "📱" };

export default function Payments() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [receiptId, setReceiptId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [providerDialog, setProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [providerForm, setProviderForm] = useState({ baseVerificationUrl: "", receiverAccountNo: "" });

  const { data: payments = [], isLoading } = useListPayments({
    query: { queryKey: getListPaymentsQueryKey(), refetchInterval: 12000 }
  });
  const { data: providers = [] } = useListPaymentProviders({ query: { queryKey: getListPaymentProvidersQueryKey() } });

  // Announce new pending payments that weren't in the previous poll
  const seenPaymentIds = useRef<Set<number>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (isLoading) return;
    const pendingIds = (payments as any[])
      .filter(p => p.status === "pending")
      .map(p => p.id as number);
    const newPending = pendingIds.filter(id => !seenPaymentIds.current.has(id));

    if (!isFirstLoad.current && newPending.length > 0) {
      newPending.forEach(() => {
        speak("New order arrived");
        toast.info("New payment pending confirmation");
      });
    }

    // Track ALL payment ids (not just pending) so dismissed ones don't re-trigger
    (payments as any[]).forEach(p => seenPaymentIds.current.add(p.id));
    isFirstLoad.current = false;
  }, [payments, isLoading]);
  const verifyPayment = useVerifyPayment();
  const approvePayment = useApprovePayment();
  const updateProvider = useUpdatePaymentProvider();

  const filtered = payments.filter((p: any) => {
    const matchSearch = !search || (p.orderNumber ?? "").toLowerCase().includes(search.toLowerCase()) || (p.invoiceNo ?? "").toLowerCase().includes(search.toLowerCase()) || (p.payerName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleVerify = async () => {
    if (!receiptId.trim()) { toast.error("Enter receipt ID"); return; }
    setVerifying(true);
    try {
      const result = await verifyPayment.mutateAsync({ id: selectedPayment.id, data: { receiptId } });
      qc.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
      if ((result as any).status === "verified") toast.success("Payment verified automatically!");
      else if ((result as any).status === "manual_review") toast.warning("Amount or account mismatch — flagged for manual review");
      else toast.error("Verification failed");
      setVerifyDialog(false); setReceiptId("");
    } catch (e: any) { toast.error(e?.data?.error || "Verification error"); }
    finally { setVerifying(false); }
  };

  const handleManualApprove = async (id: number) => {
    if (!confirm("Manually approve this payment?")) return;
    try {
      await approvePayment.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
      toast.success("Payment approved");
    } catch { toast.error("Failed"); }
  };

  const handleProviderSave = async () => {
    try {
      await updateProvider.mutateAsync({ id: editingProvider.id, data: providerForm });
      qc.invalidateQueries({ queryKey: getListPaymentProvidersQueryKey() });
      toast.success("Provider updated");
      setProviderDialog(false);
    } catch { toast.error("Failed"); }
  };

  const total = { verified: 0, pending: 0, failed: 0 };
  payments.forEach((p: any) => {
    const amt = Number(p.totalAmount ?? 0);
    if (p.status === "verified") total.verified += amt;
    else if (p.status === "pending" || p.status === "manual_review") total.pending += amt;
    else total.failed += amt;
  });

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="w-6 h-6 text-primary" />Payments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Ethiopian payment verification — CBE & TeleBirr</p>
        </div>
        <Button variant="outline" onClick={() => setProviderDialog(true)}>Configure Providers</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5 shrink-0">
        {[
          { label: "Verified Revenue", val: total.verified, cls: "text-emerald-600" },
          { label: "Pending / Review", val: total.pending, cls: "text-amber-600" },
          { label: "Failed", val: total.failed, cls: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.cls}`}>{s.val.toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <TabsList>
            {["all", "pending", "manual_review", "verified", "failed"].map(s => (
              <TabsTrigger key={s} value={s} onClick={() => setFilterStatus(s)} className="capitalize text-xs">{s.replace("_", " ")}</TabsTrigger>
            ))}
          </TabsList>
          <div className="relative ml-auto w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search order, receipt…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <TabsContent value={filterStatus} className="flex-1 overflow-auto mt-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 border-b border-border">
              <tr>{["Order", "Method", "Amount", "Payer", "Invoice/Receipt", "Date", "Status", "Actions"].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const sc = statusConfig[p.status] ?? statusConfig.pending;
                const StatusIcon = sc.icon;
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium">{p.orderNumber ?? `#${p.orderId}`}</td>
                    <td className="px-3 py-2.5"><span className="flex items-center gap-1">{methodIcon[p.providerType] ?? "💳"}<span className="capitalize">{p.providerType}</span></span></td>
                    <td className="px-3 py-2.5 font-semibold">{Number(p.totalAmount).toLocaleString()} ETB</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.payerName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{p.invoiceNo ?? p.receiptId ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={`${sc.cls} flex items-center gap-1 w-fit`}><StatusIcon className="w-3 h-3" />{sc.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
                        {p.providerType !== "cash" && (p.status === "pending" || p.status === "failed") && (
                          <button onClick={() => { setSelectedPayment(p); setReceiptId(""); setVerifyDialog(true); }} className="text-primary text-xs hover:underline font-medium">Verify</button>
                        )}
                        {p.providerType === "cash" && p.status === "pending" && (
                          <button onClick={() => handleManualApprove(p.id)} className="text-emerald-600 text-xs hover:underline font-medium">Confirm Cash Received</button>
                        )}
                        {p.status === "manual_review" && (
                          <button onClick={() => handleManualApprove(p.id)} className="text-emerald-600 text-xs hover:underline font-medium">Approve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center py-10 text-muted-foreground">No payments found</div>}
        </TabsContent>
      </Tabs>

      {/* Verify Dialog */}
      <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {selectedPayment?.providerType?.toUpperCase()} Payment</DialogTitle>
            <DialogDescription>Enter the transaction receipt ID to verify automatically. If the amount and account match, it will be approved instantly.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-medium">{selectedPayment?.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Expected Amount</span><span className="font-bold text-primary">{Number(selectedPayment?.totalAmount ?? 0).toLocaleString()} ETB</span></div>
            </div>
            <div><Label>Receipt / Transaction ID</Label><Input value={receiptId} onChange={e => setReceiptId(e.target.value)} placeholder="e.g. FT12345678ABC or 9876543210" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog(false)}>Cancel</Button>
            <Button onClick={handleVerify} disabled={verifying}>{verifying ? "Verifying…" : "Verify Now"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider Config Dialog */}
      <Dialog open={providerDialog} onOpenChange={setProviderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Provider Configuration</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {providers.map((prov: any) => (
              <div key={prov.id} className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">{methodIcon[prov.providerType] ?? "💳"}{prov.name}</h4>
                  <Badge className={prov.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>{prov.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                {prov.providerType !== "cash" && (
                  <div className="space-y-2">
                    <div><Label className="text-xs">Verification URL</Label><p className="text-xs text-muted-foreground font-mono break-all">{prov.baseVerificationUrl ?? "Not set"}</p></div>
                    <div><Label className="text-xs">Receiver Account No.</Label><p className="text-xs text-muted-foreground font-mono">{prov.receiverAccountNo ?? "Not set"}</p></div>
                    <button onClick={() => { setEditingProvider(prov); setProviderForm({ baseVerificationUrl: prov.baseVerificationUrl ?? "", receiverAccountNo: prov.receiverAccountNo ?? "" }); }} className="text-primary text-xs hover:underline font-medium">Edit</button>
                  </div>
                )}
              </div>
            ))}
            {editingProvider && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Editing: {editingProvider.name}</h4>
                <div><Label>Verification Base URL</Label><Input value={providerForm.baseVerificationUrl} onChange={e => setProviderForm(f => ({ ...f, baseVerificationUrl: e.target.value }))} /></div>
                <div><Label>Our Receiver Account No.</Label><Input value={providerForm.receiverAccountNo} onChange={e => setProviderForm(f => ({ ...f, receiverAccountNo: e.target.value }))} /></div>
                <div className="flex gap-2"><Button onClick={handleProviderSave} size="sm">Save</Button><Button variant="outline" size="sm" onClick={() => setEditingProvider(null)}>Cancel</Button></div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
