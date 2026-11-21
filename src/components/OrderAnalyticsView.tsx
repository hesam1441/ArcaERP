import { InlineHelp } from "./InlineHelp";
import { getOrderCommercialTotalUSD, getOrderCommercialLineTotalUSD } from "../utils/orderAccounting";
import React, { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, Package, Users } from "lucide-react";
import { AppDatabase, Order } from "../types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { getOrderCommercialTotal, getOrderItemQuantityMT, getOrderQuantityMT, hasCompleteCalculationData, isExcludedFromFinancialCalculations } from "../utils/orderAccounting";
import { getCustomerList } from "../utils/partnerLists";
import { exportOrderListExcel } from "./OrderListTools";

interface Props { db: AppDatabase; }
type Aggregate = { name: string; orders: number; quantity: number; amount: number; lastDate: string };

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;

export const OrderAnalyticsView: React.FC<Props> = ({ db }) => {
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(today);
  const [customer, setCustomer] = useState("ALL");
  const [supplier, setSupplier] = useState("ALL");
  const [product, setProduct] = useState("ALL");
  const productNameById = useMemo(() => new Map(db.products.map((item) => [String(item.ProductID), item.ProductName])), [db.products]);
  const getKnownProductName = (order: Order, item?: { ProductID?: number; ProductName?: string }) => {
    const name = item?.ProductName || (item?.ProductID !== undefined ? productNameById.get(String(item.ProductID)) : "") || (order as any).ProductName || (order as any).Product;
    return name?.trim() || "";
  };
  const orders = useMemo(() => db.orders.filter((order) => {
    if (isExcludedFromFinancialCalculations(order) || getOrderCommercialTotal(order) <= 0) return false;
    const items = order.items || [];
    if (items.length && !items.some((item) => getKnownProductName(order, item))) return false;
    if (!items.length && !getKnownProductName(order)) return false;
    const date = order.PIDate || "";
    if (startDate && date && date < startDate) return false;
    if (endDate && date && date > endDate) return false;
    if (customer !== "ALL" && String(order.CustomerID) !== customer) return false;
    if (supplier !== "ALL" && String(order.SupplierID) !== supplier) return false;
    if (product !== "ALL" && !(order.items || []).some((item) => String(item.ProductID) === product)) return false;
    return true;
  }).sort((a, b) => (b.PIDate || "").localeCompare(a.PIDate || "")), [db.orders, startDate, endDate, customer, supplier, product, productNameById]);

  const customerStats = useMemo(() => groupOrders(orders.filter((order) => order.TradeOwnership !== "own_account"), (order) => order.CustomerName || "مشتری نامشخص"), [orders]);
  const productStats = useMemo(() => {
    const result = new Map<string, Aggregate>();
    orders.forEach((order) => {
      const items = order.items || [];
      if (!items.length) add(result, getKnownProductName(order), 1, getOrderQuantityMT(order), (getOrderCommercialTotalUSD(order) ?? 0), order.PIDate || "");
      items.forEach((item) => {
        const productName = getKnownProductName(order, item);
        if (!productName) return;
        const quantity = getOrderItemQuantityMT(order, item);
        const amount = getOrderCommercialLineTotalUSD(order, item) ?? 0;
        add(result, productName, 1, quantity, amount, order.PIDate || "");
      });
    });
    return [...result.values()].sort((a, b) => b.quantity - a.quantity);
  }, [orders, productNameById]);
  const periods = useMemo(() => {
    const result = new Map<string, Aggregate>();
    orders.filter((order) => Boolean(order.PIDate)).forEach((order) => add(result, order.PIDate.slice(0, 7), 1, getOrderQuantityMT(order), (getOrderCommercialTotalUSD(order) ?? 0), order.PIDate));
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);
  const ordersWithoutDate = orders.filter((order) => !order.PIDate).length;
  const totalQuantity = orders.reduce((sum, order) => sum + getOrderQuantityMT(order), 0);
  const totalAmount = orders.reduce((sum, order) => sum + (getOrderCommercialTotalUSD(order) ?? 0), 0);
  const maxPeriod = Math.max(...periods.map((item) => item.quantity), 1);
  const topCustomers = customerStats.slice(0, 10);
  const maxCustomerAmount = Math.max(...topCustomers.map((item) => item.amount), 1);
  const topProducts = productStats.slice(0, 10);
  const maxProductQuantity = Math.max(...topProducts.map((item) => item.quantity), 1);
  const companySales = useMemo(() => {
    const supplierNames = new Map(db.suppliers.map((item) => [item.SupplierID, item.SupplierName]));
    const totals = new Map(["براکم", "آروین", "بولز کم"].map((name) => [name, { name, orders: 0, quantity: 0, amount: 0, lastDate: "" }]));
    orders.forEach((order) => {
      const company = classifySalesCompany(order.SupplierName || supplierNames.get(order.SupplierID) || "");
      if (!company) return;
      add(totals, company, 1, getOrderQuantityMT(order), (getOrderCommercialTotalUSD(order) ?? 0), order.PIDate || "");
    });
    return [...totals.values()];
  }, [db.suppliers, orders]);
  const maxCompanyAmount = Math.max(...companySales.map((item) => item.amount), 1);
  const customerOptions = [...getCustomerList(db.customers, db.suppliers)].sort((a, b) => a.CustomerName.localeCompare(b.CustomerName, "fa"));
  const supplierOptions = [...db.suppliers].sort((a, b) => a.SupplierName.localeCompare(b.SupplierName, "fa"));
  const productOptions = [...db.products].sort((a, b) => a.ProductName.localeCompare(b.ProductName, "fa"));

  return <div className="space-y-5" id="order-analytics-root">
    <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><BarChart3 className="text-indigo-600" size={22}/>بررسی آماری سفارش‌ها</h1><InlineHelp><p className="mt-1 text-xs text-slate-500">روند سفارش، مقدار و ارزش خرید مشتریان به تفکیک کالا، تأمین‌کننده و دوره زمانی</p></InlineHelp><button type="button" onClick={() => exportOrderListExcel("ARCA_Order_Analytics", orders)} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Download size={14}/>خروجی Excel نتیجه</button></div><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5"><label>از تاریخ<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"/></label><label>تا تاریخ<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"/></label><label>خریدار / مشتری<select value={customer} onChange={(event) => setCustomer(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"><option value="ALL">همه مشتریان</option>{customerOptions.map((item) => <option key={item.CustomerID} value={item.CustomerID}>{item.CustomerName}</option>)}</select></label><label>تأمین‌کننده<select value={supplier} onChange={(event) => setSupplier(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"><option value="ALL">همه تأمین‌کنندگان</option>{supplierOptions.map((item) => <option key={item.SupplierID} value={item.SupplierID}>{item.SupplierName}</option>)}</select></label><label>کالا<select value={product} onChange={(event) => setProduct(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2"><option value="ALL">همه کالاها</option>{productOptions.map((item) => <option key={item.ProductID} value={item.ProductID}>{item.ProductName}</option>)}</select></label></div></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-3"><Kpi icon={<CalendarDays size={18}/>} label="تعداد پرونده در بازه" value={formatNumber(orders.length, 0)}/><Kpi icon={<Package size={18}/>} label="مجموع مقدار سفارش" value={`${formatNumber(totalQuantity)} MT`}/><Kpi icon={<Users size={18}/>} label="ارزش سفارش‌ها" value={formatCurrency(totalAmount, "$")}/></section>
    <section className="grid gap-5 xl:grid-cols-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs xl:col-span-3"><div className="mb-5"><h2 className="font-bold text-slate-900">روند زمانی سفارش‌ها</h2><p className="text-[11px] text-slate-500">مقدار سفارش (MT) در هر ماه</p></div><div className="flex h-64 items-end gap-2 border-b border-slate-200 pb-6">{periods.length ? periods.map((period) => <div key={period.name} className="flex h-full min-w-11 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-mono text-slate-500">{formatNumber(period.quantity)}</span><div className="w-full max-w-14 rounded-t-md bg-gradient-to-t from-indigo-600 to-cyan-400 shadow-sm transition-all" style={{ height: `${Math.max(8, period.quantity / maxPeriod * 100)}%` }} title={`${period.name}: ${formatNumber(period.quantity)} MT · ${formatCurrency(period.amount, "$")}`}/><span className="-rotate-45 whitespace-nowrap text-[10px] text-slate-500">{period.name}</span></div>) : <div className="grid h-full w-full place-items-center text-sm text-slate-400">دادهٔ تاریخ‌دار در بازه انتخاب‌شده وجود ندارد.</div>}</div>{ordersWithoutDate > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{formatNumber(ordersWithoutDate, 0)} پرونده تاریخ صدور ندارد؛ در جمع کل محاسبه شده اما در نمودار زمانی نمایش داده نمی‌شود.</p>}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs xl:col-span-2"><h2 className="font-bold text-slate-900">دوره‌های پرتکرار</h2><div className="mt-3 space-y-2">{periods.slice().sort((a,b)=>b.orders-a.orders).slice(0,6).map((period) => <div key={period.name} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="flex justify-between"><b>{period.name}</b><span>{period.orders} پرونده</span></div><div className="mt-1 flex justify-between font-mono text-slate-600"><span>{formatNumber(period.quantity)} MT</span><span>{formatCurrency(period.amount,"$")}</span></div></div>)}{!periods.length && <p className="py-6 text-center text-sm text-slate-400">دادهٔ تاریخ‌دار موجود نیست.</p>}</div></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="mb-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="text-indigo-600" size={18}/>مقایسه ۱۰ مشتری برتر</h2><InlineHelp><p className="text-[11px] text-slate-500">بر اساس ارزش خرید در بازهٔ زمانی و فیلترهای انتخاب‌شده</p></InlineHelp></div>{topCustomers.length ? <div className="flex h-72 items-end gap-2 border-b border-slate-200 pb-9">{topCustomers.map((item, index) => <div key={item.name} className="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-2"><span className="text-center text-[10px] font-mono text-slate-500">{formatCurrency(item.amount, "$")}</span><div className="w-full max-w-20 rounded-t-md bg-gradient-to-t from-violet-700 to-fuchsia-400 shadow-sm" style={{ height: `${Math.max(8, item.amount / maxCustomerAmount * 100)}%` }} title={`${item.name}: ${formatCurrency(item.amount, "$")} · ${formatNumber(item.quantity)} MT · ${item.orders} پرونده`}/><span className="max-w-20 -rotate-45 truncate whitespace-nowrap text-[10px] text-slate-500">{index + 1}. {item.name}</span></div>)}</div> : <div className="grid h-40 place-items-center text-sm text-slate-400">داده‌ای برای مقایسه مشتریان وجود ندارد.</div>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="mb-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><Package className="text-orange-600" size={18}/>۱۰ کالای پرفروش</h2><InlineHelp><p className="text-[11px] text-slate-500">رتبه‌بندی بر اساس مقدار فروش (MT) در بازه و فیلترهای فعلی</p></InlineHelp></div>{topProducts.length ? <div className="flex h-72 items-end gap-2 border-b border-slate-200 pb-9">{topProducts.map((item, index) => <div key={item.name} className="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-2"><span className="text-center text-[10px] font-mono text-slate-500">{formatNumber(item.quantity)} MT</span><div className="w-full max-w-20 rounded-t-md bg-gradient-to-t from-orange-600 to-amber-300 shadow-sm" style={{ height: `${Math.max(8, item.quantity / maxProductQuantity * 100)}%` }} title={`${item.name}: ${formatNumber(item.quantity)} MT · ${formatCurrency(item.amount, "$")} · ${item.orders} پرونده`}/><span className="max-w-20 -rotate-45 truncate whitespace-nowrap text-[10px] text-slate-500">{index + 1}. {item.name}</span></div>)}</div> : <div className="grid h-40 place-items-center text-sm text-slate-400">داده‌ای برای مقایسه کالاها وجود ندارد.</div>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"><div className="mb-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><BarChart3 className="text-emerald-600" size={18}/>مقایسه فروش شرکت‌ها</h2><InlineHelp><p className="text-[11px] text-slate-500">براکم، آروین و بولز کم بر اساس ارزش فروش در فیلترهای فعلی</p></InlineHelp></div><div className="grid gap-4 md:grid-cols-3">{companySales.map((item) => <div key={item.name} className="rounded-xl bg-slate-50 p-4"><div className="flex items-end justify-between"><b className="text-sm text-slate-800">{item.name}</b><span className="font-mono text-xs text-slate-500">{item.orders} پرونده</span></div><div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-l from-emerald-600 to-cyan-400" style={{ width: `${item.amount ? Math.max(5, item.amount / maxCompanyAmount * 100) : 0}%` }}/></div><div className="mt-3 flex items-center justify-between"><b className="font-mono text-base text-emerald-700">{formatCurrency(item.amount, "$")}</b><span className="font-mono text-xs text-slate-500">{formatNumber(item.quantity)} MT</span></div></div>)}</div></section>
    <section className="grid gap-5 lg:grid-cols-2"><StatsTable title="سفارش به تفکیک مشتری" rows={customerStats} icon={<Users size={17}/>}/><StatsTable title="سفارش به تفکیک کالا" rows={productStats} icon={<Package size={17}/>}/></section>
  </div>;
};

function add(map: Map<string, Aggregate>, name: string, orders: number, quantity: number, amount: number, date: string) { const current = map.get(name) || { name, orders: 0, quantity: 0, amount: 0, lastDate: "" }; current.orders += orders; current.quantity += quantity; current.amount += amount; if (date > current.lastDate) current.lastDate = date; map.set(name, current); }
function classifySalesCompany(name: string): "براکم" | "آروین" | "بولز کم" | null { const value = name.toLocaleLowerCase(); if (value.includes("berakem") || value.includes("براکم")) return "براکم"; if (value.includes("arovin") || value.includes("آروین")) return "آروین"; if (value.includes("bull") || value.includes("بولز")) return "بولز کم"; return null; }
function groupOrders(orders: Order[], key: (order: Order) => string) { const result = new Map<string, Aggregate>(); orders.forEach((order) => add(result, key(order), 1, getOrderQuantityMT(order), (getOrderCommercialTotalUSD(order) ?? 0), order.PIDate || "")); return [...result.values()].sort((a, b) => b.amount - a.amount); }
function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"><div className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</div><b className="mt-2 block font-mono text-lg text-slate-900">{value}</b></div>; }
function StatsTable({ title, rows, icon }: { title: string; rows: Aggregate[]; icon: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><div className="flex items-center gap-2 border-b border-slate-100 p-4 text-sm font-bold text-slate-900">{icon}{title}</div><div className="max-h-96 overflow-auto"><table className="w-full text-right text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">عنوان</th><th>پرونده</th><th>مقدار</th><th>ارزش</th><th>آخرین سفارش</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name} className="border-t border-slate-100"><td className="max-w-44 truncate p-3 font-semibold text-slate-800">{row.name}</td><td>{row.orders}</td><td className="font-mono">{formatNumber(row.quantity)} MT</td><td className="font-mono text-emerald-700">{formatCurrency(row.amount,"$")}</td><td className="font-mono text-slate-500">{row.lastDate || "—"}</td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-7 text-center text-slate-400">داده‌ای یافت نشد.</td></tr>}</tbody></table></div></section>; }
