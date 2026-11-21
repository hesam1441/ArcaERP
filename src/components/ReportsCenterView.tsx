import { InlineHelp } from "./InlineHelp";
import { getCaseFinancials, summarizeCaseFinancials } from "../utils/caseFinancials";
import { getOrderQuantityMT, getOrderItemQuantityMT, getOrderCommercialLineTotalUSD } from "../utils/orderAccounting";
import { getOrderProfitToUSDMultiplier } from "../utils/orderAccounting";
import { OwnAccountCasesReport } from "./OwnAccountCasesReport";
import React, { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Package, ReceiptText, Users } from "lucide-react";
import { AppDatabase, Language } from "../types";
import { calculateOrderMetrics, formatCurrency, formatNumber } from "../utils/formatters";

type ReportKind = "summary" | "orders" | "customers" | "products";

const downloadCsv = (name: string, rows: string[][]) => {
  const csv = "\uFEFF" + rows.map((row) => row.map((value) => `\"${String(value ?? "").replaceAll("\"", "\"\"")}\"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `${name}.csv`; link.click(); URL.revokeObjectURL(url);
};

export const ReportsCenterView: React.FC<{ guided?: boolean; db: AppDatabase; language: Language; onOpenOrder?: (id: number) => void }> = ({ guided = false, db, language, onOpenOrder }) => {
  const [kind, setKind] = useState<ReportKind>("summary");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "completed" | "on_hold">("all");
  const fa = language === "fa";
  const orders = useMemo(() => db.orders.filter((order) => {
    const date = order.PIDate || "";
    const lifecycle = order.LifecycleStatus || (order.ActiveOrder ? "active" : "completed");
    return !order.IsDummy && !order.ExcludeFromCalculations && (!from || date >= from) && (!to || date <= to) && (status === "all" || lifecycle === status);
  }), [db.orders, from, to, status]);
  const rows = useMemo(() => orders.map((order) => {
    const financial = getCaseFinancials(db, order);
    return { order, amount: financial.invoiceTotalUSD ?? 0, margin: financial.usdProfit.totalCaseProfit, qty: getOrderQuantityMT(order) };
  }), [orders, db]);
  const calculationSummary = useMemo(() => summarizeCaseFinancials(db, orders), [db, orders]);
  const totals = rows.reduce((sum, row) => ({ amount: sum.amount + row.amount, margin: sum.margin + row.margin, qty: sum.qty + row.qty }), { amount: 0, margin: 0, qty: 0 });
  totals.margin = calculationSummary.totalProfitUSD;
  const customerRows = useMemo(() => (Object.values(rows.filter((row) => row.order.TradeOwnership !== "own_account").reduce<Record<string, { name: string; orders: number; amount: number; margin: number }>>((acc, row) => {
    const name = row.order.CustomerName || "بدون مشتری";
    const current = acc[name] || { name, orders: 0, amount: 0, margin: 0 };
    current.orders += 1; current.amount += row.amount; current.margin += row.margin; acc[name] = current; return acc;
  }, {})) as Array<{ name: string; orders: number; amount: number; margin: number }>).sort((a, b) => b.amount - a.amount), [rows]);
  const productRows = useMemo(() => (Object.values(rows.reduce<Record<string, { name: string; qty: number; amount: number; orders: number }>>((acc, row) => {
    for (const item of row.order.items || []) {
      const name = item.ProductName || row.order.ProductName || "کالای بدون نام";
      const quantity = getOrderItemQuantityMT(row.order, item);
      const value = getOrderCommercialLineTotalUSD(row.order, item) ?? 0;
      const current = acc[name] || { name, qty: 0, amount: 0, orders: 0 };
      current.qty += quantity; current.amount += value; current.orders += 1; acc[name] = current;
    } return acc;
  }, {})) as Array<{ name: string; qty: number; amount: number; orders: number }>).sort((a, b) => b.amount - a.amount), [rows]);
  const title = { summary: fa ? "خلاصه مدیریتی" : "Executive summary", orders: fa ? "گزارش سفارش‌ها" : "Orders report", customers: fa ? "گزارش مشتریان" : "Customers report", products: fa ? "گزارش کالاها" : "Products report" }[kind];
  const exportCurrent = () => {
    if (kind === "orders") return downloadCsv("ARCA-orders", [["PI", "Date", "Customer", "Supplier", "Status", "Amount", "Margin", "Quantity MT"], ...rows.map(({ order, amount, margin, qty }) => [order.ProformaInvoiceID, order.PIDate, order.CustomerName || "", order.SupplierName || "", order.LifecycleStatus || (order.ActiveOrder ? "active" : "completed"), amount.toFixed(2), margin.toFixed(2), qty.toFixed(2)])]);
    if (kind === "customers") return downloadCsv("ARCA-customers", [["Customer", "Orders", "Sales", "Margin"], ...customerRows.map((r) => [r.name, r.orders, r.amount.toFixed(2), r.margin.toFixed(2)])]);
    if (kind === "products") return downloadCsv("ARCA-products", [["Product", "Orders", "Quantity MT", "Value"], ...productRows.map((r) => [r.name, r.orders, r.qty.toFixed(2), r.amount.toFixed(2)])]);
    downloadCsv("ARCA-executive-summary", [["Metric", "Value"], ["Orders", String(rows.length)], ["Invoice value USD", totals.amount.toFixed(2)], ["Total case profit USD", totals.margin.toFixed(2)], ["Quantity MT", totals.qty.toFixed(2)]]);
  };
  const tabs: Array<{ id: ReportKind; label: string; icon: typeof BarChart3 }> = [{ id: "summary", label: fa ? "مدیریتی" : "Summary", icon: BarChart3 }, { id: "orders", label: fa ? "سفارش‌ها" : "Orders", icon: ReceiptText }, { id: "customers", label: fa ? "مشتریان" : "Customers", icon: Users }, { id: "products", label: fa ? "کالاها" : "Products", icon: Package }];
  return <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-8" dir={fa ? "rtl" : "ltr"}>{orders.some(order => getOrderProfitToUSDMultiplier(order) === null) && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">پرونده‌های فاقد نرخ دلار در جمع سود USD لحاظ نشده‌اند؛ نرخ را در سود و پورسانت ثبت کنید.</p>}
    {guided && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs leading-6 text-indigo-900"><InlineHelp><p>۱. نوع گزارش را انتخاب کنید. ۲. بازه و وضعیت را مشخص کنید. ۳. نتیجه را بررسی یا خروجی بگیرید. برای بازکردن پرونده روی شماره آن کلیک کنید.</p></InlineHelp><button type="button" onClick={()=>{setFrom("");setTo("");setStatus("all");}} className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 font-bold">پاک‌کردن فیلترهای گزارش</button></section>}
    <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">سود USD؛ محاسبه‌شده: {calculationSummary.counts.ready} · اطلاعات ناقص: {calculationSummary.counts.incomplete} · فروش ملکی تحقق‌نیافته: {calculationSummary.counts.suspended} · فاقد نرخ: {calculationSummary.counts.missing_fx}</p>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-lg font-black text-slate-800">مرکز گزارش‌گیری</h1><InlineHelp><p className="mt-1 text-xs text-slate-500">گزارش‌های قابل فیلتر، قابل خروجی و قابل بررسی تا سطح هر پیش‌فاکتور</p></InlineHelp></div><button onClick={exportCurrent} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Download size={15} />خروجی Excel/CSV</button></div>
      <div className="mt-5 flex flex-wrap gap-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setKind(tab.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${kind === tab.id ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Icon size={14}/>{tab.label}</button>; })}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">از تاریخ<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400" /></label><label className="text-xs font-semibold text-slate-600">تا تاریخ<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400" /></label><label className="text-xs font-semibold text-slate-600">وضعیت<select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"><option value="all">همه وضعیت‌ها</option><option value="active">فعال</option><option value="on_hold">متوقف</option><option value="completed">مختومه</option></select></label></div>
    </section>
    <details className="rounded-xl border border-violet-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-violet-800">پرونده‌های به حساب خودم و قرض شرکت‌ها</summary><OwnAccountCasesReport db={{ ...db, orders }} onOpenOrder={(id) => onOpenOrder?.(id)}/></details>
    {calculationSummary.partialGroups.length>0&&<p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">فیلتر فقط بخشی از اعضای {calculationSummary.partialGroups.length} گروه را شامل می‌شود؛ سود آن گروه‌ها در جمع حاضر نیست. سود تجمیعی به اعضا تقسیم فرضی نمی‌شود.</p>}
    {kind === "summary" && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["سفارش‌های انتخاب‌شده", String(rows.length), "bg-slate-700"], ["ارزش اسناد USD", formatCurrency(totals.amount), "bg-indigo-600"], ["سود کل USD", formatCurrency(totals.margin), "bg-emerald-600"], ["حجم کالا", `${formatNumber(totals.qty)} MT`, "bg-amber-500"]].map(([label, value, color]) => <div key={label} className={`${color} rounded-2xl p-5 text-white shadow-sm`}><p className="text-xs opacity-80">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>)}</section>}
    {kind === "orders" && <ReportTable headers={["PI", "تاریخ", "مشتری", "وضعیت", "فروش", "حاشیه"]} rows={rows.map(({ order, amount, margin }) => [<button onClick={() => onOpenOrder?.(order.OrderID)} className="font-mono font-bold text-indigo-700 hover:underline">{order.ProformaInvoiceID}</button>, order.PIDate, order.CustomerName || "—", order.LifecycleStatus || (order.ActiveOrder ? "فعال" : "مختومه"), formatCurrency(amount), formatCurrency(margin)])} />}
    {kind === "customers" && <ReportTable headers={["مشتری", "تعداد سفارش", "فروش", "حاشیه"]} rows={customerRows.map((r) => [r.name, r.orders, formatCurrency(r.amount), formatCurrency(r.margin)])} />}
    {kind === "products" && <ReportTable headers={["کالا", "تعداد ردیف", "حجم (MT)", "ارزش"]} rows={productRows.map((r) => [r.name, r.orders, formatNumber(r.qty), formatCurrency(r.amount)])} />}
    {kind !== "summary" && !rows.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">داده‌ای با این فیلتر یافت نشد.</div>}
  </div>;
};

const ReportTable: React.FC<{ headers: string[]; rows: React.ReactNode[][] }> = ({ headers, rows }) => <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 font-bold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index} className="hover:bg-indigo-50/40">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div></section>;
