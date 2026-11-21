import { InlineHelp } from "./InlineHelp";
import { SimpleCaseAccountingPreview } from "./SimpleCaseAccountingPreview";
import { RialSalesPanel } from "./RialSalesPanel";
import { IssuerProfitCustodyPanel } from "./IssuerProfitCustodyPanel";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, Download, FileText, FlaskConical, Pencil, Plus, Search, Settings2, X } from "lucide-react";
import { AppDatabase, CashPartner, Language, Order, OrderTransaction } from "../types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { getAccountingWorkbenchSnapshot, matchesWorkbenchSearch, workbenchTransactionLabels } from "../utils/accountingWorkbench";
import { getOrderPaymentSummary, transactionAmountInOrderCurrency } from "../utils/orderAccounting";
import { OrderPaymentLedger } from "./OrderPaymentLedger";
import { WorkbenchModules } from "./WorkbenchModules";
import { WorkbenchCalculationGrid } from "./WorkbenchCalculationGrid";
import { ProformaPreviewPopup } from "./ProformaPreviewPopup";

export type WorkbenchEditorSection = "general" | "shares" | "payments" | "documents" | "shipping";
interface Props {
  initialSimple?: boolean;
  onRequestSimpleCase?:()=>void;
  onDirty?:(dirty:boolean)=>void;
  db: AppDatabase; language: Language; fixedOrderId?: number;
  onUpdateOrder: (order: Order) => void;
  onSaveParty: (party: CashPartner) => void;
  onSaveTransaction: (entry: OrderTransaction) => void;
  onSaveTransactions?: (entries: OrderTransaction[]) => void;
  onDeleteTransaction: (id: number) => void;
  onOpenCase?: (id: number, section: WorkbenchEditorSection) => void;
}

const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const actionClass = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const readSelection = () => { try { return Number(sessionStorage.getItem("arcatav.workbench.order")) || 0; } catch { return 0; } };

/** The accounting workspace is deliberately large.  Keeping the immediate
 * search text inside this small component prevents its parent (and every open
 * module) from rendering on each keystroke.  The actual filter receives text
 * as soon as rendering is available, without delaying typing. */
const AccountingSearchInput: React.FC<{ onSearch: (value: string) => void }> = React.memo(({ onSearch }) => {
  const [value, setValue] = useState("");
  const deferred = useDeferredValue(value);
  useEffect(() => { onSearch(deferred); }, [deferred, onSearch]);
  return <span className="relative mt-1 block"><Search size={15} className="absolute right-3 top-2.5 text-slate-400"/><input value={value} onChange={e => setValue(e.target.value)} placeholder="شماره پروفورما، خریدار، فروشنده یا کالا…" className={`${fieldClass} pr-9 text-slate-800`}/></span>;
});

export const AccountingWorkbenchPreview: React.FC<Props> = ({ onRequestSimpleCase, onDirty, initialSimple = false, db, language, fixedOrderId, onUpdateOrder, onSaveParty, onSaveTransaction, onSaveTransactions, onDeleteTransaction, onOpenCase }) => {
  const [simple,setSimple]=useState(()=>{try{return sessionStorage.getItem('arca.case-accounting.simple')==='true'||initialSimple;}catch{return initialSimple;}});
  const changeMode=(value:boolean)=>{setSimple(value);try{sessionStorage.setItem('arca.case-accounting.simple',String(value));}catch{}};
  const [selectedId, setSelectedId] = useState(readSelection);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeOnly, setActiveOnly] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [noteChanged, setNotesDirty] = useState(false);
  const [calculationDirty, setCalculationDirty] = useState(false);
  const [calculationPreview, setCalculationPreview] = useState<Order | null>(null);
  const notesDirty = noteChanged || calculationDirty;
  useEffect(()=>{if(!simple)onDirty?.(notesDirty);return()=>onDirty?.(false);},[simple,notesDirty,onDirty]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<number | null>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const appliedFilters = useRef<string | null>(null);
  const orders = useMemo(() => [...db.orders].filter(order => (!fixedOrderId || order.OrderID === fixedOrderId) && !order.IsDummy && !order.ExcludeFromCalculations).sort((a, b) => (b.PIDate || "").localeCompare(a.PIDate || "") || b.OrderID - a.OrderID), [db.orders, fixedOrderId]);
  const results = useMemo(() => orders.filter(order => {
    if (!matchesWorkbenchSearch(order, deferredSearch)) return false;
    if (activeOnly && !order.ActiveOrder) return false;
    if (paymentFilter === "all") return true;
    const payment = getOrderPaymentSummary(db, order);
    return paymentFilter === "unpaid" ? order.TradeOwnership !== "own_account" && payment.customerOutstanding > .005 : order.TradeOwnership !== "own_account" && payment.customerOutstanding <= .005;
  }), [orders, deferredSearch, activeOnly, paymentFilter, db]);
  useEffect(() => {
    const key = JSON.stringify([deferredSearch, activeOnly, paymentFilter]);
    if (notesDirty || appliedFilters.current === key) return;
    appliedFilters.current = key;
    if (results.length && !results.some(item => item.OrderID === selectedId)) {
      setSelectedId(results[0].OrderID);
      setLedgerOpen(false);
    }
    // A journal refresh must not navigate away from the case being edited.
  }, [deferredSearch, activeOnly, paymentFilter, notesDirty, results, selectedId]);
  const order = orders.find(item => item.OrderID === selectedId) || orders[0];
  const previewOrder = db.orders.find(item => item.OrderID === previewOrderId);
  useEffect(() => { if (order) { if (selectedId !== order.OrderID) setSelectedId(order.OrderID); try { if (!fixedOrderId) sessionStorage.setItem("arcatav.workbench.order", String(order.OrderID)); } catch { /* Browser storage is optional. */ } } }, [order?.OrderID]);
  const snapshot = useMemo(() => order ? getAccountingWorkbenchSnapshot(db, calculationPreview?.OrderID === order.OrderID ? calculationPreview : order) : null, [db, order, calculationPreview]);
  const portfolio = useMemo(() => results.reduce((total, item) => {
    const row = getAccountingWorkbenchSnapshot(db, item);
    if (!row.realization.recognized) return total;
    if (row.profitToUSD === null) { total.missingFX++; return total; }
    total.profit += row.profit.totalCaseProfit * row.profitToUSD;
    total.arcatav += row.profit.arcaShare * row.profitToUSD;
    return total;
  }, { profit: 0, arcatav: 0, missingFX: 0 }), [db, results]);
  const select = (id: number) => { if (notesDirty) return; setSelectedId(id); setLedgerOpen(false); };
  const openLedger = () => { setLedgerOpen(true); requestAnimationFrame(() => ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const openCase = (section: WorkbenchEditorSection) => { if (order && !notesDirty) onOpenCase?.(order.OrderID, section); };
  if (!order || !snapshot) return <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">پروندهٔ واقعی برای نمایش وجود ندارد.</div>;
  const { payment, ledger, profit, estimate, shares, invoiceCurrency, profitCurrency, profitToInvoice, profitToUSD, unified } = snapshot;
  const index = results.findIndex(item => item.OrderID === order.OrderID);
  const entries = [...ledger.relatedEntries].sort((a, b) => (b.PaytDate || "").localeCompare(a.PaytDate || "") || b.TransactionID - a.TransactionID);
  const equivalent = (entry: OrderTransaction) => entry.SourceOrderID === order.OrderID && entry.OrderID !== order.OrderID ? Number(entry.SourceAmount) || 0 : transactionAmountInOrderCurrency(order, entry);
  const profitMoney = (amount: number) => <span className="inline-flex flex-col items-end gap-0.5 font-mono tabular-nums" dir="ltr"><b>{profitToUSD === null ? formatCurrency(amount, profitCurrency) : formatCurrency(amount * profitToUSD, "USD")}</b>{invoiceCurrency !== "USD" && <small className="text-[10px] font-normal text-slate-400">{formatCurrency(amount * profitToInvoice, invoiceCurrency)}</small>}</span>;
  const exportWorkbook = () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { Item: "پرونده", Value: order.ProformaInvoiceID, Currency: "" },
      { Item: "خریدار", Value: order.CustomerName, Currency: "" },
      { Item: "صادرکننده", Value: snapshot.issuerName, Currency: "" },
      { Item: "ارزش پروفورما", Value: payment.invoiceTotal, Currency: invoiceCurrency },
      { Item: "دریافت مشتری", Value: payment.directReceipts, Currency: invoiceCurrency },
      { Item: "مانده دریافت مشتری", Value: order.TradeOwnership === "own_account" ? "پرونده به حساب خودم" : payment.customerOutstanding, Currency: invoiceCurrency },
      { Item: "سود پرونده", Value: profitToUSD === null ? "نرخ دلار ثبت نشده" : profit.totalCaseProfit * profitToUSD, Currency: "USD" },
      { Item: "سهم آرکاتاو", Value: profitToUSD === null ? "نرخ دلار ثبت نشده" : profit.arcaShare * profitToUSD, Currency: "USD" },
      { Item: "موجودی پرونده", Value: ledger.caseCashBalance, Currency: invoiceCurrency },
      { Item: "بدهی منابع وجه", Value: ledger.fundingDebt, Currency: invoiceCurrency },
      { Item: "یادداشت", Value: order.Note || "", Currency: "" },
      { Item: "پیگیری", Value: order.Followup || "", Currency: "" },
    ]), "Case");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(entries.map(entry => ({ Date: entry.PaytDate, Type: workbenchTransactionLabels[entry.TransactionType || "customer_receipt"] || "عملیات مالی", Description: entry.Description || entry.Note, Party: entry.Counterparty, OriginalAmount: entry.Amount, Currency: entry.PaymentCurrency || invoiceCurrency, CaseEquivalent: equivalent(entry), CaseCurrency: invoiceCurrency, FundingSource: entry.FundingPartyName || entry.FundingSource || "", Receipt: entry.Slip || "" }))), "Journal");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(shares.map(share => ({ Party: share.name, AmountUSD: profitToUSD === null ? "نرخ دلار ثبت نشده" : share.amount * profitToUSD, CaseEquivalent: share.amount * profitToInvoice, CaseCurrency: invoiceCurrency }))), "Shares");
    XLSX.writeFile(book, `Accounting_Preview_${String(order.ProformaInvoiceID || order.OrderID).replace(/[^\w-]/g, "_")}.xlsx`);
  };

  if(simple)return <SimpleCaseAccountingPreview onDirty={onDirty} key={order.OrderID} db={db} order={order} language={language} onExit={()=>changeMode(false)} onExport={exportWorkbook} onUpdateOrder={onUpdateOrder} onSaveParty={onSaveParty} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction} onOpenCase={(id,section)=>{onRequestSimpleCase?.();onOpenCase?.(id,section);}}/>;
  return <section className="space-y-3 text-slate-800" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3"><span className="text-xs text-indigo-900">برای ثبت مرحله‌ای و نمایش خلوت‌تر همین اطلاعات:</span><button type="button" data-open-simple-accounting disabled={notesDirty} onClick={()=>changeMode(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">حسابداری جامع ساده (آزمایشی)</button></div>
    {!fixedOrderId && <header className="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><FlaskConical size={20} className="text-cyan-300"/> میز حسابداری پرونده <span className="rounded bg-cyan-300/15 px-2 py-1 text-[10px] text-cyan-200">اطلاعات یکپارچه پرونده‌ها</span></h2><p className="mt-1 text-xs text-slate-300">مشخصات، گردش، سود، سهم‌ها و پیگیری در یک نگاه</p></div><div className="flex gap-2"><button type="button" disabled={notesDirty || !results.length} onClick={() => openCase("general")} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20 disabled:opacity-40"><Pencil size={14}/> ویرایش پرونده</button><button type="button" disabled={!results.length} onClick={exportWorkbook} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold"><Download size={14}/> اکسل پرونده</button></div></div>
      <div className="mt-4 grid items-end gap-2 lg:grid-cols-[1fr_1.25fr_auto]">
        <label className="text-[11px] text-slate-300">جست‌وجو<AccountingSearchInput onSearch={setSearch}/></label>
        <label className="text-[11px] text-slate-300">انتخاب پرونده<select disabled={notesDirty} value={order.OrderID} onChange={e => select(Number(e.target.value))} className={`${fieldClass} mt-1 text-slate-800`}>{index < 0 && <option value={order.OrderID}>{notesDirty ? `${order.ProformaInvoiceID} — یادداشت ذخیره نشده` : results.length ? `${order.ProformaInvoiceID} — پروندهٔ بازشده (خارج از فیلتر)` : "پرونده‌ای مطابق جست‌وجو پیدا نشد"}</option>}{results.map(item => <option key={item.OrderID} value={item.OrderID}>{item.ProformaInvoiceID} — {item.CustomerName || "بدون نام"}</option>)}</select></label>
        <div className="flex h-9 items-center gap-1"><button className={actionClass} disabled={notesDirty || index <= 0} onClick={() => select(results[0].OrderID)} aria-label="اولین پرونده"><ChevronsRight size={16}/></button><button className={actionClass} disabled={notesDirty || index <= 0} onClick={() => select(results[index - 1].OrderID)} aria-label="پرونده قبلی"><ArrowRight size={16}/></button><span className="min-w-20 text-center text-[11px]" dir="ltr">{index < 0 ? "—" : index + 1} / {results.length}</span><button className={actionClass} disabled={notesDirty || index < 0 || index >= results.length - 1} onClick={() => select(results[index + 1].OrderID)} aria-label="پرونده بعدی"><ArrowLeft size={16}/></button><button className={actionClass} disabled={notesDirty || index < 0 || index >= results.length - 1} onClick={() => select(results[results.length - 1].OrderID)} aria-label="آخرین پرونده"><ChevronsLeft size={16}/></button></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-300"><label className="flex items-center gap-1.5"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}/> فقط پرونده‌های فعال</label><label className="flex items-center gap-2">وضعیت دریافت<select className="rounded border border-slate-700 bg-slate-800 p-1 text-xs" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}><option value="all">همه پرونده‌ها</option><option value="unpaid">دارای مانده مشتری</option><option value="paid">تسویه دریافت مشتری</option></select></label><span className="mr-auto">{results.length} نتیجه</span></div>
    </header>}
    {!results.length && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">نتیجه‌ای پیدا نشد؛ جست‌وجو یا فیلتر را تغییر دهید.</p>}
    {notesDirty && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">تغییرات ذخیره نشده است؛ قبل از تغییر پرونده یا بازکردن ویرایشگر، آن را ذخیره یا لغو کنید.</p>}
    {(results.length > 0 || notesDirty) && <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-4 py-3"><button type="button" onClick={() => setPreviewOrderId(order.OrderID)} aria-label={`پیش‌نمایش پروفورما ${order.ProformaInvoiceID}`} title="پیش‌نمایش پروفورما" className="rounded px-1 py-1 font-mono text-base font-bold text-indigo-800 underline decoration-indigo-200 underline-offset-4 hover:bg-indigo-50 hover:decoration-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500" dir="ltr">{order.ProformaInvoiceID}</button><span className="text-sm">{order.CustomerName || "—"}</span><span className="mr-auto flex flex-wrap gap-1.5"><Tag tone={order.ActiveOrder ? "green" : "slate"}>{order.ActiveOrder ? "فعال" : "غیرفعال"}</Tag><Tag tone={order.TradeOwnership === "own_account" ? "purple" : "slate"}>{order.TradeOwnership === "own_account" ? `به حساب ${snapshot.economicOwnerName}` : "پرونده مشتری"}</Tag><Tag tone={payment.customerOutstanding > .005 ? "amber" : "green"}>{order.TradeOwnership === "own_account" ? "دریافت مشتری ندارد" : payment.customerOutstanding > .005 ? "دریافت ناقص" : "دریافت تسویه"}</Tag><Tag tone="slate">{order.CommissionPaid ? "پورسانت: تسویه ثبت‌شده" : "پورسانت: تسویه ثبت نشده"}</Tag></span></div>
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
      <Metric label="ارزش پروفورما" value={formatCurrency(payment.invoiceTotal, invoiceCurrency)}/>
      <Metric label="دریافت واقعی مشتری" value={formatCurrency(payment.directReceipts, invoiceCurrency)}/>
      <Metric label={order.TradeOwnership === "own_account" ? "تأمین از موجودی مالک" : "مانده دریافت مشتری"} value={formatCurrency(order.TradeOwnership === "own_account" ? ledger.ownerFunding : payment.customerOutstanding, invoiceCurrency)} tone="amber"/>
      <Metric label="موجودی قابل مصرف پرونده" value={formatCurrency(ledger.caseCashBalance, invoiceCurrency)} tone="cyan"/>
      <Metric label={unified?.isActual ? "سود طبق اسناد فعلی" : "سود برآوردی"} value={snapshot.realization.awaitingRealization ? "در انتظار تحقق" : profitMoney(profit.totalCaseProfit)} tone="green"/>
      <Metric label="سهم آرکاتاو" value={snapshot.realization.awaitingRealization ? "در انتظار تحقق" : profitMoney(profit.arcaShare)} tone="indigo"/>
    </div>

    {order.TradeOwnership === "own_account" && <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900"><b>◆ {snapshot.realization.recognized ? "نتیجه فروش محقق‌شده؛ در گزارش عملکرد لحاظ می‌شود" : "سرمایه درگیر؛ سود و زیان از جمع عملکرد خارج است"}</b><p className="my-2">وصول فروش: {formatCurrency(snapshot.realization.collected, invoiceCurrency)} · سرمایه مصرف‌شده: {formatCurrency(snapshot.realization.capital, invoiceCurrency)}</p><label className="flex items-center gap-2"><input type="checkbox" checked={!!order.OwnAccountSaleSettled} disabled={notesDirty} onChange={e => onUpdateOrder({ ...order, OwnAccountSaleSettled: e.target.checked })}/>فروش و وصول این پرونده نهایی شده است؛ نتیجه واقعی حتی در صورت زیان شناسایی شود</label></section>}
    {order.TradeOwnership === "own_account" && snapshot.capitalPartners.length > 0 && <section className="rounded-xl border border-violet-200 bg-white p-4 text-xs"><h3 className="mb-3 font-bold text-violet-900">آورده و سهم شرکای سرمایه</h3><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-right"><thead><tr><th>صاحب سرمایه</th><th>آورده واقعی</th><th>نسبت سرمایه</th><th>اصل سرمایه برگشتی</th><th>سود / زیان شریک</th><th>سود پرداخت‌شده</th><th>مانده نهایی شریک</th></tr></thead><tbody>{snapshot.capitalPartners.map(p => <tr key={p.partyId} className="border-t"><td className="py-2">{p.name}{p.isOwner ? " · مالک" : " · سرمایه‌گذار"}</td><td>{formatCurrency(p.invested, invoiceCurrency)}</td><td>{formatNumber(p.ratio * 100)}%</td><td>{formatCurrency(p.returned, invoiceCurrency)}</td><td>{!snapshot.realization.recognized ? "در انتظار تحقق" : p.isOwner ? "طبق تقسیم سهم شرکت‌ها" : profitMoney(unified?.allocations.filter(a => a.ruleId === `capital-investor:${p.partyId}`).reduce((n, a) => n + a.amount, 0) || 0)}</td><td>{formatCurrency(p.profitPaid, invoiceCurrency)}</td><td>{!snapshot.realization.recognized ? "در انتظار تحقق" : p.isOwner ? "طبق سهم شرکت‌ها" : formatCurrency(p.invested - p.returned - p.profitPaid + (unified?.allocations.filter(a => a.ruleId === `capital-investor:${p.partyId}`).reduce((n, a) => n + a.amount, 0) || 0) * profitToInvoice, invoiceCurrency)}</td></tr>)}</tbody></table></div><InlineHelp><p className="mt-2 text-slate-500">نسبت‌ها طبق سهم توافقی ثبت‌شده در پرونده هستند و با بازپرداخت اصل پول تغییر نمی‌کنند. سود و زیان سرمایه‌گذار از نتیجه خالص و به همین نسبت تقسیم می‌شود؛ اصل سرمایه، سود و قرض شرکت‌ها جدا هستند.</p></InlineHelp></section>}
    <RialSalesPanel key={`rial-${order.OrderID}`} order={order} db={db} onSave={onUpdateOrder} disabled={notesDirty}/>
    <details className="rounded-xl border border-cyan-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-cyan-900">موجودی موقت و تحویل سهم‌های این پرونده</summary>{notesDirty ? <p className="p-3 text-xs text-amber-700">ابتدا تغییرات پرونده را ذخیره یا لغو کنید.</p> : <div className="mt-3"><IssuerProfitCustodyPanel db={db} orders={[order]} onUpdateOrder={onUpdateOrder}/></div>}</details>
    <WorkbenchModules modules={[
      { id: "profit", title: "محاسبه سود", wide: true, content: (
        <Panel title="محاسبه سود" action={<button className={actionClass} disabled={notesDirty} onClick={() => openCase("shares")}><Settings2 size={13}/> تنظیم سود</button>}>
          <div className="mb-3 flex gap-1.5"><Tag tone={unified?.isActual ? "green" : "amber"}>{unified?.isActual ? "اسناد واقعی · موقت تا تکمیل" : "برآورد معامله"}</Tag><Tag tone="slate">{unified?.isWaterfall ? "تقسیم مرحله‌ای" : snapshot.plan ? "سود داخلی + مشترک" : "محاسبهٔ قدیمی"}</Tag></div>
          {profitToUSD === null && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">نرخ USD ثبت نشده است؛ مبالغ سود به ارز اصلی نمایش داده می‌شوند.</p>}
          {snapshot.financial.financialGroup ? <p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">عضو گروه مالی «{snapshot.financial.financialGroup.name}»؛ سود و تقسیم سهم در بخش گروه‌های مالی مرکز حسابداری انجام می‌شود و برای این عضو سود مستقل محاسبه نمی‌شود.</p> : <WorkbenchCalculationGrid key={order.OrderID} db={db} order={order} onSave={onUpdateOrder} onDirty={setCalculationDirty} onPreview={setCalculationPreview}/>}
          <div className="mt-3 rounded-lg bg-slate-50 p-2"><Info label="سود برآورد اولیه" value={profitMoney(estimate.totalCaseProfit)}/><Info label="سود مبنای تقسیم" value={profitMoney(profit.totalCaseProfit)} strong/>{unified?.isWaterfall && <Info label="سهم شرکت پیش از تقسیم" value={profitMoney(unified.waterfallIssuerAmount || 0)}/>}<details className="mt-2 text-[11px]"><summary className="cursor-pointer text-indigo-700">جزئیات دریافت، هزینه و کسورات سود</summary>{unified?.actuals && <><Info label={order.RialSalesEnabled ? "فروش ریالی به معادل ارزی" : "فروش وصول‌شده خالص"} value={profitMoney(unified.actuals.revenue)}/><Info label="خرید پرداخت‌شده خالص" value={profitMoney(unified.actuals.purchase)}/><Info label="هزینه‌های عملیاتی واقعی" value={profitMoney(unified.actuals.expenses)}/></>}<Info label="کارمزد بانک / برآورد" value={profitMoney(profit.bankShare)}/><Info label="کمیسیون‌ها / سهم رابط" value={profitMoney(profit.individualShares)}/></details></div>
        </Panel>
      ) },
      { id: "case", title: "پرونده و معامله", wide: false, content: (
        <Panel title="پرونده و معامله" action={<button className={actionClass} disabled={notesDirty} onClick={() => openCase("general")}><Pencil size={12}/> ویرایش</button>}>
          <Info label="شماره داخلی / تاریخ" value={`${order.OrderID} · ${order.PIDate || "—"}`}/><Info label="صادرکننده" value={snapshot.issuerName}/><Info label="فروشنده" value={order.SupplierName || "—"}/><Info label="خریدار اسنادی" value={order.CustomerName || "—"}/><Info label="مالک اقتصادی" value={order.TradeOwnership === "own_account" ? snapshot.economicOwnerName : "مشتری"}/><Info label="ایجنت فروش" value={snapshot.plan?.agentName || (order.HasSalesAgent ? "تعیین نشده" : "بدون ایجنت")}/><Info label="وزن معامله" value={`${formatNumber(snapshot.quantityMT)} MT`}/><Info label="ارز قیمت‌ها / پروفورما" value={`${profitCurrency} / ${invoiceCurrency}`}/><Info label={`نرخ تسویه ${profitCurrency} → ${invoiceCurrency}`} value={formatNumber(profitToInvoice)}/>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100"><table className="w-full text-right text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">کالا</th><th>مقدار / واحد</th><th className="p-2">قیمت / {profitCurrency}</th></tr></thead><tbody>{(order.items || []).map((item, i) => <tr key={item.OrderDetailID || i} className="border-t border-slate-100"><td className="p-2">{item.ProductName || item.ProductDescription || item.ProductID}</td><td className="font-mono">{formatNumber(item.Quantity)} {item.QuantityUnit || snapshot.implicitItemUnit}</td><td className="p-2 font-mono">{formatNumber(item.AgreedCustomerPrice ?? item.UnitPrice)}</td></tr>)}</tbody></table></div>
        </Panel>
      ) },
      { id: "payments", title: "دریافت و پرداخت", wide: false, content: (
        <Panel title={`گردش دریافت و پرداخت · ${entries.length} سند`} action={<button className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white" onClick={openLedger}><Plus size={13}/> ثبت / ویرایش</button>}>
          <div className="max-h-72 overflow-auto"><table className="w-full text-right text-[11px]"><thead className="sticky top-0 bg-white text-slate-500"><tr><th className="py-2">تاریخ / نوع</th><th>شرح و طرف حساب</th><th className="text-left">مبلغ اصلی</th></tr></thead><tbody>{entries.map(entry => <tr key={`${entry.TransactionID}-${entry.JournalID || ""}`} className="border-t border-slate-100"><td className="py-2 align-top"><span className="block font-mono">{entry.PaytDate || "—"}</span><small className="text-slate-500">{workbenchTransactionLabels[entry.TransactionType || "customer_receipt"] || "عملیات مالی"}</small></td><td className="max-w-36 px-2 py-2 align-top"><span className="block break-words">{entry.Description || entry.Note || "—"}</span><small className="text-slate-400">{entry.Counterparty || ""}{entry.FundingPartyName ? ` · از ${entry.FundingPartyName}` : ""}</small></td><td className="py-2 text-left align-top font-mono" dir="ltr"><b>{formatCurrency(entry.Amount, entry.PaymentCurrency || invoiceCurrency)}</b>{entry.PaymentCurrency !== invoiceCurrency && <small className="block text-slate-400">{formatCurrency(equivalent(entry), invoiceCurrency)}</small>}{entry.Slip && <small className="block text-slate-400">#{entry.Slip}</small>}</td></tr>)}</tbody></table>{!entries.length && <p className="py-6 text-center text-xs text-slate-400">هنوز سندی ثبت نشده است.</p>}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3"><Metric label="ورودی نقدی پرونده" value={formatCurrency(ledger.caseCashIn, invoiceCurrency)}/><Metric label="پرداخت‌های پرونده" value={formatCurrency(ledger.operationalPayments, invoiceCurrency)}/></div>
        </Panel>
      ) },
      { id: "shares", title: "سهم اشخاص و شرکت‌ها", wide: false, content: (
        <Panel title="سهم اشخاص و شرکت‌ها">
          {shares.length ? shares.map(share => <Info key={share.id} label={share.name} value={profitMoney(share.amount)} strong={share.name === "آرکاتاو"}/>) : <p className="py-3 text-xs text-slate-400">هنوز سهمی تعریف نشده است.</p>}
          <details className="mt-3 text-[11px] text-slate-500"><summary className="cursor-pointer text-indigo-700">مبنای سهم‌ها و تسویه</summary><p className="mt-2 leading-5">سهم‌ها از همان تنظیمات سود پرونده محاسبه می‌شوند. وضعیت تسویهٔ اشخاص را در حساب اشخاص و اسناد پرداخت بررسی کنید؛ وجود سهم به معنی پرداخت آن نیست.</p></details>
        </Panel>
      ) },
      { id: "funding", title: "تأمین وجه و تعهدات", wide: false, content: (
        <Panel title="تأمین وجه و تعهدات">
          <Info label="تأمین از موجودی مالک" value={formatCurrency(ledger.ownerFunding, invoiceCurrency)}/><Info label="قرض دریافتی از شرکت‌ها" value={formatCurrency(ledger.companyLoanReceipts, invoiceCurrency)}/><Info label="مانده بدهی منابع وجه" value={formatCurrency(ledger.fundingDebt, invoiceCurrency)} strong/><details className="mt-2 text-[11px]"><summary className="cursor-pointer text-indigo-700">صندوق، اعتبار و حساب صاحبان سهم</summary><Info label="اعتبار قابل استفاده مشتری" value={formatCurrency(payment.availableCredit, invoiceCurrency)}/><Info label="مانده صندوق پرونده" value={formatCurrency(ledger.caseFundBalance, invoiceCurrency)}/><Info label="طلب صاحبان سهم از پرونده‌ها" value={formatCurrency(ledger.stakeholderReceivable, invoiceCurrency)}/><Info label="بدهی به صاحبان سهم" value={formatCurrency(ledger.stakeholderDebt, invoiceCurrency)}/></details>
        </Panel>
      ) },
      { id: "notes", title: "یادداشت و پیگیری", wide: false, content: (
        <WorkbenchNotes key={order.OrderID} order={order} onDirtyChange={setNotesDirty} onSave={patch => { const latest = db.orders.find(item => item.OrderID === order.OrderID); if (latest) onUpdateOrder({ ...latest, ...patch }); }}/>
      ) },
      { id: "documents", title: "مدارک و حمل", wide: false, content: (
        <Panel title="مدارک و حمل" action={<button className={actionClass} disabled={notesDirty} onClick={() => openCase("documents")}><FileText size={13}/> مدارک</button>}>
          <Info label="شماره بارنامه" value={order.BLNo || "—"}/><Info label="کانتینر" value={order.ContainerNo || "—"}/><Info label="شماره کامیون" value={order.TruckNo || "—"}/><Info label="حمل‌کننده" value={order.Carrier || "—"}/><Info label="تحویل مدارک" value={order.DocumentsDelivered ? "ثبت شده" : "ثبت نشده"}/>
          <div className="mt-3 space-y-1">{(order.attachments || []).slice(0, 4).map(file => <span key={file.id} className="flex items-center gap-1.5 rounded bg-slate-50 p-2 text-[11px]"><FileText size={12} className="shrink-0 text-slate-400"/><span className="truncate">{file.name}</span></span>)}</div>
          <button className={`${actionClass} mt-3 w-full`} disabled={notesDirty} onClick={() => openCase("shipping")}>جزئیات حمل و لجستیک</button>
        </Panel>
      ) },
      { id: "help", title: "راهنمای فرم", wide: false, content: (
        <details className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800"><summary className="cursor-pointer font-bold">راهنمای فرم جامع</summary><p className="mt-2 leading-6">اطلاعات از پرونده و دفتر فعلی خوانده می‌شوند. یادداشت و پیگیری با دکمهٔ ذخیره ثبت می‌شوند. ثبت یا ویرایش سند در همان دفتر رسمی انجام می‌شود. مقادیر سود با USD جمع می‌شوند؛ دریافت و پرداخت، ارز اصلی هر سند را حفظ می‌کند.</p></details>
      ) }
    ]}/>

    <div ref={ledgerRef} className="scroll-mt-4">{ledgerOpen && <section className="rounded-2xl border-2 border-indigo-200 bg-white p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-indigo-900">دفتر رسمی دریافت و پرداخت · {order.ProformaInvoiceID}</h3><button onClick={() => setLedgerOpen(false)} className={actionClass}><X size={14}/> بستن دفتر</button></div><OrderPaymentLedger key={order.OrderID} db={db} language={language} fixedOrderId={order.OrderID} onSaveParty={onSaveParty} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction}/></section>}</div>
    <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs"><b>جمع نتایج جست‌وجو · {results.length} پرونده</b><span>سود کل: <b className="font-mono text-emerald-700">{formatCurrency(portfolio.profit, "USD")}</b></span><span>سهم آرکاتاو: <b className="font-mono text-indigo-700">{formatCurrency(portfolio.arcatav, "USD")}</b></span>{portfolio.missingFX > 0 && <span className="text-amber-800">{portfolio.missingFX} پرونده بدون نرخ USD در جمع لحاظ نشده است.</span>}</footer>
    </>}
    {previewOrder && <ProformaPreviewPopup key={previewOrder.OrderID} order={previewOrder} db={db} onUpdateOrder={onUpdateOrder} onClose={() => setPreviewOrderId(null)}/>}
  </section>;
};

const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="flex min-h-12 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2"><h3 className="text-xs font-bold text-slate-800">{title}</h3>{action}</header><div className="p-3">{children}</div></section>;
const Info: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => <div className={`flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 text-[11px] last:border-0 ${strong ? "font-bold text-indigo-800" : ""}`}><span className="shrink-0 text-slate-500">{label}</span><span className="min-w-0 break-words text-left">{value}</span></div>;
const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => <div className={`min-w-0 rounded-xl border p-3 ${tone === "green" ? "border-emerald-100 bg-emerald-50" : tone === "indigo" ? "border-indigo-100 bg-indigo-50" : tone === "amber" ? "border-amber-100 bg-amber-50" : tone === "cyan" ? "border-cyan-100 bg-cyan-50" : "border-slate-200 bg-white"}`}><span className="block text-[10px] text-slate-500">{label}</span><div className="mt-2 break-words text-sm font-bold tabular-nums">{value}</div></div>;
const Tag: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "purple" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{children}</span>;

const WorkbenchNotes: React.FC<{ order: Order; onSave: (patch: Partial<Pick<Order, "Note" | "Followup" | "ETD" | "ETA">>) => void; onDirtyChange: (dirty: boolean) => void }> = ({ order, onSave, onDirtyChange }) => {
  const saved = { Note: order.Note || "", Followup: order.Followup || "", ETD: order.ETD || "", ETA: order.ETA || "" };
  const [baseline, setBaseline] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [submitted, setSubmitted] = useState(false);
  const pending = useRef<Partial<typeof saved> | null>(null);
  const dirty = (Object.keys(saved) as Array<keyof typeof saved>).some(key => draft[key] !== baseline[key]);
  const change = (patch: Partial<typeof saved>) => { pending.current = null; setDraft({ ...draft, ...patch }); setSubmitted(false); };
  const save = () => {
    const patch = Object.fromEntries((Object.keys(saved) as Array<keyof typeof saved>).filter(key => draft[key] !== baseline[key]).map(key => [key, draft[key]]));
    pending.current = patch;
    onSave(patch);
    setSubmitted(true);
  };
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const acknowledged = pending.current && Object.entries(pending.current).every(([key, value]) => saved[key as keyof typeof saved] === value);
    if (acknowledged || !dirty) { setBaseline(saved); setDraft(saved); if (acknowledged) pending.current = null; }
  }, [order.Note, order.Followup, order.ETD, order.ETA, dirty]);
  return <Panel title="یادداشت و پیگیری" action={<button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={!dirty} onClick={save}>ذخیره</button>}>
    <label className="block text-[11px] font-semibold text-slate-600">یادداشت پرونده<textarea className={`${fieldClass} mt-1 min-h-36 resize-y font-normal leading-6`} value={draft.Note} onChange={e => change({ Note: e.target.value })}/></label>
    <label className="mt-3 block text-[11px] font-semibold text-slate-600">پیگیری و اقدام بعدی<textarea className={`${fieldClass} mt-1 min-h-28 resize-y font-normal leading-6`} value={draft.Followup} onChange={e => change({ Followup: e.target.value })}/></label>
    <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-500">تاریخ خروج (ETD)<input className={`${fieldClass} mt-1 font-mono`} dir="ltr" placeholder="YYYY-MM-DD" value={draft.ETD} onChange={e => change({ ETD: e.target.value })}/></label><label className="text-[11px] text-slate-500">تاریخ ورود (ETA)<input className={`${fieldClass} mt-1 font-mono`} dir="ltr" placeholder="YYYY-MM-DD" value={draft.ETA} onChange={e => change({ ETA: e.target.value })}/></label></div>
    <div className="mt-3 flex items-center justify-between text-[10px]">{dirty ? <><span className="text-amber-700">تغییرات ذخیره نشده</span><button onClick={() => { pending.current = null; setDraft(saved); setBaseline(saved); setSubmitted(false); }} className="font-bold text-slate-500">لغو تغییرات</button></> : <span className="text-emerald-700">{submitted ? "ذخیره در پرونده ثبت شد" : "هماهنگ با پرونده"}</span>}</div>
  </Panel>;
};
