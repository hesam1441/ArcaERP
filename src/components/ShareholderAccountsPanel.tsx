import { InlineHelp } from "./InlineHelp";
import { getCaseProfitCustody, recordProfitDelivery } from "../utils/profitCustody";
import { getReportingFinancials, getCaseFinancials, getBeneficiarySettlement, isCaseCommissionSettled } from "../utils/caseFinancials";
import { getCaseProfitPlan } from "../utils/caseProfitEngine";
import { getOrderProfitCurrency, getOrderProfitToUSDMultiplier, transactionAmountInOrderCurrency, getOrderProfitToInvoiceMultiplier } from "../utils/orderAccounting";
import React, { useMemo, useState } from "react";
import { AppDatabase, Order } from "../types";
import { formatNumber } from "../utils/formatters";
import { ownedCompanyFor, normalizePartnerName } from "../utils/partnerIdentity";
import { getCaseShareRecipients } from "../utils/caseProfitEngine";

interface Props { db: AppDatabase; onUpdateOrder: (order: Order) => void; }
type ShareRef = { key: string; name: string; role: string; amount: number; order: Order; source: "fixed" | "custom" | "company" | "calculated"; field?: keyof Order; id?: string; ownerId?: string };

const fixedShares: { name: string; role: string; field: keyof Order }[] = [
  { name: "آرکاتاو", role: "شرکت", field: "ArcaShare" }, { name: "برا", role: "شرکت صادرکننده", field: "BeraShare" },
  { name: "حسام", role: "دریافت‌کننده کمیسیون", field: "Hesam" }, { name: "رضا", role: "دریافت‌کننده کمیسیون", field: "Reza" },
  { name: "جلالی", role: "دریافت‌کننده کمیسیون", field: "Jalali" }, { name: "لیدا", role: "دریافت‌کننده کمیسیون", field: "Lida" },
  { name: "حمید", role: "دریافت‌کننده کمیسیون", field: "Hamid" }, { name: "مرادی", role: "دریافت‌کننده کمیسیون", field: "Moradi" },
  { name: "مهسا", role: "دریافت‌کننده کمیسیون", field: "Mahsa" }, { name: "آرش", role: "دریافت‌کننده کمیسیون", field: "Arash" },
  { name: "آروین", role: "شرکت صادرکننده", field: "Arovin" }, { name: "خسرو", role: "دریافت‌کننده کمیسیون", field: "Khusru" },
  { name: "برابانک", role: "حساب واسط", field: "Berabank" }, { name: "سایر", role: "سهم متفرقه", field: "Extra" },
];
const norm = normalizePartnerName;

export const ShareholderAccountsPanel: React.FC<Props> = ({ db, onUpdateOrder }) => {
  const [person, setPerson] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [paymentOrderId, setPaymentOrderId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentError, setPaymentError] = useState("");
  const [summaryOrder, setSummaryOrder] = useState<Order | null>(null);

  const refs = useMemo(() => getReportingFinancials(db).flatMap((financial): ShareRef[] => {
    const order = financial.order;
    return financial.shares.map(item => ({ key: `${order.OrderID}-calculated-${item.id}`, name: item.name, role: item.role, amount: item.amount, order, source: "calculated", id: item.id, ownerId: item.id }));
  }), [db.orders, db.suppliers, db.issuerCompanyShares, db.orderTransactions, db.financialGroups]);
  const people = db.cashPartners;
  const selectedPerson = people.find(p => p.id === person);
  const selectedNames = new Set([selectedPerson?.name, selectedPerson?.nameEn, ...(selectedPerson?.aliases || [])].filter(Boolean).map(norm));
  const selectedRefs = refs.filter(item => item.ownerId === person || selectedNames.has(norm(item.name)));
  const paidFor = (ref: ShareRef) => getBeneficiarySettlement(ref.order, ref.name, db).paid;
  const usd = (ref: ShareRef, amount: number) => amount * (getOrderProfitToUSDMultiplier(ref.order) ?? 0);
  const totalShare = selectedRefs.reduce((sum, ref) => sum + usd(ref, ref.amount), 0);
  const totalPaid = selectedRefs.reduce((sum, ref) => sum + usd(ref, paidFor(ref)), 0);
  const stakeholderMovement = (ref: ShareRef) => {
    const ownerId = ownedCompanyFor(ref.name)?.id || ref.ownerId;
    if (!ownerId) return { fund: 0, loaned: 0, repaid: 0, debt: 0 };
    const entries = db.orderTransactions || [];
    const sum = (type: string, predicate: (entry: typeof entries[number]) => boolean) => entries.filter((entry) => entry.TransactionType === type && predicate(entry)).reduce((total, entry) => total + transactionAmountInOrderCurrency(ref.order, entry) / getOrderProfitToInvoiceMultiplier(ref.order), 0);
    return {
      fund: sum("stakeholder_fund_contribution", (entry) => entry.OrderID === ref.order.OrderID && entry.PartnerId === ownerId),
      loaned: sum("stakeholder_case_loan", (entry) => entry.SourceOrderID === ref.order.OrderID && entry.PartnerId === ownerId),
      repaid: sum("stakeholder_case_loan_repayment", (entry) => entry.SourceOrderID === ref.order.OrderID && entry.PartnerId === ownerId),
      debt: sum("stakeholder_case_loan", (entry) => entry.OrderID === ref.order.OrderID && entry.PartnerId === ownerId),
    };
  };
  const totalLoaned = selectedRefs.reduce((sum, ref) => { const movement = stakeholderMovement(ref); return sum + usd(ref, movement.loaned - movement.repaid); }, 0);
  const totalDebt = selectedRefs.reduce((sum, ref) => sum + usd(ref, stakeholderMovement(ref).debt), 0);

  const canEditShare = (ref: ShareRef) => {
    const plan = getCaseProfitPlan(ref.order, db.suppliers.find(s => s.SupplierID === ref.order.SupplierID));
    return !!plan && ref.role !== "investor" && (["company", "agent"].includes(ref.role) || norm(ref.name) === "arcatav" || (plan.rules || []).some(rule => rule.beneficiaryId === ref.id || norm(rule.beneficiaryName) === norm(ref.name)) || (ref.order.customShares || []).some(share => share.partnerId === ref.id || norm(share.partnerName) === norm(ref.name)));
  };
  const saveShare = (ref: ShareRef) => {
    let updated = { ...ref.order };
    if (ref.source === "fixed" && ref.field) updated = { ...updated, [ref.field]: editAmount };
    if (ref.source === "custom") updated.customShares = (updated.customShares || []).map((item) => item.id === ref.id ? { ...item, amount: editAmount } : item);
    if (ref.source === "company") updated.companyProfitShares = (updated.companyProfitShares || []).map((item, index) => String(index) === ref.id ? { ...item, amount: editAmount } : item);
    if (ref.source === "calculated") {
      const plan = getCaseProfitPlan(ref.order, db.suppliers.find(s => s.SupplierID === ref.order.SupplierID));
      if (!plan) return;
      const role = norm(ref.name) === "arcatav" ? "arcatav" : ref.role === "company" ? "issuer" : ref.role === "agent" ? "agent" : undefined;
      if (role) updated.profitPlan = { ...plan, manualShare: { role, amount: editAmount } };
      else {
        const rules = (plan.rules || []).map(rule => rule.beneficiaryId === ref.id || norm(rule.beneficiaryName) === norm(ref.name) ? { ...rule, method: "fixed" as const, value: editAmount } : rule);
        const custom = (updated.customShares || []).map(share => share.partnerId === ref.id || norm(share.partnerName) === norm(ref.name) ? { ...share, amount: editAmount } : share);
        updated = { ...updated, profitPlan: { ...plan, rules }, customShares: custom };
      }
    }
    onUpdateOrder(updated); setEditingKey(null);
  };
  const registerReceipt = (ref: ShareRef) => {
    try {
      onUpdateOrder(recordProfitDelivery(db, ref.order, { beneficiaryId: getCaseProfitCustody(db, ref.order).beneficiaries.find(item => item.id === ref.ownerId || norm(item.name) === norm(ref.name))?.id || "", amount: paymentAmount, currency: getOrderProfitCurrency(ref.order), date: paymentDate }));
      setPaymentOrderId(null); setPaymentAmount(0); setPaymentError("");
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "ثبت تحویل انجام نشد."); }
  };

  return <><section className="rounded-2xl border border-purple-200 bg-white p-4 shadow-xs"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-purple-950">حساب اشخاص و شرکت‌های دارای سهم</h2><InlineHelp><p className="text-[11px] text-slate-500">سهم واقعی، تسویه، طلب و بدهی ناشی از انتقال بین پرونده‌ها</p></InlineHelp></div><select value={person} onChange={(e) => { setPerson(e.target.value); setEditingKey(null); setPaymentOrderId(null); }} className="min-w-64 rounded-xl border border-purple-200 bg-purple-50 p-2 text-xs font-bold"><option value="">انتخاب شخص یا شرکت...</option>{people.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.role}</option>)}</select></div>{person && <><div className="mt-4 grid grid-cols-2 gap-3 text-xs lg:grid-cols-5"><div className="rounded-xl bg-purple-50 p-3"><span className="text-slate-500">جمع سهم واقعی (USD)</span><b className="mt-1 block font-mono text-purple-800">{formatNumber(totalShare)}</b></div><div className="rounded-xl bg-emerald-50 p-3"><span className="text-slate-500">تسویه‌شده (USD)</span><b className="mt-1 block font-mono text-emerald-700">{formatNumber(totalPaid)}</b></div><div className="rounded-xl bg-amber-50 p-3"><span className="text-slate-500">طلب از پرونده‌ها (USD)</span><b className="mt-1 block font-mono text-amber-700">{formatNumber(totalLoaned)}</b></div><div className="rounded-xl bg-rose-50 p-3"><span className="text-slate-500">بدهی پرونده‌های دریافتی (USD)</span><b className="mt-1 block font-mono text-rose-700">{formatNumber(totalDebt)}</b></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">مانده سهم مستقیم (USD)</span><b className="mt-1 block font-mono text-slate-800">{formatNumber(totalShare-totalPaid-totalLoaned)}</b></div></div><div className="mt-4 overflow-x-auto"><table className="w-full text-right text-xs"><thead className="bg-slate-50"><tr><th className="p-2">PI</th><th>مشتری</th><th>نوع سهم</th><th>سهم واقعی</th><th>قرض داده‌شده</th><th>طلب باقی‌مانده</th><th>بدهی دریافتی</th><th>تسویه</th><th>مانده</th><th>عملیات</th></tr></thead><tbody>{selectedRefs.map((ref) => { const paid=paidFor(ref); const movement=stakeholderMovement(ref); const receivable=movement.loaned-movement.repaid; return <React.Fragment key={ref.key}><tr onClick={()=>setSummaryOrder(ref.order)} className="cursor-pointer border-t transition-colors hover:bg-indigo-50/70" title="برای مشاهده خلاصه پیش‌فاکتور کلیک کنید"><td className="p-2 font-mono font-bold text-indigo-700">{ref.order.ProformaInvoiceID}</td><td>{ref.order.CustomerName}</td><td>{ref.role}</td><td>{editingKey===ref.key?<div className="flex gap-1" onClick={(e)=>e.stopPropagation()}><input type="number" value={editAmount} onChange={(e)=>setEditAmount(Number(e.target.value))} className="w-28 rounded border p-1"/><button onClick={()=>saveShare(ref)} className="rounded bg-indigo-600 px-2 text-white">ذخیره</button></div>:<span className="font-mono">{formatNumber(ref.amount)} {getOrderProfitCurrency(ref.order)}</span>}</td><td className="font-mono text-violet-700">{formatNumber(movement.loaned)}</td><td className="font-mono text-amber-700">{formatNumber(receivable)}</td><td className="font-mono text-rose-700">{formatNumber(movement.debt)}</td><td className="font-mono text-emerald-700">{formatNumber(paid)}</td><td className="font-mono font-bold text-slate-700">{formatNumber(ref.amount-paid-receivable)}</td><td className="space-x-1 space-x-reverse" onClick={(e)=>e.stopPropagation()}><button disabled={!canEditShare(ref)} title={ref.role === "investor" ? "سهم سرمایه‌گذار از نسبت سرمایه در پرونده تعیین می‌شود" : "ویرایش در فرمول مشترک پرونده"} onClick={()=>{setEditingKey(ref.key);setEditAmount(ref.amount)}} className="rounded bg-slate-100 px-2 py-1">ویرایش سهم</button><button onClick={()=>{setPaymentError("");setPaymentOrderId(ref.order.OrderID);setPaymentAmount(Math.max(0,ref.amount-paid-receivable))}} className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">اعلام تحویل سود</button></td></tr>{paymentOrderId===ref.order.OrderID&&<tr className="border-t bg-emerald-50/50"><td colSpan={10} className="p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-bold">ثبت تحویل به {ref.name}:</span><input type="number" min="0" value={paymentAmount||""} onChange={(e)=>setPaymentAmount(Number(e.target.value))} className="w-32 rounded border p-2"/><span>{getOrderProfitCurrency(ref.order)}</span><input type="date" value={paymentDate} onChange={(e)=>setPaymentDate(e.target.value)} className="rounded border p-2"/><button onClick={()=>registerReceipt(ref)} className="rounded bg-emerald-600 px-4 py-2 font-bold text-white">ثبت در پرونده</button><button onClick={()=>setPaymentOrderId(null)} className="rounded bg-white px-3 py-2">انصراف</button></div>{paymentError && <p role="alert" className="mt-2 text-xs text-rose-600">{paymentError}</p>}</td></tr>}</React.Fragment>})}</tbody></table></div></>}</section>{summaryOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={()=>setSummaryOrder(null)}><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e)=>e.stopPropagation()}><div className="flex items-start justify-between border-b pb-3"><div><h3 className="font-bold text-slate-900">خلاصه پیش‌فاکتور</h3><p className="mt-1 font-mono text-sm font-bold text-indigo-700">{summaryOrder.ProformaInvoiceID}</p></div><button onClick={()=>setSummaryOrder(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600">بستن</button></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-400">مشتری</span><b className="mt-1 block">{summaryOrder.CustomerName || "—"}</b></div><div><span className="text-slate-400">تأمین‌کننده</span><b className="mt-1 block">{summaryOrder.SupplierName || "—"}</b></div><div><span className="text-slate-400">تاریخ PI</span><b className="mt-1 block font-mono">{summaryOrder.PIDate || "—"}</b></div><div><span className="text-slate-400">وضعیت</span><b className="mt-1 block">{summaryOrder.OrderStatus || "—"}</b></div><div><span className="text-slate-400">مبلغ</span><b className="mt-1 block font-mono">{formatNumber(summaryOrder.SellPrice * (summaryOrder.TotalQuantity > 1000 ? summaryOrder.TotalQuantity / 1000 : summaryOrder.TotalQuantity))} {summaryOrder.TransactionCurrency || "USD"}</b></div><div><span className="text-slate-400">مقدار</span><b className="mt-1 block font-mono">{formatNumber(summaryOrder.TotalQuantity > 1000 ? summaryOrder.TotalQuantity / 1000 : summaryOrder.TotalQuantity)} MT</b></div><div className="col-span-2"><span className="text-slate-400">کالا</span><b className="mt-1 block">{summaryOrder.ProductName || summaryOrder.Product || "—"}</b></div></div></div></div>}</>;
};
