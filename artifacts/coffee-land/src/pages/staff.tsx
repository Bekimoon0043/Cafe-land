import { useState } from "react";
import { Users, Clock, Plus, Search, UserCheck, UserX } from "lucide-react";
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
  useListEmployees, getListEmployeesQueryKey, useCreateEmployee, useUpdateEmployee,
  useListShifts, getListShiftsQueryKey, useClockIn, useClockOut,
  useListAuditLogs, getListAuditLogsQueryKey,
} from "@workspace/api-client-react";

const ROLES = ["admin", "manager", "cashier", "kitchen"] as const;
const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  manager: "bg-blue-100 text-blue-700 border-blue-200",
  cashier: "bg-amber-100 text-amber-700 border-amber-200",
  kitchen: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function Staff() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("employees");
  const [search, setSearch] = useState("");
  const [empDialog, setEmpDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ fullName: "", role: "cashier", phone: "", email: "", hireDate: "", salary: "", username: "", password: "" });
  const [clockDialog, setClockDialog] = useState(false);
  const [clockEmpId, setClockEmpId] = useState("");
  const [clockAction, setClockAction] = useState<"in" | "out">("in");

  const { data: employees = [] } = useListEmployees({ query: { queryKey: getListEmployeesQueryKey() } });
  const { data: shifts = [] } = useListShifts({ query: { queryKey: getListShiftsQueryKey() } });
  const { data: auditLogs = [] } = useListAuditLogs({ query: { queryKey: getListAuditLogsQueryKey() } });
  const createEmp = useCreateEmployee();
  const updateEmp = useUpdateEmployee();
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const filtered = employees.filter(e => e.fullName.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    try {
      if (editing) {
        await updateEmp.mutateAsync({ id: editing.id, data: { fullName: form.fullName, role: form.role as any, phone: form.phone, email: form.email, salary: form.salary ? parseFloat(form.salary) : undefined, isActive: true } });
        toast.success("Employee updated");
      } else {
        await createEmp.mutateAsync({ data: { fullName: form.fullName, role: form.role as any, phone: form.phone, email: form.email, hireDate: form.hireDate, salary: form.salary ? parseFloat(form.salary) : undefined, username: form.username, password: form.password } });
        toast.success("Employee created with login access");
      }
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      setEmpDialog(false); setEditing(null);
      setForm({ fullName: "", role: "cashier", phone: "", email: "", hireDate: "", salary: "", username: "", password: "" });
    } catch (e: any) { toast.error(e?.data?.error || "Failed to save employee"); }
  };

  const handleClock = async () => {
    if (!clockEmpId) { toast.error("Select employee"); return; }
    try {
      if (clockAction === "in") { await clockIn.mutateAsync({ data: { employeeId: parseInt(clockEmpId) } }); toast.success("Clocked in"); }
      else { await clockOut.mutateAsync({ data: { employeeId: parseInt(clockEmpId) } }); toast.success("Clocked out"); }
      qc.invalidateQueries({ queryKey: getListShiftsQueryKey() });
      setClockDialog(false); setClockEmpId("");
    } catch (e: any) { toast.error(e?.data?.error || "Clock action failed"); }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="w-6 h-6 text-primary" />Staff Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{employees.filter(e => e.isActive).length} active employees</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setClockAction("in"); setClockDialog(true); }}><UserCheck className="w-4 h-4 mr-1" />Clock In</Button>
          <Button variant="outline" onClick={() => { setClockAction("out"); setClockDialog(true); }}><UserX className="w-4 h-4 mr-1" />Clock Out</Button>
          <Button onClick={() => { setEditing(null); setForm({ fullName: "", role: "cashier", phone: "", email: "", hireDate: "", salary: "", username: "", password: "" }); setEmpDialog(true); }}><Plus className="w-4 h-4 mr-1" />Add Staff</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0 mb-4">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="shifts">Shifts & Attendance</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="flex-1 overflow-hidden flex flex-col mt-0">
          <div className="relative max-w-xs mb-4 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(emp => (
                <div key={emp.id} className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {emp.fullName.charAt(0)}
                    </div>
                    <Badge className={roleColors[emp.role] || ""}>{emp.role}</Badge>
                  </div>
                  <h3 className="font-semibold text-foreground">{emp.fullName}</h3>
                  <p className="text-sm text-muted-foreground">{emp.phone ?? emp.email ?? "—"}</p>
                  {emp.salary && <p className="text-sm font-medium text-primary mt-1">{Number(emp.salary).toLocaleString()} ETB/mo</p>}
                  <p className="text-xs text-muted-foreground mt-1">Since {emp.hireDate}</p>
                  <button onClick={() => { setEditing(emp); setForm({ fullName: emp.fullName, role: emp.role, phone: emp.phone ?? "", email: emp.email ?? "", hireDate: emp.hireDate, salary: emp.salary ? String(emp.salary) : "", username: "", password: "" }); setEmpDialog(true); }} className="mt-3 text-xs text-primary hover:underline font-medium">Edit</button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="flex-1 overflow-auto mt-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 border-b border-border">
              <tr>{["Employee", "Clock In", "Clock Out", "Hours"].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(shifts as any[]).map((s: any) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{s.employeeName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{new Date(s.clockIn).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.clockOut ? new Date(s.clockOut).toLocaleString() : <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>}</td>
                  <td className="px-3 py-2.5 font-semibold">{s.totalHours ? `${Number(s.totalHours).toFixed(1)}h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shifts.length === 0 && <div className="text-center py-10 text-muted-foreground">No shift records yet</div>}
        </TabsContent>

        <TabsContent value="audit" className="flex-1 overflow-auto mt-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 border-b border-border">
              <tr>{["User", "Action", "Entity", "Details", "Time"].map(h => <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(auditLogs as any[]).map((log: any) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{log.username}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs">{log.action}</Badge></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{log.details ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditLogs.length === 0 && <div className="text-center py-10 text-muted-foreground">No audit logs yet</div>}
        </TabsContent>
      </Tabs>

      {/* Employee Dialog */}
      <Dialog open={empDialog} onOpenChange={setEmpDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Employee" : "Add New Employee"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div><Label>Full Name</Label><Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} /></div>
            <div><Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hire Date</Label><Input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} /></div>
              <div><Label>Monthly Salary (ETB)</Label><Input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} /></div>
            </div>
            {!editing && <>
              <div className="border-t pt-3 mt-3">
                <p className="text-sm font-semibold text-muted-foreground mb-2">Login Credentials</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Username</Label><Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
                  <div><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
                </div>
              </div>
            </>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEmpDialog(false)}>Cancel</Button><Button onClick={handleSave}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clock In/Out Dialog */}
      <Dialog open={clockDialog} onOpenChange={setClockDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clock {clockAction === "in" ? "In" : "Out"}</DialogTitle></DialogHeader>
          <div>
            <Label>Select Employee</Label>
            <Select value={clockEmpId} onValueChange={setClockEmpId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.filter(e => e.isActive).map(e => <SelectItem key={e.id} value={String(e.id)}>{e.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setClockDialog(false)}>Cancel</Button><Button onClick={handleClock}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
