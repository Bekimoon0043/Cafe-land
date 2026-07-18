import { useState } from "react";
import { UsersRound, Plus, Search, Star, ShoppingBag, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import {
  useListCustomers, getListCustomersQueryKey, useCreateCustomer, useGetCustomer,
} from "@workspace/api-client-react";

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });

  const { data: customers = [], isLoading } = useListCustomers({
    params: { search: search || undefined } as any,
    query: { queryKey: [...getListCustomersQueryKey(), search] }
  });
  const { data: detail } = useGetCustomer({ id: detailId! }, { query: { enabled: !!detailId, queryKey: ['customer', detailId] } });
  const createCustomer = useCreateCustomer();

  const handleCreate = async () => {
    if (!form.name || !form.phone) { toast.error("Name and phone required"); return; }
    try {
      await createCustomer.mutateAsync({ data: { name: form.name, phone: form.phone, email: form.email || undefined } });
      toast.success("Customer added");
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setAddDialog(false); setForm({ name: "", phone: "", email: "" });
    } catch (e: any) { toast.error(e?.data?.error || "Failed to add customer"); }
  };

  const tierLabel = (points: number) => {
    if (points >= 5000) return { label: "Gold", cls: "bg-amber-100 text-amber-700 border-amber-200" };
    if (points >= 1000) return { label: "Silver", cls: "bg-slate-100 text-slate-600 border-slate-200" };
    return { label: "Bronze", cls: "bg-orange-100 text-orange-700 border-orange-200" };
  };

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><UsersRound className="w-6 h-6 text-primary" />Customers & Loyalty</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{customers.length} registered customers</p>
        </div>
        <Button onClick={() => setAddDialog(true)}><Plus className="w-4 h-4 mr-1" />Add Customer</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-5 shrink-0">
        {[
          { label: "Total Customers", value: customers.length, icon: UsersRound },
          { label: "Gold Members", value: customers.filter(c => (c.loyaltyPoints ?? 0) >= 5000).length, icon: Star },
          { label: "Total Revenue", value: `${customers.reduce((s, c) => s + (Number(c.totalSpent) || 0), 0).toLocaleString()} ETB`, icon: ShoppingBag },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><s.icon className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></div>
          </div>
        ))}
      </div>

      {/* Customer list */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 border-b border-border">
            <tr>{["Customer", "Phone", "Orders", "Total Spent", "Points", "Tier", ""].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {customers.map(c => {
              const tier = tierLabel(c.loyaltyPoints ?? 0);
              return (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setDetailId(c.id)}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">{c.name.charAt(0)}</div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span></td>
                  <td className="px-3 py-2.5 font-semibold">{c.totalOrders ?? 0}</td>
                  <td className="px-3 py-2.5 font-medium">{Number(c.totalSpent ?? 0).toLocaleString()} ETB</td>
                  <td className="px-3 py-2.5 font-semibold text-primary">{(c.loyaltyPoints ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5"><Badge className={tier.cls}>{tier.label}</Badge></td>
                  <td className="px-3 py-2.5"><button className="text-primary text-xs hover:underline">View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {customers.length === 0 && <div className="text-center py-10 text-muted-foreground">No customers yet</div>}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Phone *</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+251 91..." /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button><Button onClick={handleCreate}>Add Customer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={open => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Orders</p><p className="text-2xl font-bold">{detail.totalOrders}</p></div>
                <div className="bg-muted/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Total Spent</p><p className="text-2xl font-bold">{Number(detail.totalSpent).toLocaleString()}</p></div>
                <div className="bg-muted/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Points</p><p className="text-2xl font-bold text-primary">{(detail.loyaltyPoints ?? 0).toLocaleString()}</p></div>
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-sm">Recent Orders</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(detail as any).recentOrders?.map((o: any) => (
                    <div key={o.id} className="flex justify-between text-sm bg-muted/30 rounded px-3 py-2">
                      <span className="font-medium">{o.orderNumber}</span>
                      <Badge variant="outline" className="text-xs">{o.status}</Badge>
                      <span>{Number(o.totalAmount).toLocaleString()} ETB</span>
                      <span className="text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {!(detail as any).recentOrders?.length && <p className="text-muted-foreground text-sm">No orders yet</p>}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2 text-sm">Loyalty History</h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(detail as any).loyaltyHistory?.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between text-sm bg-muted/30 rounded px-3 py-2">
                      <span className={`font-semibold ${tx.type === "earned" ? "text-emerald-600" : "text-red-600"}`}>{tx.type === "earned" ? "+" : ""}{tx.points} pts</span>
                      <span className="capitalize text-muted-foreground">{tx.type}</span>
                      <span className="text-muted-foreground text-xs">{new Date(tx.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
