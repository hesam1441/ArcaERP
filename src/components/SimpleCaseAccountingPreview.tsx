import { CompactCaseSummary } from './CompactCaseSummary';
import { InlineHelp } from "./InlineHelp";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppDatabase, CashPartner, Language, Order, OrderTransaction } from '../types';
import type { WorkbenchEditorSection } from './AccountingWorkbenchPreview';
import { getAccountingWorkbenchSnapshot } from '../utils/accountingWorkbench';
import { formatCurrency } from '../utils/formatters';
import { WorkbenchCalculationGrid } from './WorkbenchCalculationGrid';
import { OrderPaymentLedger } from './OrderPaymentLedger';
import { RialSalesPanel } from './RialSalesPanel';
import { IssuerProfitCustodyPanel } from './IssuerProfitCustodyPanel';

const steps = [['overview','خلاصه و یادداشت'],['profit','خرید، فروش و سود'],['payments','دریافت و پرداخت'],['rial','فروش ریالی'],['shares','سهم‌ها و تسویه']] as const;
type Step = typeof steps[number][0];
type Props = {
 onDirty?:(dirty:boolean)=>void;
 db:AppDatabase; order:Order; language:Language; onExit:()=>void; onExport:()=>void;
 onUpdateOrder:(order:Order)=>void; onSaveParty:(party:CashPartner)=>void;
 onSaveTransaction:(entry:OrderTransaction)=>void; onSaveTransactions?:(entries:OrderTransaction[])=>void;
 onDeleteTransaction:(id:number)=>void; onOpenCase?:(id:number,section:WorkbenchEditorSection)=>void;
};
/** A case-specific guided screen over the canonical journal and profit writers. */
export function SimpleCaseAccountingPreview({onDirty,db,order,language,onExit,onExport,onUpdateOrder,onSaveParty,onSaveTransaction,onSaveTransactions,onDeleteTransaction,onOpenCase}:Props) {
 const storageKey=`arca.simple-accounting.step.${order.OrderID}`;
 const [step,setStep]=useState<Step>(()=>{try{const v=sessionStorage.getItem(storageKey);return steps.some(([id])=>id===v)?v as Step:'overview';}catch{return 'overview';}});
 const [dirty,setDirty]=useState(false);
 const [version,setVersion]=useState(0);
 const [note,setNote]=useState<string|null>(null);
 const [preview,setPreview]=useState<Order|null>(null);
 const busy=dirty||note!==null;
 useEffect(()=>{onDirty?.(busy);return()=>onDirty?.(false);},[busy,onDirty]);
 const snapshot=useMemo(()=>getAccountingWorkbenchSnapshot(db,preview?.OrderID===order.OrderID?preview:order),[db,order,preview]);
 const saveOrder=useCallback((updated:Order)=>{onUpdateOrder(updated);setDirty(false);},[onUpdateOrder]);
 useEffect(()=>{try{sessionStorage.setItem(storageKey,step);}catch{}},[storageKey,step]);
 const navigate=(next:Step)=>{if(!busy){setStep(next);setPreview(null);}};
 const open=(section:WorkbenchEditorSection)=>{if(!busy)onOpenCase?.(order.OrderID,section);};
 const cash=(amount:number)=>formatCurrency(amount,snapshot.invoiceCurrency);
 const profit=(amount:number)=>formatCurrency(amount,snapshot.profitCurrency);
 return <section data-simple-case-accounting dir="rtl" className="space-y-4 text-xs text-slate-800">
  <header className="rounded-2xl border border-indigo-200 bg-white p-4">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-indigo-600">حسابداری پرونده</p><h2 className="mt-2 text-lg font-bold" dir="auto">{order.ProformaInvoiceID} · {order.CustomerName}</h2></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={onExport} className="rounded-lg border px-3 py-2 disabled:opacity-40">خروجی Excel</button><button type="button" disabled={busy} onClick={onExit} className="rounded-lg border px-3 py-2 disabled:opacity-40">نمای کلاسیک حسابداری</button></div></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['مانده دریافت مشتری',order.TradeOwnership==='own_account'?'به حساب خودم':cash(snapshot.payment.customerOutstanding)],['موجودی قابل مصرف پرونده',cash(snapshot.ledger.caseCashBalance)],['سود مبنای تقسیم',snapshot.realization.recognized?profit(snapshot.profit.totalCaseProfit):'در انتظار تحقق فروش'],['سهم آرکاتاو',snapshot.realization.recognized?profit(snapshot.profit.arcaShare):'در انتظار تحقق فروش']].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><b className="mt-2 block font-mono" dir="auto">{value}</b></div>)}</div>
  </header>
  {busy&&<div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><span>ورودی ذخیره‌نشده دارید؛ ابتدا ثبت را کامل کنید یا آن را لغو کنید.</span><button type="button" onClick={()=>{setNote(null);setDirty(false);setPreview(null);setVersion(v=>v+1);}} className="rounded border border-amber-300 bg-white px-3 py-2">لغو ورودی ذخیره‌نشده</button></div>}
  <nav aria-label="مراحل حسابداری جامع ساده" className="flex flex-wrap gap-2">{steps.map(([id,label])=><button key={id} type="button" disabled={busy&&id!==step} aria-current={id===step?'step':undefined} onClick={()=>navigate(id)} className={`rounded-xl border px-3 py-3 font-bold disabled:opacity-40 ${step===id?'border-indigo-600 bg-indigo-600 text-white':'bg-white'}`}>{label}</button>)}</nav>
  <div key={`${order.OrderID}-${version}`} className="rounded-2xl border bg-white p-4">
   {step==='overview'&&<CompactCaseSummary db={db} order={order} onSave={saveOrder} onDirty={setDirty} onEdit={()=>open('general')}/>}
   {step==='profit'&&(snapshot.financial.financialGroup?<p className="rounded-xl bg-violet-50 p-4 leading-7">این پرونده عضو گروه «{snapshot.financial.financialGroup.name}» است. سود آن در حساب گروه تجمیعی محاسبه می‌شود؛ برای جلوگیری از دوباره‌شماری، محاسبه مستقل اینجا انجام نمی‌شود. حساب گروه را از بخش پرونده‌های تجمیعی مرکز حسابداری باز کنید.</p>:<><h3 className="text-base font-bold">قیمت‌ها را وارد کنید، سپس تقسیم سود را بررسی کنید</h3><InlineHelp><p className="mt-2 text-slate-500">سناریوی آرکاتاو و ایجنت و درصد بانک در «تنظیم فرمول سود، شرکت و ایجنت» قرار دارد.</p></InlineHelp><WorkbenchCalculationGrid guided db={db} order={order} onSave={saveOrder} onDirty={setDirty} onPreview={setPreview}/></>)}
   {step==='payments'&&<OrderPaymentLedger guided db={db} language={language} fixedOrderId={order.OrderID} onDirty={setDirty} onSaveParty={onSaveParty} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction}/>}
   {step==='rial'&&<RialSalesPanel guided db={db} order={order} onDirty={setDirty} onSave={saveOrder}/>}
   {step==='shares'&&<><h3 className="text-base font-bold">سهم هر شخص و ثبت تحویل سود</h3><InlineHelp><p className="my-3 leading-6 text-slate-500">ثبت دریافت مشتری با تحویل سهم متفاوت است. پرداخت سهم‌ها را در همین بخش ثبت کنید.</p></InlineHelp><IssuerProfitCustodyPanel guided db={db} orders={[order]} onDirty={setDirty} onUpdateOrder={saveOrder}/></>}
  </div>
 </section>;
}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p dir="auto" className="mt-2 whitespace-pre-wrap font-semibold">{value}</p></div>;}
