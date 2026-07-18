/**
 * Public Customer Menu Page — no auth required.
 * Route: /menu/table/:tableId
 */
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Coffee, Search, ShoppingCart, X, Plus, Minus, ChevronRight, Globe, CheckCircle2, Banknote, Smartphone, Building2, AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const r = await fetch(`${API_BASE}/api${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

interface Category  { id: number; nameEn: string; nameAm: string; icon?: string; }
interface MenuItem  { id: number; nameEn: string; nameAm: string; descriptionEn?: string; descriptionAm?: string; price: number; categoryId: number; isAvailable: boolean; imageUrl?: string; }
interface CartItem  { item: MenuItem; quantity: number; }
interface Provider  { id: number; name: string; providerType: string; isActive: boolean; }

type PaymentStep = "choose" | "receipt" | "submitting" | "done";

const EMOJI: Record<string, string> = { coffee: "☕", hamburger: "🍔", cup: "🥤", cake: "🍰", dessert: "🍰", salad: "🥗", juice: "🥤" };

export default function CustomerMenu() {
  const params = useParams<{ tableId: string }>();
  const tableId = parseInt(params.tableId ?? "0");

  const [lang, setLang]               = useState<"en"|"am">(() => (localStorage.getItem("coffee_land_lang") as "en"|"am") ?? "en");
  const [categories, setCats]         = useState<Category[]>([]);
  const [items, setItems]             = useState<MenuItem[]>([]);
  const [providers, setProviders]     = useState<Provider[]>([]);
  const [selectedCat, setCat]         = useState<number|null>(null);
  const [search, setSearch]           = useState("");
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [tableLabel, setLabel]        = useState("");
  const [placing, setPlacing]         = useState(false);
  const [orderNum, setOrderNum]       = useState("");
  const [orderId, setOrderId]         = useState<number|null>(null);
  const [orderTotal, setOrderTotal]   = useState(0);
  const [error, setError]             = useState("");

  // Payment flow
  const [payStep, setPayStep]           = useState<PaymentStep|null>(null);
  const [chosenProvider, setChosen]     = useState<Provider|null>(null);
  const [receiptInput, setReceiptInput] = useState("");
  const [payError, setPayError]         = useState("");
  const [payResult, setPayResult]       = useState<any>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/menu/categories"),
      apiFetch("/menu/items?available=true"),
      tableId ? apiFetch("/tables").catch(() => []) : Promise.resolve([]),
      apiFetch("/payments/providers").catch(() => []),
    ]).then(([cats, its, tables, provs]: any[]) => {
      setCats(cats);
      setItems(its);
      const tbl = tables.find((t: any) => t.id === tableId);
      if (tbl) setLabel(tbl.label);
      setProviders((provs as Provider[]).filter(p => p.isActive));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tableId]);

  const t = (en: string, am: string) => lang === "am" ? am : en;

  const toggleLang = () => {
    const next: "en"|"am" = lang === "en" ? "am" : "en";
    setLang(next);
    localStorage.setItem("coffee_land_lang", next);
  };

  const filtered = items.filter(i => {
    const matchCat    = selectedCat === null || i.categoryId === selectedCat;
    const matchSearch = !search || i.nameEn.toLowerCase().includes(search.toLowerCase()) || i.nameAm.includes(search);
    return matchCat && matchSearch && i.isAvailable;
  });

  const addToCart = (item: MenuItem) =>
    setCart(c => c.find(ci => ci.item.id === item.id)
      ? c.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)
      : [...c, { item, quantity: 1 }]);

  const removeFromCart = (itemId: number) =>
    setCart(c => c.flatMap(ci => ci.item.id !== itemId ? [ci] : ci.quantity > 1 ? [{ ...ci, quantity: ci.quantity - 1 }] : []));

  const cartCount = cart.reduce((s, ci) => s + ci.quantity, 0);
  const cartTotal = cart.reduce((s, ci) => s + ci.item.price * ci.quantity, 0);
  const getQty    = (id: number) => cart.find(ci => ci.item.id === id)?.quantity ?? 0;

  const handlePlaceOrder = async () => {
    if (!cart.length) return;
    setPlacing(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/orders/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: tableId || null,
          notes: `QR order — ${tableLabel || "walk-in"}`,
          items: cart.map(ci => ({
            menuItemId: ci.item.id,
            quantity:   ci.quantity,
            unitPrice:  ci.item.price,
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Server error"); }
      const order = await res.json();
      setOrderNum(order.orderNumber);
      setOrderId(order.id);
      setOrderTotal(parseFloat(order.totalAmount ?? "0"));
      setCartOpen(false);
      setCart([]);
      setPayStep("choose");
    } catch (e: any) {
      setError(e.message ?? "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const submitPayment = async (prov: Provider, receipt?: string) => {
    if (!orderId) return;
    setPayStep("submitting");
    setPayError("");
    try {
      const body: any = { orderId, providerType: prov.providerType };
      if (prov.providerType !== "cash") body.receiptId = (receipt ?? receiptInput).trim();
      const res = await fetch(`${API_BASE}/api/payments/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Payment error"); }
      const result = await res.json();
      setPayResult(result);
      setPayStep("done");
    } catch (e: any) {
      setPayError(e.message ?? "Payment failed. Please try again.");
      setPayStep(prov.providerType === "cash" ? "choose" : "receipt");
    }
  };

  const providerIcon = (type: string) => {
    if (type === "cash") return <Banknote className="w-6 h-6 text-emerald-600" />;
    if (type === "telebirr") return <Smartphone className="w-6 h-6 text-purple-600" />;
    return <Building2 className="w-6 h-6 text-blue-600" />;
  };

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen bg-[#2c1810] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Coffee className="w-10 h-10 text-[#cc5500] animate-pulse" />
        <p className="text-white/60 text-sm">{t("Loading menu…","ምናሌ እየጫነ ነው…")}</p>
      </div>
    </div>
  );

  /* ── Payment: choose method ── */
  if (payStep === "choose") return (
    <div className="min-h-screen bg-[#fdf8f3] flex items-center justify-center p-6">
      <div className="bg-white border border-orange-100 rounded-3xl p-6 max-w-sm w-full shadow-xl">
        <div className="text-center mb-5">
          <p className="text-xs font-mono bg-orange-50 text-[#cc5500] rounded-lg px-3 py-1.5 inline-block mb-3">#{orderNum}</p>
          <h2 className="text-xl font-bold text-[#2c1810]">{t("Choose Payment","የክፍያ ዘዴ ይምረጡ")}</h2>
          <p className="text-[#cc5500] font-bold text-lg mt-1">{orderTotal.toLocaleString()} ETB</p>
        </div>

        <div className="space-y-3">
          {providers.map(prov => (
            <button
              key={prov.id}
              onClick={() => {
                setChosen(prov);
                setPayError("");
                if (prov.providerType === "cash") {
                  submitPayment(prov);
                } else {
                  setPayStep("receipt");
                }
              }}
              className="w-full flex items-center gap-4 border-2 border-gray-100 hover:border-[#cc5500] rounded-2xl p-4 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-orange-50 flex items-center justify-center transition-colors flex-shrink-0">
                {providerIcon(prov.providerType)}
              </div>
              <div>
                <p className="font-bold text-[#2c1810] text-sm">{prov.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {prov.providerType === "cash"
                    ? t("Cashier will collect payment","ሰራተኛ ክፍያ ይሰበስባል")
                    : prov.providerType === "telebirr"
                    ? t("Pay via TeleBirr mobile","በTeleBirr ይክፈሉ")
                    : t("Bank transfer receipt","የባንክ ዝውውር 영수증")}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#cc5500] ml-auto transition-colors" />
            </button>
          ))}
        </div>

        {payError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{payError}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Payment: enter receipt ID ── */
  if (payStep === "receipt" && chosenProvider) return (
    <div className="min-h-screen bg-[#fdf8f3] flex items-center justify-center p-6">
      <div className="bg-white border border-orange-100 rounded-3xl p-6 max-w-sm w-full shadow-xl">
        <button
          onClick={() => { setPayStep("choose"); setReceiptInput(""); setPayError(""); }}
          className="text-xs text-gray-400 hover:text-[#cc5500] mb-4 flex items-center gap-1"
        >
          ← {t("Back","ተመለስ")}
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            {providerIcon(chosenProvider.providerType)}
          </div>
          <div>
            <h2 className="font-bold text-[#2c1810]">{chosenProvider.name}</h2>
            <p className="text-xs text-gray-400">{t("Enter transaction reference","የግብይት ማጣቀሻ ያስገቡ")}</p>
          </div>
        </div>

        <div className="bg-orange-50 rounded-2xl p-3 mb-4 text-sm">
          <div className="flex justify-between text-gray-500 mb-1">
            <span>{t("Order","ትዕዛዝ")}</span><span className="font-mono">#{orderNum}</span>
          </div>
          <div className="flex justify-between font-bold text-[#2c1810]">
            <span>{t("Amount to pay","የሚከፈለው")}</span>
            <span className="text-[#cc5500]">{orderTotal.toLocaleString()} ETB</span>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <label className="block text-sm font-semibold text-[#2c1810]">
            {chosenProvider.providerType === "telebirr"
              ? t("TeleBirr Transaction ID","የTeleBirr ግብይት ቁጥር")
              : t("CBE Receipt / FT Reference","የCBE ደረሰኝ / FT ቁጥር")}
          </label>
          <input
            value={receiptInput}
            onChange={e => setReceiptInput(e.target.value)}
            placeholder={chosenProvider.providerType === "telebirr" ? "e.g. 9876543210" : "e.g. FT12345678ABC"}
            className="w-full border-2 border-gray-200 focus:border-[#cc5500] rounded-xl px-4 py-3 text-sm font-mono outline-none transition-colors"
          />
          <p className="text-xs text-gray-400">
            {chosenProvider.providerType === "telebirr"
              ? t("Find it in your TeleBirr app under transaction history","TeleBirr ላፕቶ ስር ባሉ ግብይቶች ይፈልጉ")
              : t("Find it in your CBE receipt or mobile app","በCBE ደረሰኝ ወይም ሞባይል ላፕቶ ይፈልጉ")}
          </p>
        </div>

        {payError && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{payError}
          </div>
        )}

        <button
          onClick={() => chosenProvider && submitPayment(chosenProvider, receiptInput)}
          disabled={!receiptInput.trim()}
          className="w-full bg-[#cc5500] text-white rounded-2xl py-4 font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-all hover:bg-[#b34a00]"
        >
          {t("Submit Payment","ክፍያ አስገባ")}
        </button>
      </div>
    </div>
  );

  /* ── Payment: submitting ── */
  if (payStep === "submitting") return (
    <div className="min-h-screen bg-[#fdf8f3] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-[#cc5500] animate-spin" />
        <p className="text-gray-500 text-sm">{t("Verifying payment…","ክፍያ እየተረጋገጠ ነው…")}</p>
      </div>
    </div>
  );

  /* ── Payment: done ── */
  if (payStep === "done") {
    const isCash = payResult?.providerType === "cash";
    const isVerified = payResult?.status === "verified";
    const isReview = payResult?.status === "manual_review";

    return (
      <div className="min-h-screen bg-[#fdf8f3] flex items-center justify-center p-6">
        <div className="bg-white border border-orange-100 rounded-3xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${isCash ? "bg-blue-100" : isVerified ? "bg-emerald-100" : "bg-amber-100"}`}>
            {isCash
              ? <Banknote className="w-10 h-10 text-blue-500" />
              : isVerified
              ? <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              : <AlertCircle className="w-10 h-10 text-amber-500" />}
          </div>

          <h2 className="text-2xl font-bold text-[#2c1810] mb-2">
            {isCash
              ? t("Order Placed!","ትዕዛዝ ተቀብሏል!")
              : isVerified
              ? t("Payment Confirmed!","ክፍያ ተረጋግጧል!")
              : t("Payment Submitted","ክፍያ ቀርቧል")}
          </h2>

          <p className="text-sm font-mono bg-orange-50 text-[#cc5500] rounded-lg px-3 py-1.5 inline-block mb-3">#{orderNum}</p>

          <p className="text-gray-500 text-sm mb-2">
            {isCash
              ? t("A cashier will come to collect your payment shortly.","ገንዘብ ተቀባይ ብዙም ሳይቆይ ክፍያ ለመቀበል ይመጣል።")
              : isVerified
              ? t("Your payment has been verified. Your order is being prepared!","ክፍያዎ ተረጋግጧል። ትዕዛዝዎ እየተዘጋጀ ነው!")
              : t("Your payment receipt was submitted. Staff will verify it shortly.","ደረሰኝዎ ቀርቧል። ሰራተኛ ብዙም ሳይቆይ ያረጋግጣል።")}
          </p>

          {tableLabel && <p className="font-bold text-[#cc5500] text-lg mb-6">{tableLabel}</p>}

          <button
            onClick={() => { setPayStep(null); setPayResult(null); setOrderId(null); setReceiptInput(""); setChosen(null); }}
            className="w-full bg-[#cc5500] text-white rounded-2xl py-3 font-semibold hover:bg-[#b34a00] transition-colors"
          >
            {t("Order More","ተጨማሪ ትዕዛዝ ስጥ")}
          </button>
        </div>
      </div>
    );
  }

  const catIcon = (catId: number) => {
    const c = categories.find(x => x.id === catId);
    if (c?.icon && EMOJI[c.icon]) return EMOJI[c.icon];
    
    const name = (c?.nameEn || "").toLowerCase();
    if (name.includes("coffee") || name.includes("tea") || name.includes("drink")) return "☕";
    if (name.includes("food") || name.includes("burger") || name.includes("pizza")) return "🍔";
    if (name.includes("dessert") || name.includes("cake") || name.includes("sweet")) return "🍰";
    if (name.includes("salad") || name.includes("healthy")) return "🥗";
    
    return "🍽️";
  };

  return (
    <div className="min-h-screen bg-[#fdf8f3] pb-28">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-[#2c1810] shadow-lg">
        {/* Brand bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#cc5500] flex items-center justify-center">
              <Coffee className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">Coffee Land</p>
              {tableLabel && <p className="text-xs text-white/50 mt-0.5">{tableLabel}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {lang === "en" ? "አማርኛ" : "English"}
            </button>
            {cartCount > 0 && (
              <button
                onClick={() => setCartOpen(true)}
                className="relative bg-[#cc5500] text-white rounded-full px-3 py-1.5 text-sm font-semibold flex items-center gap-2 shadow-lg"
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="font-bold">{cartCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("Search menu…","ምናሌ ፈልግ…")}
              className="w-full bg-white/10 border border-white/10 text-white placeholder:text-white/30 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#cc5500]/60"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {[{ id: null, nameEn: "All", nameAm: "ሁሉም" }, ...categories].map(cat => (
            <button
              key={cat.id ?? "all"}
              onClick={() => setCat(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5
                ${selectedCat === cat.id
                  ? "bg-[#cc5500] text-white shadow-md scale-105"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:scale-105"
                }`}
            >
              {cat.id !== null && <span className="text-sm">{catIcon(cat.id)}</span>}
              {lang === "am" ? cat.nameAm : cat.nameEn}
            </button>
          ))}
        </div>
      </div>

      {/* ── Menu items ── */}
      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Coffee className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t("No items found","ምንም ዕቃ አልተገኘም")}</p>
          </div>
        )}

        {filtered.map(item => {
          const qty = getQty(item.id);
          return (
            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-orange-50 overflow-hidden flex hover:shadow-md transition-shadow duration-300">
              {/* Thumbnail */}
              <div className="w-28 h-28 flex-shrink-0 bg-orange-50 flex items-center justify-center text-4xl overflow-hidden">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.nameEn} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
                  : <span className="opacity-80">{catIcon(item.categoryId)}</span>
                }
              </div>

              {/* Info */}
              <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                <div>
                  <h3 className="font-bold text-[#2c1810] text-sm leading-tight truncate">
                    {lang === "am" ? item.nameAm : item.nameEn}
                  </h3>
                  {lang === "am" && item.nameEn !== item.nameAm && (
                    <p className="text-xs text-gray-400 truncate">{item.nameEn}</p>
                  )}
                  {(lang === "en" ? item.descriptionEn : item.descriptionAm) && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                      {lang === "en" ? item.descriptionEn : item.descriptionAm}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-[#cc5500] text-sm">
                    {item.price.toLocaleString()} ETB
                  </span>

                  {qty > 0 ? (
                    <div className="flex items-center gap-1.5 bg-orange-50 rounded-full px-2.5 py-1.5 shadow-sm">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-6 h-6 rounded-full bg-[#cc5500]/20 flex items-center justify-center hover:bg-[#cc5500]/30 transition-colors"
                      >
                        <Minus className="w-3 h-3 text-[#cc5500]" />
                      </button>
                      <span className="text-sm font-bold text-[#cc5500] w-5 text-center">{qty}</span>
                      <button
                        onClick={() => addToCart(item)}
                        className="w-6 h-6 rounded-full bg-[#cc5500] flex items-center justify-center hover:bg-[#b34a00] transition-colors shadow-sm"
                      >
                        <Plus className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      className="bg-[#cc5500] text-white rounded-full px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all hover:bg-[#b34a00] shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />{t("Add","ጨምር")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Floating cart button ── */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40 flex justify-center">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-md bg-[#cc5500] text-white rounded-2xl px-5 py-4 shadow-2xl flex items-center justify-between font-semibold active:scale-[0.98] transition-all hover:shadow-3xl hover:bg-[#b34a00]"
          >
            <span className="bg-white/20 rounded-full px-3 py-1 text-sm font-bold">{cartCount}</span>
            <span className="text-base">{t("View Order","ትዕዛዝ ይመልከቱ")}</span>
            <span className="text-base font-bold">{cartTotal.toLocaleString()} ETB</span>
          </button>
        </div>
      )}

      {/* ── Cart sheet ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-[#2c1810]">{t("Your Order","ትዕዛዝዎ")}</h3>
              <button onClick={() => setCartOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.map(({ item, quantity }) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-xl flex-shrink-0">
                    {catIcon(item.categoryId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#2c1810] truncate">
                      {lang === "am" ? item.nameAm : item.nameEn}
                    </p>
                    <p className="text-xs text-gray-400">{item.price.toLocaleString()} ETB × {quantity}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center">
                      <Minus className="w-3 h-3 text-gray-500" />
                    </button>
                    <span className="font-bold text-sm w-4 text-center">{quantity}</span>
                    <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-full bg-[#cc5500] flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-[#cc5500] w-20 text-right flex-shrink-0">
                    {(item.price * quantity).toLocaleString()} ETB
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-white">
              {/* Totals */}
              <div className="bg-orange-50 rounded-2xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t("Subtotal","ንዑስ ድምር")}</span>
                  <span>{cartTotal.toLocaleString()} ETB</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t("VAT (15%)","ቫት (15%)")}</span>
                  <span>{Math.round(cartTotal * 0.15).toLocaleString()} ETB</span>
                </div>
                <div className="flex justify-between font-bold text-base text-[#2c1810] border-t border-orange-100 pt-1.5">
                  <span>{t("Total","ጠቅላላ")}</span>
                  <span className="text-[#cc5500]">{Math.round(cartTotal * 1.15).toLocaleString()} ETB</span>
                </div>
              </div>

              {tableLabel && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{t("Table","ጠረጴዛ")}:</span>
                  <span className="font-semibold text-[#2c1810]">{tableLabel}</span>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">{error}</div>
              )}

              <p className="text-xs text-gray-400">
                {t(
                  "A staff member will come to confirm and collect payment.",
                  "ሰራተኛ ለማረጋገጥ እና ክፍያ ለመቀበል ይመጣል።"
                )}
              </p>

              <button
                onClick={handlePlaceOrder}
                disabled={placing}
                className="w-full bg-[#cc5500] text-white rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-all"
              >
                {placing ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                    </svg>
                    {t("Placing order…","ትዕዛዝ እየተቀበለ…")}
                  </span>
                ) : (
                  <>
                    {t("Place Order","ትዕዛዝ ጠቀስ")}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
