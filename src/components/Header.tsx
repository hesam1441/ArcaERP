import { useResponsiveText } from "../hooks/useResponsiveText";
import { cashCurrencyTotal } from "../utils/cashBalances";
import React from "react";
import {
  Menu,
  Search,
  Bot,
  Calendar,
  Download,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { AppDatabase, Language, AppUser } from "../types";
import { formatCurrency } from "../utils/formatters";
import { getTranslation } from "../i18n/translations";

interface HeaderProps {
  hideWorkspaceTools?: boolean;
  db: AppDatabase;
  language: Language;
  onToggleLanguage: () => void;
  currentUser?: AppUser;
  onOpenSidebar: () => void;
  onOpenAI: () => void;
  onInstallApp?: () => void;
  onRefreshApp: () => void;
  isOnline: boolean;
  syncStatus: "synced" | "pending" | "syncing" | "conflict";
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectSearchResult?: (type: string, id: number | string) => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
}

// The application shell contains retained pages.  A global search field must
// let search results yield to immediate typing in the small input component.
const DelayedGlobalSearchInput: React.FC<{ value: string; onCommit: (value: string) => void; language: Language }> = React.memo(({ value, onCommit, language }) => {
  const [text, setText] = useResponsiveText(value, onCommit);
  const clear = () => { setText(""); onCommit(""); };
  return <>
    <input
      id="global-search-input"
      type="text"
      placeholder={language === "fa" ? "جست‌وجوی یکپارچه: PI، مشتری، تأمین‌کننده یا کالا" : "Search PI, customer, supplier or product"}
      value={text}
      onChange={(event) => setText(event.currentTarget.value)}
      className={`w-full ${language === "fa" ? "pl-4 pr-9" : "pr-4 pl-9"} py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 text-xs text-slate-800 transition-all outline-hidden placeholder:text-slate-400`}
    />
    {value && <button onClick={clear} className={`absolute ${language === "fa" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600`}>✕</button>}
  </>;
});

export const Header: React.FC<HeaderProps> = ({
  hideWorkspaceTools=false,
  db,
  language,
  onToggleLanguage,
  currentUser,
  onOpenSidebar,
  onOpenAI,
  onInstallApp,
  onRefreshApp,
  isOnline,
  syncStatus,
  searchQuery,
  setSearchQuery,
  onSelectSearchResult,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack = false,
  canNavigateForward = false,
}) => {
  const t = (key: any) => getTranslation(language, key);
  // Persian and Arabic keyboards commonly produce visually identical but different
  // characters. Normalising them keeps the one global search dependable.
  const normaliseSearch = (value: string) => value
    .toLocaleLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
  const searchTerm = normaliseSearch(searchQuery);
  const sortedOrders = [...db.orders].sort((a, b) => (b.PIDate || "").localeCompare(a.PIDate || ""));
  const productNameById = new Map(db.products.map((product) => [product.ProductID, normaliseSearch(`${product.ProductName} ${product.ChemicalName || ""}`)]));
  const matchesProduct = (order: AppDatabase["orders"][number]) => [
    (order as any).ProductName,
    (order as any).Product,
    ...(order.items || []).map((item) => productNameById.get(item.ProductID) || ""),
  ].some((value) => normaliseSearch(value || "").includes(searchTerm));
  const piMatches = searchTerm ? sortedOrders.filter((order) => normaliseSearch(order.ProformaInvoiceID || "").includes(searchTerm)) : [];
  const partyMatches = searchTerm ? sortedOrders.filter((order) => order.ActiveOrder && [order.CustomerName, order.SupplierName].some((value) => normaliseSearch(value || "").includes(searchTerm))) : [];
  const productMatches = searchTerm ? sortedOrders.filter(matchesProduct) : [];
  const matchedOrders = piMatches.length ? piMatches : partyMatches.length ? partyMatches : productMatches;
  const searchKind = piMatches.length ? (language === "fa" ? "پیش‌فاکتورهای مطابق PI" : "Matching proformas") : partyMatches.length ? (language === "fa" ? "سفارش‌های فعال مشتری / تأمین‌کننده" : "Active customer / supplier orders") : (language === "fa" ? "پروفورماهای مرتبط با کالا" : "Product-related proformas");

  // Aggregate quick cash stats
  const totalUsdCash = cashCurrencyTotal(db.cashEntries,"USD");
  const totalEurCash = cashCurrencyTotal(db.cashEntries,"EUR");

  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const searchTools = (<div className="relative w-full">
          <Search
            size={15}
            className={`absolute ${language === "fa" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
          />
          <DelayedGlobalSearchInput value={searchQuery} onCommit={setSearchQuery} language={language}/>
          {searchTerm && (
            <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl" dir={language === "fa" ? "rtl" : "ltr"}>
              {matchedOrders.length ? <><div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-500">{searchKind} · {matchedOrders.length} مورد</div>{matchedOrders.slice(0, 7).map((order) => <button key={order.OrderID} type="button" onMouseDown={(event) => { event.preventDefault(); onSelectSearchResult?.("order", order.OrderID); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-xs hover:bg-indigo-50"><div className="min-w-0"><span className="block font-mono font-bold text-indigo-700">{order.ProformaInvoiceID || "—"}</span><span className="block truncate text-[10px] text-slate-500">{order.CustomerName || "—"} · {order.SupplierName || "—"}</span></div><span className="shrink-0 font-mono text-[10px] text-slate-400">{order.PIDate || "—"}</span></button>)}</> : null}
              {db.customers.filter((item) => normaliseSearch(item.CustomerName).includes(searchTerm)).slice(0, 4).map((item) => <button key={`customer-${item.CustomerID}`} type="button" onMouseDown={(event) => { event.preventDefault(); onSelectSearchResult?.("customer", item.CustomerID); }} className="flex w-full items-center justify-between gap-3 border-t border-slate-50 px-3 py-2 text-right text-xs hover:bg-emerald-50"><span className="font-bold text-emerald-700">مشتری: {item.CustomerName}</span><span className="text-[10px] text-slate-400">{item.City || ""}</span></button>)}
              {db.suppliers.filter((item) => normaliseSearch(item.SupplierName).includes(searchTerm)).slice(0, 4).map((item) => <button key={`supplier-${item.SupplierID}`} type="button" onMouseDown={(event) => { event.preventDefault(); onSelectSearchResult?.("supplier", item.SupplierID); }} className="flex w-full items-center justify-between gap-3 border-t border-slate-50 px-3 py-2 text-right text-xs hover:bg-emerald-50"><span className="font-bold text-emerald-700">تأمین‌کننده: {item.SupplierName}</span><span className="text-[10px] text-slate-400">{item.City || ""}</span></button>)}
              {db.products.filter((item) => normaliseSearch(`${item.ProductName} ${item.ChemicalName || ""}`).includes(searchTerm)).slice(0, 4).map((item) => <button key={`product-${item.ProductID}`} type="button" onMouseDown={(event) => { event.preventDefault(); onSelectSearchResult?.("product", item.ProductID); }} className="flex w-full items-center justify-between gap-3 border-t border-slate-50 px-3 py-2 text-right text-xs hover:bg-amber-50"><span className="font-bold text-amber-700">کالا: {item.ProductName}</span><span className="text-[10px] text-slate-400">{item.HSCODE || ""}</span></button>)}
              {!matchedOrders.length && !db.customers.some((item) => normaliseSearch(item.CustomerName).includes(searchTerm)) && !db.suppliers.some((item) => normaliseSearch(item.SupplierName).includes(searchTerm)) && !db.products.some((item) => normaliseSearch(`${item.ProductName} ${item.ChemicalName || ""}`).includes(searchTerm)) && <div className="px-3 py-2 text-xs text-slate-400">{language === "fa" ? "نتیجه‌ای یافت نشد." : "No result found."}</div>}
            </div>
          )}
        </div>);
  const historyTools = (<div className="flex items-center rounded-md border border-slate-200 bg-white">
          <button type="button" onClick={onNavigateBack} disabled={!canNavigateBack} className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300" title="بازگشت به صفحه یا پرونده قبلی" aria-label="بازگشت"><ChevronRight size={17}/></button>
          <button type="button" onClick={onNavigateForward} disabled={!canNavigateForward} className="flex h-8 w-8 items-center justify-center border-r border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300" title="حرکت به صفحه یا پرونده بعدی" aria-label="بعدی"><ChevronLeft size={17}/></button>
        </div>);
  const treasuryTools = (<div data-treasury-summary className={`${hideWorkspaceTools?"flex":"hidden md:flex"} items-center gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs`} title="خلاصه موجودی نقدی خزانه">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-medium leading-none mb-0.5">
              موجودی نقدی · دلار و یورو
            </div>
            <div className="font-bold font-mono text-emerald-700 flex items-center gap-1.5 leading-none">
              <span>USD {formatCurrency(totalUsdCash, "$")}</span>
              <span className="text-slate-300">|</span>
              <span>EUR {formatCurrency(totalEurCash, "€")}</span>
            </div>
          </div>
        </div>);

  return (
    <header
      id="app-header"
      className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4"
    >
      {/* Left: Mobile Menu & Search */}
      <div className="flex min-w-0 flex-[1.6] items-center gap-3">
        <button
          id="sidebar-toggle-btn"
          aria-label="بازکردن منوی برنامه"
          onClick={onOpenSidebar}
          className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden"
        >
          <Menu size={18} />
        </button>

        {!hideWorkspaceTools && searchTools}
      </div>

      {/* Center & Right: Treasury Quick Badges & High Density Actions */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        {!hideWorkspaceTools && historyTools}
        <div className={`hidden sm:flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-bold ${syncStatus === "conflict" ? "border-rose-200 bg-rose-50 text-rose-700" : !isOnline || syncStatus === "pending" ? "border-amber-200 bg-amber-50 text-amber-700" : syncStatus === "syncing" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} title="وضعیت ذخیره و همگام‌سازی اطلاعات">
          <span className={`h-2 w-2 rounded-full ${syncStatus === "conflict" ? "bg-rose-500" : !isOnline || syncStatus === "pending" ? "bg-amber-500" : syncStatus === "syncing" ? "animate-pulse bg-sky-500" : "bg-emerald-500"}`} />
          {syncStatus === "conflict" ? "نیاز به رفع تداخل" : !isOnline ? "آفلاین · تغییرات در صف" : syncStatus === "pending" ? "در صف همگام‌سازی" : syncStatus === "syncing" ? "در حال همگام‌سازی" : "همگام‌شده"}
        </div>
        {/* Date badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium">
          <Calendar size={13} className="text-slate-400" />
          <span>{todayFormatted}</span>
        </div>

        {/* Treasury Mini Badge */}
        {!hideWorkspaceTools && treasuryTools}

        {/* AI Assistant Button */}
        <button
          type="button"
          onClick={onRefreshApp}
          className="flex h-8 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-indigo-600"
          title="رفرش اپ و بازگشت به همین صفحه"
          aria-label="رفرش اپ و حفظ صفحهٔ فعلی"
        ><RefreshCw size={15} /></button>
        {onInstallApp && <button
          type="button"
          onClick={onInstallApp}
          className="flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-[10px] font-bold text-white transition hover:bg-slate-700"
          title="نصب ARCA روی دستگاه"
          aria-label="نصب اپ"
        >
          <Download size={14} /><span className="hidden sm:inline">نصب اپ</span>
        </button>}
        <button
          id="header-ai-btn"
          onClick={onOpenAI}
          disabled={!isOnline}
          className="flex h-8 w-9 items-center justify-center rounded-md bg-indigo-600 text-white transition-all hover:bg-indigo-700 active:scale-98 disabled:cursor-not-allowed disabled:bg-slate-300"
          title={isOnline ? "دستیار هوشمند" : "دستیار هوشمند فقط در حالت آنلاین در دسترس است"}
          aria-label="دستیار هوشمند"
        >
          <Bot size={16} />
        </button>

        {/* Language Switcher: kept next to the assistant for a compact action group. */}
        <button
          onClick={onToggleLanguage}
          className="flex h-8 w-9 items-center justify-center rounded-md bg-slate-50 text-xs font-black text-slate-700 transition-all hover:bg-slate-100"
          title="تغییر زبان / Switch Language"
        >
          <span>{language === "fa" ? "EN" : "FA"}</span>
        </button>
      </div>
    </header>
  );
};
