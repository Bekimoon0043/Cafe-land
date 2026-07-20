import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect } from 'react';
import { getUserFromToken } from '@/lib/auth';
import { Layout } from '@/components/layout';

// Pages — authenticated
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import KDS from '@/pages/kds';
import POS from '@/pages/pos';
import Menu from '@/pages/menu';
import Tables from '@/pages/tables';
import Inventory from '@/pages/inventory';
import Staff from '@/pages/staff';
import Customers from '@/pages/customers';
import Payments from '@/pages/payments';
import Reports from '@/pages/reports';
import Settings from '@/pages/settings';
import Expenses from '@/pages/expenses';

// Public page — no auth required
import CustomerMenu from '@/pages/customer-menu';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
});

function ProtectedRoute({ component: Component, roles }: { component: any; roles?: string[] }) {
  const [location, setLocation] = useLocation();
  const user = getUserFromToken();

  useEffect(() => {
    if (!user) {
      setLocation('/login');
    } else if (roles && !roles.includes(user.role)) {
      if (user.role === 'kitchen') setLocation('/kds');
      else if (user.role === 'cashier') setLocation('/pos');
      else setLocation('/');
    }
  }, [user, roles, location, setLocation]);

  if (!user || (roles && !roles.includes(user.role))) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public — no auth */}
      <Route path="/login" component={Login} />
      <Route path="/menu/table/:tableId" component={CustomerMenu} />

      {/* Protected */}
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/pos">
        {() => <ProtectedRoute component={POS} roles={['admin', 'manager', 'cashier']} />}
      </Route>
      <Route path="/kds">
        {() => <ProtectedRoute component={KDS} roles={['admin', 'manager', 'kitchen']} />}
      </Route>
      <Route path="/menu">
        {() => <ProtectedRoute component={Menu} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/tables">
        {() => <ProtectedRoute component={Tables} roles={['admin', 'manager', 'cashier']} />}
      </Route>
      <Route path="/inventory">
        {() => <ProtectedRoute component={Inventory} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/staff">
        {() => <ProtectedRoute component={Staff} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/customers">
        {() => <ProtectedRoute component={Customers} roles={['admin', 'manager', 'cashier']} />}
      </Route>
      <Route path="/payments">
        {() => <ProtectedRoute component={Payments} roles={['admin', 'manager', 'cashier']} />}
      </Route>
      <Route path="/expenses">
        {() => <ProtectedRoute component={Expenses} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/reports">
        {() => <ProtectedRoute component={Reports} roles={['admin', 'manager']} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} roles={['admin', 'manager']} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
