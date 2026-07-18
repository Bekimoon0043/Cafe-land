import { TrendingUp, ShoppingBag, Clock, AlertTriangle, ChefHat, Coffee } from "lucide-react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useGetHourlySales, getGetHourlySalesQueryKey } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { data: dashboard } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: hourly = [] } = useGetHourlySales({ query: { queryKey: getGetHourlySalesQueryKey() } });

  const kpis = [
    { label: "Today's Revenue", value: `${(dashboard?.todayRevenue ?? 0).toLocaleString()} ETB`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Today's Orders",  value: dashboard?.todayOrders ?? 0,   icon: ShoppingBag, color: "text-blue-600",   bg: "bg-blue-50" },
    { label: "Active Orders",   value: dashboard?.activeOrders ?? 0,  icon: Clock,       color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Low Stock",       value: dashboard?.lowStockCount ?? 0, icon: AlertTriangle,color: "text-red-600",  bg: "bg-red-50" },
  ];

  const ordersByStatus: { status: string; count: number }[] = (dashboard as any)?.ordersByStatus ?? [];

  return (
    <div className="p-4 md:p-6 overflow-auto bg-background">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Coffee className="w-5 h-5 text-primary" />Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Coffee Land — real-time overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-xl p-3 md:p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium leading-tight">{kpi.label}</p>
              <div className={`w-7 h-7 rounded-full ${kpi.bg} flex items-center justify-center shrink-0`}>
                <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
              </div>
            </div>
            <p className={`text-lg md:text-2xl font-bold ${kpi.color} break-all`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Hourly chart */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-3">Today's Hourly Sales</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={(hourly as any[]).filter((h: any) => h.hour >= 6)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}h`} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip labelFormatter={(h: number) => `${h}:00–${h + 1}:00`} formatter={(v: any) => [`${Number(v).toLocaleString()} ETB`]} />
              <Bar dataKey="revenue" fill="#cc5500" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Orders by status */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-3">Orders by Status (Today)</h3>
          <div className="space-y-3">
            {ordersByStatus.map(s => {
              const max = Math.max(...ordersByStatus.map(x => x.count), 1);
              const pct = (s.count / max) * 100;
              const barColor =
                s.status === "completed" ? "bg-emerald-500" :
                s.status === "pending"   ? "bg-amber-500" :
                s.status === "preparing" ? "bg-blue-500" : "bg-red-500";
              return (
                <div key={s.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium">{s.status}</span>
                    <span className="font-bold">{s.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className={`h-2 ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {ordersByStatus.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ChefHat className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No orders today yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weekly revenue */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-3">Weekly Revenue (last 7 days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={(dashboard as any)?.revenueThisWeek ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ETB`, "Revenue"]} />
            <Bar dataKey="revenue" fill="#cc5500" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
