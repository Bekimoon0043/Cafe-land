import { useState } from "react";
import { Receipt, Plus, Trash2, Edit2, TrendingDown, Download, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import {
  useListExpenseCategories, getListExpenseCategoriesQueryKey,
  useListExpenses, getListExpensesQueryKey,
  useGetExpenseSummary, getGetExpenseSummaryQueryKey,
  useCreateExpense, useUpdateExpense, useDeleteExpense,
  useCreateExpenseCategory,
} from "@workspace/api-client-react";

const PAYMENT_METHODS = ["cash", "bank_transfer", "mobile_money", "card", "other"];

function formatETB(n: number) { return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`; }

export default function Expenses() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [tab, setTab] = useState("list");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [filterCategory, setFilterCategory] = useState("all");
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [catDialog, setCatDialog] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", nameAm: "", color: "#6b7280" });
  const [form, setForm] = useState({
    categoryId: "", amount: "", description: "", paymentMethod: "cash",
    receiptNo: "", expenseDate: today, notes: "",
  });

  const expQuery = { dateFrom, dateTo, ...(filterCategory !== "all" ? { categoryId: filterCategory } : {}) };

  const { data: categories = [] } = useListExpenseCategories({ query: { queryKey: getListExpenseCategoriesQueryKey() } });
  const { data: expenses = [], isLoading } = useListExpenses({ params: expQuery as any, query: { queryKey: [...getListExpensesQueryKey(), dateFrom, dateTo, filterCategory] } });
  const { data: summary } = useGetExpenseSummary({ params: { dateFrom, dateTo } as any, query: { queryKey: [...getGetExpenseSummaryQueryKey(), dateFrom, dateTo] } });

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateExpenseCategory();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetExpenseSummaryQueryKey() });
  };

  const openAdd = () => {
    setEditingExpense(null);
    setForm({ categoryId: "", amount: "", description: "", paymentMethod: "cash", receiptNo: "", expenseDate: today, notes: "" });
    setExpenseDialog(true);
  };

  const openEdit = (e: any) => {
    setEditingExpense(e);
    setForm({ categoryId: String(e.categoryId ?? ""), amount: String(e.amount ?? ""), description: e.description ?? "", paymentMethod: e.paymentMethod ?? "cash", receiptNo: e.receiptNo ?? "", expenseDate: e.expenseDate ?? today, notes: e.notes ?? "" });
    setExpenseDialog(true);
  };

  const handleSave = async () => {
    if (!form.categoryId || !form.amount || !form.description || !form.expenseDate) {
      toast.error("Category, amount, description and date are required"); return;
    }
    try {
      const payload = { categoryId: parseInt(form.categoryId), amount: parseFloat(form.amount), description: form.description, paymentMethod: form.paymentMethod, receiptNo: form.receiptNo || null, expenseDate: form.expenseDate, notes: form.notes || null };
      if (editingExpense) {
        await updateExpense.mutateAsync({ id: editingExpense.id, data: payload as any });
        toast.success("Expense updated");
      } else {
        await createExpense.mutateAsync({ data: payload as any });
        toast.success("Expense recorded");
      }
      invalidate();
      setExpenseDialog(false);
    } catch (e: any) { toast.error(e?.data?.error || "Failed to save expense"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteExpense.mutateAsync({ id });
      toast.success("Expense deleted");
      invalidate();
    } catch { toast.error("Failed to delete"); }
  };

  const handleAddCategory = async () => {
    if (!catForm.name) { toast.error("Name required"); return; }
    try {
      await createCategory.mutateAsync({ data: catForm as any });
      toast.success("Category created");
      qc.invalidateQueries({ queryKey: getListExpenseCategoriesQueryKey() });
      setCatDialog(false);
      setCatForm({ name: "", nameAm: "", color: "#6b7280" });
    } catch { toast.error("Failed to create category"); }
  };

  const sum = summary as any;
  const grandTotal = sum?.grandTotal ?? 0;
  const byCategory = sum?.byCategory ?? [];
  const dailyData = sum?.dailyData ?? [];

  const exportCSV = () => {
    const rows = [["Date", "Category", "Description", "Amount (ETB)", "Payment Method", "Receipt No", "Staff", "Notes"]];
    for (const e of (expenses as any[])) {
      rows.push([e.expenseDate, e.categoryName ?? "", e.description, String(e.amount), e.paymentMethod, e.receiptNo ?? "", e.staffName ?? "", e.notes ?? ""]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `expenses_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />Expense Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track all business expenses and costs</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setCatDialog(true)}><Tag className="w-3.5 h-3.5 mr-1.5" />Add Category</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1.5" />Export CSV</Button>
          <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Expense</Button>
        </div>
      </div>

      {/* Date filters + category filter */}
      <div className="flex items-center gap-3 mb-5 shrink-0 flex-wrap">
        <Label className="text-muted-foreground text-sm">From</Label>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
        <Label className="text-muted-foreground text-sm">To</Label>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(categories as any[]).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* Grand Total pill */}
        <div className="ml-auto bg-red-50 border border-red-100 rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="font-bold text-red-600">{formatETB(grandTotal)}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0 mb-4">
          <TabsTrigger value="list">All Expenses</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="chart">Charts</TabsTrigger>
        </TabsList>

        {/* ── LIST TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="list" className="flex-1 overflow-auto mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>
          ) : (expenses as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Receipt className="w-10 h-10 opacity-20" />
              <p>No expenses recorded for this period</p>
              <Button size="sm" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" />Record First Expense</Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm border-b border-border">
                <tr>
                  {["Date", "Category", "Description", "Amount", "Method", "Receipt #", "Recorded By", ""].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(expenses as any[]).map((e: any) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">{e.expenseDate}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.categoryColor ?? "#6b7280" }} />
                        {e.categoryName ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-xs truncate">{e.description}</td>
                    <td className="px-3 py-2.5 font-bold text-red-600">{formatETB(e.amount)}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-xs capitalize">{e.paymentMethod?.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{e.receiptNo ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{e.staffName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(e)} className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(e.id)} className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        {/* ── SUMMARY TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="summary" className="flex-1 overflow-auto mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {byCategory.map((c: any) => (
              <div key={c.categoryId} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.categoryColor ?? "#6b7280" }} />
                    <span className="font-semibold text-sm">{c.categoryName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.count} entries</span>
                </div>
                <div className="text-xl font-bold text-red-600">{formatETB(c.total)}</div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${c.percentage}%`, backgroundColor: c.categoryColor ?? "#6b7280" }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{c.percentage.toFixed(1)}% of total</div>
              </div>
            ))}
            {byCategory.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">No expense data for this period</div>
            )}
          </div>
        </TabsContent>

        {/* ── CHARTS TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="chart" className="flex-1 overflow-auto mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Pie chart — by category */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Expenses by Category</h3>
              {byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byCategory.map((c: any, i: number) => (
                        <Cell key={i} fill={c.categoryColor ?? `hsl(${i * 45}, 60%, 50%)`} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatETB(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-64 flex items-center justify-center text-muted-foreground">No data</div>}
            </div>

            {/* Bar chart — daily trend */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Daily Expense Trend</h3>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} width={50} />
                    <Tooltip formatter={(v: any) => [formatETB(Number(v)), "Amount"]} />
                    <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-64 flex items-center justify-center text-muted-foreground">No data</div>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── ADD/EDIT EXPENSE DIALOG ───────────────────────────────────────── */}
      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingExpense ? "Edit Expense" : "Record Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#6b7280" }} />{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (ETB) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>Description <span className="text-destructive">*</span></Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was this expense for?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Receipt / Reference Number</Label>
              <Input value={form.receiptNo} onChange={e => setForm(f => ({ ...f, receiptNo: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes (optional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingExpense ? "Save Changes" : "Record Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADD CATEGORY DIALOG ───────────────────────────────────────────── */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name (English) <span className="text-destructive">*</span></Label><Input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Name (Amharic)</Label><Input value={catForm.nameAm} onChange={e => setCatForm(f => ({ ...f, nameAm: e.target.value }))} /></div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border border-border" />
                <span className="text-sm text-muted-foreground">{catForm.color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCategory}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
