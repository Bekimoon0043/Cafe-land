import { useState, useRef } from "react";
import { useListTables, getListTablesQueryKey, useUpdateTable, useCreateTable } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Grid2X2, Users, Search, Plus, QrCode, Download, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import QRCode from "react-qr-code";

const statusColors: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  occupied: "bg-red-500/10 text-red-600 border-red-500/30",
  reserved: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  cleaning: "bg-slate-500/10 text-slate-600 border-slate-500/30",
};

const statusBorder: Record<string, string> = {
  free: "border-emerald-500/40",
  occupied: "border-red-500/40",
  reserved: "border-amber-500/40",
  cleaning: "border-slate-500/40",
};

function getMenuUrl(tableId: number): string {
  const base = window.location.origin;
  return `${base}/menu/table/${tableId}`;
}

export default function Tables() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [qrTable, setQrTable] = useState<any>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", capacity: "4" });
  const qrRef = useRef<HTMLDivElement>(null);

  const { data: tables = [], isLoading } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const updateTable = useUpdateTable();
  const createTable = useCreateTable();

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateTable.mutateAsync({ id, data: { status } as any });
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast.success(`Table status updated to ${status}`);
    } catch { toast.error("Failed to update status"); }
  };

  const handleAddTable = async () => {
    if (!addForm.label) { toast.error("Label required"); return; }
    try {
      // Get branchId from first table or use 1
      const branchId = tables[0]?.branchId ?? 1;
      await createTable.mutateAsync({ data: { label: addForm.label, capacity: parseInt(addForm.capacity), branchId } });
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast.success("Table added");
      setAddDialog(false);
      setAddForm({ label: "", capacity: "4" });
    } catch { toast.error("Failed to add table"); }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current || !qrTable) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    // Clone and add white bg + label
    const clone = svg.cloneNode(true) as SVGElement;
    const ns = "http://www.w3.org/2000/svg";
    const padding = 24;
    const labelHeight = 40;
    const svgSize = 256;
    const totalH = svgSize + padding * 2 + labelHeight;
    const totalW = svgSize + padding * 2;

    const wrapper = document.createElementNS(ns, "svg");
    wrapper.setAttribute("width", String(totalW));
    wrapper.setAttribute("height", String(totalH));
    wrapper.setAttribute("xmlns", ns);

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", String(totalW));
    bg.setAttribute("height", String(totalH));
    bg.setAttribute("fill", "white");
    wrapper.appendChild(bg);

    clone.setAttribute("x", String(padding));
    clone.setAttribute("y", String(padding));
    clone.setAttribute("width", String(svgSize));
    clone.setAttribute("height", String(svgSize));
    wrapper.appendChild(clone);

    // Title
    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", String(totalW / 2));
    title.setAttribute("y", String(svgSize + padding + 22));
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-family", "Arial, sans-serif");
    title.setAttribute("font-size", "16");
    title.setAttribute("font-weight", "bold");
    title.setAttribute("fill", "#3e2723");
    title.textContent = `☕ Coffee Land — ${qrTable.label}`;
    wrapper.appendChild(title);

    const sub = document.createElementNS(ns, "text");
    sub.setAttribute("x", String(totalW / 2));
    sub.setAttribute("y", String(svgSize + padding + 38));
    sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("font-family", "Arial, sans-serif");
    sub.setAttribute("font-size", "10");
    sub.setAttribute("fill", "#888");
    sub.textContent = "Scan to view menu & order";
    wrapper.appendChild(sub);

    const xml = new XMLSerializer().serializeToString(wrapper);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${qrTable.label.replace(/\s+/g, "-").toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded");
  };

  const filteredTables = tables.filter(t => t.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Grid2X2 className="w-6 h-6 text-primary" />Table Layout
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage dining areas · click a table card to change status or view QR</p>
        </div>
        <div className="flex gap-3">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search table…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={() => setAddDialog(true)}><Plus className="w-4 h-4 mr-1" />Add Table</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-5 mb-5 shrink-0 bg-card p-3 rounded-lg border border-border shadow-sm">
        {Object.entries(statusColors).map(([status]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border ${statusColors[status]}`} />
            <span className="text-sm font-medium capitalize text-foreground">{status}</span>
            <span className="text-xs text-muted-foreground">({tables.filter(t => t.status === status).length})</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filteredTables.map(table => (
            <div
              key={table.id}
              className={`bg-card rounded-2xl border-2 shadow-sm p-4 flex flex-col items-center justify-center aspect-square relative group transition-all hover:shadow-md cursor-pointer ${statusBorder[table.status] ?? "border-border"}`}
            >
              <div className={`absolute inset-0 opacity-10 rounded-2xl ${statusColors[table.status]?.split(" ")[0]}`} />

              <h2 className="text-2xl font-bold text-foreground relative z-10">{table.label}</h2>
              <div className="flex items-center gap-1 mt-1.5 text-muted-foreground relative z-10">
                <Users className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">{table.capacity}</span>
              </div>
              <div className={`mt-2.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider relative z-10 ${statusColors[table.status]}`}>
                {table.status}
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity p-3 z-20">
                <p className="text-xs font-bold text-foreground mb-1">Set Status:</p>
                <div className="grid grid-cols-2 gap-1.5 w-full mb-2">
                  {["free", "occupied", "reserved", "cleaning"].map(s => (
                    <button key={s} onClick={e => { e.stopPropagation(); handleStatusChange(table.id, s); }} className={`py-1 text-xs font-semibold rounded capitalize ${statusColors[s]} border`}>{s}</button>
                  ))}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setQrTable(table); }}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <QrCode className="w-3.5 h-3.5" /> View QR Code
                </button>
              </div>
            </div>
          ))}
        </div>
        {filteredTables.length === 0 && !isLoading && (
          <div className="text-center py-16 text-muted-foreground">No tables found</div>
        )}
      </div>

      {/* QR Code Dialog */}
      <Dialog open={!!qrTable} onOpenChange={open => !open && setQrTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              QR Code — {qrTable?.label}
            </DialogTitle>
          </DialogHeader>
          {qrTable && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground text-center">
                Customers scan this to view the menu for <strong>{qrTable.label}</strong> (seats {qrTable.capacity})
              </p>
              {/* QR code */}
              <div ref={qrRef} className="bg-white p-5 rounded-xl border border-border shadow-sm">
                <QRCode
                  value={getMenuUrl(qrTable.id)}
                  size={220}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox="0 0 256 256"
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-foreground mb-0.5">☕ Coffee Land — {qrTable.label}</p>
                <p className="text-xs text-muted-foreground break-all font-mono">{getMenuUrl(qrTable.id)}</p>
              </div>
              <div className="flex gap-3 w-full">
                <Button className="flex-1" onClick={handleDownloadQR}>
                  <Download className="w-4 h-4 mr-2" />Download SVG
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(getMenuUrl(qrTable.id)); toast.success("Link copied"); }}>
                  Copy Link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">Print and place on the table. Scanning opens a public menu page — no login required.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Table Label *</Label><Input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Table 13, VIP 1, Bar 3" /></div>
            <div><Label>Seating Capacity</Label><Input type="number" min="1" max="20" value={addForm.capacity} onChange={e => setAddForm(f => ({ ...f, capacity: e.target.value }))} /></div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleAddTable}>Add Table</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
