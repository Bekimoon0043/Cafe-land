import { useState, useRef } from "react";
import {
  useListCategories, getListCategoriesQueryKey,
  useListMenuItems, getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BilingualText } from "@/components/bilingual-text";
import { Plus, Edit2, Trash2, Search, Coffee, Upload, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/notify";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── helpers ────────────────────────────────────────────────────────────────────
async function authFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

interface ItemForm {
  id?: number;
  nameEn: string;
  nameAm: string;
  descriptionEn: string;
  descriptionAm: string;
  categoryId: string;
  price: string;
  prepTimeMinutes: string;
  isAvailable: boolean;
  imageUrl: string;       // URL stored in DB
  imagePreview: string;   // local blob URL for UI preview
}

const emptyForm = (): ItemForm => ({
  nameEn: "", nameAm: "", descriptionEn: "", descriptionAm: "",
  categoryId: "", price: "", prepTimeMinutes: "10", isAvailable: true,
  imageUrl: "", imagePreview: "",
});

// ── Category form ───────────────────────────────────────────────────────────
interface CatForm { id?: number; nameEn: string; nameAm: string; icon: string; sortOrder: string; }
const emptyCatForm = (): CatForm => ({ nameEn: "", nameAm: "", icon: "", sortOrder: "0" });

// ── Main component ─────────────────────────────────────────────────────────────
export default function MenuManagement() {
  const [activeTab, setActiveTab]   = useState("items");
  const [search, setSearch]         = useState("");
  const [filterCat, setFilterCat]   = useState("");
  const queryClient                 = useQueryClient();

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [itemDialog, setItemDialog] = useState(false);
  const [catDialog,  setCatDialog]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [form,       setForm]       = useState<ItemForm>(emptyForm());
  const [catForm,    setCatForm]    = useState<CatForm>(emptyCatForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: menuItems   = [] } = useListMenuItems({}, { query: { queryKey: getListMenuItemsQueryKey({}) } });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey({}) });
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  };

  // ── Image upload ─────────────────────────────────────────────────────────────
  const handleImageFile = async (file: File) => {
    // Show local preview instantly
    const preview = URL.createObjectURL(file);
    setForm(f => ({ ...f, imagePreview: preview }));

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setForm(f => ({ ...f, imageUrl: url }));
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Image upload failed");
      setForm(f => ({ ...f, imagePreview: f.imageUrl })); // revert preview
    } finally {
      setUploading(false);
    }
  };

  const openAddItem = () => { setForm(emptyForm()); setItemDialog(true); };
  const openEditItem = (item: any) => {
    setForm({
      id: item.id,
      nameEn: item.nameEn, nameAm: item.nameAm,
      descriptionEn: item.descriptionEn ?? "", descriptionAm: item.descriptionAm ?? "",
      categoryId: String(item.categoryId),
      price: String(item.price),
      prepTimeMinutes: String(item.prepTimeMinutes ?? 10),
      isAvailable: item.isAvailable,
      imageUrl: item.imageUrl ?? "", imagePreview: item.imageUrl ?? "",
    });
    setItemDialog(true);
  };

  // ── Save item (create or update) ─────────────────────────────────────────────
  const handleSaveItem = async () => {
    if (!form.nameEn || !form.nameAm || !form.categoryId || !form.price) {
      toast.error("Please fill all required fields (Name EN, Name AM, Category, Price)");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nameEn: form.nameEn, nameAm: form.nameAm,
        descriptionEn: form.descriptionEn || null, descriptionAm: form.descriptionAm || null,
        categoryId: parseInt(form.categoryId),
        price: parseFloat(form.price),
        prepTimeMinutes: parseInt(form.prepTimeMinutes) || 10,
        isAvailable: form.isAvailable,
        imageUrl: form.imageUrl || null,
      };
      if (form.id) {
        await authFetch(`/menu/items/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Menu item updated");
      } else {
        await authFetch("/menu/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Menu item added");
      }
      setItemDialog(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete item ───────────────────────────────────────────────────────────────
  const handleDeleteItem = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await authFetch(`/menu/items/${id}`, { method: "DELETE" });
      toast.success("Item deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  // ── Toggle availability ───────────────────────────────────────────────────────
  const handleToggle = async (id: number) => {
    try {
      await authFetch(`/menu/items/${id}/toggle-availability`, { method: "POST" });
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Toggle failed");
    }
  };

  // ── Category CRUD ─────────────────────────────────────────────────────────────
  const openAddCat  = () => { setCatForm(emptyCatForm()); setCatDialog(true); };
  const openEditCat = (c: any) => {
    setCatForm({ id: c.id, nameEn: c.nameEn, nameAm: c.nameAm, icon: c.icon ?? "", sortOrder: String(c.sortOrder ?? 0) });
    setCatDialog(true);
  };
  const handleSaveCat = async () => {
    if (!catForm.nameEn || !catForm.nameAm) { toast.error("Both names required"); return; }
    setSaving(true);
    try {
      const payload = { nameEn: catForm.nameEn, nameAm: catForm.nameAm, icon: catForm.icon || null, sortOrder: parseInt(catForm.sortOrder) || 0 };
      if (catForm.id) {
        await authFetch(`/menu/categories/${catForm.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Category updated");
      } else {
        await authFetch("/menu/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast.success("Category added");
      }
      setCatDialog(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteCat = async (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
      await authFetch(`/menu/categories/${id}`, { method: "DELETE" });
      toast.success("Category deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  // ── Filtered items ────────────────────────────────────────────────────────────
  const filtered = menuItems.filter(item => {
    const matchSearch = !search || item.nameEn.toLowerCase().includes(search.toLowerCase()) || item.nameAm.includes(search);
    const matchCat    = !filterCat || item.categoryId === parseInt(filterCat);
    return matchSearch && matchCat;
  });

  return (
    <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5 shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />Menu Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage categories and menu items</p>
        </div>
        <Button
          onClick={activeTab === "items" ? openAddItem : openAddCat}
          className="h-9 px-4 font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          {activeTab === "items" ? "Add Item" : "Add Category"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start h-10 bg-muted/50 p-1 mb-4 shrink-0">
          <TabsTrigger value="items"      className="text-sm px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Menu Items</TabsTrigger>
          <TabsTrigger value="categories" className="text-sm px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm">Categories</TabsTrigger>
        </TabsList>

        {/* ── Items tab ── */}
        <TabsContent value="items" className="flex-1 overflow-hidden m-0 border border-border rounded-xl bg-card shadow-sm flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b border-border flex flex-wrap gap-3 shrink-0 bg-muted/20">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." className="pl-9 bg-background h-9" />
            </div>
            <select
              value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[70px]">Image</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Available</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Coffee className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{search || filterCat ? "No items match your filters" : "No menu items yet — click Add Item to get started"}</p>
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(item => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden border border-border flex items-center justify-center">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.nameEn} className="w-full h-full object-cover" />
                          : <Coffee className="w-5 h-5 text-muted-foreground/40" />
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{item.nameEn}</div>
                      <div className="text-xs text-muted-foreground">{item.nameAm}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                        {(item as any).categoryName ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-sm">ETB {Number(item.price).toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={item.isAvailable} onCheckedChange={() => handleToggle(item.id)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEditItem(item)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteItem(item.id, item.nameEn)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Categories tab ── */}
        <TabsContent value="categories" className="flex-1 overflow-hidden m-0 border border-border rounded-xl bg-card shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Icon</TableHead>
                  <TableHead className="text-center">Sort Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                      No categories yet — click Add Category to get started
                    </TableCell>
                  </TableRow>
                )}
                {categories.map(cat => (
                  <TableRow key={cat.id} className="hover:bg-muted/30">
                    <TableCell><BilingualText en={cat.nameEn} am={cat.nameAm} /></TableCell>
                    <TableCell className="text-center text-xl">{cat.icon ?? "—"}</TableCell>
                    <TableCell className="text-center font-mono text-sm">{cat.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => openEditCat(cat)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCat(cat.id, cat.nameEn)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Item Dialog ── */}
      <Dialog open={itemDialog} onOpenChange={open => { if (!open) setItemDialog(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* ── Image upload ── */}
            <div className="md:col-span-2">
              <Label className="mb-2 block text-sm font-medium">Product Image</Label>
              <div
                className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors relative group"
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}
              >
                <input
                  ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }}
                />

                {form.imagePreview ? (
                  <div className="relative w-full">
                    <img src={form.imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                    {!uploading && (
                      <button
                        type="button"
                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                        onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, imageUrl: "", imagePreview: "" })); }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Click to upload or drag & drop</p>
                      <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP up to 5 MB</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Name fields */}
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">Name (English) <span className="text-destructive">*</span></Label>
              <Input id="nameEn" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="e.g. Espresso" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAm">Name (Amharic / አማርኛ) <span className="text-destructive">*</span></Label>
              <Input id="nameAm" value={form.nameAm} onChange={e => setForm(f => ({ ...f, nameAm: e.target.value }))} placeholder="e.g. ኤስፕሬሶ" />
            </div>

            {/* Description fields */}
            <div className="space-y-1.5">
              <Label htmlFor="descEn">Description (English)</Label>
              <textarea
                id="descEn" rows={2}
                value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))}
                placeholder="Short description..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descAm">Description (Amharic)</Label>
              <textarea
                id="descAm" rows={2}
                value={form.descriptionAm} onChange={e => setForm(f => ({ ...f, descriptionAm: e.target.value }))}
                placeholder="አጭር መግለጫ..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
              <select
                id="category" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nameEn} / {c.nameAm}</option>)}
              </select>
            </div>

            {/* Price + prep time */}
            <div className="space-y-1.5">
              <Label htmlFor="price">Price (ETB) <span className="text-destructive">*</span></Label>
              <Input id="price" type="number" min="0" step="0.50" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prepTime">Prep Time (minutes)</Label>
              <Input id="prepTime" type="number" min="1" max="120" value={form.prepTimeMinutes} onChange={e => setForm(f => ({ ...f, prepTimeMinutes: e.target.value }))} />
            </div>

            {/* Available toggle */}
            <div className="flex items-center gap-3 pt-1">
              <Switch id="available" checked={form.isAvailable} onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))} />
              <Label htmlFor="available">Available for ordering</Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setItemDialog(false)} disabled={saving || uploading}>Cancel</Button>
            <Button onClick={handleSaveItem} disabled={saving || uploading} className="min-w-[100px]">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (form.id ? "Save Changes" : "Add Item")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Category Dialog ── */}
      <Dialog open={catDialog} onOpenChange={open => { if (!open) setCatDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{catForm.id ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name (English) <span className="text-destructive">*</span></Label>
              <Input value={catForm.nameEn} onChange={e => setCatForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Coffee Drinks" />
            </div>
            <div className="space-y-1.5">
              <Label>Name (Amharic) <span className="text-destructive">*</span></Label>
              <Input value={catForm.nameAm} onChange={e => setCatForm(f => ({ ...f, nameAm: e.target.value }))} placeholder="የቡና መጠጦች" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Icon (emoji)</Label>
                <Input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="☕" maxLength={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input type="number" value={catForm.sortOrder} onChange={e => setCatForm(f => ({ ...f, sortOrder: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCatDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveCat} disabled={saving} className="min-w-[100px]">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (catForm.id ? "Save Changes" : "Add Category")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
