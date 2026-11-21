import { IntegratedModuleHub } from "./components/IntegratedModuleHub";
import { InterfaceVersionSwitch } from "./components/InterfaceVersionSwitch";
import { readInterfaceVersion, saveInterfaceVersion, INTERFACE_VERSION_KEY } from "./utils/interfaceVersion";
import { WorkspaceAppearance } from "./components/WorkspaceAppearance";
import { WorkspaceLayoutPicker } from "./components/WorkspaceLayoutPicker";
import { useWorkspaceAppearance } from "./components/WorkspaceAppearance";
import { FooterClock } from "./components/FooterClock";
import { confirmListProfitSettlement } from "./utils/listSettlement";
import { validateFinancialGroups } from "./utils/financialGroups";
import type { WorkbenchEditorSection } from "./components/AccountingWorkbenchPreview";
import { normalizePartyDatabase } from "./utils/partyNormalization";
import { validatePaymentFunding } from "./utils/paymentFunding";
import { getPartyDirectory, saveDirectoryParty } from "./utils/partyDirectory";
import { PartyDirectoryProvider } from "./components/PartyDirectory";
import { CompanyFinancePortal } from "./components/CompanyFinancePortal";
import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import {
  ActiveTab,
  AppDatabase,
  Order,
  Customer,
  Supplier,
  Product,
  CashEntry,
  Inquiry,
  TaskItem,
  CalendarEvent,
  AppUser,
  CashPartner,
  Language,
  UserRole,
  PrintTemplateConfig,
  PriceEntry,
  CostDetail,
  GeneralCost,
  SaleDetail,
  OrderTransaction,
  DocumentTemplate,
} from "./types";
import { acceptConflictBase, DatabaseConflictError, loadDatabase, loadServerDatabase, saveDatabase, saveServerDatabase } from "./services/storageService";
import { IssuerCompanyShare } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { DashboardOverview } from "./components/DashboardOverview";
import { LoginView } from "./components/LoginView";
import { getTranslation } from "./i18n/translations";

const ProformaOrdersView = lazy(() => import("./components/ProformaOrdersView").then((m) => ({ default: m.ProformaOrdersView })));
const TasksManagerView = lazy(() => import("./components/TasksManagerView").then((m) => ({ default: m.TasksManagerView })));
const CommercialCalendarView = lazy(() => import("./components/CommercialCalendarView").then((m) => ({ default: m.CommercialCalendarView })));
const UserManagementView = lazy(() => import("./components/UserManagementView").then((m) => ({ default: m.UserManagementView })));
const AccountingCommissionsView = lazy(() => import("./components/AccountingCommissionsView").then((m) => ({ default: m.AccountingCommissionsView })));
const OptimizedWorkspacePreview = lazy(() => import("./components/OptimizedWorkspacePreview").then(m => ({default:m.OptimizedWorkspacePreview})));
const CaseDirectoryPreview = lazy(() => import("./components/CaseDirectoryPreview").then(m => ({default:m.CaseDirectoryPreview})));
const AccountingReferencePreview = lazy(() => import("./components/AccountingReferencePreview").then(m => ({default:m.AccountingReferencePreview})));
const BusinessAccountingPreview = lazy(() => import("./components/BusinessAccountingPreview").then((m) => ({ default: m.BusinessAccountingPreview })));
const MultiCurrencyCashView = lazy(() => import("./components/MultiCurrencyCashView").then((m) => ({ default: m.MultiCurrencyCashView })));
const CustomersSuppliersView = lazy(() => import("./components/CustomersSuppliersView").then((m) => ({ default: m.CustomersSuppliersView })));
const ProductsCatalogView = lazy(() => import("./components/ProductsCatalogView").then((m) => ({ default: m.ProductsCatalogView })));
const LogisticsTrackingView = lazy(() => import("./components/LogisticsTrackingView").then((m) => ({ default: m.LogisticsTrackingView })));
const CommercialOperationsView = lazy(() => import("./components/CommercialOperationsView").then((m) => ({ default: m.CommercialOperationsView })));
const CustomerFinancialOverview = lazy(() => import("./components/CustomerFinancialOverview").then((m) => ({ default: m.CustomerFinancialOverview })));
const OfficeCorrespondenceView = lazy(() => import("./components/OfficeCorrespondenceView").then((m) => ({ default: m.OfficeCorrespondenceView })));
const BackupRestoreView = lazy(() => import("./components/BackupRestoreView").then((m) => ({ default: m.BackupRestoreView })));
const AccessImportModal = lazy(() => import("./components/AccessImportModal").then((m) => ({ default: m.AccessImportModal })));
const AIAssistantDrawer = lazy(() => import("./components/AIAssistantDrawer").then((m) => ({ default: m.AIAssistantDrawer })));
const SettingsView = lazy(() => import("./components/SettingsView").then((m) => ({ default: m.SettingsView })));
const DocumentTemplatesSettings = lazy(() => import("./components/DocumentTemplatesSettings").then((m) => ({ default: m.DocumentTemplatesSettings })));
const AIKeySettings = lazy(() => import("./components/AIKeySettings").then((m) => ({ default: m.AIKeySettings })));
const AccessOrderEntryPreview = lazy(() => import("./components/AccessOrderEntryPreview").then((m) => ({ default: m.AccessOrderEntryPreview })));
const OrderAnalyticsView = lazy(() => import("./components/OrderAnalyticsView").then((m) => ({ default: m.OrderAnalyticsView })));
const ReportsCenterView = lazy(() => import("./components/ReportsCenterView").then((m) => ({ default: m.ReportsCenterView })));
const OutlookExecutiveCenter = lazy(() => import("./components/OutlookExecutiveCenter").then((m) => ({ default: m.OutlookExecutiveCenter })));
const PartnerOfficePortal = lazy(() => import("./components/PartnerOfficePortal").then((m) => ({ default: m.PartnerOfficePortal })));
const AgentPortal = lazy(() => import("./components/AgentPortal").then((m) => ({ default: m.AgentPortal })));
const ProfitCalculatorPreview = lazy(() => import("./components/ProfitCalculatorPreview").then((m) => ({ default: m.ProfitCalculatorPreview })));
const BmoChequeIssuer = lazy(() => import("./components/BmoChequeIssuer").then((m) => ({ default: m.BmoChequeIssuer })));
// These workspaces are intentionally retained after their first visit.  They
// contain large ledgers and grids; unmounting them on every menu switch made
// users pay the full construction cost repeatedly.
const RetainedAccountingCommissionsView = React.memo(AccountingCommissionsView, (previous, next) => previous.db === next.db && previous.language === next.language);
const RetainedLogisticsTrackingView = React.memo(LogisticsTrackingView, (previous, next) => previous.db === next.db);

// Navigation should never wait for a network request after the user has already
// pointed at a menu item.  Dynamic imports are cached by the browser, so the
// same loader safely serves hover, focus and background warm-up.
const tabModuleLoaders: Partial<Record<ActiveTab, () => Promise<unknown>>> = {
  proforma: () => import("./components/ProformaOrdersView"),
  tasks: () => import("./components/TasksManagerView"),
  calendar: () => import("./components/CommercialCalendarView"),
  users: () => import("./components/UserManagementView"),
  accounting: () => import("./components/AccountingCommissionsView"),
  optimized_workspace_preview: () => import("./components/OptimizedWorkspacePreview"),
  accounting_reference_preview: () => import("./components/AccountingReferencePreview"),
  business_accounting_preview: () => import("./components/BusinessAccountingPreview"),
  cash: () => import("./components/MultiCurrencyCashView"),
  customers: () => import("./components/CustomersSuppliersView"),
  suppliers: () => import("./components/CustomersSuppliersView"),
  products: () => import("./components/ProductsCatalogView"),
  pricing: () => import("./components/ProductsCatalogView"),
  logistics: () => import("./components/LogisticsTrackingView"),
  operations: () => import("./components/CommercialOperationsView"),
  customer_accounts: () => import("./components/CustomerFinancialOverview"),
  correspondence: () => import("./components/OfficeCorrespondenceView"),
  access_entry_preview: () => import("./components/AccessOrderEntryPreview"),
  profit_calculator_preview: () => import("./components/ProfitCalculatorPreview"),
  analytics: () => import("./components/OrderAnalyticsView"),
  reports: () => import("./components/ReportsCenterView"),
  outlook_center: () => import("./components/OutlookExecutiveCenter"),
  backup: () => import("./components/BackupRestoreView"),
  settings: () => import("./components/SettingsView"),
  cheque_issuer: () => import("./components/BmoChequeIssuer"),
};
const preloadTabModule = (tab: ActiveTab) => { void tabModuleLoaders[tab]?.().catch(() => undefined); };

const PageLoader = () => <div className="grid min-h-[45vh] place-items-center"><div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-500 shadow-sm">در حال آماده‌سازی این بخش…</div></div>;

// Keeps a page mounted after its first visit.  Re-entering a menu therefore
// restores its ready UI and local filters instead of rebuilding large tables,
// ledgers and charts.  While hidden, the last React element is preserved and
// receives current data the next time that page becomes active.
const KeepAlivePage = ({ active, children }: { active: boolean; children: React.ReactNode }) => {
  const lastPage = useRef<React.ReactNode>(null);
  if (children) lastPage.current = children;
  if (!lastPage.current) return null;
  return <div className={active ? "block" : "hidden"} aria-hidden={!active}>{lastPage.current}</div>;
};

// React StrictMode intentionally re-runs effects in development. Keeping the
// request outside the component guarantees that startup validates a session
// only once, even when the effect is attached more than once.
let sessionRestoreRequest: Promise<any> | null = null;
const APP_REFRESH_LOCATION_KEY = "arcatav.refresh-location";
const readRefreshLocation = (): { tab: ActiveTab; orderId: number | null; subTab: WorkbenchEditorSection } => {
  try {
    const saved = sessionStorage.getItem(APP_REFRESH_LOCATION_KEY);
    if (!saved) return { tab: readInterfaceVersion()==="legacy"?"dashboard":"optimized_workspace_preview", orderId: null, subTab: "general" };
    const value = JSON.parse(saved);
    return {
      tab: typeof value.tab === "string" ? value.tab as ActiveTab : "dashboard",
      orderId: typeof value.orderId === "number" ? value.orderId : null,
      subTab: ["general", "shares", "payments", "documents", "shipping"].includes(value.subTab) ? value.subTab as WorkbenchEditorSection : "general",
    };
  } catch {
    return { tab: "dashboard", orderId: null, subTab: "general" };
  }
};
const restoreSessionOnce = () => {
  if (!sessionRestoreRequest) {
    sessionRestoreRequest = fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, status: response.status, session: response.ok ? await response.json() : null }))
      .catch((error) => { sessionRestoreRequest = null; throw error; });
  }
  return sessionRestoreRequest;
};

const companyFinanceShell = (user: AppUser): AppDatabase => ({
  customers: [], suppliers: [], products: [], orders: [], cashEntries: [], inquiries: [],
  users: [user], currentUser: user, tasks: [], calendarEvents: [], cashPartners: [],
  settings: {}, systemSettings: {}, language: "en",
});

export default function App() {
  useWorkspaceAppearance();
  const [refreshLocation] = useState(readRefreshLocation);
  const [storedDb, setDb] = useState<AppDatabase>(loadDatabase);
  const db = React.useMemo(() => normalizePartyDatabase({ ...storedDb, cashPartners: getPartyDirectory(storedDb) }), [storedDb]);
  const [language, setLanguage] = useState<Language>(
    db.systemSettings?.language || "fa"
  );
  const [theme, setTheme] = useState<"indigo" | "emerald" | "midnight" | "gold" | "rose" | "glass">((db.settings?.theme as any) || "indigo");
  const [activeTab, setActiveTab] = useState<ActiveTab>(refreshLocation.tab);
  const [retainedWorkspaceTabs, setRetainedWorkspaceTabs] = useState<Set<ActiveTab>>(() => new Set([refreshLocation.tab]));
  useEffect(() => {
    if (activeTab !== "accounting" && activeTab !== "logistics") return;
    setRetainedWorkspaceTabs((current) => current.has(activeTab) ? current : new Set([...current, activeTab]));
  }, [activeTab]);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const mainContentRef = useRef<HTMLDivElement>(null);
  const proformaReturnRef = useRef<{ tab: ActiveTab; scrollTop: number } | null>((() => {
    try { return JSON.parse(sessionStorage.getItem("arca.editor.return") || "null"); } catch { return null; }
  })());
  const previousPage = useRef(activeTab);
  const previousScroll = useRef(0);
  const previousCreateSignal = useRef(0);
  useEffect(() => {
    // Capture every entry point, including accounting shortcuts and portals.
    if (activeTab === "proforma" && previousPage.current !== "proforma") {
      proformaReturnRef.current = selectedOrderIdForEditor !== null || createNewOrderSignal !== previousCreateSignal.current
        ? { tab: previousPage.current, scrollTop: previousScroll.current } : null;
      try { sessionStorage.setItem("arca.editor.return", JSON.stringify(proformaReturnRef.current)); } catch {}
    }
    previousPage.current = activeTab;
    previousCreateSignal.current = createNewOrderSignal;
    const container = mainContentRef.current;
    const rememberScroll = () => { previousScroll.current = container?.scrollTop || 0; };
    container?.addEventListener("scroll", rememberScroll, { passive: true });
    return () => { container?.removeEventListener("scroll", rememberScroll); };
  }, [activeTab]);
  const [caseOpenSequence,setCaseOpenSequence]=useState(0);
  const [simpleCaseSource,setSimpleCaseSource]=useState(()=>["optimized_workspace_preview","accounting_reference_preview"].includes(proformaReturnRef.current?.tab || ""));
  const openOrderFromCurrentPage = (orderId: number) => {
    setCaseOpenSequence(sequence=>sequence+1);
    setSimpleCaseSource(["optimized_workspace_preview","accounting_reference_preview"].includes(activeTab));
    if (activeTab !== "proforma") proformaReturnRef.current = { tab: activeTab, scrollTop: mainContentRef.current?.scrollTop || 0 };
    setSelectedOrderIdForEditor(orderId);
    setSelectedOrderInitialTab("general");
    setActiveTab("proforma");
  };
  const returnFromProformaEditor = () => {
    const origin = proformaReturnRef.current;
    setSelectedOrderIdForEditor(null);
    if (!origin) return;
    proformaReturnRef.current = null;
    try { sessionStorage.removeItem("arca.editor.return"); } catch {}
    setActiveTab(origin.tab);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (mainContentRef.current) mainContentRef.current.scrollTop = origin.scrollTop; }));
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAIDrawerOpen, setIsAIDrawerOpen] = useState(false);
  const [isAccessImportOpen, setIsAccessImportOpen] = useState(false);
  const [selectedOrderIdForEditor, setSelectedOrderIdForEditor] = useState<number | null>(refreshLocation.orderId);
  const [selectedOrderInitialTab, setSelectedOrderInitialTab] = useState<WorkbenchEditorSection>(refreshLocation.subTab);
  const [createNewOrderSignal, setCreateNewOrderSignal] = useState(0);
  const saveRefreshLocation = () => {
    try {
      sessionStorage.setItem(APP_REFRESH_LOCATION_KEY, JSON.stringify({ tab: activeTab, orderId: selectedOrderIdForEditor, subTab: selectedOrderInitialTab }));
    } catch {
      // Refresh remains available even when browser storage is unavailable.
    }
  };
  useEffect(() => { saveRefreshLocation(); }, [activeTab, selectedOrderIdForEditor, selectedOrderInitialTab]);
  // تاریخچهٔ داخلیِ صفحه‌ها، همراه با پروندهٔ بازشده در فرم.
  const navigationEntries = useRef<{ tab: ActiveTab; orderId: number | null; subTab: WorkbenchEditorSection }[]>([]);
  const navigationRestoring = useRef(false);
  const [navigationIndex, setNavigationIndex] = useState(-1);
  useEffect(() => {
    const next = { tab: activeTab, orderId: selectedOrderIdForEditor, subTab: selectedOrderInitialTab };
    const current = navigationEntries.current[navigationIndex];
    if (navigationRestoring.current) { navigationRestoring.current = false; return; }
    if (current && current.tab === next.tab && current.orderId === next.orderId && current.subTab === next.subTab) return;
    navigationEntries.current = [...navigationEntries.current.slice(0, navigationIndex + 1), next].slice(-40);
    setNavigationIndex(navigationEntries.current.length - 1);
  }, [activeTab, selectedOrderIdForEditor, selectedOrderInitialTab]);
  const restoreNavigation = (offset: -1 | 1) => {
    const nextIndex = navigationIndex + offset;
    const entry = navigationEntries.current[nextIndex];
    if (!entry) return;
    navigationRestoring.current = true;
    setNavigationIndex(nextIndex);
    setActiveTab(entry.tab);
    setSelectedOrderIdForEditor(entry.orderId);
    setSelectedOrderInitialTab(entry.subTab);
  };
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  // A local marker is never proof of authentication. Wait for the HttpOnly
  // server session before exposing either the workspace or the login form.
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [isDatabaseHydrated, setIsDatabaseHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<"synced" | "pending" | "syncing" | "conflict">(navigator.onLine ? "synced" : "pending");
  const [syncConflict, setSyncConflict] = useState<{ serverData: AppDatabase; revision: string | null; paths: string[] } | null>(null);
  const installPrompt = useRef<any>(null);
  const serverDatabaseReady = useRef(false);
  const persistenceErrorShown = useRef(false);

  const t = (key: any) => getTranslation(language, key);

  // Restore the server-side session first, then hydrate protected application data.
  useEffect(() => {
    let active = true;
    restoreSessionOnce()
      .then(async ({ ok, status, session }) => {
        if (!ok) {
          if (status === 401) {
            localStorage.removeItem("arca_last_authenticated_user");
            if (active) setAuthenticatedUserId(null);
          }
          return null;
        }
        if (!active || !session?.user?.id) return;
        localStorage.setItem("arca_last_authenticated_user", session.user.id);
        setAuthenticatedUserId(session.user.id);
        if (session.user.role === "company_finance") {
          if (active) { setDb(companyFinanceShell(session.user as AppUser)); setSyncStatus("synced"); }
          return;
        }
        const serverDb = await loadServerDatabase();
        if (active && serverDb) {
          serverDatabaseReady.current = true;
          setDb(serverDb);
          setSyncStatus("synced");
        }
      })
      .catch((error) => {
        console.warn("Server unavailable; keeping the application locked.", error);
        if (active) setSyncStatus("pending");
      })
      .finally(() => {
        if (active) setIsDatabaseHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event;
    };
    const installed = () => { installPrompt.current = null; };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", captureInstallPrompt); window.removeEventListener("appinstalled", installed); };
  }, []);

  const handleInstallApp = async () => {
    const prompt = installPrompt.current;
    if (!prompt) {
      showToast("در Chrome یا Edge، از منوی مرورگر گزینه «Install ARCA» یا «Install app» را انتخاب کنید. در iPhone/iPad: Share → Add to Home Screen.");
      return;
    }
    await prompt.prompt();
    await prompt.userChoice;
    installPrompt.current = null;
  };

  const handleRefreshApp = () => {
    saveRefreshLocation();
    showToast("در حال دریافت آخرین تغییرات…");
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "FORCE_SHELL_REFRESH" });
      window.setTimeout(() => window.location.reload(), 2500);
      return;
    }
    window.location.reload();
  };

  useEffect(() => {
    const online = () => { setIsOnline(true); setSyncStatus((value) => value === "conflict" ? value : "pending"); setDb((value) => ({ ...value })); };
    const offline = () => { setIsOnline(false); setSyncStatus((value) => value === "conflict" ? value : "pending"); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  // یک منبع حقیقت: تمام تغییرات اپ در دیتابیس پایدار سرور هم ثبت می‌شوند.
  // نوشتنِ هم‌زمان یک دیتابیس بزرگ در localStorage هنگام هر کلید، رابط کاربر
  // را قفل می‌کرد. مانند ERPهای دسکتاپ، ابتدا ورودی در حافظهٔ فرم می‌ماند و
  // پس از مکث کوتاه یک‌جا ذخیره و همگام می‌شود.
  useEffect(() => {
    // Check before scheduling: a timer capturing the seed database must not
    // become writable merely because server hydration finishes later.
    if (!serverDatabaseReady.current || !authenticatedUserId) return;
    if (db.users.find((user) => user.id === authenticatedUserId)?.role === "company_finance") return;
    const timer = window.setTimeout(() => {
      saveDatabase(db);
      if (!serverDatabaseReady.current) return;
      if (!navigator.onLine) { setSyncStatus("pending"); return; }
      setSyncStatus((value) => value === "conflict" ? value : "pending");
      setSyncStatus("syncing");
      void saveServerDatabase(db)
        .then((savedDb) => {
          persistenceErrorShown.current = false;
          setSyncStatus("synced");
          if (JSON.stringify(savedDb) !== JSON.stringify(db)) setDb(current => current === storedDb ? savedDb : current);
        })
        .catch((error) => {
          console.error("Server database persistence failed", error);
          if (error instanceof DatabaseConflictError) {
            setSyncStatus("conflict");
            const paths = ((error as any).conflictPaths || []) as string[];
            if (error.serverData) setSyncConflict({ serverData: error.serverData, revision: error.revision, paths });
            const count = paths.length;
            showToast(`همگام‌سازی متوقف شد: ${count || "چند"} فیلد یکسان توسط کاربران مختلف تغییر کرده است؛ داده‌ای بازنویسی نشد.`);
            return;
          }
          setSyncStatus("pending");
          if (!persistenceErrorShown.current) {
            persistenceErrorShown.current = true;
            showToast("ذخیره‌سازی سرور ناموفق بود؛ اطلاعات محلی حفظ شده است.");
          }
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [db, authenticatedUserId]);

  // Update HTML document direction and title
  useEffect(() => {
    document.documentElement.dir = language === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.title = "Arcatav ERP";
  }, [language]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  // The server database is the durable source after a session is restored.
  // Keep the visible template aligned with it after a reload or deployment.
  useEffect(() => {
    if (db.settings?.theme) setTheme(db.settings.theme);
  }, [db.settings?.theme]);
  useEffect(() => {
    const styleId = "arcatav-custom-fonts";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) { style = document.createElement("style"); style.id = styleId; document.head.appendChild(style); }
    style.textContent = (db.customFonts || []).map((font) => `@font-face{font-family:'${font.family.replace(/'/g, "")}';src:url('${font.data}');font-display:swap;}`).join("\n");
    document.documentElement.style.setProperty("--arca-app-font", db.settings?.fontFamily ? `'${db.settings.fontFamily}'` : "");
    document.body.style.fontFamily = db.settings?.fontFamily ? `'${db.settings.fontFamily}', Arial, sans-serif` : "";
  }, [db.customFonts, db.settings?.fontFamily]);
  const handleThemeChange = (nextTheme: "indigo" | "emerald" | "midnight" | "gold" | "rose" | "glass") => {
    setTheme(nextTheme);
    setDb((prev) => {
      const nextDb = { ...prev, settings: { ...prev.settings, theme: nextTheme } };
      // Template selection must survive an immediate refresh, not wait for the
      // normal debounced database persistence cycle.
      if (serverDatabaseReady.current) {
        queueMicrotask(() => void saveServerDatabase(nextDb).catch((error) => {
          console.error("Theme server persistence failed", error);
          showToast("قالب انتخاب‌شده محلی اعمال شد، اما ذخیره‌سازی سرور ناموفق بود.");
        }));
      }
      return nextDb;
    });
  };

  const showToast = (message: string) => {
    setToastNotification(message);
    setTimeout(() => {
      setToastNotification(null);
    }, 4000);
  };

  const handleToggleLanguage = () => {
    const nextLang: Language = language === "fa" ? "en" : "fa";
    setLanguage(nextLang);
    setDb((prev) => ({
      ...prev,
      systemSettings: {
        ...prev.systemSettings,
        language: nextLang,
      },
    }));
    showToast(nextLang === "fa" ? "زبان برنامه به فارسی تغییر یافت." : "Language switched to English.");
  };

  // Order Handlers
  const handleSaveOrder = (order: Order) => {
    if (order.ConsolidatedGroupId) {
      setDb(previous => ({ ...previous, financialGroups: (previous.financialGroups || []).map(group => group.id === order.ConsolidatedGroupId ? { ...group, profitPlan: order.profitPlan, customShares: order.customShares, commissionSettlements: order.commissionSettlements, OwnAccountSaleSettled: order.OwnAccountSaleSettled } : group) }));
      showToast("تغییرات حساب گروه مالی ثبت شد."); return;
    }
    setDb((currentDb) => {
      const exists = currentDb.orders.some((o) => o.OrderID === order.OrderID);
      const updatedOrders = exists ? currentDb.orders.map((o) => (o.OrderID === order.OrderID ? order : o)) : [order, ...currentDb.orders];
      const nextDb = { ...currentDb, orders: updatedOrders };
      const groupError = validateFinancialGroups(nextDb);
      if (groupError) { showToast(groupError); return currentDb; }
      const fundingError = validatePaymentFunding(nextDb, currentDb);
      if (fundingError) { showToast(fundingError); return currentDb; }
      // The shared persistence effect batches this update after the user pauses.
      // Posting the complete database here used to run once for every character
      // in accounting forms, blocking typing and creating needless sync races.
      return nextDb;
    });
    showToast(
      language === "fa"
        ? `پیش‌فاکتور ${order.ProformaInvoiceID} با موفقیت ثبت شد.`
        : `Proforma ${order.ProformaInvoiceID} saved successfully.`
    );
  };

  const handleDeleteOrder = (orderId: number) => {
    if (db.financialGroups?.some(group=>group.orderIds.includes(orderId))) { showToast("پرونده عضو گروه مالی است؛ ابتدا عضویت گروه را اصلاح کنید."); return; }
    setDb((prev) => ({
      ...prev,
      orders: prev.orders.filter((o) => o.OrderID !== orderId),
    }));
    showToast(t("confirm_delete"));
  };

  const handleSaveIssuerCompanyShares = (issuerCompanyShares: IssuerCompanyShare[]) => {
    setDb((prev) => ({ ...prev, issuerCompanyShares }));
    showToast("نسبت سهم آرکاتاو در شرکت‌های صادرکننده ذخیره شد.");
  };

  // Customer Handlers
  const handleSaveCustomer = (customer: Customer) => {
    setDb((prev) => {
      const exists = prev.customers.some((c) => c.CustomerID === customer.CustomerID);
      const updated = exists
        ? prev.customers.map((c) => (c.CustomerID === customer.CustomerID ? customer : c))
        : [customer, ...prev.customers];
      const identity = getPartyDirectory(prev).find(p => p.id === `customer:${customer.CustomerID}` || p.name === prev.customers.find(c => c.CustomerID === customer.CustomerID)?.CustomerName);
      const base = identity ? saveDirectoryParty(prev, { ...identity, name: customer.CustomerName }) : prev;
      return { ...base, customers: updated };
    });
    showToast(`خریدار ${customer.CustomerName} ذخیره شد.`);
  };

  const handleDeleteCustomer = (customerId: number) => {
    setDb((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.CustomerID !== customerId),
    }));
    showToast("خریدار حذف شد.");
  };

  // Supplier Handlers
  const handleSaveSupplier = (supplier: Supplier) => {
    setDb((prev) => {
      const exists = prev.suppliers.some((s) => s.SupplierID === supplier.SupplierID);
      const updated = exists
        ? prev.suppliers.map((s) => (s.SupplierID === supplier.SupplierID ? supplier : s))
        : [supplier, ...prev.suppliers];
      const identity = getPartyDirectory(prev).find(p => p.id === `supplier:${supplier.SupplierID}` || p.name === prev.suppliers.find(c => c.SupplierID === supplier.SupplierID)?.SupplierName);
      const base = identity ? saveDirectoryParty(prev, { ...identity, name: supplier.SupplierName }) : prev;
      return { ...base, suppliers: updated };
    });
    showToast(`تأمین‌کننده ${supplier.SupplierName} ذخیره شد.`);
  };

  const handleDeleteSupplier = (supplierId: number) => {
    setDb((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((s) => s.SupplierID !== supplierId),
    }));
    showToast("تأمین‌کننده حذف شد.");
  };

  // Product Handlers
  const handleSaveProduct = (product: Product) => {
    setDb((prev) => {
      const exists = prev.products.some((p) => p.ProductID === product.ProductID);
      const updated = exists
        ? prev.products.map((p) => (p.ProductID === product.ProductID ? product : p))
        : [product, ...prev.products];
      return { ...prev, products: updated };
    });
    showToast(`کالای ${product.ProductName} ذخیره شد.`);
  };

  const handleDeleteProduct = (productId: number) => {
    setDb((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.ProductID !== productId),
    }));
    showToast("کالا حذف شد.");
  };

  const handleSaveInquiry = (inquiry: Inquiry) => {
    setDb((prev) => ({
      ...prev,
      inquiries: (prev.inquiries || []).some((item) => item.InquiryID === inquiry.InquiryID)
        ? (prev.inquiries || []).map((item) => item.InquiryID === inquiry.InquiryID ? inquiry : item)
        : [inquiry, ...(prev.inquiries || [])],
    }));
    showToast("استعلام قیمت جدید ثبت شد.");
  };

  const handleSavePrice = (entry: PriceEntry) => setDb((prev) => ({
    ...prev,
    priceList: (prev.priceList || []).some((p) => p.PriceID === entry.PriceID)
      ? (prev.priceList || []).map((p) => p.PriceID === entry.PriceID ? entry : p)
      : [entry, ...(prev.priceList || [])],
  }));
  const handleSaveCost = (entry: CostDetail) => setDb((prev) => ({
    ...prev,
    costDetails: (prev.costDetails || []).some((c) => c.CID === entry.CID)
      ? (prev.costDetails || []).map((c) => c.CID === entry.CID ? entry : c)
      : [entry, ...(prev.costDetails || [])],
  }));
  const handleSaveGeneralCost = (entry: GeneralCost) => setDb((prev) => ({
    ...prev,
    generalCosts: (prev.generalCosts || []).some((c) => c.GID === entry.GID)
      ? (prev.generalCosts || []).map((c) => c.GID === entry.GID ? entry : c)
      : [entry, ...(prev.generalCosts || [])],
  }));
  const handleSaveTransaction = (entry: OrderTransaction) => handleSaveTransactions([entry]);
  // Post related debit/credit rows in one state change. A transfer is therefore
  // never briefly saved as only one side of the accounting event.
  const handleSaveTransactions = (entries: OrderTransaction[]) => setDb((prev) => {
    const replacements = new Map(entries.map((entry) => [entry.TransactionID, entry]));
    const existing = prev.orderTransactions || [];
    const candidate = { ...prev, orderTransactions: [...entries.filter((entry) => !existing.some((current) => current.TransactionID === entry.TransactionID)), ...existing.map((entry) => replacements.get(entry.TransactionID) || entry)] };
    const error = validatePaymentFunding(candidate);
    if (error) { showToast(error); return prev; }
    return candidate;
  });
  const handleDeleteTransaction = (transactionId: number) => setDb((prev) => ({
    ...prev,
    orderTransactions: (prev.orderTransactions || []).filter((entry) => entry.TransactionID !== transactionId && entry.LinkedTransactionID !== transactionId),
  }));
  const handleSaveSale = (entry: SaleDetail) => setDb((prev) => ({
    ...prev,
    saleDetails: (prev.saleDetails || []).some((s) => s.SID === entry.SID)
      ? (prev.saleDetails || []).map((s) => s.SID === entry.SID ? entry : s)
      : [entry, ...(prev.saleDetails || [])],
  }));

  // Cash Handlers & Partners CRUD
  const handleSaveCashEntry = (entry: CashEntry) => {
    setDb((prev) => {
      const exists = prev.cashEntries.some((c) => c.CashID === entry.CashID);
      const updated = exists
        ? prev.cashEntries.map((c) => (c.CashID === entry.CashID ? entry : c))
        : [entry, ...prev.cashEntries];
      return { ...prev, cashEntries: updated };
    });
    showToast("سند خزانه‌داری با موفقیت ثبت شد.");
  };

  const handleDeleteCashEntry = (cashId: number) => {
    setDb((prev) => ({
      ...prev,
      cashEntries: prev.cashEntries.filter((c) => c.CashID !== cashId),
    }));
    showToast("سند خزانه‌داری حذف شد.");
  };

  const handleSaveCashPartner = (partner: CashPartner) => {
    setDb((prev) => saveDirectoryParty(prev, partner));
    showToast(`حساب همکار ${partner.name} ذخیره شد.`);
  };

  const handleAddNewFieldOption = (fieldKey: string, newOption: string) => {
    if (!newOption.trim()) return;
    setDb((prev) => {
      const currentOptions = prev.fieldOptions?.[fieldKey] || [];
      if (currentOptions.includes(newOption.trim())) return prev;
      return {
        ...prev,
        fieldOptions: {
          ...(prev.fieldOptions || {}),
          [fieldKey]: [...currentOptions, newOption.trim()],
        },
      };
    });
    showToast(`گزینه جدید "${newOption}" در پایگاه داده ثبت شد.`);
  };

  const handleDeleteCashPartner = (partnerId: string) => {
    if (db.orderTransactions?.some((entry) => entry.FundingPartyId === partnerId) || db.orders.some((order) => order.EconomicOwnerPartyId === partnerId)) {
      showToast("این منبع دارای سند مالی است و قابل حذف نیست؛ سوابق آن باید حفظ شود.");
      return;
    }
    setDb((prev) => ({
      ...prev,
      cashPartners: (prev.cashPartners || []).filter((p) => p.id !== partnerId),
      hiddenPartyIds: [...new Set([...(prev.hiddenPartyIds || []), partnerId])],
    }));
    showToast("شخص / شرکت از فهرست حذف شد؛ سوابق مالی برای حسابرسی حفظ شده‌اند.");
  };

  // Tasks CRUD Handlers
  const handleSaveTask = (task: TaskItem) => {
    setDb((prev) => {
      const currentTasks = prev.tasks || [];
      const exists = currentTasks.some((t) => t.id === task.id);
      const updated = exists
        ? currentTasks.map((t) => (t.id === task.id ? task : t))
        : [task, ...currentTasks];
      return { ...prev, tasks: updated };
    });
    showToast("تسک با موفقیت ذخیره شد.");
  };

  const handleDeleteTask = (taskId: string) => {
    setDb((prev) => ({
      ...prev,
      tasks: (prev.tasks || []).filter((t) => t.id !== taskId),
    }));
    showToast("تسک حذف شد.");
  };

  // Calendar CRUD Handlers
  const handleSaveCalendarEvent = (event: CalendarEvent) => {
    setDb((prev) => {
      const currentEvents = prev.calendarEvents || [];
      const exists = currentEvents.some((e) => e.id === event.id);
      const updated = exists
        ? currentEvents.map((e) => (e.id === event.id ? event : e))
        : [event, ...currentEvents];
      return { ...prev, calendarEvents: updated };
    });
    showToast("رویداد تقویم با موفقیت ثبت شد.");
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    setDb((prev) => ({
      ...prev,
      calendarEvents: (prev.calendarEvents || []).filter((e) => e.id !== eventId),
    }));
    showToast("رویداد از تقویم حذف گردید.");
  };

  // User Management & RBAC Handlers
  const handleSaveUser = (user: AppUser) => {
    setDb((prev) => {
      const currentUsers = prev.users || [];
      const exists = currentUsers.some((u) => u.id === user.id);
      const updated = exists
        ? currentUsers.map((u) => (u.id === user.id ? user : u))
        : [...currentUsers, user];
      return { ...prev, users: updated };
    });
    showToast(`کاربر ${user.name} با موفقیت ذخیره شد.`);
  };

  const handleDeleteUser = (userId: string) => {
    setDb((prev) => ({
      ...prev,
      users: (prev.users || []).filter((u) => u.id !== userId),
    }));
    showToast("کاربر حذف شد.");
  };

  const handleSwitchUser = (user: AppUser) => {
    setDb((prev) => ({
      ...prev,
      currentUser: user,
    }));
    showToast(`کاربر فعال به ${user.name} تغییر یافت.`);
  };

  const handleLogin = (user: AppUser) => {
    // Keep persistence paused until the authoritative server database has
    // finished loading. Otherwise a stale first-visit browser cache can win
    // the race and overwrite the persistent database after sign-in.
    serverDatabaseReady.current = false;
    setAuthenticatedUserId(user.id);
    localStorage.setItem("arca_last_authenticated_user", user.id);
    if (user.role === "company_finance") {
      serverDatabaseReady.current = true;
      setDb(companyFinanceShell(user));
      return;
    }
    void loadServerDatabase()
      .then((serverDb) => {
        if (!serverDb) throw new Error("Server database is empty");
        serverDatabaseReady.current = true;
        setDb({ ...serverDb, currentUser: user });
      })
      .catch(() => {
        serverDatabaseReady.current = false;
        setAuthenticatedUserId(null);
        localStorage.removeItem("arca_last_authenticated_user");
        showToast("دریافت اطلاعات سرور ناموفق بود؛ ورود برای حفاظت از اطلاعات لغو شد.");
      });
  };
  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    setAuthenticatedUserId(null);
    localStorage.removeItem("arca_last_authenticated_user");
  };

  const handleSavePrintTemplateConfig = (templateConfig: PrintTemplateConfig) => {
    setDb((prev) => ({
      ...prev,
      printTemplateConfig: templateConfig,
    }));
    showToast("قالب چاپ و تنظیمات با موفقیت ذخیره شد.");
  };

  // Quick Action Dispatcher
  const handleOpenQuickAdd = (type: "order" | "customer" | "product" | "cash") => {
    if (type === "order") {
      setSimpleCaseSource(["optimized_workspace_preview","accounting_reference_preview"].includes(activeTab));
      if (activeTab !== "proforma") proformaReturnRef.current = {tab:activeTab,scrollTop:mainContentRef.current?.scrollTop || 0};
      setActiveTab("proforma");
      setSelectedOrderIdForEditor(null);
      setCreateNewOrderSignal((current) => current + 1);
      // The editor consumes createNewSignal after mounting; a delayed DOM click
      // would open a second draft and could replace input already being typed.
    } else if (type === "customer") {
      setActiveTab("customers");
    } else if (type === "product") {
      setActiveTab("products");
    } else if (type === "cash") {
      setActiveTab("cash");
    }
  };

  // AI Action Execution
  const handleApplyAIAction = async (actionType: string, payload: any) => {
    if (actionType === "SETTLE_ACCOUNTING_LIST") {
      const actionUser = db.users.find((user) => user.id === authenticatedUserId && user.active);
      if (!actionUser || !["superadmin", "accountant"].includes(actionUser.role)) throw new Error("نقش فعلی اجازهٔ تأیید تسویهٔ لیست را ندارد.");
      if (payload?.receiptAndSharesConfirmed !== true) throw new Error("تأیید واقعی وصول وجه و پرداخت همهٔ سهم‌ها الزامی است.");
      const next = confirmListProfitSettlement(db, String(payload?.listId || ""), String(payload?.date || ""), String(payload?.note || ""));
      const error = validateFinancialGroups(next) || validatePaymentFunding(next, db);
      if (error) throw new Error(error);
      setDb(next);
      try {
        await saveServerDatabase(next);
        showToast("تسویهٔ سود لیست و مختومه‌شدن پرونده‌ها ذخیره شد.");
      } catch (saveError) {
        showToast("تأیید محلی حفظ شد؛ ذخیرهٔ سرور را بررسی کنید.");
        throw saveError;
      }
      return;
    }
    if (actionType === "CREATE_ORDER" && payload) {
      const newOrder: Order = {
        OrderID: Date.now(),
        ProformaInvoiceID: payload.ProformaInvoiceID || `ARCA-PI-AI-${Date.now()}`,
        SupplierID: 1,
        CustomerID: 101,
        SupplierName: payload.SupplierName || "ARCA TAV CO.",
        CustomerName: payload.CustomerName || "خریدار جدید",
        PIDate: new Date().toISOString().slice(0, 10),
        TransportaionMode: "Sea Freight",
        CountryOfOrigin: "UAE",
        CountryOfDestination: "Iran",
        PortOfLoading: "Jebel Ali",
        PortOfDischarge: "Bandar Abbas",
        TermsOfDelivery: "CFR Bandar Abbas",
        FinalPlaceOfDelivery: "Customs",
        TermsOfPayment: "100% TT",
        TransactionCurrency: payload.TransactionCurrency || "USD",
        AgreementCurrency: payload.AgreementCurrency || "USD",
        InvoiceCurrency: payload.InvoiceCurrency || "USD",
        ExchangeRateApplied: payload.ExchangeRateApplied || 1.0,
        IsExchangeRateUsed: Boolean(payload.ExchangeRateApplied && payload.ExchangeRateApplied !== 1.0),
        ExchangeRate: payload.ExchangeRateApplied || 1.0,
        TypeOfEXRate: "Official",
        TotalGrossWeight: `${payload.TotalQuantity || 25000} KG`,
        TotalNetWeight: payload.TotalQuantity || 25000,
        TotalCube: "40 CBM",
        Freight: 1800,
        Discount: 0,
        Note: "Created via AI Assistant",
        CountryOfBeneficiary: "UAE",
        TranspotationModeMeans: "Ocean Vessel",
        PartialShipment: "Not Allowed",
        NameOfSignatory: "Dr. Hesam Karimi",
        TargetPrice: payload.SellPrice || 1200,
        FreightFcl: 1800,
        QtyFcl: 25000,
        NumberFcl: 1,
        TotalQuantity: payload.TotalQuantity || 25000,
        ArcaShare: payload.ArcaShare || 1000,
        BeraShare: payload.BeraShare || 800,
        Hesam: 0,
        Reza: 0,
        Jalali: 0,
        Lida: 0,
        Hamid: 0,
        Moradi: 0,
        Mahsa: 0,
        Arash: 0,
        Arovin: 0,
        Khusru: 0,
        Berabank: 0,
        Extra: 0,
        Commission: payload.TotalCommission || 2000,
        TotalCommission: payload.TotalCommission || 2000,
        BuyerPaid: false,
        ThirdPartyPaid: false,
        CommissionPaid: false,
        ActiveOrder: true,
        TargetOrder: true,
        Target: true,
        NetFob: (payload.SellPrice || 1200) - (payload.Margin || 50),
        CFRNet: (payload.SellPrice || 1200) - (payload.Margin || 50),
        SellPrice: payload.SellPrice || 1200,
        Margin: payload.Margin || 50,
        MarginM: payload.Margin || 50,
        CostPrice: 1150,
        PackWeight: 0.025,
        PI_Valid_Days: 90,
        SC_Valid_Days: 30,
        ScCurrency: "USD",
        DocumentType: "Proforma Invoice",
        OrderStatus: payload.OrderStatus || "پیش‌فاکتور صادر شده",
        items: [
          {
            OrderDetailID: Date.now(),
            OrderID: Date.now(),
            ProductID: 10001,
            ProductName: payload.ProductName || "کالای بازرگانی",
            Quantity: payload.TotalQuantity || 25000,
            UnitPrice: (payload.SellPrice || 1200) / 1000,
            ProductDescription: "Standard Export Grade",
            NosAndKindOfPackages: "Export Packing",
            GrossWeight: payload.TotalQuantity || 25000,
            ExtPrice: ((payload.TotalQuantity || 25000) * (payload.SellPrice || 1200)) / 1000,
          },
        ],
      };
      handleSaveOrder(newOrder);
      setActiveTab("proforma");
    } else if (actionType === "CREATE_CUSTOMER" && payload) {
      const newCust: Customer = {
        CustomerID: Date.now(),
        CustomerName: payload.CustomerName || "مشتری جدید",
        Address: payload.Address || "",
        Tel: payload.Tel || "",
        CommercialID: payload.CommercialID || "",
        Activity: payload.Activity || "صنایع شیمیایی",
        City: payload.City || "تهران",
        Country: "Iran",
      };
      handleSaveCustomer(newCust);
      setActiveTab("customers");
    } else if (actionType === "CREATE_TASK" && payload) {
      const newTask: TaskItem = {
        id: "t_" + Date.now(),
        title: payload.title || "تسک جدید دستیار هوشمند",
        description: payload.description || "",
        dueDate: payload.dueDate || new Date().toISOString().slice(0, 10),
        priority: payload.priority || "HIGH",
        assignedToName: payload.assignedToName || db.currentUser?.name || "حسام کریمی",
        completed: false,
        category: "sales",
        createdAt: new Date().toISOString(),
      };
      handleSaveTask(newTask);
      setActiveTab("tasks");
    } else if (actionType === "NAVIGATE_TAB" && payload?.tab) {
      setActiveTab(payload.tab);
    }
  };

  // Access Import Handler
  const handleAccessImportSuccess = (importedData: Partial<AppDatabase>, mode: "MERGE" | "REPLACE") => {
    if (mode === "REPLACE") {
      const newDb: AppDatabase = {
        orders: importedData.orders || [],
        customers: importedData.customers || [],
        suppliers: importedData.suppliers || [],
        products: importedData.products || [],
        cashEntries: importedData.cashEntries || [],
        cashPartners: db.cashPartners,
        tasks: db.tasks,
        calendarEvents: db.calendarEvents,
        users: db.users,
        currentUser: db.currentUser,
        customClauses: db.customClauses,
        inquiries: importedData.inquiries || [],
        systemSettings: db.systemSettings,
        lastBackupDate: new Date().toISOString(),
      };
      setDb(newDb);
      showToast("تمام اطلاعات دیتابیس اکسس با موفقیت جایگزین شد.");
    } else {
      setDb((prev) => ({
        ...prev,
        orders: [...(importedData.orders || []), ...prev.orders],
        customers: [...(importedData.customers || []), ...prev.customers],
        suppliers: [...(importedData.suppliers || []), ...prev.suppliers],
        products: [...(importedData.products || []), ...prev.products],
        cashEntries: [...(importedData.cashEntries || []), ...prev.cashEntries],
        lastBackupDate: new Date().toISOString(),
      }));
      showToast("اطلاعات دیتابیس اکسس با موفقیت در بانک اطلاعاتی ادغام گردید.");
    }
  };

  const defaultRoleTabs: Record<UserRole, ActiveTab[]> = {
    superadmin: ["dashboard", "outlook_center", "proforma", "access_entry_preview", "profit_calculator_preview", "optimized_workspace_preview", "accounting_reference_preview", "accounting", "company_finance", "business_accounting_preview", "customer_accounts", "correspondence", "cash", "calendar", "tasks", "customers", "products", "operations", "logistics", "analytics", "reports", "users", "access_import", "backup", "settings"],
    sales_manager: ["dashboard", "outlook_center", "proforma", "tasks", "calendar", "customers", "products", "logistics", "analytics", "reports"],
    accountant: ["dashboard", "accounting", "business_accounting_preview", "customer_accounts", "correspondence", "cash", "operations", "tasks", "reports"],
    logistics: ["dashboard", "outlook_center", "logistics", "tasks", "calendar"],
    sales_rep: ["dashboard", "proforma", "tasks", "customers", "products"],
    partner_office: ["partner_portal"],
    sales_agent: ["partner_portal"],
    company_finance: ["company_finance"],
  };
  const authenticatedUser = db.users.find((user) => user.id === authenticatedUserId && user.active);
  // This is deliberately independent of the accounting role. The BMO cheque
  // printer is a private operational tool for Hesam's administrator account.
  const canUseChequeIssuer = authenticatedUser?.id === "u_admin" || authenticatedUser?.username.trim().toLowerCase() === "hesam";
  // The service worker keeps the files on disk, but a menu can still pause the
  // first time its JavaScript is parsed. Warm the most-used ERP workspaces in
  // small background steps after login; navigation then opens from memory.
  useEffect(() => {
    if (!authenticatedUser) return;
    let cancelled = false;
    const priorityTabs: ActiveTab[] = [activeTab, "proforma", "accounting", "customers", "products", "cash", "reports", "tasks", "logistics", "calendar", "operations", "customer_accounts", "analytics", "correspondence", "business_accounting_preview", "outlook_center", "access_entry_preview", "profit_calculator_preview", "settings", "backup", "users"];
    const loaders = [...new Set(priorityTabs)].map((tab) => tabModuleLoaders[tab]).filter((loader): loader is () => Promise<unknown> => Boolean(loader));
    const warm = async () => {
      for (const load of loaders) {
        if (cancelled) return;
        try { await load(); } catch { /* A later menu visit retries normally. */ }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      }
    };
    const timer = window.setTimeout(() => { void warm(); }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [authenticatedUser?.id]);
  useEffect(() => {
    if (!authenticatedUser) return;
    const configuredTabs = authenticatedUser.permissions || db.rolePermissions?.[authenticatedUser.role] || defaultRoleTabs[authenticatedUser.role];
    const guaranteedTabs: ActiveTab[] = authenticatedUser.role === "superadmin"
      ? ["settings", "customer_accounts", "correspondence", "outlook_center", "profit_calculator_preview", "optimized_workspace_preview", "accounting_reference_preview"]
      : ["sales_manager", "logistics"].includes(authenticatedUser.role) ? ["settings", "outlook_center"] : ["settings"];
    const chequeTabs: ActiveTab[] = canUseChequeIssuer ? ["cheque_issuer"] : [];
    const allowedTabs = [...configuredTabs, ...guaranteedTabs.filter((tab) => !configuredTabs.includes(tab)), ...chequeTabs];
    if (!allowedTabs.includes(activeTab)) setActiveTab("dashboard");
  }, [activeTab, authenticatedUser, db.rolePermissions, canUseChequeIssuer]);
  useEffect(()=>{
    if(!isDatabaseHydrated||authenticatedUser?.role!=='superadmin')return;
    let chosen=false;try{chosen=!!localStorage.getItem(INTERFACE_VERSION_KEY);}catch{}
    if(chosen)return;
    saveInterfaceVersion('new');
    if(activeTab!=='proforma')setActiveTab('optimized_workspace_preview');
  },[authenticatedUser?.id,isDatabaseHydrated]);
  // Do not authenticate against an old browser cache while the persistent server
  // database is still loading; this is especially important on a first mobile visit.
  if (!isDatabaseHydrated) {
    return <main className="min-h-screen bg-slate-950 flex items-center justify-center p-5" dir="rtl"><p className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-3 text-sm text-slate-300">در حال آماده‌سازی اطلاعات ورود…</p></main>;
  }
  if (!authenticatedUser) return <LoginView users={db.users} language={language} onLogin={handleLogin} />;
  if (!isDatabaseHydrated) return <div className="h-screen grid place-items-center bg-slate-950 text-white font-bold">در حال دریافت اطلاعات ذخیره‌شده…</div>;
  if (authenticatedUser.role === "company_finance") return <CompanyFinancePortal user={authenticatedUser} onLogout={handleLogout}/>;
  if (["partner_office", "sales_agent"].includes(authenticatedUser.role)) return <>
    <button type="button" onClick={() => setActiveTab(activeTab === "settings" ? "partner_portal" : "settings")} className="fixed bottom-4 left-4 z-50 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg">{activeTab === "settings" ? "بازگشت به پرتال" : "تنظیمات برنامه"}</button>
    {activeTab === "settings" ? <Suspense fallback={<PageLoader/>}><main className="min-h-screen bg-slate-100 p-5 pb-24" dir="rtl"><SettingsView db={db} theme={theme} onThemeChange={setTheme} appearanceOnly onSaveSettings={() => {}} /></main></Suspense> : authenticatedUser.role === "partner_office" ? <Suspense fallback={<PageLoader/>}><PartnerOfficePortal db={db} user={authenticatedUser} onSaveOrder={handleSaveOrder} onSaveTask={handleSaveTask} onSaveCalendarEvent={handleSaveCalendarEvent} onLogout={handleLogout}/></Suspense> : <Suspense fallback={<PageLoader/>}><AgentPortal db={db} user={authenticatedUser} onLogout={handleLogout}/></Suspense>}
  </>;

  const usingNewWorkspace = activeTab === "optimized_workspace_preview" || (activeTab === "proforma" && simpleCaseSource);
  const switchInterface = (version:'new'|'legacy') => {
    saveInterfaceVersion(version);
    setSimpleCaseSource(version==='new');
    setSelectedOrderIdForEditor(null);
    setCreateNewOrderSignal(0);
    setIsSidebarOpen(false);
    const tab:ActiveTab=version==='new'?'optimized_workspace_preview':'settings';
    try{sessionStorage.setItem(APP_REFRESH_LOCATION_KEY,JSON.stringify({tab,orderId:null,subTab:'general'}));}catch{}
    setActiveTab(tab);
  };
  const canOpenIntegrated = (tab: string) => {
    const guaranteed = authenticatedUser.role === "superadmin"
      ? ["settings", "customer_accounts", "correspondence", "outlook_center", "profit_calculator_preview", "optimized_workspace_preview", "accounting_reference_preview", "company_finance"]
      : ["sales_manager", "logistics"].includes(authenticatedUser.role) ? ["settings", "outlook_center"] : ["settings"];
    return guaranteed.includes(tab) || (authenticatedUser.permissions || db.rolePermissions?.[authenticatedUser.role] || defaultRoleTabs[authenticatedUser.role] || []).some(item => item === tab);
  };
  const navigateIntegratedWorkspace = (tab: string) => {
    const routes: Record<string, [string, string?]> = {
      dashboard: ["reports", "dashboard"], analytics: ["reports", "analytics"], settings: ["settings", "main"],
      tasks: ["planning", "tasks"], calendar: ["planning", "calendar"], commercial_calendar: ["planning", "calendar"],
      accounting: ["accounting", "main"], customer_accounts: ["accounting", "customers"], company_finance: ["accounting", "companies"], operations: ["accounting", "operations"],
      correspondence: ["communications", "letters"], outlook_center: ["communications", "outlook"],
      access_entry_preview: ["cases", "quick"], profit_calculator_preview: ["accounting", "profit"], business_accounting_preview: ["accounting", "journal"],
      backup: ["settings", "backup"], users: ["settings", "users"], access_import: ["settings", "import"],
      products: ["products"], customers: ["parties"], suppliers: ["parties"], cash: ["cash"], logistics: ["logistics"], proforma: ["cases"],
    };
    const [page, section] = routes[tab] || ["cases"];
    if (section) try { sessionStorage.setItem(`arca.hub.${page}`, section); } catch {}
    window.dispatchEvent(new CustomEvent("arca-workspace-navigate", { detail: { page, section } }));
  };
  const renderSettings = (experimental=false) => (<>{authenticatedUser.role==="superadmin"&&<InterfaceVersionSwitch current={experimental?"new":"legacy"} onChange={switchInterface}/>} {experimental?<section data-workspace-preferences className="rounded-xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">ظاهر و منو</h2><div className="flex flex-wrap items-center gap-4"><WorkspaceAppearance/><WorkspaceLayoutPicker/></div></section>:<SettingsView db={db} theme={theme} appearanceOnly onThemeChange={handleThemeChange} onSaveSettings={(settings) => setDb((prev) => ({ ...prev, settings: { ...prev.settings, ...settings }, systemSettings: { ...prev.systemSettings, ...settings } }))} />}{authenticatedUser.role === "superadmin" && <>
              <details className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-800">اطلاعات شرکت و تنظیمات عمومی</summary><div className="mt-4"><SettingsView db={db} theme={theme} generalOnly onThemeChange={handleThemeChange} onSaveSettings={(settings) => setDb((prev) => ({ ...prev, settings: { ...prev.settings, ...settings }, systemSettings: { ...prev.systemSettings, ...settings } }))}/></div></details>
              <details className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-800">هوش مصنوعی و اتصال سرویس‌ها</summary><div className="mt-4"><AIKeySettings username={authenticatedUser.username}/></div></details>
              <details className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-800">قالب اسناد و تنظیمات پروفورما</summary><div className="mt-4"><DocumentTemplatesSettings db={db} onSavePrintTemplateConfig={handleSavePrintTemplateConfig} onSaveOrder={handleSaveOrder} onSave={(template: DocumentTemplate) => setDb((prev) => ({ ...prev, printTemplateConfig: template.isActive && template.documentType !== "COO" && template.theme ? {...prev.printTemplateConfig, templateStyle: template.theme as PrintTemplateConfig["templateStyle"]} : prev.printTemplateConfig, documentTemplates: [...(prev.documentTemplates || []).filter((item) => item.id !== template.id).map((item) => template.isActive && item.documentType === template.documentType && item.theme === template.theme && item.issuerCompanyId === template.issuerCompanyId && (template.documentType !== "COO" || item.country?.toLowerCase() === template.country?.toLowerCase()) ? { ...item, isActive: false } : item), template] }))} onDelete={(id: string) => setDb((prev) => ({ ...prev, documentTemplates: (prev.documentTemplates || []).filter((item) => item.id !== id && !item.isBuiltIn) }))} onSaveFont={(font) => setDb((prev) => ({ ...prev, customFonts: [...(prev.customFonts || []).filter((item) => item.id !== font.id), font] }))} onDeleteFont={(id) => setDb((prev) => ({ ...prev, customFonts: (prev.customFonts || []).filter((font) => font.id !== id) }))} onApplyAppFont={(fontFamily) => setDb((prev) => ({ ...prev, settings: { ...prev.settings, fontFamily } }))} /></div></details></>}</>);

  return (
    <PartyDirectoryProvider db={db} onSave={handleSaveCashPartner} onDelete={handleDeleteCashPartner}><div
      id="app-shell"
      data-active-workspace={usingNewWorkspace ? "new" : undefined}
      className="flex h-screen bg-[#F1F5F9] text-[#1E293B] font-sans antialiased overflow-hidden select-none"
      dir={language === "fa" ? "rtl" : "ltr"}
    >
      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-xl border border-slate-700 animate-fade-in flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toastNotification}</span>
        </div>
      )}
      {syncConflict && (
        <div className="fixed inset-x-4 top-20 z-[90] mx-auto max-w-2xl rounded-xl border border-rose-200 bg-white p-4 text-right shadow-2xl" dir="rtl">
          <p className="text-sm font-black text-rose-800">تداخل واقعی در {syncConflict.paths.length || "چند"} فیلد</p>
          <p className="mt-1 text-xs leading-6 text-slate-600">دو کاربر یک اطلاعات یکسان را تغییر داده‌اند. هیچ داده‌ای بازنویسی نشده است. نسخه‌ای را که باید روی سرور بماند انتخاب کنید.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white" onClick={() => {
              acceptConflictBase(syncConflict.serverData, syncConflict.revision);
              setSyncConflict(null); setSyncStatus("pending"); setDb((value) => ({ ...value }));
            }}>حفظ تغییرات این دستگاه</button>
            <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700" onClick={() => {
              setDb(syncConflict.serverData); setSyncConflict(null); setSyncStatus("synced");
            }}>استفاده از نسخه سرور</button>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      {(!usingNewWorkspace || isSidebarOpen) && <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onPreloadTab={preloadTabModule}
        language={language}
        onToggleLanguage={handleToggleLanguage}
        currentUser={authenticatedUser}
        rolePermissions={db.rolePermissions}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onOpenQuickAdd={handleOpenQuickAdd}
        onOpenAI={() => setIsAIDrawerOpen(true)}
        onOpenAccessImport={() => setIsAccessImportOpen(true)}
        onQuickBackup={() => {
          const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `ARCA-Database-Backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast("فایل پشتیبان کامل دیتابیس دانلود شد.");
        }}
        onLogout={handleLogout}
        db={db}
      />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* App Header */}
        <Header
          hideWorkspaceTools={usingNewWorkspace}
          db={db}
          language={language}
          onToggleLanguage={handleToggleLanguage}
          currentUser={authenticatedUser}
          onOpenSidebar={() => usingNewWorkspace ? window.dispatchEvent(new Event("arca-workspace-menu")) : setIsSidebarOpen(true)}
          onOpenAI={() => setIsAIDrawerOpen(true)}
          onInstallApp={handleInstallApp}
          onRefreshApp={handleRefreshApp}
          isOnline={isOnline}
          syncStatus={syncStatus}
          searchQuery={globalSearchQuery}
          setSearchQuery={setGlobalSearchQuery}
          onSelectSearchResult={(type, id) => {
            if (type === "order") {
              openOrderFromCurrentPage(Number(id));
            } else if (type === "customer" || type === "supplier") {
              setActiveTab("customers");
            } else if (type === "product") {
              setActiveTab("products");
            }
            setGlobalSearchQuery("");
          }}
          onNavigateBack={() => restoreNavigation(-1)}
          onNavigateForward={() => restoreNavigation(1)}
          canNavigateBack={navigationIndex > 0}
          canNavigateForward={navigationIndex >= 0 && navigationIndex < navigationEntries.current.length - 1}
        />
        {!usingNewWorkspace && <div className="fixed left-4 top-20 z-[60] flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg" dir="rtl">
          <button type="button" onClick={() => restoreNavigation(-1)} disabled={navigationIndex <= 0} className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300" title="بازگشت به صفحه یا پرونده قبلی">‹ قبلی</button>
          <button type="button" onClick={() => restoreNavigation(1)} disabled={navigationIndex < 0 || navigationIndex >= navigationEntries.current.length - 1} className="border-r border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300" title="حرکت به صفحه یا پرونده بعدی">بعدی ›</button>
        </div>}

        {/* Scrollable View Container */}
        <main ref={mainContentRef} className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <Suspense fallback={<PageLoader />}>
          <KeepAlivePage active={activeTab === "company_finance"}>{activeTab === "company_finance" && authenticatedUser.role === "superadmin" && <CompanyFinancePortal user={authenticatedUser} isArcaAdmin onLogout={handleLogout}/>}</KeepAlivePage>
          <KeepAlivePage active={activeTab === "dashboard"}>{activeTab === "dashboard" && (
            <DashboardOverview
              db={db}
              language={language}
              setActiveTab={setActiveTab}
              onOpenQuickAdd={handleOpenQuickAdd}
              onOpenAI={() => setIsAIDrawerOpen(true)}
              onSelectOrder={(id) => {
                setActiveTab("proforma");
                setSelectedOrderIdForEditor(id);
                setSelectedOrderInitialTab("general");
              }}
              onOpenAccessImport={() => setIsAccessImportOpen(true)}
              onUpdateTask={handleSaveTask}
              onUpdateOrder={handleSaveOrder}
              onSaveDashboardLayout={(dashboardWidgets) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardWidgets } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardWidgets } : prev.currentUser,
              }))}
              onSaveDashboardHiddenWidgets={(dashboardHiddenWidgets) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardHiddenWidgets } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardHiddenWidgets } : prev.currentUser,
              }))}
              onSaveDashboardShortcuts={(dashboardShortcuts) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardShortcuts } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardShortcuts } : prev.currentUser,
              }))}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "proforma"}>{activeTab === "proforma" && (
            <ProformaOrdersView overlayOnly={simpleCaseSource}
              guided={simpleCaseSource}
              key={`proforma-editor-${createNewOrderSignal}-${selectedOrderIdForEditor ?? "new"}-${simpleCaseSource ? "simple" : "classic"}-${caseOpenSequence}`}
              db={db}
              language={language}
              onSaveOrder={handleSaveOrder}
              onDeleteOrder={handleDeleteOrder}
              onSaveCustomer={handleSaveCustomer}
              onSaveSupplier={handleSaveSupplier}
              onSaveCashPartner={handleSaveCashPartner}
              onAddNewFieldOption={handleAddNewFieldOption}
              onSavePrintTemplateConfig={handleSavePrintTemplateConfig}
              onSaveIssuerCompanyShares={handleSaveIssuerCompanyShares}
              onSaveTransaction={handleSaveTransaction}
              onSaveTransactions={handleSaveTransactions}
              onDeleteTransaction={handleDeleteTransaction}
              onSaveDocumentTemplate={(template: DocumentTemplate) => setDb((prev) => ({ ...prev, printTemplateConfig: template.isActive && template.documentType !== "COO" && template.theme ? {...prev.printTemplateConfig, templateStyle: template.theme as PrintTemplateConfig["templateStyle"]} : prev.printTemplateConfig, documentTemplates: [...(prev.documentTemplates || []).filter((item) => item.id !== template.id).map((item) => template.isActive && item.documentType === template.documentType && item.theme === template.theme && item.issuerCompanyId === template.issuerCompanyId && (template.documentType !== "COO" || item.country?.toLowerCase() === template.country?.toLowerCase()) ? { ...item, isActive: false } : item), template] }))}
              onDeleteDocumentTemplate={(id: string) => setDb((prev) => ({ ...prev, documentTemplates: (prev.documentTemplates || []).filter((item) => item.id !== id && !item.isBuiltIn) }))}
              onSaveCustomFont={(font) => setDb((prev) => ({ ...prev, customFonts: [...(prev.customFonts || []).filter((item) => item.id !== font.id), font] }))}
              onDeleteCustomFont={(id) => setDb((prev) => ({ ...prev, customFonts: (prev.customFonts || []).filter((font) => font.id !== id) }))}
              onApplyAppFont={(fontFamily) => setDb((prev) => ({ ...prev, settings: { ...prev.settings, fontFamily } }))}
              onSaveTask={handleSaveTask}
              onSaveCalendarEvent={handleSaveCalendarEvent}
              canPrintDocuments={authenticatedUser.role === "superadmin" || db.roleDocumentPrintPermissions?.[authenticatedUser.role] === true}
              currentUserId={authenticatedUser.id}
              selectedOrderId={selectedOrderIdForEditor}
              onCloseEditor={returnFromProformaEditor}
              onRefreshApp={handleRefreshApp}
              createNewSignal={createNewOrderSignal}
              initialSubTab={selectedOrderInitialTab}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "access_entry_preview"}>{activeTab === "access_entry_preview" && <AccessOrderEntryPreview db={db} language={language} onSaveOrder={handleSaveOrder} onOpenOrder={(id, section = "general") => { setSelectedOrderIdForEditor(id ?? null); setSelectedOrderInitialTab(section); setActiveTab("proforma"); }} />}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "profit_calculator_preview"}>{activeTab === "profit_calculator_preview" && <ProfitCalculatorPreview db={db} onSaveOrder={handleSaveOrder} />}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "analytics"}>{activeTab === "analytics" && <OrderAnalyticsView db={db} />}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "reports"}>{activeTab === "reports" && <ReportsCenterView db={db} language={language} onOpenOrder={(id) => openOrderFromCurrentPage(id)} />}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "outlook_center"}>{activeTab === "outlook_center" && <OutlookExecutiveCenter />}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "tasks"}>{activeTab === "tasks" && (
            <TasksManagerView
              db={db}
              language={language}
              onSaveTask={handleSaveTask}
              onDeleteTask={handleDeleteTask}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "calendar"}>{activeTab === "calendar" && (
            <CommercialCalendarView
              db={db}
              language={language}
              onSaveCalendarEvent={handleSaveCalendarEvent}
              onDeleteCalendarEvent={handleDeleteCalendarEvent}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "users"}>{activeTab === "users" && authenticatedUser.role === "superadmin" && (
            <UserManagementView
              db={db}
              language={language}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              onSwitchUser={handleSwitchUser}
              onSaveRolePermissions={(rolePermissions) => setDb((prev) => ({ ...prev, rolePermissions }))}
              onSaveRoleDocumentPrintPermissions={(roleDocumentPrintPermissions) => setDb((prev) => ({ ...prev, roleDocumentPrintPermissions }))}
            />
          )}</KeepAlivePage>

          {retainedWorkspaceTabs.has("accounting") && (
            <div className={activeTab === "accounting" ? "block" : "hidden"} aria-hidden={activeTab !== "accounting"}>
            <RetainedAccountingCommissionsView
              db={db}
              language={language}
              onUpdateOrder={handleSaveOrder}
              onSaveTransaction={handleSaveTransaction}
              onSaveTransactions={handleSaveTransactions}
              onDeleteTransaction={handleDeleteTransaction}
              onSaveCompanyLedgerEntry={(entry) => setDb((prev) => ({ ...prev, companyLedgerEntries: [...(prev.companyLedgerEntries || []), entry] }))}
              onDeleteCompanyLedgerEntry={(id) => setDb((prev) => ({ ...prev, companyLedgerEntries: (prev.companyLedgerEntries || []).filter((entry) => entry.id !== id) }))}
              onSaveParty={handleSaveCashPartner}
              onDeleteParty={handleDeleteCashPartner}
              onSaveFinancialGroups={(financialGroups) => setDb(previous => { const next = { ...previous, financialGroups }; const error = validateFinancialGroups(next); if (error) { showToast(error); return previous; } return next; })}
              onConfirmListSettlement={async (listId,date,note) => {
                const next = confirmListProfitSettlement(db,listId,date,note);
                const error = validateFinancialGroups(next) || validatePaymentFunding(next,db);
                if(error)throw new Error(error);
                setDb(next);
                try { await saveServerDatabase(next); showToast("تسویه سود لیست و مختومه‌شدن پرونده‌ها ذخیره شد."); }
                catch(error) { showToast("تأیید محلی حفظ شد؛ ذخیره سرور را بررسی کنید."); throw error; }
              }}
              onSaveAccountingLists={(accountingLists) => setDb((prev) => ({ ...prev, accountingLists }))}
              onOpenCaseSection={(orderId, section) => {
                setSelectedOrderIdForEditor(orderId);
                setSelectedOrderInitialTab(section);
                setActiveTab("proforma");
              }}
              onSelectOrder={(orderId) => {
                setSelectedOrderIdForEditor(orderId);
                // Accounting rows are shortcuts for posting/viewing the selected case's ledger.
                // Opening the payment tab prevents an extra navigation step after choosing a PI.
                setSelectedOrderInitialTab("payments");
                setActiveTab("proforma");
              }}
            />
            </div>
          )}
          <KeepAlivePage active={usingNewWorkspace}>{usingNewWorkspace && <OptimizedWorkspacePreview db={db} onNewOrder={()=>handleOpenQuickAdd("order")} onOpenOrder={openOrderFromCurrentPage} pages={[
            {id:"cases",title:"پرونده‌ها",description:"پیدا کردن پرونده، تغییر وضعیت، ویرایش و مدارک؛ فهرست کوتاه و صفحه‌بندی‌شده.",content:<IntegratedModuleHub id="cases" sections={[{id:"main",title:"فهرست پرونده‌ها",content:<CaseDirectoryPreview db={db} onOpen={openOrderFromCurrentPage} onSave={handleSaveOrder} canOpenAccounting={canOpenIntegrated("accounting")}/>},{id:"quick",title:"ثبت سریع پرونده",content:<AccessOrderEntryPreview db={db} language={language} onSaveOrder={handleSaveOrder} onOpenOrder={(id, section = "general") => { if(id == null) handleOpenQuickAdd("order"); else { openOrderFromCurrentPage(id); setSelectedOrderInitialTab(section); } }} />,allowed:authenticatedUser.role === "superadmin" && canOpenIntegrated("access_entry_preview")}]}/>},
            {id:"accounting",title:"حسابداری",description:"ثبت خرید و فروش، دریافت و پرداخت، سهم‌ها، گروه‌های تجمیعی و لیست‌های اختصاصی؛ مرحله‌به‌مرحله.",content:<IntegratedModuleHub id="accounting" sections={[{id:"main",title:"حساب پرونده و گزارش‌های گروهی",content:<AccountingReferencePreview db={db} language={language} onUpdateOrder={handleSaveOrder} onSaveParty={handleSaveCashPartner} onSaveTransaction={handleSaveTransaction} onSaveTransactions={handleSaveTransactions} onDeleteTransaction={handleDeleteTransaction} onSaveLists={accountingLists=>setDb(previous=>({...previous,accountingLists}))} onSaveGroups={financialGroups=>setDb(previous=>{const next={...previous,financialGroups};const error=validateFinancialGroups(next);if(error){showToast(error);return previous;}return next;})} onOpenCase={(id,section)=>{openOrderFromCurrentPage(id);setSelectedOrderInitialTab(section);}}/>},{id:"ledgers",title:"دفاتر، منابع و انتقال‌ها",content:<AccountingCommissionsView guidedTools
              db={db}
              language={language}
              onUpdateOrder={handleSaveOrder}
              onSaveTransaction={handleSaveTransaction}
              onSaveTransactions={handleSaveTransactions}
              onDeleteTransaction={handleDeleteTransaction}
              onSaveCompanyLedgerEntry={(entry) => setDb((prev) => ({ ...prev, companyLedgerEntries: [...(prev.companyLedgerEntries || []), entry] }))}
              onDeleteCompanyLedgerEntry={(id) => setDb((prev) => ({ ...prev, companyLedgerEntries: (prev.companyLedgerEntries || []).filter((entry) => entry.id !== id) }))}
              onSaveParty={handleSaveCashPartner}
              onDeleteParty={handleDeleteCashPartner}
              onSaveFinancialGroups={(financialGroups) => setDb(previous => { const next = { ...previous, financialGroups }; const error = validateFinancialGroups(next); if (error) { showToast(error); return previous; } return next; })}
              onConfirmListSettlement={async (listId,date,note) => {
                const next = confirmListProfitSettlement(db,listId,date,note);
                const error = validateFinancialGroups(next) || validatePaymentFunding(next,db);
                if(error)throw new Error(error);
                setDb(next);
                try { await saveServerDatabase(next); showToast("تسویه سود لیست و مختومه‌شدن پرونده‌ها ذخیره شد."); }
                catch(error) { showToast("تأیید محلی حفظ شد؛ ذخیره سرور را بررسی کنید."); throw error; }
              }}
              onSaveAccountingLists={(accountingLists) => setDb((prev) => ({ ...prev, accountingLists }))}
              onOpenCaseSection={(orderId, section) => {
                openOrderFromCurrentPage(orderId);
                setSelectedOrderInitialTab(section);
                
              }}
              onSelectOrder={(orderId) => {
                openOrderFromCurrentPage(orderId);
                // Accounting rows are shortcuts for posting/viewing the selected case's ledger.
                // Opening the payment tab prevents an extra navigation step after choosing a PI.
                setSelectedOrderInitialTab("payments");
                
              }}
            />},{id:"customers",title:"حساب مشتریان",content:<CustomerFinancialOverview db={db} language={language} onUpdateOrder={handleSaveOrder} onOpenOrderFinancial={(orderId)=>{openOrderFromCurrentPage(orderId);setSelectedOrderInitialTab("payments");}}/>,allowed:canOpenIntegrated("customer_accounts")},{id:"companies",title:"دفتر مالی شرکت‌های زیرمجموعه",content:<CompanyFinancePortal user={authenticatedUser} isArcaAdmin embedded/>,allowed:authenticatedUser.role === "superadmin"},{id:"operations",title:"عملیات تجاری و هزینه‌ها",content:<CommercialOperationsView
              db={db}
              language={language}
              onSavePrice={handleSavePrice}
              onSaveCost={handleSaveCost}
              onSaveGeneralCost={handleSaveGeneralCost}
              onSaveSale={handleSaveSale}
            />,allowed:canOpenIntegrated("operations")},{id:"cheques",title:"صدور چک",content:<BmoChequeIssuer
              db={db}
              userId={authenticatedUser?.id || "u_admin"}
              onSave={(printedCheques, chequePrintSettings, chequePrintFormats) => setDb((previous) => ({ ...previous, printedCheques, chequePrintSettings, chequePrintFormats }))}
            />,allowed:canUseChequeIssuer},{id:"profit",title:"محاسبه سود",content:<ProfitCalculatorPreview db={db} onSaveOrder={handleSaveOrder} />,allowed:canOpenIntegrated("profit_calculator_preview")},{id:"journal",title:"ثبت جامع حسابداری",content:<BusinessAccountingPreview db={db} onSaveTransaction={handleSaveTransaction} onSaveTransactions={handleSaveTransactions} onDeleteTransaction={handleDeleteTransaction}/>,allowed:canOpenIntegrated("business_accounting_preview")}]}/>},
            {id:"cash",title:"صندوق",description:"ثبت گردش واقعی صندوق‌ها به تفکیک ارز، حساب و تاریخ.",content:<MultiCurrencyCashView guided db={db} language={language} onSaveCashEntry={handleSaveCashEntry} onDeleteCashEntry={handleDeleteCashEntry} onSavePartner={handleSaveCashPartner} onDeletePartner={handleDeleteCashPartner}/>},
            {id:"parties",title:"اشخاص و شرکت‌ها",description:"ثبت و ویرایش اطلاعات مشتریان و تأمین‌کنندگان؛ همان فهرست مشترک برنامه.",content:<CustomersSuppliersView guided db={db} onSaveCustomer={handleSaveCustomer} onDeleteCustomer={handleDeleteCustomer} onSaveSupplier={handleSaveSupplier} onDeleteSupplier={handleDeleteSupplier} onQuickNewProformaForCustomer={()=>handleOpenQuickAdd("order")}/>},
            {id:"products",title:"کالاها",description:"اطلاعات کالا، اسناد فنی، استعلام و قیمت تأمین‌کننده.",content:<ProductsCatalogView guided db={db} onSaveProduct={handleSaveProduct} onDeleteProduct={handleDeleteProduct} onSaveInquiry={handleSaveInquiry} onSavePrice={handleSavePrice} onOpenQuickAddProformaWithProduct={()=>handleOpenQuickAdd("order")}/>},
            {id:"logistics",title:"حمل و پیگیری",description:"بارنامه‌ها، کانتینرها، کامیون و زمان‌بندی حمل پرونده‌های واقعی.",content:<LogisticsTrackingView guided db={db} onUpdateOrderLogistics={handleSaveOrder}/>},
            {id:"planning",title:"تقویم و برنامه‌ریزی",defaultSection:"calendar",description:"کارها، موعدها و تقویم مشترک.",content:<IntegratedModuleHub id="planning" quickTabs sections={[{id:"calendar",title:"تقویم و برنامه‌ریزی",content:<CommercialCalendarView db={db} language={language} onSaveCalendarEvent={handleSaveCalendarEvent} onDeleteCalendarEvent={handleDeleteCalendarEvent} onSelectOrder={openOrderFromCurrentPage}/>},{id:"tasks",title:"کارها و پیگیری",content:<TasksManagerView guided db={db} language={language} onSaveTask={handleSaveTask} onDeleteTask={handleDeleteTask} onToggleTaskComplete={(id,resultNote)=>{const task=(db.tasks||[]).find(item=>item.id===id);if(task)handleSaveTask({...task,completed:!task.completed,...(resultNote?{resultNote}:{})});}} onOpenOrder={openOrderFromCurrentPage}/>}]}/>},
            {id:"settings",title:"تنظیمات",description:"ظاهر و منو، تنظیمات عمومی، شرکت و اسناد؛ مطابق سطح دسترسی.",content:<IntegratedModuleHub id="settings" sections={[{id:"main",title:"ظاهر و تنظیمات برنامه",content:renderSettings(true)},{id:"users",title:"کاربران و دسترسی‌ها",content:<UserManagementView
              db={db}
              language={language}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              onSwitchUser={handleSwitchUser}
              onSaveRolePermissions={(rolePermissions) => setDb((prev) => ({ ...prev, rolePermissions }))}
              onSaveRoleDocumentPrintPermissions={(roleDocumentPrintPermissions) => setDb((prev) => ({ ...prev, roleDocumentPrintPermissions }))}
            />,allowed:authenticatedUser.role === "superadmin"},{id:"backup",title:"پشتیبان‌گیری و بازگردانی",content:<BackupRestoreView
              db={db}
              onDatabaseRestored={(newDb) => {
                setDb(newDb);
                showToast("دیتابیس با موفقیت بازگردانی شد.");
              }}
            />,allowed:canOpenIntegrated("backup")},{id:"import",title:"ورود اطلاعات Access",content:<AccessImportModal
              currentDb={db}
              onImportSuccess={handleAccessImportSuccess}
              onClose={() => navigateIntegratedWorkspace("settings")}
            />,allowed:canOpenIntegrated("access_import")}]}/>},
            {id:"reports",title:"گزارش‌ها",description:"گزارش واقعی پرونده‌ها، مشتریان و کالاها با فیلتر و خروجی.",content:<IntegratedModuleHub id="reports" sections={[{id:"main",title:"گزارش‌های عملیاتی",content:<ReportsCenterView guided db={db} language={language} onOpenOrder={openOrderFromCurrentPage}/>},{id:"analytics",title:"تحلیل و آمار پرونده‌ها",content:<OrderAnalyticsView db={db} />,allowed:canOpenIntegrated("analytics")},{id:"dashboard",title:"داشبورد و میانبرها",content:<DashboardOverview
              db={db}
              language={language}
              setActiveTab={navigateIntegratedWorkspace}
              onOpenQuickAdd={handleOpenQuickAdd}
              onOpenAI={() => setIsAIDrawerOpen(true)}
              onSelectOrder={(id) => {
                
                openOrderFromCurrentPage(id);
                setSelectedOrderInitialTab("general");
              }}
              onOpenAccessImport={() => navigateIntegratedWorkspace("access_import")}
              onUpdateTask={handleSaveTask}
              onUpdateOrder={handleSaveOrder}
              onSaveDashboardLayout={(dashboardWidgets) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardWidgets } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardWidgets } : prev.currentUser,
              }))}
              onSaveDashboardHiddenWidgets={(dashboardHiddenWidgets) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardHiddenWidgets } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardHiddenWidgets } : prev.currentUser,
              }))}
              onSaveDashboardShortcuts={(dashboardShortcuts) => setDb((prev) => ({
                ...prev,
                users: prev.users.map((user) => user.id === authenticatedUser.id ? { ...user, dashboardShortcuts } : user),
                currentUser: prev.currentUser?.id === authenticatedUser.id ? { ...prev.currentUser, dashboardShortcuts } : prev.currentUser,
              }))}
            />,allowed:canOpenIntegrated("dashboard")}]}/>}
,
            {id:"communications",title:"ارتباطات",description:"مکاتبات، درخواست‌ها و منشی اجرایی.",content:<IntegratedModuleHub id="communications" sections={[{id:"letters",title:"مکاتبات و درخواست‌ها",content:<OfficeCorrespondenceView db={db} language={language} onSaveSettings={(commissionRequestSettings) => setDb((prev) => ({ ...prev, commissionRequestSettings }))} onSaveLetter={(letter) => setDb((prev) => ({ ...prev, commissionRequestLetters: [letter, ...(prev.commissionRequestLetters || [])] }))}/>,allowed:canOpenIntegrated("correspondence")},{id:"outlook",title:"منشی و Outlook",content:<OutlookExecutiveCenter />,allowed:canOpenIntegrated("outlook_center")}]}/>}
          ].filter(page=>{
            if(page.id === "settings") return true;
            if(page.id === "communications") return canOpenIntegrated("correspondence") || canOpenIntegrated("outlook_center");
            if(page.id === "planning") return canOpenIntegrated("tasks") || canOpenIntegrated("calendar");
            const tabs: Record<string,string> = {cases:"proforma", accounting:"accounting", cash:"cash", parties:"customers", products:"products", logistics:"logistics", reports:"reports"};
            return canOpenIntegrated(tabs[page.id] || page.id);
          })}/>}</KeepAlivePage>
          <KeepAlivePage active={activeTab === "accounting_reference_preview"}>{activeTab === "accounting_reference_preview" && <AccountingReferencePreview db={db} language={language} onUpdateOrder={handleSaveOrder} onSaveParty={handleSaveCashPartner} onSaveTransaction={handleSaveTransaction} onSaveTransactions={handleSaveTransactions} onDeleteTransaction={handleDeleteTransaction} onSaveLists={accountingLists=>setDb(previous=>({...previous,accountingLists}))} onSaveGroups={financialGroups=>setDb(previous=>{const next={...previous,financialGroups};const error=validateFinancialGroups(next);if(error){showToast(error);return previous;}return next;})} onOpenCase={(id,section)=>{openOrderFromCurrentPage(id);setSelectedOrderInitialTab(section);}}/>}</KeepAlivePage>
          <KeepAlivePage active={activeTab === "business_accounting_preview"}>{activeTab === "business_accounting_preview" && <BusinessAccountingPreview db={db} onSaveTransaction={handleSaveTransaction} onSaveTransactions={handleSaveTransactions} onDeleteTransaction={handleDeleteTransaction}/>}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "cash"}>{activeTab === "cash" && (
            <MultiCurrencyCashView
              db={db}
              language={language}
              onSaveCashEntry={handleSaveCashEntry}
              onDeleteCashEntry={handleDeleteCashEntry}
              onSavePartner={handleSaveCashPartner}
              onDeletePartner={handleDeleteCashPartner}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "customers"}>{activeTab === "customers" && (
            <CustomersSuppliersView
              db={db}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              onSaveSupplier={handleSaveSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onQuickNewProformaForCustomer={(custId) => {
                setActiveTab("proforma");
                setSelectedOrderIdForEditor(null);
              }}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "suppliers"}>{activeTab === "suppliers" && (
            <CustomersSuppliersView
              db={db}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              onSaveSupplier={handleSaveSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onQuickNewProformaForCustomer={(custId) => {
                setActiveTab("proforma");
                setSelectedOrderIdForEditor(null);
              }}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "products"}>{activeTab === "products" && (
            <ProductsCatalogView
              db={db}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveInquiry={handleSaveInquiry}
              onSavePrice={handleSavePrice}
              onOpenQuickAddProformaWithProduct={(prod) => {
                setActiveTab("proforma");
                setSelectedOrderIdForEditor(null);
              }}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "pricing"}>{activeTab === "pricing" && (
            <ProductsCatalogView
              db={db}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveInquiry={handleSaveInquiry}
              onSavePrice={handleSavePrice}
              onOpenQuickAddProformaWithProduct={(prod) => {
                setActiveTab("proforma");
                setSelectedOrderIdForEditor(null);
              }}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "operations"}>{activeTab === "operations" && (
            <CommercialOperationsView
              db={db}
              language={language}
              onSavePrice={handleSavePrice}
              onSaveCost={handleSaveCost}
              onSaveGeneralCost={handleSaveGeneralCost}
              onSaveSale={handleSaveSale}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "customer_accounts"}>{activeTab === "customer_accounts" && <CustomerFinancialOverview db={db} language={language} onUpdateOrder={handleSaveOrder} onOpenOrderFinancial={(orderId)=>{setSelectedOrderIdForEditor(orderId);setSelectedOrderInitialTab("payments");setActiveTab("proforma")}}/>}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "correspondence"}>{activeTab === "correspondence" && <OfficeCorrespondenceView db={db} language={language} onSaveSettings={(commissionRequestSettings) => setDb((prev) => ({ ...prev, commissionRequestSettings }))} onSaveLetter={(letter) => setDb((prev) => ({ ...prev, commissionRequestLetters: [letter, ...(prev.commissionRequestLetters || [])] }))}/>}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "cheque_issuer"}>{activeTab === "cheque_issuer" && canUseChequeIssuer && (
            <BmoChequeIssuer
              db={db}
              userId={authenticatedUser?.id || "u_admin"}
              onSave={(printedCheques, chequePrintSettings, chequePrintFormats) => setDb((previous) => ({ ...previous, printedCheques, chequePrintSettings, chequePrintFormats }))}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "settings"}>{activeTab === "settings" && (
            renderSettings()
          )}</KeepAlivePage>

          {retainedWorkspaceTabs.has("logistics") && (
            <div className={activeTab === "logistics" ? "block" : "hidden"} aria-hidden={activeTab !== "logistics"}>
            <RetainedLogisticsTrackingView
              db={db}
              onUpdateOrderLogistics={handleSaveOrder}
            />
            </div>
          )}

          <KeepAlivePage active={activeTab === "access_import"}>{activeTab === "access_import" && (
            <AccessImportModal
              currentDb={db}
              onImportSuccess={handleAccessImportSuccess}
              onClose={() => restoreNavigation(-1)}
            />
          )}</KeepAlivePage>

          <KeepAlivePage active={activeTab === "backup"}>{activeTab === "backup" && (
            <BackupRestoreView
              db={db}
              onDatabaseRestored={(newDb) => {
                setDb(newDb);
                showToast("دیتابیس با موفقیت بازگردانی شد.");
              }}
            />
          )}</KeepAlivePage>
          </Suspense>
        </main>

        {/* High Density Status Footer */}
        <footer data-app-status-footer className="h-8 bg-white border-t border-slate-200 px-5 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">ARCA Commercial ERP v3.5</span>
            <span>•</span>
            <span>{t("access_import_title")}</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <FooterClock/>
            <span className="flex items-center gap-1 text-emerald-600 font-sans font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {language === "fa" ? "دیتابیس متصل" : "Connected"}
            </span>
          </div>
        </footer>
      </div>

      {/* AI Accountant Chat Drawer */}
      <Suspense fallback={null}><AIAssistantDrawer
        isOpen={isAIDrawerOpen}
        onClose={() => setIsAIDrawerOpen(false)}
        db={db}
        userRole={authenticatedUser.role}
        onApplyAIAction={handleApplyAIAction}
      /></Suspense>

      {/* Access Database Import Modal */}
      {isAccessImportOpen && (
        <Suspense fallback={<PageLoader />}><AccessImportModal
          currentDb={db}
          onImportSuccess={handleAccessImportSuccess}
          onClose={() => setIsAccessImportOpen(false)}
        /></Suspense>
      )}
    </div></PartyDirectoryProvider>
  );
}
