import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Calculator,
  Wallet,
  Users,
  Package,
  BadgeDollarSign,
  Ship,
  Store,
  Database,
  ShieldCheck,
  Bot,
  PlusCircle,
  DownloadCloud,
  ChevronLeft,
  CheckSquare,
  Calendar as CalendarIcon,
  UserCheck,
  Globe,
  Sparkles,
  Settings,
  ReceiptText,
  LogOut,
  Building2,
  Boxes,
  Wrench,
  BarChart3,
  FileBarChart,
  MailCheck,
} from "lucide-react";
import { ActiveTab, AppDatabase, Language, AppUser } from "../types";
import { getTranslation } from "../i18n/translations";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onPreloadTab?: (tab: ActiveTab) => void;
  language: Language;
  onToggleLanguage: () => void;
  currentUser?: AppUser;
  rolePermissions?: AppDatabase["rolePermissions"];
  onOpenQuickAdd: (type: "order" | "customer" | "product" | "cash") => void;
  onOpenAI: () => void;
  onOpenAccessImport: () => void;
  onQuickBackup: () => void;
  db: AppDatabase;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onPreloadTab,
  language,
  onToggleLanguage,
  currentUser,
  rolePermissions,
  onOpenQuickAdd,
  onOpenAI,
  onOpenAccessImport,
  onQuickBackup,
  db,
  isOpen,
  setIsOpen,
  onLogout,
}) => {
  const t = (key: any) => getTranslation(language, key);

  const activeOrdersCount = db.orders.filter((o) => o.ActiveOrder).length;
  const inTransitCount = db.orders.filter(
    (o) => o.ActiveOrder && (o.OrderStatus?.includes("مسیر") || o.OrderStatus?.includes("گمرک"))
  ).length;
  const pendingTasksCount = (db.tasks || []).filter((t) => !t.completed).length;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  type NavItem = {
    id: ActiveTab;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: number;
    badgeColor?: string;
  };

  const navItems: NavItem[] = [
    {
      id: "dashboard" as ActiveTab,
      label: t("nav_dashboard"),
      subtitle: t("nav_dashboard_sub"),
      icon: LayoutDashboard,
    },
    {
      id: "proforma" as ActiveTab,
      label: t("nav_proforma"),
      subtitle: t("nav_proforma_sub"),
      icon: FileSpreadsheet,
      badge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
      badgeColor: "bg-blue-600",
    },
    {
      id: "tasks" as ActiveTab,
      label: t("nav_tasks"),
      subtitle: t("nav_tasks_sub"),
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
      badgeColor: "bg-purple-600",
    },
    {
      id: "calendar" as ActiveTab,
      label: t("nav_calendar"),
      subtitle: t("nav_calendar_sub"),
      icon: CalendarIcon,
    },
    {
      id: "outlook_center" as ActiveTab,
      label: language === "fa" ? "منشی هوشمند" : "Executive assistant",
      subtitle: language === "fa" ? "ایمیل، تقویم، حمل و قیمت‌ها" : "Email, calendar, logistics & prices",
      icon: MailCheck,
    },
    {
      id: "accounting" as ActiveTab,
      label: language === "fa" ? "مرکز حسابداری" : "Accounting center",
      subtitle: language === "fa" ? "دفاتر پرونده، سود و زیان و سهم‌ها" : "Case ledgers, P&L and shares",
      icon: Calculator,
    },
    {
      id: "company_finance" as ActiveTab,
      label: language === "fa" ? "دفتر مالی براکم / اروین" : "Berakem / Arovin finance",
      subtitle: language === "fa" ? "دفاتر مستقل شرکت‌های زیرمجموعه" : "Independent subsidiary books",
      icon: Building2,
    },
    {
      id: "business_accounting_preview" as ActiveTab,
      label: language === "fa" ? "حسابداری آزمایشی" : "Accounting preview",
      subtitle: language === "fa" ? "رابط Business Suite با دادهٔ مشترک" : "Business Suite UI on shared data",
      icon: ReceiptText,
    },
    {
      id: "cash" as ActiveTab,
      label: t("nav_cash"),
      subtitle: t("nav_cash_sub"),
      icon: Wallet,
    },
    {
      id: "customers" as ActiveTab,
      label: t("nav_customers"),
      subtitle: t("nav_customers_sub"),
      icon: Users,
      badge: db.customers.length,
      badgeColor: "bg-emerald-600",
    },
    {
      id: "products" as ActiveTab,
      label: t("nav_products"),
      subtitle: t("nav_products_sub"),
      icon: Package,
      badge: db.products.length,
    },
    {
      id: "logistics" as ActiveTab,
      label: t("nav_logistics"),
      subtitle: t("nav_logistics_sub"),
      icon: Ship,
      badge: inTransitCount > 0 ? inTransitCount : undefined,
      badgeColor: "bg-amber-600",
    },
    {
      id: "correspondence" as ActiveTab,
      label: language === "fa" ? "مکاتبات اداری" : "Office correspondence",
      subtitle: language === "fa" ? "نامه‌های درخواست کمیسیون" : "Commission request letters",
      icon: FileSpreadsheet,
    },
    {
      id: "customer_accounts" as ActiveTab,
      label: language === "fa" ? "حساب مشتریان" : "Customer accounts",
      subtitle: language === "fa" ? "بدهی، طلب، پرداخت‌ها و پرونده‌ها" : "Debt, credit, payments & orders",
      icon: BadgeDollarSign,
    },
    {
      id: "operations" as ActiveTab,
      label: language === "fa" ? "عملیات تجاری" : "Commercial operations",
      subtitle: language === "fa" ? "قیمت، هزینه و فروش داخلی" : "Prices, costs & local sales",
      icon: ReceiptText,
    },
    {
      id: "analytics" as ActiveTab,
      label: language === "fa" ? "بررسی آماری سفارش‌ها" : "Order analytics",
      subtitle: language === "fa" ? "روند مشتری، کالا و دوره‌های سفارش" : "Customer, product and order trends",
      icon: BarChart3,
    },
    {
      id: "reports" as ActiveTab,
      label: language === "fa" ? "مرکز گزارش‌گیری" : "Reports center",
      subtitle: language === "fa" ? "گزارش مدیریتی، سفارش، مشتری و کالا" : "Executive, order, customer and product reports",
      icon: FileBarChart,
    },
    {
      id: "users" as ActiveTab,
      label: t("nav_users"),
      subtitle: t("nav_users_sub"),
      icon: UserCheck,
    },
    {
      id: "access_import" as ActiveTab,
      label: language === "fa" ? "ورود اطلاعات از Access" : "Import from Access",
      subtitle: language === "fa" ? "انتقال اطلاعات سیستم قدیمی" : "Import legacy system data",
      icon: Database,
    },
    {
      id: "backup" as ActiveTab,
      label: t("nav_backup"),
      subtitle: t("nav_backup_sub"),
      icon: ShieldCheck,
    },
    {
      id: "settings" as ActiveTab,
      label: language === "fa" ? "تنظیمات" : "Settings",
      subtitle: language === "fa" ? "ظاهر و تنظیمات برنامه" : "Appearance and app settings",
      icon: Settings,
    },
    {
      id: "access_entry_preview" as ActiveTab,
      label: language === "fa" ? "ثبت سریع پروفورما" : "Quick proforma entry",
      subtitle: language === "fa" ? "متصل به پرونده‌ها و حسابداری" : "Shared cases and accounting",
      icon: Wrench,
    },
    {
      id: "optimized_workspace_preview" as ActiveTab,
      label: language === "fa" ? "نسخهٔ جدید برنامه" : "New version",
      subtitle: language === "fa" ? "محیط جدید با اطلاعات مشترک" : "Experimental workspace with live data",
      icon: Calculator,
    },
    {
      id: "accounting_reference_preview" as ActiveTab,
      label: language === "fa" ? "صفحه مرجع حسابداری" : "Accounting reference preview",
      subtitle: language === "fa" ? "ورود یکپارچه اطلاعات واقعی پرونده" : "Unified live case workspace",
      icon: Calculator,
    },
    {
      id: "profit_calculator_preview" as ActiveTab,
      label: language === "fa" ? "فرم آزمایشی سود" : "Profit calculator preview",
      subtitle: language === "fa" ? "محاسبه ساده و مستقل سود پرونده" : "Simple standalone case profit calculator",
      icon: Calculator,
    },
    {
      id: "cheque_issuer" as ActiveTab,
      label: language === "fa" ? "صدور چک BMO" : "BMO cheque issuer",
      subtitle: language === "fa" ? "چاپ مستقل روی برگهٔ چک" : "Standalone cheque printing",
      icon: FileSpreadsheet,
    },
  ];

  const navGroups: Array<{ id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tabs: ActiveTab[]; advanced?: boolean }> = [
    {
      id: "daily",
      label: language === "fa" ? "کار روزانه" : "Daily work",
      icon: LayoutDashboard,
      tabs: ["dashboard", "proforma", "tasks", "calendar"],
    },
    {
      id: "finance",
      label: language === "fa" ? "حسابداری و مالی" : "Accounting & finance",
      icon: BadgeDollarSign,
      tabs: ["accounting", "company_finance", "customer_accounts", "cash"],
    },
    {
      id: "operations",
      label: language === "fa" ? "عملیات و گزارش‌ها" : "Operations & reports",
      icon: ReceiptText,
      tabs: ["operations", "logistics", "analytics", "reports"],
    },
    {
      id: "master-data",
      label: language === "fa" ? "اطلاعات پایه" : "Master data",
      icon: Boxes,
      tabs: ["customers", "products"],
    },
    {
      id: "correspondence",
      label: language === "fa" ? "مکاتبات و ارتباطات" : "Correspondence & communication",
      icon: MailCheck,
      tabs: ["outlook_center", "correspondence"],
    },
    {
      id: "administration",
      label: language === "fa" ? "تنظیمات و مدیریت سیستم" : "Settings & administration",
      icon: Settings,
      tabs: ["settings", "users", "backup", "access_import"],
      advanced: true,
    },
    {
      id: "private-tools",
      label: language === "fa" ? "ابزارهای شخصی" : "Private tools",
      icon: Wrench,
      tabs: ["cheque_issuer"],
      advanced: true,
    },
    {
      id: "experimental",
      label: language === "fa" ? "ابزارهای آزمایشی" : "Experimental tools",
      icon: Wrench,
      tabs: ["optimized_workspace_preview", "accounting_reference_preview", "business_accounting_preview", "access_entry_preview", "profit_calculator_preview"],
      advanced: true,
    },
  ];
  const activeGroupId = navGroups.find(group => group.tabs.includes(activeTab))?.id;
  useEffect(() => {
    if (activeGroupId) setExpandedGroups(previous => ({ ...previous, [activeGroupId]: true }));
  }, [activeTab, activeGroupId]);
  const defaultPermissions: Record<string, ActiveTab[]> = {
    superadmin: navItems.map((item) => item.id),
    sales_manager: ["dashboard", "outlook_center", "proforma", "tasks", "calendar", "customers", "products", "logistics", "analytics", "reports"],
    accountant: ["dashboard", "accounting", "business_accounting_preview", "customer_accounts", "correspondence", "cash", "operations", "tasks", "reports"],
    logistics: ["dashboard", "outlook_center", "logistics", "tasks", "calendar"],
    sales_rep: ["dashboard", "proforma", "tasks", "customers", "products"],
  };
  const isChequeIssuerAdmin = currentUser?.id === "u_admin" || currentUser?.username.trim().toLowerCase() === "hesam";
  const configuredTabs = currentUser?.permissions || rolePermissions?.[currentUser?.role || "sales_rep"] || defaultPermissions[currentUser?.role || "sales_rep"];
  const guaranteedTabs: ActiveTab[] = currentUser?.role === "superadmin"
    ? ["settings", "customer_accounts", "correspondence", "outlook_center", "profit_calculator_preview", "optimized_workspace_preview", "accounting_reference_preview", "company_finance"]
    : ["sales_manager", "logistics"].includes(currentUser?.role || "") ? ["settings", "outlook_center"] : ["settings"];
  const allowedTabs = [...configuredTabs, ...guaranteedTabs.filter((tab) => !configuredTabs.includes(tab)), ...(isChequeIssuerAdmin ? ["cheque_issuer" as ActiveTab] : [])];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main Sidebar */}
      <aside
        id="app-sidebar"
        className={`fixed lg:static inset-y-0 ${language === "fa" ? "right-0" : "left-0"} z-40 w-68 bg-slate-950 text-slate-300 flex flex-col border-${language === "fa" ? "l" : "r"} border-slate-800 transition-transform duration-300 ease-in-out ${
          isOpen
            ? "translate-x-0"
            : language === "fa"
            ? "translate-x-full lg:translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* App Logo & Header */}
        <div data-sidebar-header className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/95 p-1 flex items-center justify-center shadow-md">
              <img src="/arcatav-logo.png" alt="ARCATAV" className="h-full w-full object-contain" />
            </div>
            <div data-sidebar-brand-name>
              <div className="text-white text-sm font-bold leading-none tracking-wide">
                ARCATAV
              </div>
              <div className="text-slate-500 text-[10px] leading-tight mt-1">
                {language === "fa" ? "مدیریت بازرگانی" : "Commercial management"}
              </div>
            </div>
          </div>

          <button
            onClick={onToggleLanguage}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono border border-slate-700 transition-all"
            title="تغییر زبان / Switch Language"
          >
            <Globe size={12} />
            <span className="font-bold">{language.toUpperCase()}</span>
          </button>
        </div>

        {/* Quick Action Button */}
        <div data-sidebar-quick className="px-3 pt-3 pb-2">
          <button
            onClick={() => {
              onOpenQuickAdd("order");
              setIsOpen(false);
            }}
            title={t("new_proforma")} aria-label={t("new_proforma")}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-98"
          >
            <PlusCircle size={15} />
            <span data-sidebar-action-label>{t("new_proforma")}</span>
          </button>
        </div>

        {/* Navigation Items */}
        <nav data-sidebar-nav aria-label={language === "fa" ? "منوی اصلی" : "Main navigation"} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 py-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {navGroups.map((group) => {
            const visibleItems = group.tabs
              .map((tab) => navItems.find((item) => item.id === tab))
              .filter((item): item is NavItem => Boolean(item && allowedTabs.includes(item.id)))
              .filter((item) => currentUser?.role === "superadmin" || !["users", "access_entry_preview", "company_finance"].includes(item.id));
            if (!visibleItems.length) return null;
            const isExpanded = expandedGroups[group.id] ?? visibleItems.some((item) => item.id === activeTab);
            return (
              <section data-sidebar-group={group.id} key={group.id} className="mb-3">
                <button data-sidebar-group-heading type="button" title={group.label} aria-label={group.label} onClick={() => setExpandedGroups((value) => ({ ...value, [group.id]: !isExpanded }))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-slate-200" aria-expanded={isExpanded} aria-controls={`sidebar-group-${group.id}`}>
                  <group.icon size={14} />
                  <span data-sidebar-group-label>{group.label}</span>
                  <ChevronLeft data-sidebar-group-arrow size={12} className={`ms-auto shrink-0 transition-transform ${isExpanded ? "-rotate-90" : ""}`} />
                </button>
                <div id={`sidebar-group-${group.id}`} data-sidebar-group-items className={`space-y-0.5 ${isExpanded ? "" : "sidebar-group-collapsed"}`}>

                  {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                data-nav-item="true"
                data-nav-active={isActive ? "true" : "false"}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsOpen(false);
                }}
                onPointerEnter={() => onPreloadTab?.(item.id)}
                onFocus={() => onPreloadTab?.(item.id)}
                onPointerDown={() => onPreloadTab?.(item.id)}
                title={`${item.label}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                aria-label={item.label}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                  isActive
                    ? "bg-white/10 text-white font-bold"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    size={16}
                    className={isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"}
                  />
                  <div data-sidebar-item-label className="text-right truncate">
                    <div className="leading-snug">{item.label}</div>
                  </div>
                </div>

                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full text-white ${
                      item.badgeColor || "bg-slate-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
                  })}
                </div>
              </section>
            );
          })}
        </nav>

        <div data-sidebar-account className="px-3 py-3 border-t border-slate-800">
          {currentUser && (
            <div data-sidebar-user className="flex items-center gap-2.5 px-2 pb-2.5">
              <div className="w-8 h-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-white font-bold text-[11px] truncate">
                  {language === "fa" ? currentUser.name : currentUser.nameEn || currentUser.name}
                </div>
                <div className="text-slate-500 text-[10px] truncate">{currentUser.role}</div>
              </div>
            </div>
          )}
          <button
            title={language === "fa" ? "خروج از حساب" : "Sign out"}
            aria-label={language === "fa" ? "خروج از حساب" : "Sign out"}
            onClick={() => { onLogout(); setIsOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all text-slate-300 hover:bg-rose-950/30 hover:text-rose-200"
          >
            <LogOut size={16} className="text-slate-400" />
            <span data-sidebar-action-label>{language === "fa" ? "خروج از حساب" : "Sign out"}</span>
          </button>
        </div>

        {/* AI Assistant */}
        <div data-sidebar-ai className="px-3 pb-3">
          <button
            onClick={() => {
              onOpenAI();
              setIsOpen(false);
            }}
            title={t("nav_ai")} aria-label={t("nav_ai")}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg p-2 text-xs flex items-center justify-between text-slate-300 hover:text-white transition-all"
          >
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-indigo-400" />
              <span data-sidebar-action-label className="font-bold">{t("nav_ai")}</span>
            </div>
            <Sparkles size={13} className="text-indigo-400" />
          </button>
        </div>
      </aside>
    </>
  );
};
