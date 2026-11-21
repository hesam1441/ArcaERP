import { InlineHelp } from "./InlineHelp";
import { cashCurrencyTotal } from "../utils/cashBalances";
import { summarizeCaseFinancials } from "../utils/caseFinancials";
import { normalizePartnerName } from "../utils/partnerIdentity";
import { getOrderAmountInUSD, getOrderCurrency, getCentralCaseLedger, transactionAmountInOrderCurrency } from "../utils/orderAccounting";
import { getCaseFinancials } from "../utils/caseFinancials";
import { getOrderProfitToUSDMultiplier } from "../utils/orderAccounting";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  TrendingUp,
  Wallet,
  Ship,
  Users,
  Building2,
  Package,
  PlusCircle,
  Sparkles,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Database,
  ShieldCheck,
  Send,
  Bot,
  Calendar,
  CheckSquare,
  Square,
  MessageSquare,
  Flame,
  Plus,
  GripVertical,
  RotateCcw,
  SlidersHorizontal,
  X,
  Search,
} from "lucide-react";
import { ActiveTab, AppDatabase, Language, Order, TaskItem } from "../types";
import { formatCurrency, formatNumber, toJalaliDate } from "../utils/formatters";
import { calculateProfitBreakdownUSD } from "../utils/profitCalculations";
import { getOrderCommercialTotal, getOrderPaymentSummary, getOrderQuantityMT, hasCompleteCalculationData, isExcludedFromFinancialCalculations } from "../utils/orderAccounting";
import { getCustomerList } from "../utils/partnerLists";
import { getTranslation } from "../i18n/translations";

interface DashboardOverviewProps {
  db: AppDatabase;
  language: Language;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenQuickAdd: (type: "order" | "customer" | "product" | "cash") => void;
  onOpenAI: () => void;
  onSelectOrder: (orderId: number) => void;
  onOpenAccessImport: () => void;
  onUpdateTask?: (task: TaskItem) => void;
  onSaveDashboardLayout?: (widgetIds: string[]) => void;
  onSaveDashboardHiddenWidgets?: (widgetIds: string[]) => void;
  onSaveDashboardShortcuts?: (tabs: ActiveTab[]) => void;
  onUpdateOrder?: (order: Order) => void;
}

interface SearchableFilterOption {
  value: string;
  label: string;
}

const normalizeFilterText = (value: string) => value.trim().toLocaleLowerCase("fa");

const SearchableFilter: React.FC<{
  value: string;
  options: SearchableFilterOption[];
  allLabel: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
}> = ({ value, options, allLabel, searchPlaceholder, onChange }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = value === "ALL" ? "" : options.find((option) => option.value === value)?.label || "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeFilterText(query);
    if (!normalizedQuery || query === selectedLabel) return options.slice(0, 12);
    return options.filter((option) => normalizeFilterText(option.label).includes(normalizedQuery)).slice(0, 20);
  }, [options, query, selectedLabel]);

  const selectOption = (nextValue: string, nextLabel = "") => {
    onChange(nextValue);
    setQuery(nextLabel);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <Search size={14} className="pointer-events-none absolute right-2.5 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        placeholder={value === "ALL" ? allLabel : searchPlaceholder}
        aria-label={searchPlaceholder}
        className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      {(query || value !== "ALL") && (
        <button type="button" onClick={() => selectOption("ALL")} className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="پاک کردن فیلتر" aria-label="پاک کردن فیلتر">
          <X size={13} />
        </button>
      )}
      {open && (
        <div className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          <button type="button" onClick={() => selectOption("ALL")} className={`block w-full rounded-md px-3 py-2 text-right text-xs hover:bg-indigo-50 ${value === "ALL" && !query ? "font-bold text-indigo-700" : "text-slate-700"}`}>{allLabel}</button>
          {filteredOptions.map((option) => (
            <button key={option.value} type="button" onClick={() => selectOption(option.value, option.label)} className={`block w-full rounded-md px-3 py-2 text-right text-xs hover:bg-indigo-50 ${value === option.value ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-700"}`}>{option.label}</button>
          ))}
          {filteredOptions.length === 0 && <div className="px-3 py-3 text-center text-xs text-slate-400">موردی پیدا نشد</div>}
        </div>
      )}
    </div>
  );
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  db,
  language,
  setActiveTab,
  onOpenQuickAdd,
  onOpenAI,
  onSelectOrder,
  onOpenAccessImport,
  onUpdateTask,
  onSaveDashboardLayout,
  onSaveDashboardHiddenWidgets,
  onSaveDashboardShortcuts,
  onUpdateOrder,
}) => {
  const [quickAiInput, setQuickAiInput] = useState("");
  const [selectedTaskNoteId, setSelectedTaskNoteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [overviewSupplier, setOverviewSupplier] = useState("ALL");
  const [overviewCustomer, setOverviewCustomer] = useState("ALL");
  const [overviewProduct, setOverviewProduct] = useState("ALL");
  const [overviewMode, setOverviewMode] = useState<"all" | "active" | "unpaid">("all");
  const [overviewDateSort, setOverviewDateSort] = useState<"desc" | "asc">("desc");
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [dashboardShortcuts, setDashboardShortcuts] = useState<ActiveTab[]>(db.currentUser?.dashboardShortcuts || ["proforma", "accounting", "customer_accounts", "tasks"]);
  const defaultWidgetOrder = ["ai_assistant", "quick_access", "metrics", "orders_overview", "tasks", "recent_orders", "profit_and_logistics"];
  const savedWidgetOrder = db.currentUser?.dashboardWidgets || [];
  const [widgetOrder, setWidgetOrder] = useState<string[]>([
    ...savedWidgetOrder.filter((id) => defaultWidgetOrder.includes(id)),
    ...defaultWidgetOrder.filter((id) => !savedWidgetOrder.includes(id)),
  ]);
  const [layoutEditing, setLayoutEditing] = useState(false);
  // AI is optional and intentionally starts hidden; it remains available from the widget picker.
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(db.currentUser?.dashboardHiddenWidgets ?? ["ai_assistant"]);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  const moduleProps = (id: string) => ({
    draggable: layoutEditing,
    onDragStart: () => setDraggedWidget(id),
    onDragOver: (event: React.DragEvent) => { if (layoutEditing) event.preventDefault(); },
    onDrop: () => {
      if (!draggedWidget || draggedWidget === id) return;
      const next = [...widgetOrder];
      const from = next.indexOf(draggedWidget);
      const to = next.indexOf(id);
      next.splice(from, 1);
      next.splice(to, 0, draggedWidget);
      setWidgetOrder(next);
      setDraggedWidget(null);
      onSaveDashboardLayout?.(next);
    },
    style: { order: widgetOrder.indexOf(id) },
    className: layoutEditing ? "relative cursor-move rounded-2xl ring-2 ring-indigo-300 ring-offset-2 transition-all" : "relative",
  });
  const toggleWidgetVisibility = (id: string) => {
    const next = hiddenWidgets.includes(id) ? hiddenWidgets.filter((item) => item !== id) : [...hiddenWidgets, id];
    setHiddenWidgets(next);
    onSaveDashboardHiddenWidgets?.(next);
  };

  const t = (key: any) => getTranslation(language, key);
  const shortcutCatalog: { id: ActiveTab; label: string; description: string }[] = [
    {id:"proforma",label:"پروفورما و سفارش‌ها",description:"ثبت، ویرایش و چاپ پرونده"},{id:"accounting",label:"حسابداری و سهم‌ها",description:"تسهیم، حساب اشخاص و دفتر شرکت"},{id:"customer_accounts",label:"حساب مشتریان",description:"بدهی، طلب و پرداخت‌ها"},{id:"cash",label:"صندوق و ارز",description:"گردش نقدی چندارزی"},{id:"correspondence",label:"مکاتبات اداری",description:"نامه‌های درخواست کمیسیون"},{id:"operations",label:"عملیات تجاری",description:"هزینه، قیمت و فروش داخلی"},{id:"logistics",label:"لجستیک",description:"حمل و پیگیری محموله"},{id:"customers",label:"مشتریان و تأمین‌کنندگان",description:"اطلاعات طرف‌های تجاری"},{id:"products",label:"کالاها",description:"کاتالوگ محصولات"},{id:"tasks",label:"وظایف",description:"پیگیری کارهای روزانه"},{id:"calendar",label:"تقویم",description:"موعدها و رویدادها"},{id:"backup",label:"پشتیبان‌گیری",description:"بازیابی اطلاعات"},{id:"settings",label:"تنظیمات",description:"ظاهر و تنظیمات برنامه"},
  ];
  const permittedShortcuts = shortcutCatalog.filter((item) => !db.currentUser?.permissions?.length || db.currentUser.permissions.includes(item.id) || db.currentUser.role === "superadmin");
  const toggleShortcut = (tab: ActiveTab) => { const next = dashboardShortcuts.includes(tab) ? dashboardShortcuts.filter((item) => item !== tab) : [...dashboardShortcuts, tab]; setDashboardShortcuts(next); onSaveDashboardShortcuts?.(next); };

  // Filter out dummy/excluded proformas from financial and volume metrics
  const dummyOrdersCount = db.orders.filter(isExcludedFromFinancialCalculations).length;
  const missingProfitFX = db.orders.filter(o => o.ActiveOrder && !isExcludedFromFinancialCalculations(o) && getOrderProfitToUSDMultiplier(o) === null);
  const activeFinancials = db.orders.filter(o => o.ActiveOrder).map(order => getCaseFinancials(db, order));
  const reviewOrders = activeFinancials.filter(item => ["incomplete", "missing_fx"].includes(item.status)).map(item => item.order);
  const activeOrders = activeFinancials.filter(item => item.reportable || item.status === "consolidated").map(item => item.order);
  const totalQuantityActive = activeOrders.reduce((sum, order) => sum + getOrderQuantityMT(order), 0);
  const activeSummary = summarizeCaseFinancials(db, db.orders.filter(order=>order.ActiveOrder));
  const totalMarginActive = activeSummary.totalProfitUSD;
  const totalCommissionsActive = activeSummary.commissionUSD;

  // Cash totals
  const totalUsdCash = cashCurrencyTotal(db.cashEntries,"USD");
  const totalEurCash = cashCurrencyTotal(db.cashEntries,"EUR");

  // Total sales volume calculation
  const totalSalesEstimate = activeOrders.reduce(
    (sum, order) => sum + (getCaseFinancials(db, order).invoiceTotalUSD ?? 0),
    0
  );

  // Pending prioritized tasks
  const pendingTasks = (db.tasks || [])
    .filter((task) => !task.completed)
    .sort((a, b) => {
      const pMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return pMap[b.priority] - pMap[a.priority];
    });

  // Partners share sums from all active orders
  const partnerTotals = new Map<string, { name: string; amount: number; color: string }>();
  activeFinancials.filter(row => row.reportable).forEach(row => row.usdShares.forEach(share => {
    const key = normalizePartnerName(share.name);
    const previous = partnerTotals.get(key);
    partnerTotals.set(key, { name: share.name, amount: (previous?.amount || 0) + share.amount, color: "bg-indigo-600" });
  }));
  const partnersSummary = [...partnerTotals.values()].filter(partner => Math.abs(partner.amount) > .005);
  const overviewOrders = db.orders.filter((order) => {
    if (isExcludedFromFinancialCalculations(order)) return false;
    const matchesSupplier = overviewSupplier === "ALL" || String(order.SupplierID) === overviewSupplier;
    const matchesCustomer = overviewCustomer === "ALL" || String(order.CustomerID) === overviewCustomer;
    const matchesProduct = overviewProduct === "ALL" || (order.items || []).some((item) => String(item.ProductID) === overviewProduct);
    const received = getOrderPaymentSummary(db, order).directReceipts;
    const amount = getOrderCommercialTotal(order);
    return matchesSupplier && matchesCustomer && matchesProduct && (overviewMode !== "active" || order.ActiveOrder) && (overviewMode !== "unpaid" || getOrderPaymentSummary(db, order).customerOutstanding > 0.005);
  });
  const sortedOverviewOrders = [...overviewOrders].sort((a, b) => overviewDateSort === "desc" ? (b.PIDate || "").localeCompare(a.PIDate || "") : (a.PIDate || "").localeCompare(b.PIDate || ""));
  const overviewFinancials = overviewOrders.reduce((totals, order) => {
    const financial = getCaseFinancials(db, order);
    const currency = getOrderCurrency(order);
    const amount = financial.invoiceTotalUSD ?? 0;
    const received = getOrderAmountInUSD(order, getOrderPaymentSummary(db, order).directReceipts, currency) ?? 0;
    const profit = financial.usdProfit;
    const costs = getCentralCaseLedger(db, order).relatedEntries.filter(entry => entry.OrderID === order.OrderID && entry.TransactionType === "order_expense").reduce((sum, entry) => sum + (getOrderAmountInUSD(order, transactionAmountInOrderCurrency(order, entry), currency) ?? 0), 0);
    return { invoiced: totals.invoiced + amount, received: totals.received + received, outstanding: totals.outstanding + (getOrderAmountInUSD(order, getOrderPaymentSummary(db, order).customerOutstanding, currency) ?? 0), costs: totals.costs + costs, arca: totals.arca + profit.arcaShare, partners: totals.partners + profit.totalCaseProfit - profit.bankShare - profit.arcaShare };
  }, { invoiced: 0, received: 0, outstanding: 0, costs: 0, arca: 0, partners: 0 });

  const overviewSummary = summarizeCaseFinancials(db, overviewOrders);
  overviewFinancials.arca = overviewSummary.arcatavShareUSD;
  overviewFinancials.partners = overviewSummary.ready.reduce((sum,item)=>sum+item.usdProfit.totalCaseProfit-item.usdProfit.bankShare-item.usdProfit.arcaShare,0);

  const handleToggleTask = (task: TaskItem) => {
    if (!onUpdateTask) return;
    onUpdateTask({
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
    });
  };

  const handleSaveTaskOutcome = (task: TaskItem) => {
    if (!onUpdateTask) return;
    onUpdateTask({
      ...task,
      outcomeNote: noteInput,
    });
    setSelectedTaskNoteId(null);
    setNoteInput("");
  };

  const orderLifecycleStatus = (order: Order): NonNullable<Order["LifecycleStatus"]> => order.LifecycleStatus || (order.ActiveOrder ? "active" : "completed");
  const updateOrderLifecycleStatus = (order: Order, status: NonNullable<Order["LifecycleStatus"]>) => {
    onUpdateOrder?.({
      ...order,
      LifecycleStatus: status,
      ActiveOrder: status === "active",
      OrderStatus: status === "cancelled" ? "لغو شده (Cancelled)" : status === "completed" ? "مختومه (Completed)" : status === "on_hold" ? "متوقف موقت (On Hold)" : "فعال (Active)",
    });
  };

  return (
    <div id="dashboard-overview-root" className="flex flex-col gap-5 pb-8">
      {activeSummary.partialGroups.length>0&&<p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">بخشی از اعضای {activeSummary.partialGroups.length} گروه در فیلتر فعال نیست؛ سود آن گروه‌ها بین اعضای فعال تقسیم فرضی نشده است. نتیجهٔ کامل در گروه‌های مالی مرکز حسابداری نمایش داده می‌شود.</p>}
      {/* High Density Quick Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></div>
          <span className="text-xs font-bold text-slate-800">داشبورد مدیریتی</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">| حسابداری و بازرگانی فعال</span>
          {dummyOrdersCount > 0 && (
            <span
              onClick={() => setActiveTab("proforma")}
              className="cursor-pointer text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:bg-amber-100 transition-colors"
              title="پیش‌فاکتورهای صوری/آزمایشی در محاسبات سود و فروش وارد نشده‌اند"
            >
              <span>{dummyOrdersCount} پروفرمای صوری (خارج از محاسبات)</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLayoutEditing((current) => !current)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 border ${layoutEditing ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <GripVertical size={14} />
            <span>{layoutEditing ? "پایان چیدمان" : "ویرایش چیدمان"}</span>
          </button>
          {layoutEditing && <button onClick={() => { setWidgetOrder(defaultWidgetOrder); onSaveDashboardLayout?.(defaultWidgetOrder); }} className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" title="بازگشت به چیدمان پیش‌فرض"><RotateCcw size={14}/></button>}
          <button onClick={()=>setWidgetPickerOpen(true)} className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"><SlidersHorizontal size={14}/>انتخاب ویجت‌ها</button>
          <button
            onClick={() => onOpenQuickAdd("order")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <PlusCircle size={14} />
            <span>{t("new_proforma")}</span>
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <CheckSquare size={14} />
            <span>{t("nav_tasks")} ({pendingTasks.length})</span>
          </button>
          <button
            onClick={onOpenAccessImport}
            className="border border-slate-200 text-slate-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-all flex items-center gap-1.5"
          >
            <Database size={14} className="text-indigo-600" />
            <span>دریافت اطلاعات</span>
          </button>
        </div>
      </div>

      <div {...moduleProps("quick_access")}><section className="rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">دسترسی سریع من</h2><p className="text-[11px] text-slate-500">ویجت‌های انتخاب‌شده برای کاربر فعلی</p></div><button onClick={()=>setWidgetPickerOpen(true)} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">ویرایش</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{dashboardShortcuts.map((id)=>{const item=shortcutCatalog.find((entry)=>entry.id===id);if(!item)return null;return <button key={id} onClick={()=>setActiveTab(id)} className="rounded-xl border border-slate-200 p-3 text-right transition hover:border-indigo-300 hover:bg-indigo-50"><b className="block text-xs text-slate-900">{item.label}</b><span className="mt-1 block text-[10px] text-slate-500">{item.description}</span></button>})}{dashboardShortcuts.length===0&&<button onClick={()=>setWidgetPickerOpen(true)} className="rounded-xl border border-dashed border-indigo-300 p-4 text-xs font-bold text-indigo-700">+ انتخاب اولین ویجت</button>}</div></section></div>

      {/* 4-Column High Density KPI Metrics Grid */}
      <div {...moduleProps("metrics")}><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Sales */}
        <div className="bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all">
          <div className="text-slate-500 text-xs mb-1 font-medium">ارزش سفارش‌های فعال</div>
          <div className="text-xl font-black text-slate-900 font-mono">
            {formatCurrency(totalSalesEstimate, "$")}
          </div>
          <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
            <span>↑ ۱۲٪ ماه جاری</span>
            <span className="text-slate-400 font-mono text-[10px]">({formatNumber(totalQuantityActive)} MT)</span>
          </div>
        </div>

        {/* KPI 2: Active Orders / Proformas */}
        <div className="bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all">
          <div className="text-slate-500 text-xs mb-1 font-medium">{t("nav_proforma")}</div>
          <div className="text-xl font-black text-slate-900 font-mono flex items-baseline gap-1">
            <span>{activeOrders.length}</span>
            <span className="text-xs font-normal text-slate-500 font-sans">فقره فعال</span>
          </div>
          <div className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-medium">
            <Clock size={12} />
            <span>نیاز به پیگیری و ترخیص</span>
          </div>
        </div>

        {/* KPI 3: Catalog & Suppliers */}
        <div className="bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all">
          <div className="text-slate-500 text-xs mb-1 font-medium">کالاها و طرف‌های تجاری</div>
          <div className="text-xl font-black text-slate-800 font-mono flex items-baseline gap-1">
            <span>{db.products.length}</span>
            <span className="text-xs font-normal text-slate-500 font-sans">ردیف کالا</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>{getCustomerList(db.customers, db.suppliers).length} خریدار</span>
            <span>•</span>
            <span>{db.suppliers.length} تامین‌کننده</span>
          </div>
        </div>

        {/* KPI 4: Total Financial Balance (High Density Indigo Card) */}
        <div className="bg-indigo-600 p-3.5 border border-indigo-700 rounded-xl shadow-2xs text-white">
          <div className="opacity-80 text-xs mb-1 font-medium">{t("total_margin")}</div>
          <div className="text-xl font-black font-mono">
            {formatCurrency(totalMarginActive, "$")}
          </div>
          <div className="text-xs opacity-90 mt-1 flex items-center justify-between font-mono">
            <span>نقدینگی USD: {formatCurrency(totalUsdCash, "$")}</span>
          </div>
        </div>
      </div></div>

      {missingProfitFX.length > 0 && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{missingProfitFX.length} پرونده فاقد نرخ تبدیل سود به USD است و در جمع دلاری سود لحاظ نشده است؛ نرخ دلار را در سود و پورسانت ثبت کنید.</p>}
      {reviewOrders.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-2xs"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertCircle size={17}/>پرونده‌های نیازمند بررسی پیش از محاسبه</h2><p className="mt-1 text-[11px] text-amber-800">این پرونده‌ها به دلیل اطلاعات ناقص یا نرخ تبدیل نامشخص در جمع سود USD لحاظ نشده‌اند. زیان‌های معتبر در جمع محاسبه می‌شوند.</p></div><span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-bold text-amber-900">{reviewOrders.length} پرونده</span></div><div className="mt-3 max-h-44 overflow-auto rounded-lg border border-amber-200 bg-white"><table className="w-full text-right text-xs"><thead className="sticky top-0 bg-amber-50 text-amber-900"><tr><th className="p-2">PI</th><th>مشتری</th><th>علت بررسی</th><th>سود محاسبه‌شده</th><th>وضعیت</th></tr></thead><tbody>{reviewOrders.map((order) => { const profit = getCaseFinancials(db, order).usdProfit.totalCaseProfit; const reason = getCaseFinancials(db, order).statusLabel; return <tr key={order.OrderID} onClick={() => onSelectOrder(order.OrderID)} className="cursor-pointer border-t border-amber-100 hover:bg-amber-50"><td className="p-2 font-mono font-bold text-indigo-700">{order.ProformaInvoiceID}</td><td>{order.CustomerName || "—"}</td><td className="text-amber-800">{reason}</td><td className="font-mono text-rose-700">{formatCurrency(profit, "$")}</td><td onClick={(event)=>event.stopPropagation()}><button onClick={()=>onUpdateOrder?.({...order,ActiveOrder:!order.ActiveOrder,LifecycleStatus:order.ActiveOrder?"completed":"active",OrderStatus:order.ActiveOrder?"مختومه (Completed)":"فعال (Active)"})} className={`rounded px-2 py-1 text-[10px] font-bold ${order.ActiveOrder?"bg-emerald-100 text-emerald-800":"bg-slate-200 text-slate-700"}`}>{order.ActiveOrder?"فعال":"غیرفعال"}</button></td></tr>; })}</tbody></table></div></section>}

      <section {...moduleProps("orders_overview")}><div className="rounded-xl border border-indigo-200 bg-white shadow-2xs overflow-hidden">
        <div className="border-b border-indigo-100 bg-indigo-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-indigo-950">Overview سفارش‌ها و مطالبات</h2><InlineHelp><p className="mt-1 text-[11px] text-indigo-700">مانده مشتری = مبلغ PI − تمام دریافت‌های ثبت‌شده در دفاتر شرکت</p></InlineHelp></div><div className="flex items-center gap-2"><button onClick={()=>setOverviewDateSort(current=>current === "desc" ? "asc" : "desc")} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800">تاریخ: {overviewDateSort === "desc" ? "جدیدترین" : "قدیمی‌ترین"}</button><div className="flex rounded-lg border border-indigo-200 bg-white p-1 text-xs">{([['all','همه'],['active','فعال'],['unpaid','دریافت‌نشده']] as const).map(([id,label])=><button key={id} onClick={()=>setOverviewMode(id)} className={`rounded-md px-2.5 py-1.5 ${overviewMode===id?'bg-indigo-600 text-white font-bold':'text-slate-600'}`}>{label}</button>)}</div></div></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><SearchableFilter value={overviewSupplier} onChange={setOverviewSupplier} allLabel="همه تأمین‌کنندگان" searchPlaceholder="جستجوی تأمین‌کننده" options={db.suppliers.map(item=>({value:String(item.SupplierID),label:item.SupplierName}))}/><SearchableFilter value={overviewCustomer} onChange={setOverviewCustomer} allLabel="همه مشتریان" searchPlaceholder="جستجوی خریدار" options={getCustomerList(db.customers, db.suppliers).map(item=>({value:String(item.CustomerID),label:item.CustomerName}))}/><SearchableFilter value={overviewProduct} onChange={setOverviewProduct} allLabel="همه کالاها" searchPlaceholder="جستجوی کالا" options={db.products.map(item=>({value:String(item.ProductID),label:item.ProductName}))}/></div></div>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-5 text-xs"><div><span className="text-slate-500">ارزش PI</span><b className="mt-1 block font-mono">{formatCurrency(overviewFinancials.invoiced,'$')}</b></div><div><span className="text-slate-500">دریافت مشتری</span><b className="mt-1 block font-mono text-emerald-700">{formatCurrency(overviewFinancials.received,'$')}</b></div><div><span className="text-slate-500">مانده طلب</span><b className="mt-1 block font-mono text-rose-700">{formatCurrency(overviewFinancials.outstanding,'$')}</b></div><div><span className="text-slate-500">سهم آرکا</span><b className="mt-1 block font-mono text-indigo-700">{formatCurrency(overviewFinancials.arca,'$')}</b></div><div><span className="text-slate-500">سهم شرکا</span><b className="mt-1 block font-mono text-purple-700">{formatCurrency(overviewFinancials.partners,'$')}</b></div></div>
        <div className="max-h-64 overflow-auto border-t border-slate-100"><table className="w-full text-right text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="p-2.5">PI</th><th>تاریخ</th><th>مشتری</th><th>تأمین‌کننده</th><th>مبلغ</th><th>دریافتی</th><th>مانده / اعتبار</th><th>وضعیت مالی</th>{overviewMode==='all'&&<th>وضعیت سفارش</th>}</tr></thead><tbody>{sortedOverviewOrders.map(order=>{const amount=getOrderCommercialTotal(order);const payment=getOrderPaymentSummary(db,order);const shownBalance=payment.availableCredit>0?payment.availableCredit:payment.temporaryDebt>0?payment.temporaryDebt:payment.customerOutstanding;return <tr key={order.OrderID} onClick={()=>onSelectOrder(order.OrderID)} className="cursor-pointer border-t hover:bg-indigo-50"><td className="p-2.5 font-mono font-bold text-indigo-700">{order.ProformaInvoiceID}</td><td className="font-mono">{order.PIDate}</td><td>{order.CustomerName}{order.TradeOwnership === "own_account" && <span className="block text-[10px] text-violet-700">به حساب: {db.cashPartners.find((party) => party.id === order.EconomicOwnerPartyId)?.name || "مالک پرونده"}</span>}</td><td>{order.SupplierName}</td><td>{formatCurrency(amount,'$')}</td><td className="text-emerald-700">{formatCurrency(payment.directReceipts,'$')}</td><td className={`font-bold ${payment.availableCredit>0?'text-blue-700':payment.temporaryDebt>0?'text-amber-700':'text-rose-700'}`}>{formatCurrency(shownBalance,'$')}</td><td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${payment.status==='debtor'?'bg-rose-50 text-rose-700':payment.status==='temporary_debt'?'bg-amber-50 text-amber-700':payment.status==='creditor'?'bg-blue-50 text-blue-700':'bg-emerald-50 text-emerald-700'}`}>{payment.status==='debtor'?'بدهکار':payment.status==='temporary_debt'?'بدهی امانی':payment.status==='creditor'?'طلبکار':'تسویه'}</span></td>{overviewMode==='all'&&<td onClick={(event)=>event.stopPropagation()}><select value={orderLifecycleStatus(order)} onChange={(event)=>updateOrderLifecycleStatus(order,event.target.value as NonNullable<Order["LifecycleStatus"]>)} className="rounded-md border border-slate-200 bg-white p-1.5 text-[10px] font-bold"><option value="active">فعال</option><option value="on_hold">متوقف موقت</option><option value="completed">مختومه</option><option value="cancelled">کنسل‌شده</option></select></td>}</tr>})}</tbody></table>{overviewOrders.length===0&&<p className="p-5 text-center text-xs text-slate-400">سفارشی با این فیلتر وجود ندارد.</p>}</div>
      </div></section>

      {/* Task List Widget for Landing Page (High Priority Request) */}
      <div {...moduleProps("tasks")}><div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-purple-50 text-purple-700">
              <CheckSquare size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>وظایف روزانه</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-mono font-bold">
                  {pendingTasks.length} وظیفه فعال
                </span>
              </h3>
              <InlineHelp><p className="text-[11px] text-slate-400">
                تسک‌های روزانه و اولویت‌دار؛ با زدن چک‌مارک از لیست خارج شده و نتیجه ثبت می‌شود
              </p></InlineHelp>
            </div>
          </div>

          <button
            onClick={() => setActiveTab("tasks")}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
          >
            <span>{t("nav_tasks")} ↵</span>
          </button>
        </div>

        {pendingTasks.length === 0 ? (
          <div className="p-4 text-center text-xs text-emerald-700 bg-emerald-50 rounded-lg flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />
            <span>تمام تسک‌های امروز با موفقیت تکمیل شده‌اند!</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition-all flex flex-col justify-between gap-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                      title={t("mark_done")}
                    >
                      <Square size={16} />
                    </button>
                    <div>
                      <div className="font-bold text-slate-900 leading-snug">{task.title}</div>
                      {task.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {task.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        task.priority === "HIGH"
                          ? "bg-rose-100 text-rose-700"
                          : task.priority === "MEDIUM"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {task.priority === "HIGH" ? "فوری" : task.priority === "MEDIUM" ? "متوسط" : "عادی"}
                    </span>
                  </div>
                </div>

                {/* Outcome note display or edit */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <Clock size={11} className="text-slate-400" />
                    <span>{task.dueDate ? toJalaliDate(task.dueDate) : "امروز"}</span>
                    {task.assignedToName && (
                      <span className="text-indigo-600 font-sans">({task.assignedToName})</span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setSelectedTaskNoteId(task.id);
                      setNoteInput(task.outcomeNote || "");
                    }}
                    className="text-[11px] text-purple-700 hover:text-purple-900 font-medium flex items-center gap-1"
                  >
                    <MessageSquare size={11} />
                    <span>{task.outcomeNote ? "ویرایش نتیجه" : "ثبت نتیجه / نوت"}</span>
                  </button>
                </div>

                {/* In-line note input when opened */}
                {selectedTaskNoteId === task.id && (
                  <div className="pt-2 flex items-center gap-1.5 animate-scale-in">
                    <input
                      type="text"
                      placeholder="اعلام نتیجه کار یا یادداشت..."
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      className="w-full bg-white border border-purple-200 rounded p-1 text-xs outline-none"
                    />
                    <button
                      onClick={() => handleSaveTaskOutcome(task)}
                      className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[11px] font-bold shrink-0"
                    >
                      {t("save")}
                    </button>
                    <button
                      onClick={() => setSelectedTaskNoteId(null)}
                      className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-[11px]"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div></div>

      {widgetPickerOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={()=>setWidgetPickerOpen(false)}><div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event)=>event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">انتخاب ویجت‌های داشبورد</h2><InlineHelp><p className="text-xs text-slate-500">نمایش هر ویجت و میانبر برای حساب شما ذخیره می‌شود.</p></InlineHelp></div><button onClick={()=>setWidgetPickerOpen(false)} className="rounded-lg bg-slate-100 p-2"><X size={18}/></button></div><div className="mb-4 rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><div><b className="text-xs">دستیار هوشمند</b><p className="mt-1 text-[10px] text-slate-500">نمایش یا پنهان‌سازی ویجت دستیار در داشبورد</p></div><button onClick={()=>toggleWidgetVisibility("ai_assistant")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${hiddenWidgets.includes("ai_assistant")?"bg-slate-100 text-slate-600":"bg-indigo-600 text-white"}`}>{hiddenWidgets.includes("ai_assistant")?"نمایش بده":"در حال نمایش"}</button></div></div><div className="grid gap-2 sm:grid-cols-2">{permittedShortcuts.map((item)=>{const selected=dashboardShortcuts.includes(item.id);return <button key={item.id} onClick={()=>toggleShortcut(item.id)} className={`rounded-xl border p-3 text-right ${selected?"border-indigo-400 bg-indigo-50":"border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between"><b className="text-xs">{item.label}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected?"bg-indigo-600 text-white":"bg-slate-100 text-slate-500"}`}>{selected?"انتخاب شده":"افزودن"}</span></div><p className="mt-1 text-[10px] text-slate-500">{item.description}</p></button>})}</div><button onClick={()=>setWidgetPickerOpen(false)} className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white">پایان و ذخیره</button></div></div>}

      {/* Recent orders: each row opens its related case directly. */}
      <div {...moduleProps("recent_orders")}><div className="grid grid-cols-1 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-xs text-slate-800">آخرین سفارش‌ها و پیش‌فاکتورها</h3>
              <p className="text-[11px] text-slate-400">فهرست پیش‌فاکتورهای در جریان و وضعیت مالی</p>
            </div>
            <button
              onClick={() => setActiveTab("proforma")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <span>مشاهده همه</span>
              <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 font-medium">
                <tr className="h-8">
                  <th className="px-3 font-medium">شماره PI</th>
                  <th className="px-3 font-medium">نام مشتری</th>
                  <th className="px-3 font-medium">مبلغ کل</th>
                  <th className="px-3 font-medium">مارجین</th>
                  <th className="px-3 font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeOrders.slice(0, 5).map((order) => {
                  const marginTotal = getCaseFinancials(db, order).usdProfit.totalCaseProfit;
                  const extPriceTotal = getOrderCommercialTotal(order);

                  return (
                    <tr key={order.OrderID} onClick={() => { setActiveTab("proforma"); onSelectOrder(order.OrderID); }} className="h-10 cursor-pointer hover:bg-indigo-50/80 transition-colors" title="برای مشاهده و ویرایش پرونده کلیک کنید">
                      <td className="px-3 font-mono font-medium text-indigo-700">
                        {order.ProformaInvoiceID}
                      </td>
                      <td className="px-3 font-medium text-slate-800">
                        <div className="max-w-[130px] truncate">{order.CustomerName}</div>
                      </td>
                      <td className="px-3 font-mono font-semibold text-slate-800">
                        {formatCurrency(extPriceTotal, order.InvoiceCurrency || "$")}
                      </td>
                      <td className="px-3 font-mono font-semibold text-emerald-700">
                        +{formatCurrency(marginTotal, "$")}
                      </td>
                      <td className="px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            order.BuyerPaid
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {order.BuyerPaid ? "تسویه کامل" : "در انتظار واریز"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div></div>

      {!hiddenWidgets.includes("ai_assistant") && <div {...moduleProps("ai_assistant")}>
        {/* Independent dashboard assistant widget; it can be moved in layout mode. */}
        <div className="bg-slate-900 rounded-xl shadow-2xs flex flex-col text-white border border-slate-800 overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
              <h3 className="font-bold text-xs">دستیار هوشمند</h3>
            </div>
            <button
              onClick={onOpenAI}
              className="text-[10px] bg-indigo-600/40 hover:bg-indigo-600 text-indigo-200 hover:text-white px-2 py-0.5 rounded transition-all"
            >
              باز کردن دستیار
            </button>
          </div>

          <div className="flex-1 p-3 space-y-2.5 text-xs overflow-y-auto max-h-[240px]">
            <div className="bg-slate-800 p-2 rounded-lg border-r-2 border-indigo-500">
              <p className="opacity-90 leading-relaxed text-[11px]">
                سلام! من دستیار هوش مصنوعی حسابداری و بازرگانی شما هستم. می‌توانم فاکتور جدید ثبت کنم، نرخ‌های تسعیر را حساب کنم یا گزارش تراز تهیه کنم.
              </p>
            </div>

            <div className="bg-indigo-600/20 p-2 rounded-lg text-left border border-indigo-500/30">
              <p className="leading-relaxed text-[11px] text-indigo-200">
                سود کل سفارشات فعال و وضعیت تسویه‌ها را بررسی کن.
              </p>
            </div>

            <div className="bg-slate-800 p-2 rounded-lg border-r-2 border-indigo-500">
              <p className="opacity-90 leading-relaxed text-[11px]">
                سود ناخالص سفارشات برابر <span className="font-mono text-emerald-400 font-bold">{formatCurrency(totalMarginActive, "$")}</span> و کل پورسانت‌ها <span className="font-mono text-indigo-300 font-bold">{formatCurrency(totalCommissionsActive, "$")}</span> است.
              </p>
            </div>
          </div>

          <div className="p-2 bg-slate-950/70 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (quickAiInput.trim()) {
                  onOpenAI();
                }
              }}
              className="relative"
            >
              <input
                type="text"
                placeholder="دستور هوش مصنوعی (مثلاً: ثبت پیش‌فاکتور جدید)..."
                value={quickAiInput}
                onChange={(e) => setQuickAiInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md py-1.5 pr-2.5 pl-7 text-xs text-slate-200 outline-none focus:border-indigo-500 placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300 text-xs font-bold"
              >
                ↵
              </button>
            </form>
          </div>
        </div>
      </div>}

      {/* Secondary Row: Partner Shares & Logistics Fast Follow-Up */}
      <div {...moduleProps("profit_and_logistics")}><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Partner Commission Radar (AccQ) */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-3.5 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-xs text-slate-800">تسهیم سود و پورسانت شرکا</h4>
              <p className="text-[10px] text-slate-400">سهم دریافتی مدیران و شرکا از سفارشات در جریان</p>
            </div>
            <button
              onClick={() => setActiveTab("accounting")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              جدول حسابداری ↵
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {partnersSummary.map((p, idx) => (
              <div key={idx} className="p-2 rounded-md bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium truncate">{p.name}</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(p.amount, "$")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logistics Fast Pipeline (FollowUpF) */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-3.5 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Ship className="text-indigo-600" size={15} />
              <div>
                <h4 className="font-bold text-xs text-slate-800">وضعیت کانتینرها و اسناد حمل</h4>
                <InlineHelp><p className="text-[10px] text-slate-400">بارنامه‌های فعال و تاریخ‌های تخمینی رسیدن کالا (ETA)</p></InlineHelp>
              </div>
            </div>
            <button
              onClick={() => setActiveTab("calendar")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <Calendar size={13} />
              <span>تقویم پیگیری ↵</span>
            </button>
          </div>

          <div className="space-y-2">
            {activeOrders.slice(0, 3).map((order) => (
              <div
                key={order.OrderID}
                onClick={() => setActiveTab("logistics")}
                className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50/40 border border-slate-200/80 transition-all cursor-pointer flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-indigo-700">{order.ProformaInvoiceID}</div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{order.CustomerName}</div>
                </div>
                <div className="text-left">
                  <div className="font-mono text-[10px] text-slate-600">B/L: {order.BLNo || "در انتظار"}</div>
                  <div className="text-[10px] text-amber-700 font-medium">ETA: {order.ETA ? toJalaliDate(order.ETA) : "در انتظار"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div></div>
    </div>
  );
};
