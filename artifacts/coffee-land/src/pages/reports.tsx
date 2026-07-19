import { useState } from "react";
import { BarChart3, TrendingUp, ShoppingBag, AlertTriangle, Coffee, Download } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { exportSalesCSV, exportTopItemsCSV, exportPaymentsCSV, exportHourlyCSV, exportCategoriesCSV } from "@/lib/export-csv";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetSalesReport, getGetSalesReportQueryKey,
  useGetTopItems, getGetTopItemsQueryKey,
  useGetPaymentBreakdown, getGetPaymentBreakdownQueryKey,
  useGetHourlySales, getGetHourlySalesQueryKey,
} from "@workspace/api-client-react";

const COLORS = ["#cc5500", "#8b3a0f", "#f4a460", "#d2691e", "#a0522d"];

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: dashboard } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: sales } = useGetSalesReport({ params: { dateFrom, dateTo } as any, query: { queryKey: [...getGetSalesReportQueryKey(), dateFrom, dateTo] } });
  const { data: topItems = [] } = useGetTopItems({ params: { limit: 10, dateFrom, dateTo } as any, query: { queryKey: [...getGetTopItemsQueryKey(), dateFrom, dateTo] } });
  const { data: payBreakdown } = useGetPaymentBreakdown({ params: { dateFrom, dateTo } as any, query: { queryKey: [...getGetPaymentBreakdownQueryKey(), dateFrom, dateTo] } });
  const { data: hourly = [] } = useGetHourlySales({ query: { queryKey: getGetHourlySalesQueryKey() } });

  const weekRevenue = dashboard?.revenueThisWeek ?? [];
  const ordersByStatus = dashboard?.ordersByStatus ?? [];

  const [activeTab, setActiveTab] = useState("revenue");

  return (
    <div className="p-6 h-full flex flex-col bg-background overflow-auto">
      <div className="flex items-center justify-between mb-6 shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" />Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Business performance overview</p>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Label className="text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          <Label className="text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
          {/* Context-sensitive export button */}
          {activeTab === "revenue" && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-1"
              onClick={() => {
                if ((sales as any)?.data?.length) exportSalesCSV((sales as any).data, dateFrom, dateTo);
                if ((sales as any)?.topCategories?.length) exportCategoriesCSV((sales as any).topCategories, dateFrom, dateTo);
              }}>
              <Download className="w-3.5 h-3.5" />Export Revenue CSV
            </Button>
          )}
          {activeTab === "top-items" && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-1"
              onClick={() => exportTopItemsCSV(topItems as any[], dateFrom, dateTo)}>
              <Download className="w-3.5 h-3.5" />Export Items CSV
            </Button>
          )}
          {activeTab === "payments" && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-1"
              onClick={() => exportPaymentsCSV((payBreakdown as any)?.breakdown ?? [], dateFrom, dateTo)}>
              <Download className="w-3.5 h-3.5" />Export Payments CSV
            </Button>
          )}
          {activeTab === "hourly" && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-1"
              onClick={() => exportHourlyCSV(hourly as any[])}>
              <Download className="w-3.5 h-3.5" />Export Hourly CSV
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 shrink-0">
        {[
          { label: "Today's Revenue", value: `${(dashboard?.todayRevenue ?? 0).toLocaleString()} ETB`, sub: `${dashboard?.todayOrders ?? 0} orders`, icon: TrendingUp, color: "text-emerald-600" },
          { label: "Active Orders", value: dashboard?.activeOrders ?? 0, sub: "in kitchen now", icon: ShoppingBag, color: "text-amber-600" },
          { label: "Avg Order Value", value: `${(dashboard?.avgOrderValue ?? 0).toLocaleString()} ETB`, sub: "today", icon: Coffee, color: "text-primary" },
          { label: "Low Stock Items", value: dashboard?.lowStockCount ?? 0, sub: "need reorder", icon: AlertTriangle, color: "text-red-600" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="revenue" className="flex-1" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="top-items">Top Items</TabsTrigger>
          <TabsTrigger value="payments">Payment Mix</TabsTrigger>
          <TabsTrigger value="hourly">Hourly (Today)</TabsTrigger>
        </TabsList>

        {/* Revenue Chart */}
        <TabsContent value="revenue">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4 text-sm">Weekly Revenue (last 7 days)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weekRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ETB`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#cc5500" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4 text-sm">Sales Trend ({dateFrom} → {dateTo})</h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total Revenue", value: `${(sales?.totalRevenue ?? 0).toLocaleString()} ETB` },
                  { label: "Orders", value: sales?.totalOrders ?? 0 },
                  { label: "Avg/Order", value: `${(sales?.avgOrderValue ?? 0).toLocaleString()} ETB` },
                ].map(s => (
                  <div key={s.label} className="bg-muted/50 rounded-lg p-2.5 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="font-bold text-sm mt-1">{s.value}</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={sales?.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ETB`, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#cc5500" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4 text-sm">Orders by Status (today)</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={ordersByStatus.filter(o => o.count > 0)} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70}>
                      {ordersByStatus.filter(o => o.count > 0).map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {ordersByStatus.map((s, idx) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} /><span className="capitalize text-foreground">{s.status}</span></div>
                      <span className="font-bold">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4 text-sm">Revenue by Category</h3>
              <div className="space-y-2">
                {(sales?.topCategories ?? []).map((cat: any, idx: number) => {
                  const maxRev = Math.max(...(sales?.topCategories ?? []).map((c: any) => c.revenue), 1);
                  return (
                    <div key={cat.categoryName}>
                      <div className="flex justify-between text-sm mb-1"><span className="font-medium">{cat.categoryName}</span><span className="text-muted-foreground">{cat.revenue.toLocaleString()} ETB</span></div>
                      <div className="h-2 bg-muted rounded-full"><div className="h-2 bg-primary rounded-full transition-all" style={{ width: `${(cat.revenue / maxRev) * 100}%` }} /></div>
                    </div>
                  );
                })}
                {!(sales?.topCategories?.length) && <p className="text-muted-foreground text-sm">No data for selected range</p>}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Top Items */}
        <TabsContent value="top-items">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Top Selling Items</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-3">
                {(topItems as any[]).map((item: any, idx: number) => {
                  const maxSold = Math.max(...(topItems as any[]).map((i: any) => i.totalSold), 1);
                  return (
                    <div key={item.menuItemId} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1"><span className="font-medium">{item.nameEn}</span><span className="text-muted-foreground">{item.totalSold} sold · {item.revenue.toLocaleString()} ETB</span></div>
                        <div className="h-2 bg-muted rounded-full"><div className="h-2 bg-primary rounded-full" style={{ width: `${(item.totalSold / maxSold) * 100}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
                {topItems.length === 0 && <p className="text-muted-foreground text-sm">No sales data for selected range</p>}
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topItems as any[]} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="nameEn" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [v, "Sold"]} />
                  <Bar dataKey="totalSold" fill="#cc5500" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* Payment Mix */}
        <TabsContent value="payments">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold mb-4">Payment Method Distribution</h3>
              <p className="text-2xl font-bold text-primary mb-4">{(payBreakdown?.total ?? 0).toLocaleString()} ETB total</p>
              <div className="space-y-3">
                {(payBreakdown?.breakdown ?? []).map((b: any) => (
                  <div key={b.method} className="flex items-center gap-3">
                    <span className="text-lg">{b.method === "cash" ? "💵" : b.method === "cbe" ? "🏦" : "📱"}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1"><span className="capitalize font-medium">{b.method}</span><span>{b.amount.toLocaleString()} ETB ({b.percentage}%)</span></div>
                      <div className="h-2 bg-muted rounded-full"><div className="h-2 bg-primary rounded-full" style={{ width: `${b.percentage}%` }} /></div>
                    </div>
                    <span className="text-muted-foreground text-xs">{b.count} txns</span>
                  </div>
                ))}
                {!payBreakdown?.breakdown?.length && <p className="text-muted-foreground text-sm">No payment data for selected range</p>}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={payBreakdown?.breakdown ?? []} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={100} label={({ name, percentage }: any) => `${name} ${percentage}%`}>
                    {(payBreakdown?.breakdown ?? []).map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ETB`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* Hourly Sales */}
        <TabsContent value="hourly">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Today's Hourly Sales Pattern</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={(hourly as any[]).filter((h: any) => h.hour >= 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}:00`} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, name: string) => [name === "revenue" ? `${Number(v).toLocaleString()} ETB` : v, name === "revenue" ? "Revenue" : "Orders"]} labelFormatter={(h: number) => `${h}:00 – ${h + 1}:00`} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#cc5500" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="orders" fill="#f4a460" name="Orders" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
