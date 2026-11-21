import { InlineHelp } from "./InlineHelp";
import { useResponsiveText } from "../hooks/useResponsiveText";
import { FinancialGroupsPanel } from "./FinancialGroupsPanel";
import { FinancialGroup } from "../types";
import { IssuerProfitCustodyPanel } from "./IssuerProfitCustodyPanel";
import { getCaseFinancials, summarizeCaseFinancials, getBeneficiarySettlement, isCaseCommissionSettled } from "../utils/caseFinancials";
import { getOwnAccountRealization } from "../utils/orderAccounting";
import { AccountingWorkbenchPreview, type WorkbenchEditorSection } from "./AccountingWorkbenchPreview";
import { getOrderAmountInUSD, getOrderProfitToUSDMultiplier, getOrderCurrency } from "../utils/orderAccounting";
import { projectCaseProfit, calculateUnifiedProfit, getCaseShareRecipients } from "../utils/caseProfitEngine";
import { OwnAccountCasesReport } from "./OwnAccountCasesReport";
import { PaymentFundingPanel } from "./PaymentFundingPanel";
import { PartyDirectory } from "./PartyDirectory";
import { CashPartner } from "../types";
import { getInterCaseTransfers, transferLabel, transferEndpoints } from "../utils/interCaseTransfers";
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Download,
  DollarSign,
  TrendingUp,
  CreditCard,
  Building,
  Users,
  FlaskConical,
  Eye,
  EyeOff,
} from "lucide-react";
import { AccountingList, Order, AppDatabase, CompanyLedgerEntry, Language, OrderTransaction } from "../types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { withDummyProformaSuffix } from "../utils/proformaNumber";
import { exportToCSV } from "../services/storageService";
import { CompanyLedgerPanel } from "./CompanyLedgerPanel";
import { ShareholderAccountsPanel } from "./ShareholderAccountsPanel";
import { calculateProfitBreakdownUSD } from "../utils/profitCalculations";
import { normalizePartnerName } from "../utils/partnerIdentity";
import { convertedTransactionAmount, getOrderCommercialTotal, getOrderPaymentSummary } from "../utils/orderAccounting";
import { CaseAccountingCenter } from "./CaseAccountingCenter";
import { CustomAccountingLists } from "./CustomAccountingLists";
import { CustomerAccountLedger } from "./CustomerAccountLedger";
import { OrderListTools, useOrderListFilters } from "./OrderListTools";
import { DashboardCfrEstimator } from "./DashboardCfrEstimator";
import { BasicAccountingCalculator } from "./BasicAccountingCalculator";

interface AccountingCommissionsViewProps {
  guidedTools?: boolean;
  db: AppDatabase;
  onSaveParty: (party: CashPartner) => void;
  onDeleteParty?: (partyId: string) => void;
  onUpdateOrder: (order: Order) => void;
  onSelectOrder?: (orderId: number) => void;
  onOpenCaseSection?: (orderId: number, section: WorkbenchEditorSection) => void;
  onSaveCompanyLedgerEntry?: (entry: CompanyLedgerEntry) => void;
  onDeleteCompanyLedgerEntry?: (id: string) => void;
  language: Language;
  onSaveTransaction: (transaction: OrderTransaction) => void;
  onSaveTransactions?: (transactions: OrderTransaction[]) => void;
  onDeleteTransaction: (transactionId: number) => void;
  onSaveFinancialGroups?: (groups: FinancialGroup[]) => void;
  onConfirmListSettlement?: (listId:string,date:string,note:string)=>Promise<void>;
  onSaveAccountingLists?: (lists: AccountingList[]) => void;
}

const DeferredAccountingTextInput: React.FC<{ value: string; onCommit: (value: string) => void; placeholder: string; className: string; mono?: boolean }> = React.memo(({ value, onCommit, placeholder, className }) => {
  const [localValue, setLocalValue] = useResponsiveText(value, onCommit);
  return <input type="text" placeholder={placeholder} value={localValue} onChange={(event) => setLocalValue(event.target.value)} className={className}/>;
});

export const AccountingCommissionsView: React.FC<AccountingCommissionsViewProps> = ({
  db,
  guidedTools = false,
  onUpdateOrder,
  onSaveParty,
  onDeleteParty,
  onSelectOrder,
  onOpenCaseSection,
  onSaveCompanyLedgerEntry,
  onDeleteCompanyLedgerEntry,
  language,
  onSaveTransaction,
  onSaveTransactions,
  onDeleteTransaction,
  onSaveAccountingLists, onSaveFinancialGroups, onConfirmListSettlement,
}) => {
  const [piSearch, setPiSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  // Search fields must remain responsive even when there are many cases and
  // each case has a detailed profit/commission calculation.  The input state
  // updates immediately; only the expensive table filtering catches up.
  const deferredPiSearch = useDeferredValue(piSearch);
  const deferredSupplierSearch = useDeferredValue(supplierSearch);
  const deferredCustomerSearch = useDeferredValue(customerSearch);
  const [activeOnly, setActiveOnly] = useState<boolean | null>(true);
  const [commissionPaidFilter, setCommissionPaidFilter] = useState<boolean | null>(null);
  const [buyerPaidFilter, setBuyerPaidFilter] = useState<boolean | null>(null);
  const [dummyFilter, setDummyFilter] = useState<"ALL" | "REAL" | "DUMMY">("ALL");
  const [accountingSection, setAccountingSection] = useState<"financial_groups" | "workbench_preview" | "own_accounts" | "funding" | "overview" | "customer_ledgers" | "case_ledgers" | "custom_lists" | "transfers" | "stakeholders" | "company" | "orders" | "cfr_estimator" | "calculator">(() => {
    if(guidedTools) return "company";
    try { return sessionStorage.getItem("arcatav.accounting.preview-active") === "true" ? "workbench_preview" : "overview"; } catch { return "overview"; }
  });
  useEffect(() => { try { sessionStorage.setItem("arcatav.accounting.preview-active", String(accountingSection === "workbench_preview")); } catch { /* Session storage is optional. */ } }, [accountingSection]);
  const [selectedLedgerOrderId, setSelectedLedgerOrderId] = useState<number | null>(null);
  const [showShareColumns, setShowShareColumns] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<{ kind: "margin" | "arca" | "bera" | "commission" | "share"; key?: string; label: string } | null>(null);
  const [settlementOrderId, setSettlementOrderId] = useState<number | null>(null);
  // Opening the accounting center must not synchronously calculate every
  // ledger/profit share in the database.  Render the workspace first and let
  // the detailed financial summary begin on the next browser frame.
  const [financialDataReady, setFinancialDataReady] = useState(false);
  useEffect(() => {
    const needsFinancialSummary = accountingSection === "overview" || accountingSection === "orders";
    if (!needsFinancialSummary) { setFinancialDataReady(false); return; }
    setFinancialDataReady(false);
    const frame = requestAnimationFrame(() => setFinancialDataReady(true));
    return () => cancelAnimationFrame(frame);
  }, [accountingSection, db]);
  const orderListFilters = useOrderListFilters(db.orders);
  const [settlement, setSettlement] = useState({ type: "paid" as "paid" | "received" | "advance" | "advance_repayment" | "advance_offset", partyName: "", amount: 0, currency: "USD", date: new Date().toISOString().slice(0, 10), note: "" });
  const settlementOrder = db.orders.find((order) => order.OrderID === settlementOrderId);

  const partiesFor = (order: Order) => getCaseFinancials(db, order).shares.map(item => ({ name: item.name, amount: item.amount }));
  const paidFor = (order: Order, partyName: string) => getBeneficiarySettlement(order, partyName, db).paid;
  const advanceFor = (order: Order, partyName: string) => getBeneficiarySettlement(order, partyName, db).advance;
  const saveSettlement = () => {
    if (!settlementOrder || !settlement.partyName.trim() || settlement.amount <= 0) return;
    const entries = [...(settlementOrder.commissionSettlements || []), { ...settlement, id: `commission-settlement-${Date.now()}`, createdAt: new Date().toISOString() }];
    const totalPaid = entries.filter((item) => item.type === "paid" || item.type === "advance_offset").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    onUpdateOrder({ ...settlementOrder, commissionSettlements: entries, CommissionPaid: isCaseCommissionSettled(db, { ...settlementOrder, commissionSettlements: entries }) });
    setSettlement({ type: "paid", partyName: "", amount: 0, currency: getCaseFinancials(db, settlementOrder).profitCurrency, date: new Date().toISOString().slice(0, 10), note: "" });
  };
  const deleteSettlement = (id: string) => {
    if (!settlementOrder) return;
    const entries = (settlementOrder.commissionSettlements || []).filter((item) => item.id !== id);
    const totalPaid = entries.filter((item) => item.type === "paid" || item.type === "advance_offset").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    onUpdateOrder({ ...settlementOrder, commissionSettlements: entries, CommissionPaid: isCaseCommissionSettled(db, { ...settlementOrder, commissionSettlements: entries }) });
  };

  const usdValue = (order: Order, amount: number | undefined) => Number(amount || 0) * (getOrderProfitToUSDMultiplier(order) ?? 0);
  const filteredOrders = useMemo(() => orderListFilters.filteredOrders.filter((order) => {
    if (deferredPiSearch && !(order.ProformaInvoiceID || "").toLowerCase().includes(deferredPiSearch.toLowerCase())) {
      return false;
    }
    if (deferredSupplierSearch && !(order.SupplierName || "").toLowerCase().includes(deferredSupplierSearch.toLowerCase())) {
      return false;
    }
    if (deferredCustomerSearch && !(order.CustomerName || "").toLowerCase().includes(deferredCustomerSearch.toLowerCase())) {
      return false;
    }
    if (activeOnly !== null && order.ActiveOrder !== activeOnly) {
      return false;
    }
    if (commissionPaidFilter !== null && order.CommissionPaid !== commissionPaidFilter) {
      return false;
    }
    if (buyerPaidFilter !== null && order.BuyerPaid !== buyerPaidFilter) {
      return false;
    }
    if (dummyFilter === "REAL" && (order.IsDummy || order.ExcludeFromCalculations)) {
      return false;
    }
    if (dummyFilter === "DUMMY" && !order.IsDummy && !order.ExcludeFromCalculations) {
      return false;
    }
    return true;
  }), [orderListFilters.filteredOrders, deferredPiSearch, deferredSupplierSearch, deferredCustomerSearch, activeOnly, commissionPaidFilter, buyerPaidFilter, dummyFilter]);

  // Calculate Aggregation Totals EXCLUDING dummy / excluded orders
  type ShareColumn = { key: string; label: string; total: number };
  const financialSummary = useMemo(() => {
    const financialCache = new Map<number, ReturnType<typeof getCaseFinancials>>();
    const financialFor = (order: Order) => { let value = financialCache.get(order.OrderID); if (!value) { value = getCaseFinancials(db, order); financialCache.set(order.OrderID, value); } return value; };
    const reportRecipients = (order: Order) => financialFor(order).usdShares.map(item => ({ name: item.name, amount: item.amount }));
    const normalized = normalizePartnerName;
    const financialScopeOrders = financialDataReady ? filteredOrders : [];
    const summary = summarizeCaseFinancials(db, financialScopeOrders);
    const calculationOrders = summary.ready.map(financial => financial.order);
    const columns = new Map<string, ShareColumn>();
    calculationOrders.forEach(order => reportRecipients(order).forEach(item => {
      const key = normalized(item.name);
      if (Math.abs(item.amount) <= .005 || key === "arcatav") return;
      const previous = columns.get(key);
      columns.set(key, { key, label: key === "petromac" ? "پتروماک (لیدا)" : item.name, total: (previous?.total || 0) + item.amount });
    }));
    return {
      financialFor,
      calculationOrders,
      totals: summary,
      hasProfitInputs: (order: Order) => financialFor(order).inputComplete,
      incompleteProfitCount: financialScopeOrders.filter(order => financialFor(order).status === "incomplete").length,
      dummyExcludedCount: financialScopeOrders.filter(order => financialFor(order).status === "excluded").length,
      sumTotalMargin: summary.totalProfitUSD,
      sumArca: summary.arcatavShareUSD,
      sumBera: summary.issuerShareUSD,
      sumTotalCommission: summary.commissionUSD,
      orderCommissionTotal: (order: Order) => financialFor(order).usdProfit.individualShares,
      reportRecipients,
      orderShareValue: (order: Order, column: ShareColumn) => reportRecipients(order).filter(item => normalized(item.name) === column.key).reduce((sum, item) => sum + item.amount, 0),
      shareColumns: [...columns.values()],
    };
  }, [db, financialDataReady, filteredOrders]);
  const { financialFor, calculationOrders, totals, hasProfitInputs, incompleteProfitCount, dummyExcludedCount, sumTotalMargin, sumArca, sumBera, sumTotalCommission, orderCommissionTotal, reportRecipients, orderShareValue, shareColumns } = financialSummary;
  const visibleOrders = summaryFilter ? filteredOrders.filter((order) => {
    if (summaryFilter.kind === "margin") return hasProfitInputs(order) && Math.abs(financialFor(order).usdProfit.totalCaseProfit) > .005;
    if (summaryFilter.kind === "arca") return Math.abs(financialFor(order).usdProfit.arcaShare) > .005;
    if (summaryFilter.kind === "bera") return Math.abs(financialFor(order).usdProfit.issuerCompanyShare) > .005;
    if (summaryFilter.kind === "commission") return Math.abs(orderCommissionTotal(order)) > .005;
    const column = shareColumns.find((item) => item.key === summaryFilter.key);
    return column ? Math.abs(orderShareValue(order, column)) > .005 : false;
  }) : filteredOrders;
  const summaryCardClass = (active: boolean) => `w-full bg-white p-3 rounded-xl border shadow-xs text-right transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 ${active ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`;
  const toggleSummaryFilter = (next: NonNullable<typeof summaryFilter>) => {
    setSummaryFilter((current) => current?.kind === next.kind && current?.key === next.key ? null : next);
    globalThis.setTimeout(() => document.getElementById("accounting-filtered-orders")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleToggleStatus = (
    order: Order,
    field: "BuyerPaid" | "CommissionPaid" | "ActiveOrder" | "ThirdPartyPaid" | "IsDummy"
  ) => {
    if (field === "IsDummy") {
      const nextVal = !order.IsDummy;
      onUpdateOrder({
        ...order,
        IsDummy: nextVal,
        ExcludeFromCalculations: nextVal,
        ProformaInvoiceID: withDummyProformaSuffix(order.ProformaInvoiceID, nextVal),
      });
      return;
    }
    if (field === "ActiveOrder") {
      const nextActive = !order.ActiveOrder;
      onUpdateOrder({
        ...order,
        ActiveOrder: nextActive,
        LifecycleStatus: nextActive ? "active" : "completed",
        OrderStatus: nextActive ? "فعال (Active)" : "مختومه (Completed)",
      });
      return;
    }
    const updated = {
      ...order,
      [field]: !order[field],
    };
    onUpdateOrder(updated);
  };

  const activityToggle = (order: Order) => <button type="button" aria-label={`تغییر وضعیت پرونده ${order.ProformaInvoiceID}`} aria-pressed={!!order.ActiveOrder} onClick={(event) => { event.stopPropagation(); handleToggleStatus(order, "ActiveOrder"); }} title={order.ActiveOrder ? "فعال؛ کلیک برای غیرفعال‌کردن" : "غیرفعال؛ کلیک برای فعال‌کردن"} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-bold ${order.ActiveOrder ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ${order.ActiveOrder ? "bg-emerald-500" : "bg-slate-400"}`}><span className={`h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${order.ActiveOrder ? "translate-x-1" : "translate-x-5"}`}/></span>{order.ActiveOrder ? "فعال" : "غیرفعال"}</button>;

  const handleExportCSV = () => {
    const rows = visibleOrders.map((o) => ({
      "شناسه سفارش": o.OrderID,
      "شماره پروفرما": o.ProformaInvoiceID,
      "مشتری": o.CustomerName,
      "تأمین‌کننده": o.SupplierName,
      "مقدار (KG)": o.TotalQuantity,
      "قیمت فروش": o.SellPrice,
      "نرخ CFR": o.CFRNet,
      "مارجین": o.Margin,
      "سود کل ($)": financialFor(o).reportable ? financialFor(o).usdProfit.totalCaseProfit : financialFor(o).statusLabel,
      "مبلغ فاکتور ($)": getOrderAmountInUSD(o, getOrderCommercialTotal(o), o.InvoiceCurrency || o.TransactionCurrency),
      "سهم آرکا ($)": financialFor(o).usdProfit.arcaShare,
      "سهم برا ($)": financialFor(o).usdProfit.issuerCompanyShare,
      ...Object.fromEntries(shareColumns.map(column => [`سهم ${column.label} (USD)`, orderShareValue(o, column)])),
      "وضعیت محاسبه": financialFor(o).statusLabel,
      "پورسانت کل ($)": orderCommissionTotal(o),
      "پرداخت خریدار": o.BuyerPaid ? "بله" : "خیر",
      "پرداخت پورسانت": o.CommissionPaid ? "بله" : "خیر",
      "سفارش فعال": o.ActiveOrder ? "بله" : "خیر",
    }));
    exportToCSV("Arca_Accounting_Shares.csv", rows);
  };

  // These are dashboard-only computations.  Previously they ran during every
  // keystroke in the separate "reports and shares" search form because this
  // component stays mounted.  Cache them independently so that typing does
  // not calculate payment and profit figures for every case.
  const realOrders = useMemo(
    () => financialDataReady ? orderListFilters.filteredOrders.filter((order) => !order.IsDummy && !order.ExcludeFromCalculations) : [],
    [financialDataReady, orderListFilters.filteredOrders],
  );
  const accountingPulse = useMemo(() => {
    const pulse = realOrders.reduce((summary, order) => {
      const payment = getOrderPaymentSummary(db, order);
      const profit = financialFor(order).usdProfit;
      summary.invoice += getOrderAmountInUSD(order, payment.invoiceTotal, getOrderCurrency(order)) ?? 0;
      summary.received += getOrderAmountInUSD(order, payment.directReceipts, getOrderCurrency(order)) ?? 0;
      summary.outstanding += getOrderAmountInUSD(order, payment.customerOutstanding, getOrderCurrency(order)) ?? 0;
      summary.profit += profit.totalCaseProfit;
      return summary;
    }, { invoice: 0, received: 0, outstanding: 0, profit: 0 });
    pulse.profit = summarizeCaseFinancials(db, realOrders).totalProfitUSD;
    return pulse;
  }, [db, financialFor, realOrders]);
  const recentTransfers = useMemo(() => getInterCaseTransfers(db), [db]);

  return (
    <div id="accounting-commissions-root" className="space-y-6">{filteredOrders.some(order => getOrderProfitToUSDMultiplier(order) === null) && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">پرونده‌های فاقد نرخ دلار در جمع سود USD لحاظ نشده‌اند؛ نرخ دلار را در سود و پورسانت پرونده ثبت کنید.</p>}
      {totals.partialGroups.length>0&&<p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">{totals.partialGroups.length} گروه فقط بخشی از اعضایش در این فیلتر است؛ سود تجمیعی آن‌ها در جمع فیلتر لحاظ نشده است. برای نتیجهٔ گروه، همهٔ اعضا را انتخاب کنید یا بخش گروه‌های مالی را باز کنید.</p>}
      {/* View Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="text-indigo-600" size={22} />
            <span>{guidedTools ? "دفاتر و منابع مالی" : "مرکز حسابداری یکپارچه"}</span>
          </h1>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            دفتر چندگانه پرونده‌ها، سود و زیان، دریافت و پرداخت، انتقالات، سهم اشخاص و دفتر شرکت
          </p></InlineHelp>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all self-start md:self-auto"
        >
          <Download size={15} />
          <span>خروجی فایل اکسل حسابداری</span>
        </button>
      </div>

      {guidedTools ? <label className="flex flex-wrap items-center gap-2 rounded-xl border bg-white/70 p-3 text-sm"><span>دفتر یا ابزار</span><select aria-label="انتخاب دفتر حسابداری" value={accountingSection} onChange={event=>setAccountingSection(event.target.value as typeof accountingSection)} className="min-w-0 flex-1 rounded-lg border p-2 sm:max-w-sm">{[["company","دفتر شرکت"],["funding","منابع پرداخت و بدهی‌ها"],["customer_ledgers","دفتر مشتریان"],["transfers","انتقال‌ها و بازپرداخت‌ها"],["stakeholders","حساب سهم‌داران"],["orders","گزارش و سهم‌ها"],["case_ledgers","دفتر پرونده"],["cfr_estimator","برآورد CFR"],["calculator","ماشین‌حساب"]].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label> : <div className="sticky top-0 z-20 flex flex-wrap gap-2 rounded-xl border border-indigo-100 bg-white/95 p-2 shadow-sm backdrop-blur">{[["overview","نمای کلی"],["financial_groups","گروه‌های مالی"],["workbench_preview","فرم جامع حسابداری"],["funding","منابع پرداخت و بدهی‌ها"],["own_accounts","پرونده‌های به حساب خودم"],["customer_ledgers","دفتر مشتریان"],["case_ledgers","دفتر پرونده"],["custom_lists","لیست‌های اختصاصی"],["transfers","انتقال‌ها"],["stakeholders","اشخاص و شرکت‌ها"],["company","دفتر شرکت"],["orders","گزارش و سهم‌ها"],["cfr_estimator","ماشین‌حساب CFR"],["calculator","ماشین‌حساب معمولی"]].map(([id,label])=><button key={id} onClick={()=>setAccountingSection(id as typeof accountingSection)} className={`rounded-lg px-4 py-2 text-xs font-bold ${accountingSection===id?"bg-indigo-600 text-white":"bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}</div>}
      {accountingSection === "financial_groups" && onSaveFinancialGroups && <FinancialGroupsPanel db={db} onSaveGroups={onSaveFinancialGroups} onSaveParty={onSaveParty}/>}
      {accountingSection === "workbench_preview" && <AccountingWorkbenchPreview db={db} language={language} onUpdateOrder={onUpdateOrder} onSaveParty={onSaveParty} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction} onOpenCase={onOpenCaseSection || ((id) => onSelectOrder?.(id))}/>}
      {(accountingSection === "overview" || accountingSection === "orders") && <OrderListTools {...orderListFilters} title="جست‌وجوی پرونده‌های حسابداری" exportName="ARCA_Accounting_Orders" />}
      {accountingSection === "overview" && <IssuerProfitCustodyPanel db={db} orders={orderListFilters.filteredOrders} onUpdateOrder={onUpdateOrder}/>}
      {accountingSection === "overview" && !financialDataReady && <div className="rounded-2xl border border-indigo-100 bg-white p-5 text-sm text-slate-500">مرکز حسابداری باز شد؛ جمع‌بندی مالی پرونده‌ها در حال آماده‌سازی است…</div>}
      {accountingSection === "overview" && financialDataReady && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["فروش پروفورماهای واقعی",accountingPulse.invoice,"text-blue-700 bg-blue-50"],["دریافت مستقیم از خریداران",accountingPulse.received,"text-emerald-700 bg-emerald-50"],["مانده قابل دریافت",accountingPulse.outstanding,"text-rose-700 bg-rose-50"],["سود محاسباتی پرونده‌ها",accountingPulse.profit,"text-indigo-700 bg-indigo-50"]].map(([label,value,tone])=><div key={String(label)} className={`rounded-2xl border border-slate-200 p-4 ${tone}`}><span className="text-[11px] opacity-70">{label}</span><b className="mt-2 block font-mono text-lg">{formatNumber(Number(value))}</b><span className="text-[10px] opacity-60">براساس ارز هر پرونده</span></div>)}</div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">پرونده‌های مالی</h2><InlineHelp><p className="text-[11px] text-slate-500">هر پروندهٔ تازه ایجادشده، خودکار در این فهرست و دفتر حسابداری قرار می‌گیرد.</p></InlineHelp></div><button onClick={()=>setAccountingSection("case_ledgers")} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">ثبت و مشاهده گردش</button></div><div data-financial-case-scroll className="relative max-h-[430px] overflow-auto"><table dir="rtl" className="w-full min-w-[1100px] whitespace-nowrap text-right text-xs"><thead className="sticky top-0 z-20 bg-slate-50 text-slate-500"><tr><th className="sticky right-0 z-30 min-w-[160px] bg-slate-50 p-3 shadow-[-2px_0_3px_-2px_#94a3b8]">پروفورما</th><th className="p-3">فعال / غیرفعال</th><th>خریدار</th><th>صادرکننده</th><th>مبلغ</th><th>دریافت</th><th>مانده</th><th>وضعیت</th></tr></thead><tbody>{realOrders.map((order)=>{const p=getOrderPaymentSummary(db,order);return <tr key={order.OrderID} className="border-t hover:bg-indigo-50/50"><td data-case-number className="sticky right-0 z-10 min-w-[160px] bg-white p-3 shadow-[-2px_0_3px_-2px_#94a3b8]"><button type="button" onClick={()=>{setSelectedLedgerOrderId(order.OrderID);setAccountingSection("case_ledgers");}} className="font-mono font-bold text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-900" title="بازکردن دفتر این پرونده">{order.ProformaInvoiceID}</button></td><td className="px-3 py-2">{activityToggle(order)}</td><td className="px-3">{order.CustomerName}</td><td>{order.SupplierName}</td><td className="font-mono">{formatNumber(p.invoiceTotal)} {order.InvoiceCurrency || order.TransactionCurrency}</td><td className="font-mono text-emerald-700">{formatNumber(p.directReceipts)}</td><td className="font-mono font-bold text-rose-700">{formatNumber(p.customerOutstanding)}</td><td>{order.TradeOwnership === "own_account" ? <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">به حساب خودم</span> : p.customerOutstanding > .005 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">نیازمند دریافت</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">تسویه دریافت</span>}</td></tr>})}</tbody></table></div></div></section>}
      {accountingSection === "case_ledgers" && <CaseAccountingCenter onSaveParty={onSaveParty} db={db} language={language} initialOrderId={selectedLedgerOrderId} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction}/>} 
      {accountingSection === "own_accounts" && <OwnAccountCasesReport db={db} onOpenOrder={(id) => { setSelectedLedgerOrderId(id); setAccountingSection("case_ledgers"); }}/>}
      {(accountingSection === "funding" || accountingSection === "overview") && <PaymentFundingPanel db={db} onSaveParty={onSaveParty} onOpenOrder={(id) => { setSelectedLedgerOrderId(id); setAccountingSection("case_ledgers"); }}/>}
      {accountingSection === "customer_ledgers" && <CustomerAccountLedger db={db} language={language} onOpenOrder={(orderId) => { setSelectedLedgerOrderId(orderId); setAccountingSection("case_ledgers"); }}/>} 
      {accountingSection === "custom_lists" && <CustomAccountingLists db={db} lists={db.accountingLists || []} onChange={(lists) => onSaveAccountingLists?.(lists)} onOpenOrder={onSelectOrder} onUpdateOrder={onUpdateOrder} onConfirmSettlement={onConfirmListSettlement} />}
      {accountingSection === "transfers" && <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">انتقال‌ها و بازپرداخت‌های بین پرونده‌ها</h2><InlineHelp><p className="mt-1 text-[11px] text-slate-500">انتقال‌ها به پروندهٔ مبدأ و مقصد متصل‌اند و سابقهٔ بازپرداخت امانی حفظ می‌شود.</p></InlineHelp></div><button onClick={()=>setAccountingSection("case_ledgers")} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">ثبت انتقال جدید در دفتر پرونده</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">تاریخ</th><th>نوع</th><th>پرونده مقصد</th><th>پرونده مبدأ</th><th>مبلغ</th><th>شرح</th></tr></thead><tbody>{recentTransfers.map((item)=>{const { source, target } = transferEndpoints(db, item);const label=transferLabel(item);return <tr key={item.TransactionID} className="border-t"><td className="p-3 font-mono">{item.PaytDate || "—"}</td><td>{label}</td><td className="font-mono text-indigo-700"><button onClick={()=>{setSelectedLedgerOrderId(target?.OrderID || null);setAccountingSection("case_ledgers")}}>{target?.ProformaInvoiceID || "—"}</button></td><td className="font-mono text-slate-700"><button onClick={()=>{setSelectedLedgerOrderId(source?.OrderID || null);setAccountingSection("case_ledgers")}}>{source?.ProformaInvoiceID || "—"}</button></td><td className="font-mono font-bold">{formatNumber(convertedTransactionAmount(item))} {item.ProformaCurrency || item.PaymentCurrency}</td><td>{item.Note || item.Description || "—"}</td></tr>})}</tbody></table>{!recentTransfers.length&&<p className="p-8 text-center text-xs text-slate-400">هنوز انتقالی ثبت نشده است.</p>}</div></section>}
      {accountingSection === "company" && (guidedTools ? <details className="rounded-xl border bg-white/70 p-3"><summary className="cursor-pointer text-sm">سودهای امانی نزد شرکت‌های صادرکننده</summary><div className="mt-3"><IssuerProfitCustodyPanel db={db} onUpdateOrder={onUpdateOrder}/></div></details> : <IssuerProfitCustodyPanel db={db} onUpdateOrder={onUpdateOrder}/>)}
      {accountingSection === "company" && onSaveCompanyLedgerEntry && onDeleteCompanyLedgerEntry && <CompanyLedgerPanel compact={guidedTools} db={db} onSave={onSaveCompanyLedgerEntry} onDelete={onDeleteCompanyLedgerEntry}/>} 
      {accountingSection === "stakeholders" && <><ShareholderAccountsPanel db={db} onUpdateOrder={onUpdateOrder}/><details className="rounded-xl border bg-white/70 p-3"><summary className="cursor-pointer text-sm">اشخاص، شرکت‌ها و منابع پرداخت</summary><div className="mt-3 space-y-3"><PartyDirectory db={db} onSave={onSaveParty} onDelete={onDeleteParty}/><PaymentFundingPanel db={db} onSaveParty={onSaveParty} onOpenOrder={(id)=>{setSelectedLedgerOrderId(id);setAccountingSection("case_ledgers");}}/></div></details></>}

      {accountingSection === "cfr_estimator" && <DashboardCfrEstimator db={db}/>} 
      {accountingSection === "calculator" && <BasicAccountingCalculator/>} 

      {/* Query Search Filter Bar (matches SearchF controls) */}
      {accountingSection === "orders" && <>
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Filter size={15} className="text-indigo-600" />
          <span>فیلترهای پیشرفته جستجوی حسابداری (SearchF / AccSearchQ)</span>
          <button onClick={()=>setShowShareColumns((value)=>!value)} className="mr-auto rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">{showShareColumns ? "نمای خلاصه" : "نمایش جزئیات سهم‌ها"}</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-slate-500 text-[11px] mb-1">شماره پیش‌فاکتور (PISearch)</label>
            <DeferredAccountingTextInput placeholder="مثال: ARCA-PI-2024" value={piSearch} onCommit={setPiSearch} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono"/>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">نام مشتری (CustomerSearch)</label>
            <DeferredAccountingTextInput placeholder="نام مشتری..." value={customerSearch} onCommit={setCustomerSearch} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"/>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">تأمین‌کننده (SupplierSearch)</label>
            <DeferredAccountingTextInput placeholder="نام تأمین‌کننده..." value={supplierSearch} onCommit={setSupplierSearch} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"/>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">نوع پروفرما (واقعی / صوری)</label>
            <select
              value={dummyFilter}
              onChange={(e) => setDummyFilter(e.target.value as any)}
              className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
            >
              <option value="ALL">همه پروفرماها</option>
              <option value="REAL">فقط واقعی (درج در محاسبات)</option>
              <option value="DUMMY">فقط صوری / آزمایشی (Dummy)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">وضعیت سفارش (ActiveSearch)</label>
            <select
              value={activeOnly === null ? "ALL" : activeOnly ? "ACTIVE" : "INACTIVE"}
              onChange={(e) => {
                if (e.target.value === "ALL") setActiveOnly(null);
                else if (e.target.value === "ACTIVE") setActiveOnly(true);
                else setActiveOnly(false);
              }}
              className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <option value="ALL">همه موارد</option>
              <option value="ACTIVE">فقط سفارشات فعال</option>
              <option value="INACTIVE">فقط مختومه شده‌ها</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">تسویه خریدار (BuyerPaid)</label>
            <select
              value={buyerPaidFilter === null ? "ALL" : buyerPaidFilter ? "PAID" : "UNPAID"}
              onChange={(e) => {
                if (e.target.value === "ALL") setBuyerPaidFilter(null);
                else if (e.target.value === "PAID") setBuyerPaidFilter(true);
                else setBuyerPaidFilter(false);
              }}
              className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <option value="ALL">همه</option>
              <option value="PAID">تسویه شده</option>
              <option value="UNPAID">تسویه نشده</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 text-[11px] mb-1">پرداخت پورسانت (CommissionPaid)</label>
            <select
              value={commissionPaidFilter === null ? "ALL" : commissionPaidFilter ? "PAID" : "UNPAID"}
              onChange={(e) => {
                if (e.target.value === "ALL") setCommissionPaidFilter(null);
                else if (e.target.value === "PAID") setCommissionPaidFilter(true);
                else setCommissionPaidFilter(false);
              }}
              className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <option value="ALL">همه</option>
              <option value="PAID">پرداخت شده</option>
              <option value="UNPAID">در انتظار پرداخت</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Totals Strip (matches Access Sum Text Boxes) */}
      <div className="space-y-2">
        {dummyExcludedCount > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <div className="flex items-center gap-1.5 font-medium">
              <FlaskConical size={14} className="text-amber-600" />
              <span>
                توجه: تعداد <strong>{dummyExcludedCount}</strong> سفارش صوری/آزمایشی (Dummy) در مجموع‌های محاسباتی زیر لحاظ نشده‌اند.
              </span>
            </div>
            <span className="text-[11px] text-amber-600">تراز صرفاً بر مبنای سفارشات قطعی است</span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="col-span-full rounded-lg bg-slate-50 p-2 text-xs text-slate-600">محاسبه‌شده: {totals.counts.ready} · اطلاعات ناقص: {totals.counts.incomplete} · در انتظار تحقق فروش ملکی: {totals.counts.suspended} · فاقد نرخ USD: {totals.counts.missing_fx} · خارج از محاسبات: {totals.counts.excluded}</div>
          <button type="button" onClick={() => toggleSummaryFilter({ kind: "margin", label: "پرونده‌های دارای سود" })} className={summaryCardClass(summaryFilter?.kind === "margin")} title="نمایش پرونده‌های مرتبط">
            <div className="text-[10px] text-slate-400 font-bold">مجموع سود (TotalMargin)</div>
            <div className="text-sm font-black font-mono text-emerald-700 mt-1">
              {formatCurrency(sumTotalMargin, "$")}
            </div>
          </button>
          <button type="button" onClick={() => toggleSummaryFilter({ kind: "arca", label: "پرونده‌های دارای سهم آرکا" })} className={summaryCardClass(summaryFilter?.kind === "arca")} title="نمایش پرونده‌های مرتبط">
            <div className="text-[10px] text-slate-400 font-bold">مجموع سهم آرکا (Arca)</div>
            <div className="text-sm font-black font-mono text-blue-700 mt-1">
              {formatCurrency(sumArca, "$")}
            </div>
          </button>
          <button type="button" onClick={() => toggleSummaryFilter({ kind: "bera", label: "پرونده‌های دارای سهم برا" })} className={summaryCardClass(summaryFilter?.kind === "bera")} title="نمایش پرونده‌های مرتبط">
            <div className="text-[10px] text-slate-400 font-bold">مجموع سهم برا (Bera)</div>
            <div className="text-sm font-black font-mono text-indigo-700 mt-1">
              {formatCurrency(sumBera, "$")}
            </div>
          </button>
          {shareColumns.map((column)=><button type="button" key={column.key} onClick={() => toggleSummaryFilter({ kind: "share", key: column.key, label: `پرونده‌های دارای سهم ${column.label}` })} className={summaryCardClass(summaryFilter?.kind === "share" && summaryFilter.key === column.key)} title="نمایش پرونده‌های مرتبط"><div className="text-[10px] text-slate-400 font-bold">مجموع {column.label}</div><div className="text-sm font-black font-mono text-slate-800 mt-1">{formatCurrency(column.total,"$")}</div></button>)}
          <button type="button" onClick={() => toggleSummaryFilter({ kind: "commission", label: "پرونده‌های دارای پورسانت" })} className={summaryCardClass(summaryFilter?.kind === "commission")} title="نمایش پرونده‌های مرتبط">
            <div className="text-[10px] text-slate-400 font-bold">مجموع پورسانت‌ها</div>
            <div className="text-sm font-black font-mono text-purple-700 mt-1">
              {formatCurrency(sumTotalCommission, "$")}
            </div>
            <div className="mt-1 text-[9px] text-slate-400">{calculationOrders.filter((order) => Math.abs(orderCommissionTotal(order)) > .005).length} پرونده دارای پورسانت</div>
          </button>
        </div>
        {summaryFilter && <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span><strong>{summaryFilter.label}</strong> — {visibleOrders.length} پرونده؛ برای انجام عملیات روی هر ردیف کلیک کنید.</span><button type="button" onClick={() => setSummaryFilter(null)} className="rounded-md bg-white px-2 py-1 font-bold text-blue-700 shadow-xs">نمایش همه</button></div>}
      </div>

      {/* Accounting Detailed Table */}
      <div id="accounting-filtered-orders" className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="h-[calc(100dvh-330px)] min-h-[260px] max-h-[560px] overflow-auto">
          <table className="w-full text-right text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 font-bold border-b border-slate-200 shadow-sm">
              <tr>
                <th className="sticky right-0 z-20 min-w-[160px] bg-slate-50 p-3 shadow-[-2px_0_3px_-2px_#94a3b8]">شماره PI</th>
                <th className="p-3">نوع پروفرما</th>
                <th className="p-3">مشتری</th>
                <th className="p-3">تأمین‌کننده</th>
                <th className="p-3">تناژ (KG)</th>
                <th className="p-3">قیمت فروش</th>
                <th className="p-3">سود کل</th>
                {showShareColumns && <th className="p-3 bg-blue-50/70 text-blue-900">سهم آرکا</th>}
                {showShareColumns && <th className="p-3 bg-indigo-50/70 text-indigo-900">سهم برا</th>}
                {showShareColumns && shareColumns.map((column)=><th key={column.key} className="p-3">{column.label}</th>)}
                <th className="p-3">پورسانت کل</th>
                <th className="p-3 text-center">تسویه خریدار</th>
                <th className="p-3 text-center">دفتر کمیسیون</th>
                <th className="p-3 text-center">پرداخت پورسانت</th>
                <th className="p-3 text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOrders.map((order) => {
                const totalMargin = financialFor(order).usdProfit.totalCaseProfit;
                const isDummy = !!(order.IsDummy || order.ExcludeFromCalculations);

                return (
                  <tr
                    key={order.OrderID}
                    onClick={() => onSelectOrder && onSelectOrder(order.OrderID)}
                    className={`hover:bg-blue-50/60 cursor-pointer transition-colors ${
                      isDummy ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="sticky right-0 z-10 min-w-[160px] bg-white p-3 font-mono font-bold text-blue-700 underline decoration-blue-200 underline-offset-2 shadow-[-2px_0_3px_-2px_#94a3b8]">
                      {order.ProformaInvoiceID}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleStatus(order, "IsDummy")}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                          isDummy
                            ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                        title="کلیک برای تغییر وضعیت به پروفرمای صوری یا واقعی"
                      >
                        <FlaskConical size={11} className={isDummy ? "text-amber-600" : "text-slate-400"} />
                        <span>{isDummy ? "صوری (خارج از محاسبه)" : "واقعی (محاسبه)"}</span>
                      </button>
                    </td>
                    <td className="p-3 font-medium text-slate-900 max-w-[140px] truncate">{order.CustomerName}</td>
                    <td className="p-3 text-slate-600 max-w-[130px] truncate">{order.SupplierName}</td>
                    <td className="p-3 font-mono text-slate-800">{formatNumber(order.TotalQuantity)}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      {order.SellPrice} {order.TransactionCurrency}
                    </td>
                    <td className={`p-3 font-mono font-extrabold ${isDummy ? "text-slate-400 line-through" : "text-emerald-700"}`}>
                      {financialFor(order).reportable ? formatCurrency(totalMargin, "$") : financialFor(order).statusLabel}
                    </td>

                    {showShareColumns && <td className="p-3 font-mono font-bold text-blue-800 bg-blue-50/40">
                      {formatCurrency(financialFor(order).usdProfit.arcaShare, "$")}
                    </td>}
                    {showShareColumns && <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/40">
                      {formatCurrency(financialFor(order).usdProfit.issuerCompanyShare, "$")}
                    </td>}
                    {showShareColumns && shareColumns.map((column)=><td key={column.key} className="p-3 font-mono text-slate-700">{formatCurrency(orderShareValue(order,column),"$")}</td>)}
                    <td className="p-3 font-mono font-bold text-purple-700">
                      <div>{formatCurrency(orderCommissionTotal(order), "$")}</div>
                      {order.customShares && order.customShares.some((share)=>Math.abs(Number(share.amount||0))>.005) && (
                        <div className="text-[9px] text-purple-600 font-normal">
                          (+{order.customShares.filter((share)=>Math.abs(Number(share.amount||0))>.005).length} شریک دیگر)
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleStatus(order, "BuyerPaid")}
                        className={`p-1 rounded-md transition-colors ${
                          order.BuyerPaid ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-300 hover:bg-slate-100"
                        }`}
                        title="تغییر وضعیت تسویه خریدار"
                      >
                        {order.BuyerPaid ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      </button>
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setSettlementOrderId(order.OrderID); setSettlement((item) => ({ ...item, currency: order.TransactionCurrency || "USD" })); }} className="rounded-lg bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700 hover:bg-purple-100">
                        ثبت / مانده ({(order.commissionSettlements || []).length})
                      </button>
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <span className={order.CommissionPaid ? "text-emerald-600" : "text-slate-300"} title="این وضعیت از جمع پرداخت‌های ثبت‌شده محاسبه می‌شود">
                        {order.CommissionPaid ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      </span>
                    </td>

                    <td className="p-3 text-center" onClick={(event) => event.stopPropagation()}>
                      {activityToggle(order)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {settlementOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSettlementOrderId(null)}><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">دفتر دریافت و تحویل سهم‌ها</h2><p className="text-xs text-slate-500">PI: {settlementOrder.ProformaInvoiceID}</p></div><button onClick={() => setSettlementOrderId(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-lg">×</button></div><div className="mb-5 grid gap-2 rounded-xl border bg-slate-50 p-3 md:grid-cols-3">{partiesFor(settlementOrder).map((party) => { const paid = paidFor(settlementOrder, party.name); const remaining = party.amount - paid; return <div key={party.name} className="rounded-lg bg-white p-3 text-xs"><b>{party.name}</b><div>سهم: {formatNumber(party.amount)} {getCaseFinancials(db, settlementOrder).profitCurrency}</div><div className="text-emerald-700">پرداخت‌شده: {formatNumber(paid)}</div><div className={remaining > 0 ? "font-bold text-rose-600" : "font-bold text-emerald-700"}>مانده: {formatNumber(remaining)}</div></div>})}</div><div className="grid gap-2 rounded-xl border p-3 md:grid-cols-3"><select value={settlement.type} onChange={(e) => setSettlement({ ...settlement, type: e.target.value as "paid" | "received" })} className="rounded-lg border p-2 text-xs"><option value="received">دریافت کمیسیون</option><option value="paid">تحویل سود به صاحب سهم</option></select><input list="commission-parties" value={settlement.partyName} onChange={(e) => setSettlement({ ...settlement, partyName: e.target.value })} placeholder="نام شخص / طرف حساب" className="rounded-lg border p-2 text-xs"/><datalist id="commission-parties">{partiesFor(settlementOrder).map((party) => <option key={party.name} value={party.name}/>)}</datalist><input type="number" min="0" value={settlement.amount || ""} onChange={(e) => setSettlement({ ...settlement, amount: Number(e.target.value) })} placeholder="مبلغ" className="rounded-lg border p-2 text-xs"/><input value={settlement.currency} onChange={(e) => setSettlement({ ...settlement, currency: e.target.value.toUpperCase() })} placeholder="ارز" className="rounded-lg border p-2 text-xs"/><input type="date" value={settlement.date} onChange={(e) => setSettlement({ ...settlement, date: e.target.value })} className="rounded-lg border p-2 text-xs"/><input value={settlement.note} onChange={(e) => setSettlement({ ...settlement, note: e.target.value })} placeholder="توضیحات" className="rounded-lg border p-2 text-xs"/><button onClick={saveSettlement} className="rounded-lg bg-purple-600 p-2 text-xs font-bold text-white md:col-span-3">ثبت در دیتابیس</button></div><div className="mt-4 overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr><th className="p-2">تاریخ</th><th>نوع</th><th>شخص</th><th>مبلغ</th><th>توضیحات</th><th></th></tr></thead><tbody>{(settlementOrder.commissionSettlements || []).map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.date}</td><td>{item.type === "paid" ? "پرداخت" : "دریافت"}</td><td>{item.partyName}</td><td className="font-mono">{formatNumber(item.amount)} {item.currency}</td><td>{item.note}</td><td><button onClick={() => deleteSettlement(item.id)} className="text-rose-600">حذف</button></td></tr>)}</tbody></table></div></div></div>}
      </>}
    </div>
  );
};
