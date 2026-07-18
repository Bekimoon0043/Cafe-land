import { useEffect } from "react";
import { useGetKitchenDisplayOrders, getGetKitchenDisplayOrdersQueryKey, useUpdateOrderStatus } from "@workspace/api-client-react";
import { BilingualText } from "@/components/bilingual-text";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, ChefHat, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function KDS() {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useGetKitchenDisplayOrders({
    query: { 
      queryKey: getGetKitchenDisplayOrdersQueryKey(),
      refetchInterval: 10000 // Poll every 10 seconds
    }
  });

  const updateStatus = useUpdateOrderStatus();

  const handleStatusChange = async (orderId: number, status: 'preparing' | 'ready') => {
    try {
      await updateStatus.mutateAsync({ id: orderId, data: { status } });
      toast.success(`Order marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: getGetKitchenDisplayOrdersQueryKey() });
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <ChefHat className="w-12 h-12 animate-pulse" />
          <p>Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* KDS Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center text-primary">
            <ChefHat className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">Kitchen Display System</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span>&lt; 10 min</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span>10 - 20 min</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span>&gt; 20 min</span>
          </div>
        </div>
      </header>

      {/* KDS Grid */}
      <div className="flex-1 p-6 overflow-x-auto overflow-y-hidden">
        {orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
            <CheckCircle2 className="w-16 h-16 text-muted-foreground/30" />
            <p className="text-xl font-medium">No active orders</p>
          </div>
        ) : (
          <div className="flex gap-6 h-full pb-4">
            {orders.map((order) => {
              const minutes = order.elapsedMinutes;
              let headerColor = "bg-emerald-500 text-white";
              if (minutes >= 20) headerColor = "bg-red-500 text-white";
              else if (minutes >= 10) headerColor = "bg-amber-500 text-white";

              const isPreparing = order.status === 'preparing';

              return (
                <div key={order.id} className={`flex flex-col w-80 shrink-0 bg-card rounded-xl border-2 shadow-sm overflow-hidden flex-col h-full ${isPreparing ? 'border-primary' : 'border-border'}`}>
                  <div className={`${headerColor} p-4 shrink-0`}>
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-2xl font-bold">#{order.orderNumber}</h2>
                      <div className="flex items-center gap-1 font-mono text-lg font-bold bg-white/20 px-2 py-1 rounded">
                        <Clock className="w-4 h-4" />
                        {minutes}m
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm font-medium uppercase tracking-wider">
                      <span>{order.orderType.replace('_', ' ')}</span>
                      {order.tableLabel && <span>{order.tableLabel}</span>}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 bg-muted/30">
                    <ul className="space-y-4">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="bg-card p-3 rounded border border-border shadow-sm">
                          <div className="flex gap-3">
                            <span className="font-bold text-lg">{item.quantity}x</span>
                            <div className="flex-1">
                              <BilingualText en={item.nameEn} am={item.nameAm} className="font-bold text-lg leading-tight" />
                              
                              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                <ul className="mt-2 pl-2 border-l-2 border-primary/30 space-y-1">
                                  {item.selectedModifiers.map((mod, midx) => (
                                    <li key={midx} className="text-sm text-muted-foreground flex items-center gap-2">
                                      <span className="w-1 h-1 bg-primary/50 rounded-full" />
                                      <BilingualText en={mod.nameEn} am={mod.nameAm} />
                                    </li>
                                  ))}
                                </ul>
                              )}
                              
                              {item.notes && (
                                <div className="mt-2 text-sm text-destructive flex items-start gap-1 bg-destructive/10 p-2 rounded">
                                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                  <span className="font-medium italic">{item.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-card border-t border-border shrink-0">
                    {order.status === 'pending' ? (
                      <Button 
                        size="lg" 
                        className="w-full text-lg h-14 bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => handleStatusChange(order.id, 'preparing')}
                      >
                        Start Preparing
                      </Button>
                    ) : (
                      <Button 
                        size="lg" 
                        className="w-full text-lg h-14 bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={() => handleStatusChange(order.id, 'ready')}
                      >
                        Mark as Ready
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
