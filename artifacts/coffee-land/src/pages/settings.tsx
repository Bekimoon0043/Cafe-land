import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Plus, Building2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import {
  useGetSettings, getGetSettingsQueryKey, useUpdateSettings,
  useListBranches, getListBranchesQueryKey, useCreateBranch,
  useListPaymentProviders, getListPaymentProvidersQueryKey,
} from "@workspace/api-client-react";

export default function Settings() {
  const qc = useQueryClient();
  const [branchDialog, setBranchDialog] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "" });
  const [settingsForm, setSettingsForm] = useState({
    name: "", nameAm: "", phone: "", address: "",
    vatRate: "15", loyaltyPointsPerEtb: "1", receiptFooterText: "",
  });

  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: branches = [] } = useListBranches({ query: { queryKey: getListBranchesQueryKey() } });
  const updateSettings = useUpdateSettings();
  const createBranch = useCreateBranch();

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        name: settings.name ?? "",
        nameAm: (settings as any).nameAm ?? "",
        phone: (settings as any).phone ?? "",
        address: (settings as any).address ?? "",
        vatRate: String((settings as any).vatRate ?? "15"),
        loyaltyPointsPerEtb: String((settings as any).loyaltyPointsPerEtb ?? "1"),
        receiptFooterText: (settings as any).receiptFooterText ?? "",
      });
    }
  }, [settings]);

  const handleSaveSettings = async () => {
    try {
      await updateSettings.mutateAsync({
        data: {
          name: settingsForm.name,
          nameAm: settingsForm.nameAm,
          phone: settingsForm.phone,
          address: settingsForm.address,
          vatRate: parseFloat(settingsForm.vatRate),
          loyaltyPointsPerEtb: parseFloat(settingsForm.loyaltyPointsPerEtb),
          receiptFooterText: settingsForm.receiptFooterText,
        } as any
      });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast.success("Settings saved");
    } catch { toast.error("Failed to save settings"); }
  };

  const handleCreateBranch = async () => {
    if (!branchForm.name) { toast.error("Branch name required"); return; }
    try {
      await createBranch.mutateAsync({ data: branchForm });
      qc.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      toast.success("Branch created");
      setBranchDialog(false);
      setBranchForm({ name: "", address: "", phone: "" });
    } catch { toast.error("Failed to create branch"); }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-auto">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><SettingsIcon className="w-6 h-6 text-primary" />Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Restaurant configuration and branch management</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="flex-1">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="billing">Tax & Loyalty</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general">
          <div className="max-w-xl bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Restaurant Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Restaurant Name (English)</Label><Input value={settingsForm.name} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Restaurant Name (Amharic)</Label><Input value={settingsForm.nameAm} onChange={e => setSettingsForm(f => ({ ...f, nameAm: e.target.value }))} /></div>
            </div>
            <div><Label>Phone</Label><Input value={settingsForm.phone} onChange={e => setSettingsForm(f => ({ ...f, phone: e.target.value }))} placeholder="+251 11 123 4567" /></div>
            <div><Label>Address</Label><Input value={settingsForm.address} onChange={e => setSettingsForm(f => ({ ...f, address: e.target.value }))} placeholder="Bole Road, Addis Ababa" /></div>
            <div><Label>Receipt Footer Text</Label><Input value={settingsForm.receiptFooterText} onChange={e => setSettingsForm(f => ({ ...f, receiptFooterText: e.target.value }))} placeholder="Thank you for visiting!" /></div>
            <Button onClick={handleSaveSettings} className="mt-2"><Save className="w-4 h-4 mr-2" />Save Changes</Button>
          </div>
        </TabsContent>

        {/* Branches */}
        <TabsContent value="branches">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">{branches.length} branch{branches.length !== 1 ? "es" : ""} configured</p>
            <Button onClick={() => setBranchDialog(true)}><Plus className="w-4 h-4 mr-1" />Add Branch</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(branches as any[]).map((b: any) => (
              <div key={b.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold text-foreground">{b.name}</h3>
                    <span className={`text-xs font-medium ${b.isActive ? "text-emerald-600" : "text-red-500"}`}>{b.isActive ? "Active" : "Inactive"}</span>
                  </div>
                </div>
                {b.address && <p className="text-sm text-muted-foreground">{b.address}</p>}
                {b.phone && <p className="text-sm text-muted-foreground mt-1">{b.phone}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <div className="max-w-md bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Tax & Loyalty Configuration</h3>
            <div>
              <Label>VAT Rate (%)</Label>
              <Input type="number" value={settingsForm.vatRate} onChange={e => setSettingsForm(f => ({ ...f, vatRate: e.target.value }))} min="0" max="100" step="0.5" />
              <p className="text-xs text-muted-foreground mt-1">Applied automatically on all orders. Ethiopia standard VAT is 15%.</p>
            </div>
            <div>
              <Label>Loyalty Points per ETB Spent</Label>
              <Input type="number" value={settingsForm.loyaltyPointsPerEtb} onChange={e => setSettingsForm(f => ({ ...f, loyaltyPointsPerEtb: e.target.value }))} min="0" step="0.1" />
              <p className="text-xs text-muted-foreground mt-1">e.g. 1 = 1 point per ETB, 0.5 = 1 point per 2 ETB</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Loyalty Tier Thresholds</p>
              <p>🥉 Bronze: 0 – 999 pts</p>
              <p>🥈 Silver: 1,000 – 4,999 pts</p>
              <p>🥇 Gold: 5,000+ pts</p>
            </div>
            <Button onClick={handleSaveSettings}><Save className="w-4 h-4 mr-2" />Save Changes</Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Branch Dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Branch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Branch Name *</Label><Input value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} placeholder="Coffee Land - Branch 2" /></div>
            <div><Label>Address</Label><Input value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={branchForm.phone} onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBranchDialog(false)}>Cancel</Button><Button onClick={handleCreateBranch}>Create Branch</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
