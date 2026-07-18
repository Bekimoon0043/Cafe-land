import { useState, useMemo } from "react";
import { BilingualText } from "@/components/bilingual-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ShoppingBag, Plus, Minus, Trash2, X, Coffee, ChevronRight } from "lucide-react";
import { 
  useListCategories, getListCategoriesQueryKey,
  useListMenuItems, getListMenuItemsQueryKey,
  useListTables, getListTablesQueryKey,
  useCreateOrder,
  OrderInput,
  OrderInputOrderType
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type CartItem = {
  id: string; // unique local id
  menuItemId: number;
  nameEn: string;
  nameAm: string;
  price: number;
  quantity: number;
  notes?: string;
  selectedModifiers?: { modifierId: number; nameEn: string; nameAm: string; priceDelta: number }[];
};

export default function POS() {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderInputOrderType>("dine_in");
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // Queries
  const { data: categories = [] } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: menuItems = [] } = useListMenuItems({ available: true }, { query: { queryKey: getListMenuItemsQueryKey({ available: true }) } });
  const { data: tables = [] } = useListTables({ query: { queryKey: getListTablesQueryKey() } });

  const createOrder = useCreateOrder();

  // Derived state
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesCategory = activeCategory ? item.categoryId === activeCategory : true;
      const matchesSearch = searchQuery 
        ? item.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.nameAm.includes(searchQuery)
        : true;
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, searchQuery]);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const modsTotal = item.selectedModifiers?.reduce((sum, mod) => sum + mod.priceDelta, 0) || 0;
      return total + ((item.price + modsTotal) * item.quantity);
    }, 0);
  }, [cart]);

  const addToCart = (item: any) => {
    // Basic add - in a full implementation this would open a modifier modal if item has modifiers
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id && !c.notes && (!c.selectedModifiers || c.selectedModifiers.length === 0));
      if (existing) {
        return prev.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        menuItemId: item.id,
        nameEn: item.nameEn,
        nameAm: item.nameAm,
        price: item.price,
        quantity: 1
      }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (orderType === 'dine_in' && !selectedTable) {
      toast.error("Please select a table for Dine In orders");
      return;
    }

    const orderData: OrderInput = {
      orderType,
      tableId: orderType === 'dine_in' ? selectedTable : null,
      items: cart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.price,
        notes: item.notes,
        selectedModifiers: item.selectedModifiers
      }))
    };

    try {
      await createOrder.mutateAsync({ data: orderData });
      toast.success("Order created successfully!");
      setCart([]);
      setSelectedTable(null);
    } catch (err: any) {
      toast.error("Failed to create order", { description: err?.data?.error });
    }
  };

  return (
    <div className="flex h-full bg-muted/20">
      {/* Left side - Menu */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top bar with search and filters */}
        <div className="p-4 bg-card border-b border-border shadow-sm z-10 flex gap-4 items-center shrink-0">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Search menu... / ምናሌ ይፈልጉ..." 
              className="pl-10 h-12 text-lg bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex gap-2">
              <Button 
                variant={activeCategory === null ? "default" : "outline"}
                className={`whitespace-nowrap h-12 px-6 rounded-full font-semibold ${activeCategory === null ? 'shadow-md' : 'bg-background'}`}
                onClick={() => setActiveCategory(null)}
              >
                All Items
              </Button>
              {categories.map(cat => (
                <Button 
                  key={cat.id}
                  variant={activeCategory === cat.id ? "default" : "outline"}
                  className={`whitespace-nowrap h-12 px-6 rounded-full font-semibold ${activeCategory === cat.id ? 'shadow-md' : 'bg-background'}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <BilingualText en={cat.nameEn} am={cat.nameAm} className="flex gap-2 items-center" />
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Coffee className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-xl">No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 pb-20">
              {filteredItems.map(item => (
                <div 
                  key={item.id} 
                  className="bg-card rounded-xl border border-border shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-pointer overflow-hidden group flex flex-col h-full"
                  onClick={() => addToCart(item)}
                >
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.nameEn} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary/30 text-secondary-foreground/40">
                        <Coffee className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur px-2 py-1 rounded font-bold text-foreground border border-border/50 shadow-sm">
                      ETB {item.price}
                    </div>
                  </div>
                  <div className="p-3 md:p-4 flex-1 flex flex-col">
                    <BilingualText en={item.nameEn} am={item.nameAm} className="font-bold leading-tight" />
                    {item.descriptionEn && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.descriptionEn}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Cart */}
      <div className="w-96 bg-card border-l border-border shadow-2xl flex flex-col z-20 shrink-0 relative">
        <div className="p-4 border-b border-border bg-sidebar text-sidebar-foreground">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-sidebar-primary" />
            Current Order
          </h2>
        </div>

        {/* Order Type & Table Selection */}
        <div className="p-4 border-b border-border bg-muted/30 space-y-4">
          <RadioGroup 
            value={orderType} 
            onValueChange={(v) => {
              setOrderType(v as OrderInputOrderType);
              if (v !== 'dine_in') setSelectedTable(null);
            }} 
            className="flex gap-2"
          >
            {[
              { id: 'dine_in', label: 'Dine In' },
              { id: 'takeaway', label: 'Takeaway' },
              { id: 'delivery', label: 'Delivery' }
            ].map(type => (
              <div key={type.id} className="flex-1">
                <RadioGroupItem value={type.id} id={type.id} className="peer sr-only" />
                <Label
                  htmlFor={type.id}
                  className="flex items-center justify-center px-3 py-2 border-2 border-muted bg-card hover:bg-muted hover:text-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary peer-data-[state=checked]:bg-primary/5 rounded-md cursor-pointer transition-all font-semibold"
                >
                  {type.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {orderType === 'dine_in' && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Select Table</Label>
              <div className="grid grid-cols-4 gap-2">
                {tables.filter(t => t.status === 'free').map(table => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(table.id)}
                    className={`py-2 px-1 text-center rounded-md border text-sm font-bold transition-all
                      ${selectedTable === table.id 
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                        : 'bg-card border-border hover:border-primary/50'}`}
                  >
                    {table.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60">
              <ShoppingBag className="w-12 h-12 mb-3" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="bg-background border border-border rounded-lg p-3 flex gap-3 relative group">
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  <div className="flex-1">
                    <BilingualText en={item.nameEn} am={item.nameAm} className="font-bold text-sm leading-tight" />
                    <div className="text-primary font-semibold text-sm mt-1">ETB {item.price}</div>
                  </div>
                  
                  <div className="flex flex-col items-center justify-between bg-muted rounded-md shrink-0 w-10 overflow-hidden">
                    <button onClick={() => updateQuantity(item.id, 1)} className="w-full h-8 flex items-center justify-center hover:bg-primary/20 text-primary transition-colors"><Plus className="w-4 h-4" /></button>
                    <span className="font-bold text-sm h-6 flex items-center justify-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, -1)} className="w-full h-8 flex items-center justify-center hover:bg-destructive/20 text-destructive transition-colors"><Minus className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout Area */}
        <div className="p-4 border-t border-border bg-card shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>ETB {cartTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax (15%)</span>
              <span>ETB {(cartTotal * 0.15).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-foreground pt-2 border-t border-border">
              <span>Total</span>
              <span className="text-primary">ETB {(cartTotal * 1.15).toFixed(2)}</span>
            </div>
          </div>
          
          <Button 
            size="lg" 
            className="w-full h-16 text-lg font-bold shadow-lg hover:translate-y-[-2px] transition-all"
            disabled={cart.length === 0 || createOrder.isPending}
            onClick={handleCheckout}
          >
            {createOrder.isPending ? "Processing..." : "Checkout Order"}
            {!createOrder.isPending && <ChevronRight className="w-6 h-6 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
