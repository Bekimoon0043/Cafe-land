import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Coffee, LayoutDashboard, ShoppingCart, ChefHat, Menu as MenuIcon,
  Grid2X2, Package, Users, UsersRound, CreditCard, BarChart3, Settings,
  LogOut, Globe, X, AlignJustify, Receipt,
} from "lucide-react";
import { getUserFromToken, clearToken } from "@/lib/auth";
import { switchLanguage } from "@/components/bilingual-text";
import { useGetMe } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tokenUser = getUserFromToken();
  const { data: user } = useGetMe({ query: { enabled: !!tokenUser, queryKey: ["/api/auth/me"] } });

  const role = user?.role || tokenUser?.role;

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location]);

  // Close sidebar on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = () => { clearToken(); setLocation("/login"); };

  const toggleLanguage = () => {
    const current = localStorage.getItem("coffee_land_lang") || "en";
    switchLanguage(current === "en" ? "am" : "en");
  };

  const navItems = [
    { href: "/",          label: "Dashboard",    icon: LayoutDashboard, roles: ["admin", "manager"] },
    { href: "/pos",       label: "POS",           icon: ShoppingCart,    roles: ["admin", "manager", "cashier"] },
    { href: "/kds",       label: "Kitchen (KDS)", icon: ChefHat,         roles: ["admin", "manager", "kitchen"] },
    { href: "/menu",      label: "Menu",          icon: MenuIcon,        roles: ["admin", "manager"] },
    { href: "/tables",    label: "Tables",        icon: Grid2X2,         roles: ["admin", "manager", "cashier"] },
    { href: "/inventory", label: "Inventory",     icon: Package,         roles: ["admin", "manager"] },
    { href: "/staff",     label: "Staff",         icon: Users,           roles: ["admin", "manager"] },
    { href: "/customers", label: "Customers",     icon: UsersRound,      roles: ["admin", "manager", "cashier"] },
    { href: "/payments",  label: "Payments",      icon: CreditCard,      roles: ["admin", "manager", "cashier"] },
    { href: "/expenses",  label: "Expenses",      icon: Receipt,         roles: ["admin", "manager"] },
    { href: "/reports",   label: "Reports",       icon: BarChart3,       roles: ["admin", "manager"] },
    { href: "/settings",  label: "Settings",      icon: Settings,        roles: ["admin", "manager"] },
  ];

  const filteredNav = navItems.filter(item => role && item.roles.includes(role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-sidebar-border bg-sidebar shrink-0">
        <div className="flex items-center gap-3">
          <Coffee className="w-6 h-6 text-sidebar-primary" />
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">Coffee Land</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {filteredNav.map(item => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-lg transition-colors text-sm font-medium gap-3 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/70"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar/50 space-y-1 shrink-0">
        <button
          onClick={toggleLanguage}
          className="flex items-center w-full px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-lg hover:bg-sidebar-accent transition-colors gap-3"
        >
          <Globe className="w-5 h-5 text-sidebar-foreground/70 shrink-0" />
          English / አማርኛ
        </button>

        <div className="flex items-center px-3 py-2 text-sm font-medium text-sidebar-foreground rounded-lg">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-bold text-sm mr-3 shrink-0">
            {(user?.username || tokenUser?.username || "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate font-semibold">{user?.username || tokenUser?.username}</div>
            <div className="text-xs text-sidebar-foreground/60 capitalize">{role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors ml-1"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      {/* Desktop: always visible, fixed width */}
      {/* Mobile: slide-in drawer */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <SidebarContent />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-background shrink-0 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-foreground"
          >
            <AlignJustify className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground">Coffee Land</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-xs text-muted-foreground capitalize bg-muted px-2 py-1 rounded-full">{role}</div>
            <button onClick={handleLogout} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
