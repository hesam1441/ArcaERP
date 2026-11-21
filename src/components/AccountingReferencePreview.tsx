import { CompactCaseSummary } from './CompactCaseSummary';
import { InlineHelp } from "./InlineHelp";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, FileText, Calculator, Wallet, Users, Layers, ArrowUpRight } from "lucide-react";
import { AccountingList, AppDatabase, CashPartner, FinancialGroup, Language, Order, OrderTransaction } from "../types";
import { getAccountingWorkbenchSnapshot, matchesWorkbenchSearch } from "../utils/accountingWorkbench";
import { formatCurrency } from "../utils/formatters";
import { WorkbenchCalculationGrid } from "./WorkbenchCalculationGrid";
import { OrderPaymentLedger } from "./OrderPaymentLedger";
import { RialSalesPanel } from "./RialSalesPanel";
import { IssuerProfitCustodyPanel } from "./IssuerProfitCustodyPanel";
import { FinancialGroupsPanel } from "./FinancialGroupsPanel";
import { CustomAccountingLists } from "./CustomAccountingLists";
import { WorkbenchEditorSection } from "./AccountingWorkbenchPreview";

type Props = {
  db: AppDatabase; language: Language; onUpdateOrder: (order: Order) => void;
  onSaveParty: (party: CashPartner) => void;
  onSaveTransaction: (transaction: OrderTransaction) => void;
  onSaveTransactions: (transactions: OrderTransaction[]) => void;
  onDeleteTransaction: (id: number) => void;
  onSaveGroups: (groups: FinancialGroup[]) => void;
  onSaveLists: (lists: AccountingList[]) => void;
  onOpenCase: (id: number, section: WorkbenchEditorSection) => void;
};
const sections = [
  ["case", "پرونده و مدارک", FileText], ["profit", "خرید، فروش و سود", Calculator],
  ["payments", "دریافت، پرداخت و هزینه", Wallet], ["rial", "فروش ریالی", Wallet],
  ["shares", "سهم‌ها و تحویل سود", Users],
] as const;
type Section = typeof sections[number][0];
const readCase = () => { try { return Number(sessionStorage.getItem("arca.reference.case")) || 0; } catch { return 0; } };

/** An alternative interface over existing journal writers and profit projections.
 * No balances, formulas, or duplicate accounting records are stored here. */
export const AccountingReferencePreview: React.FC<Props> = ({db,language,onUpdateOrder,onSaveParty,onSaveTransaction,onSaveTransactions,onDeleteTransaction,onSaveGroups,onSaveLists,onOpenCase}) => {
  const [area,setArea] = useState<'case'|'groups'|'lists'>(()=>{try{const saved=sessionStorage.getItem('arca.reference.area')||sessionStorage.getItem('arca.reference.section');return saved==='groups'||saved==='lists'?saved:'case';}catch{return 'case';}});
  useEffect(()=>{try{sessionStorage.setItem('arca.reference.area',area);}catch{}},[area]);
  const [query,setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selected,setSelected] = useState(readCase);
  const [section,setSection] = useState<Section>(()=>{try{const saved=sessionStorage.getItem('arca.reference.section');return sections.some(([id])=>id===saved)?saved as Section:'case';}catch{return 'case';}});
  useEffect(()=>{try{sessionStorage.setItem('arca.reference.section',section);}catch{}},[section]);
  const [dirty,setDirty] = useState(false);
  const [entryDirty,setEntryDirty] = useState(false);
  const [entryVersion,setEntryVersion] = useState(0);
  const [note,setNote] = useState<string|null>(null);
  const [preview,setPreview] = useState<Order|null>(null);
  const [activity,setActivity] = useState("all");
  const cases = useMemo(()=>db.orders.filter(o=>!o.IsDummy&&!o.ExcludeFromCalculations).slice().sort((a,b)=>(b.PIDate||"").localeCompare(a.PIDate||"")),[db.orders]);
  const results = useMemo(()=>cases.filter(o=>matchesWorkbenchSearch(o,deferredQuery)&&(activity==='all'||(activity==='active'?o.ActiveOrder:!o.ActiveOrder))),[cases,deferredQuery,activity]);
  const order = cases.find(o=>o.OrderID===selected) || cases[0];
  const snapshot = useMemo(()=>order?getAccountingWorkbenchSnapshot(db,preview?.OrderID===order.OrderID?preview:order):null,[db,order,preview]);
  const saveOrder = useCallback((updated:Order)=>{onUpdateOrder(updated);setEntryDirty(false);},[onUpdateOrder]);
  const choose = (id:number)=>{if(dirty||entryDirty||note!==null)return;setSelected(id);setPreview(null);try{sessionStorage.setItem("arca.reference.case",String(id));}catch{}};
  const changeSection = (next:Section)=>{if(dirty||entryDirty||note!==null)return;setSection(next);};
  const money = (value:number,currency:string)=>formatCurrency(value,currency);
  const open = (target:WorkbenchEditorSection)=>{if(order&&!dirty&&!entryDirty&&note===null)onOpenCase(order.OrderID,target);};
  useEffect(()=>{
    const select=(event:Event)=>{
      if(dirty||entryDirty||note!==null)return;
      const id=Number((event as CustomEvent).detail?.id);
      if(!cases.some(o=>o.OrderID===id))return;
      setSelected(id);setArea('case');setSection('case');setPreview(null);
    };
    window.addEventListener('arca-reference-select',select);
    return()=>window.removeEventListener('arca-reference-select',select);
  },[cases,dirty,entryDirty,note]);
  return <section dir="rtl" className="space-y-4" data-accounting-reference>
    <header className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">مرکز حسابداری</h1><InlineHelp><p className="mt-2 text-xs text-slate-500">حساب هر پرونده، گروه‌های تجمیعی و لیست‌های اختصاصی را از بخش مستقل خود مدیریت کنید.</p></InlineHelp></div></div></header>
    <nav aria-label="بخش‌های مستقل حسابداری" className="flex flex-wrap gap-2 rounded-xl border bg-white p-2">{([['case','حساب پرونده'],['groups','پرونده‌های تجمیعی'],['lists','لیست‌های اختصاصی']] as const).map(([id,title])=><button type="button" key={id} disabled={dirty||entryDirty||note!==null} aria-current={area===id?'page':undefined} onClick={()=>setArea(id)} className={`rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-40 ${area===id?'bg-indigo-600 text-white':'text-slate-600 hover:bg-slate-50'}`}>{title}</button>)}</nav>
    {area!=='case'?<section aria-label={area==='groups'?'پرونده‌های تجمیعی':'لیست‌های اختصاصی'} data-independent-accounting={area} className="rounded-xl border bg-white p-4" key={`${area}:${entryVersion}`}>
      {entryDirty&&<button type="button" onClick={()=>{setEntryDirty(false);setEntryVersion(v=>v+1);}} className="mb-3 rounded-lg border px-3 py-2 text-xs">لغو ورودی‌های ذخیره‌نشدهٔ این بخش</button>}
      {area==='groups'?<FinancialGroupsPanel guided onDirty={setEntryDirty} db={db} onSaveGroups={groups=>{onSaveGroups(groups);setEntryDirty(false);}} onSaveParty={onSaveParty}/>:<CustomAccountingLists hideTitle guided onDirty={setEntryDirty} db={db} lists={db.accountingLists||[]} onChange={lists=>{onSaveLists(lists);setEntryDirty(false);}} onOpenOrder={id=>onOpenCase(id,'payments')} onUpdateOrder={saveOrder}/>}
    </section>:    <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside data-reference-case-picker className="rounded-2xl border bg-white p-3"><label data-mobile-reference-case-picker className="text-xs">پرونده<select aria-label="انتخاب پرونده حسابداری در موبایل" value={order?.OrderID||''} disabled={dirty||entryDirty||note!==null} onChange={e=>choose(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2">{cases.map(o=><option key={o.OrderID} value={o.OrderID}>{o.ProformaInvoiceID} · {o.CustomerName}</option>)}</select></label><div data-desktop-reference-case-picker><label className="relative block"><Search size={15} className="absolute right-3 top-3 text-slate-400"/><input aria-label="جستجوی پرونده مرجع" value={query} onChange={e=>setQuery(e.target.value)} placeholder="شماره پرونده، مشتری یا کالا" className="w-full rounded-xl border bg-slate-50 p-2.5 pr-9 text-xs"/></label><select aria-label="وضعیت پرونده مرجع" value={activity} onChange={e=>setActivity(e.target.value)} className="my-2 w-full rounded-lg border p-2 text-xs"><option value="all">همه پرونده‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></select><p className="mb-2 text-xs text-slate-400">{results.length} پرونده</p><div className="max-h-[60vh] space-y-1 overflow-y-auto">{results.map(o=><button key={o.OrderID} type="button" disabled={dirty||entryDirty||note!==null} onClick={()=>choose(o.OrderID)} aria-pressed={order?.OrderID===o.OrderID} className={`w-full rounded-xl border p-3 text-right disabled:opacity-50 ${order?.OrderID===o.OrderID?'border-indigo-300 bg-indigo-50':'border-transparent hover:bg-slate-50'}`}><b dir="ltr" className="block text-right font-mono text-xs text-indigo-800">{o.ProformaInvoiceID}</b><span className="mt-1 block truncate text-xs text-slate-600">{o.CustomerName||'بدون مشتری'}</span><small className="mt-1 block text-slate-400">{o.ActiveOrder?'فعال':'غیرفعال'} · {o.PIDate}</small></button>)}{!results.length&&<p role="status" className="p-3 text-xs text-slate-500">پرونده‌ای مطابق جستجو پیدا نشد.</p>}</div></div></aside>
      <main className="min-w-0 space-y-4">{order&&snapshot?<>
        <section className="rounded-2xl border bg-slate-900 p-5 text-white"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-mono text-lg font-bold" dir="ltr">{order.ProformaInvoiceID}</h2><p className="mt-1 text-xs text-slate-300">{order.CustomerName} · صادرکننده: {snapshot.issuerName}</p></div><button type="button" aria-label="تغییر وضعیت پرونده مرجع" aria-pressed={!!order.ActiveOrder} disabled={dirty||entryDirty||note!==null} onClick={()=>saveOrder({...order,ActiveOrder:!order.ActiveOrder})} className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-40 ${order.ActiveOrder?'border-emerald-400 text-emerald-200':'border-slate-400 text-slate-200'}`}>{order.ActiveOrder?'فعال · غیرفعال‌کردن':'غیرفعال · فعال‌کردن'}</button><button type="button" disabled={dirty||entryDirty||note!==null} onClick={()=>open('general')} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs disabled:opacity-40">فرم کامل پرونده<ArrowUpRight size={15}/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["ارزش پروفورما",money(snapshot.payment.invoiceTotal,snapshot.invoiceCurrency)],["مانده دریافت مشتری",order.TradeOwnership==='own_account'?'پرونده به حساب خودم':money(snapshot.payment.customerOutstanding,snapshot.invoiceCurrency)],["سود قابل گزارش",snapshot.financial.reportable?money(snapshot.financial.usdProfit.totalCaseProfit,'USD'):snapshot.financial.statusLabel]].map(([title,value])=><div key={title} className="rounded-xl bg-white/10 p-3"><span className="text-xs text-slate-300">{title}</span><b className="mt-2 block text-sm" dir="auto">{value}</b></div>)}</div></section>
        <nav aria-label="بخش‌های صفحه مرجع" className="flex flex-wrap gap-2">{sections.map(([id,title,Icon])=><button key={id} type="button" disabled={dirty||entryDirty||note!==null} aria-current={section===id?'page':undefined} onClick={()=>changeSection(id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold disabled:opacity-50 ${section===id?'border-indigo-600 bg-indigo-600 text-white':'bg-white text-slate-600'}`}><Icon size={15}/>{title}</button>)}</nav>
        {(dirty||entryDirty||note!==null)&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">ابتدا تغییرات این بخش را ذخیره یا لغو کنید؛ سپس پرونده یا بخش را تغییر دهید.</p>}
        {entryDirty&&<button type="button" onClick={()=>{setEntryDirty(false);setEntryVersion(v=>v+1);}} className="rounded-lg border px-3 py-2 text-xs">لغو ورودی‌های ذخیره‌نشدهٔ این بخش</button>}
        <div key={`${order.OrderID}:${entryVersion}`} className="min-w-0 rounded-2xl border bg-white p-4">
          {section==='case'&&<CompactCaseSummary db={db} order={order} onSave={saveOrder} onDirty={setEntryDirty} onEdit={()=>open('general')} onDocuments={()=>open('documents')} onShipping={()=>open('shipping')}/>}
          {section==='profit'&&<><h3 className="font-bold">مبنای خرید، فروش و تقسیم سود</h3><InlineHelp><p className="mt-1 text-xs text-slate-500">ارقام این بخش در محاسبات اصلی پرونده ثبت می‌شوند.</p></InlineHelp><WorkbenchCalculationGrid guided db={db} order={order} onSave={saveOrder} onDirty={setDirty} onPreview={setPreview}/></>}
          {section==='payments'&&<OrderPaymentLedger guided onDirty={setEntryDirty} db={db} language={language} fixedOrderId={order.OrderID} onSaveParty={onSaveParty} onSaveTransaction={entry=>{onSaveTransaction(entry);setEntryDirty(false);}} onSaveTransactions={entries=>{onSaveTransactions(entries);setEntryDirty(false);}} onDeleteTransaction={onDeleteTransaction}/>}
          {section==='rial'&&<RialSalesPanel guided onDirty={setEntryDirty} db={db} order={order} onSave={saveOrder}/>}
          {section==='shares'&&<IssuerProfitCustodyPanel guided db={db} orders={[order]} onUpdateOrder={saveOrder}/>}
        </div>
      </>:<p className="rounded-xl border bg-white p-8 text-sm text-slate-500">برای شروع، یک پروندهٔ واقعی در برنامه ثبت کنید.</p>}</main>
    </div>}
  </section>;
};
