import { useState } from "react";
import { Package, AlertTriangle, Truck, Trash2, Plus, ChevronDown, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import {
  useListIngredients, getListIngredientsQueryKey,
  useCreateIngredient, useUpdateIngredient, useDeleteIngredient,
  useListSuppliers, getListSuppliersQueryKey,
  useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useListPurchaseOrders, getListPurchaseOrdersQueryKey,
  useCreatePurchaseOrder,
  useListWasteLogs, getListWasteLogsQueryKey,
  useCreateWasteLog,
  useGetLowStockAlerts, getGetLowStockAlertsQueryKey,
} from "@workspace/api-client-react";

const UNITS = ["kg", "g", "liter", "ml", "piece", "pack"] as const;

export default function Inventory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ingredients");
  const [ingDialog, setIngDialog] = useState(false);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [poDialog, setPoDialog] = useState(false);
  const [wasteDialog, setWasteDialog] = useState(false);
  const [editingIng, setEditingIng] = useState<any>(null);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [ingForm, setIngForm] = useState({ name: "", unit: "kg", currentStock: "", reorderThreshold: "", costPerUnit: "", supplierId: "" });
  const [supplierForm, setSupplierForm] = useState({ name: "", contactPerson: "", phone: "", email: "", address: "" });
  const [poForm, setPoForm] = useState({ supplierId: "", notes: "", items: [{ ingredientId: "", quantity: "", unitCost: "" }] });
  const [wasteForm, setWasteForm] = useState({ ingredientId: "", quantity: "", reason: "" });

  const { data: ingredients = [], isLoading: ingLoading } = useListIngredients({ query: { queryKey: getListIngredientsQueryKey() } });
  const { data: suppliers = [] } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: purchaseOrders = [] } = useListPurchaseOrders({ query: { queryKey: getListPurchaseOrdersQueryKey() } });
  const { data: wasteLogs = [] } = useListWasteLogs({ query: { queryKey: getListWasteLogsQueryKey() } });
  const { data: lowStock = [] } = useGetLowStockAlerts({ query: { queryKey: getGetLowStockAlertsQueryKey() } });

  const createIng = useCreateIngredient();
  const updateIng = useUpdateIngredient();
  const deleteIng = useDeleteIngredient();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const createPO = useCreatePurchaseOrder();
  const createWaste = useCreateWasteLog();

  const filteredIng = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const openIngEdit = (ing: any) => {
    setEditingIng(ing);
    setIngForm({ name: ing.name, unit: ing.unit, currentStock: String(ing.currentStock), reorderThreshold: String(ing.reorderThreshold), costPerUnit: String(ing.costPerUnit), supplierId: String(ing.supplierId ?? "") });
    setIngDialog(true);
  };

  const handleIngSave = async () => {
    try {
      const data = { name: ingForm.name, unit: ingForm.unit as any, currentStock: parseFloat(ingForm.currentStock), reorderThreshold: parseFloat(ingForm.reorderThreshold), costPerUnit: parseFloat(ingForm.costPerUnit), supplierId: ingForm.supplierId ? parseInt(ingForm.supplierId) : undefined };
      if (editingIng) { await updateIng.mutateAsync({ id: editingIng.id, data }); toast.success("Ingredient updated"); }
      else { await createIng.mutateAsync({ data }); toast.success("Ingredient added"); }
      qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetLowStockAlertsQueryKey() });
      setIngDialog(false); setEditingIng(null);
      setIngForm({ name: "", unit: "kg", currentStock: "", reorderThreshold: "", costPerUnit: "", supplierId: "" });
    } catch { toast.error("Failed to save ingredient"); }
  };

  const handleSupplierSave = async () => {
    try {
      if (editingSupplier) { await updateSupplier.mutateAsync({ id: editingSupplier.id, data: supplierForm }); toast.success("Supplier updated"); }
      else { await createSupplier.mutateAsync({ data: supplierForm }); toast.success("Supplier added"); }
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setSupplierDialog(false); setEditingSupplier(null);
      setSupplierForm({ name: "", contactPerson: "", phone: "", email: "", address: "" });
    } catch { toast.error("Failed to save supplier"); }
  };

  const handlePOCreate = async () => {
    try {
      await createPO.mutateAsync({ data: { supplierId: parseInt(poForm.supplierId), notes: poForm.notes, items: poForm.items.map(i => ({ ingredientId: parseInt(i.ingredientId), quantity: parseFloat(i.quantity), unitCost: parseFloat(i.unitCost) })) } });
      toast.success("Purchase order created");
      qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      setPoDialog(false);
      setPoForm({ supplierId: "", notes: "", items: [{ ingredientId: "", quantity: "", unitCost: "" }] });
    } catch { toast.error("Failed to create PO"); }
  };

  const handleWasteLog = async () => {
    try {
      await createWaste.mutateAsync({ data: { ingredientId: parseInt(wasteForm.ingredientId), quantity: parseFloat(wasteForm.quantity), reason: wasteForm.reason } });
      toast.success("Waste logged");
      qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() });
      qc.invalidateQueries({ queryKey: getListWasteLogsQueryKey() });
      setWasteDialog(false);
      setWasteForm({ ingredientId: "", quantity: "", reason: "" });
    } catch { toast.error("Failed to log waste"); }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package className="w-6 h-6 text-primary" />Inventory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage ingredients, suppliers and stock</p>
        </div>
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold">{lowStock.length} low stock item{lowStock.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0 mb-4">
          <TabsTrigger value="ingredients">Ingredients ({ingredients.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({suppliers.length})</TabsTrigger>
          <TabsTrigger value="purchase-orders">Purchase Orders ({purchaseOrders.length})</TabsTrigger>
          <TabsTrigger value="waste">Waste Log ({wasteLogs.length})</TabsTrigger>
        </TabsList>

        {/* INGREDIENTS */}
        <TabsContent value="ingredients" className="flex-1 overflow-hidden flex flex-col mt-0">
          <div className="flex gap-3 mb-4 shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ingredients…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => { setEditingIng(null); setIngForm({ name: "", unit: "kg", currentStock: "", reorderThreshold: "", costPerUnit: "", supplierId: "" }); setIngDialog(true); }}><Plus className="w-4 h-4 mr-1" />Add Ingredient</Button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 border-b border-border">
                <tr>
                  {["Name", "Unit", "Stock", "Reorder At", "Cost/Unit", "Supplier", "Status", ""].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredIng.map(ing => (
                  <tr key={ing.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium">{ing.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{ing.unit}</td>
                    <td className="px-3 py-2.5 font-semibold">{Number(ing.currentStock).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{Number(ing.reorderThreshold).toFixed(2)}</td>
                    <td className="px-3 py-2.5">{Number(ing.costPerUnit).toFixed(2)} ETB</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{(ing as any).supplierName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {(ing as any).isLowStock ? <Badge className="bg-red-100 text-red-700 border-red-200">Low Stock</Badge> : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">OK</Badge>}
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => openIngEdit(ing)} className="text-primary hover:underline text-xs font-medium mr-2">Edit</button>
                      <button onClick={async () => { if (confirm("Delete?")) { await deleteIng.mutateAsync({ id: ing.id }); qc.invalidateQueries({ queryKey: getListIngredientsQueryKey() }); } }} className="text-destructive hover:underline text-xs">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredIng.length === 0 && <div className="text-center py-10 text-muted-foreground">No ingredients found</div>}
          </div>
        </TabsContent>

        {/* SUPPLIERS */}
        <TabsContent value="suppliers" className="flex-1 overflow-hidden flex flex-col mt-0">
          <div className="flex justify-end mb-4 shrink-0">
            <Button onClick={() => { setEditingSupplier(null); setSupplierForm({ name: "", contactPerson: "", phone: "", email: "", address: "" }); setSupplierDialog(true); }}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 border-b border-border">
                <tr>{["Name", "Contact", "Phone", "Email", ""].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{s.contactPerson ?? "—"}</td>
                    <td className="px-3 py-2.5">{s.phone ?? "—"}</td>
                    <td className="px-3 py-2.5">{s.email ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => { setEditingSupplier(s); setSupplierForm({ name: s.name, contactPerson: s.contactPerson ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" }); setSupplierDialog(true); }} className="text-primary hover:underline text-xs font-medium mr-2">Edit</button>
                      <button onClick={async () => { if (confirm("Delete?")) { await deleteSupplier.mutateAsync({ id: s.id }); qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() }); } }} className="text-destructive hover:underline text-xs">Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* PURCHASE ORDERS */}
        <TabsContent value="purchase-orders" className="flex-1 overflow-hidden flex flex-col mt-0">
          <div className="flex justify-end mb-4 shrink-0">
            <Button onClick={() => setPoDialog(true)}><Plus className="w-4 h-4 mr-1" />New Purchase Order</Button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 border-b border-border">
                <tr>{["#", "Supplier", "Total Cost (ETB)", "Status", "Date"].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(purchaseOrders as any[]).map((po: any) => (
                  <tr key={po.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">PO-{po.id}</td>
                    <td className="px-3 py-2.5">{po.supplierName}</td>
                    <td className="px-3 py-2.5 font-semibold">{Number(po.totalCost).toLocaleString()}</td>
                    <td className="px-3 py-2.5"><Badge className={po.status === "received" ? "bg-emerald-100 text-emerald-700" : po.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>{po.status}</Badge></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* WASTE LOG */}
        <TabsContent value="waste" className="flex-1 overflow-hidden flex flex-col mt-0">
          <div className="flex justify-end mb-4 shrink-0">
            <Button variant="destructive" onClick={() => setWasteDialog(true)}><Trash2 className="w-4 h-4 mr-1" />Log Waste</Button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 border-b border-border">
                <tr>{["Ingredient", "Quantity", "Reason", "Logged By", "Date"].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(wasteLogs as any[]).map((w: any) => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">{w.ingredientName}</td>
                    <td className="px-3 py-2.5">{Number(w.quantity).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{w.reason}</td>
                    <td className="px-3 py-2.5">{w.loggedByName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ingredient Dialog */}
      <Dialog open={ingDialog} onOpenChange={setIngDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingIng ? "Edit" : "Add"} Ingredient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={ingForm.name} onChange={e => setIngForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Unit</Label>
              <Select value={ingForm.unit} onValueChange={v => setIngForm(f => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Current Stock</Label><Input type="number" value={ingForm.currentStock} onChange={e => setIngForm(f => ({ ...f, currentStock: e.target.value }))} /></div>
              <div><Label>Reorder Threshold</Label><Input type="number" value={ingForm.reorderThreshold} onChange={e => setIngForm(f => ({ ...f, reorderThreshold: e.target.value }))} /></div>
            </div>
            <div><Label>Cost per Unit (ETB)</Label><Input type="number" value={ingForm.costPerUnit} onChange={e => setIngForm(f => ({ ...f, costPerUnit: e.target.value }))} /></div>
            <div><Label>Supplier</Label>
              <Select value={ingForm.supplierId} onValueChange={v => setIngForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIngDialog(false)}>Cancel</Button><Button onClick={handleIngSave}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSupplier ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(["name", "contactPerson", "phone", "email", "address"] as const).map(k => (
              <div key={k}><Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label><Input value={supplierForm[k]} onChange={e => setSupplierForm(f => ({ ...f, [k]: e.target.value }))} /></div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSupplierDialog(false)}>Cancel</Button><Button onClick={handleSupplierSave}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO Dialog */}
      <Dialog open={poDialog} onOpenChange={setPoDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Supplier</Label>
              <Select value={poForm.supplierId} onValueChange={v => setPoForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={poForm.notes} onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div>
              <Label className="mb-1 block">Items</Label>
              {poForm.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <Select value={item.ingredientId} onValueChange={v => setPoForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ingredientId: v } : it) }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Ingredient" /></SelectTrigger>
                    <SelectContent>{ingredients.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="w-20" type="number" placeholder="Qty" value={item.quantity} onChange={e => setPoForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it) }))} />
                  <Input className="w-24" type="number" placeholder="Cost" value={item.unitCost} onChange={e => setPoForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, unitCost: e.target.value } : it) }))} />
                  {poForm.items.length > 1 && <button onClick={() => setPoForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}><X className="w-4 h-4 text-destructive" /></button>}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setPoForm(f => ({ ...f, items: [...f.items, { ingredientId: "", quantity: "", unitCost: "" }] }))}><Plus className="w-3 h-3 mr-1" />Add Item</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPoDialog(false)}>Cancel</Button><Button onClick={handlePOCreate}>Create PO</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waste Dialog */}
      <Dialog open={wasteDialog} onOpenChange={setWasteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Waste</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ingredient</Label>
              <Select value={wasteForm.ingredientId} onValueChange={v => setWasteForm(f => ({ ...f, ingredientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                <SelectContent>{ingredients.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({Number(i.currentStock).toFixed(2)} {i.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={wasteForm.quantity} onChange={e => setWasteForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div><Label>Reason</Label><Input value={wasteForm.reason} onChange={e => setWasteForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. spoiled, dropped, expired" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setWasteDialog(false)}>Cancel</Button><Button variant="destructive" onClick={handleWasteLog}>Log Waste</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
