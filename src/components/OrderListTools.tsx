import { useResponsiveText } from "../hooks/useResponsiveText";
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, RotateCcw, Search } from "lucide-react";
import { Order } from "../types";

export interface OrderListFilterState {
  query: string;
  activity: "all" | "active" | "inactive";
  dateFrom: string;
  dateTo: string;
  supplier: string;
  customer: string;
  product: string;
}

const emptyFilters: OrderListFilterState = { query: "", activity: "all", dateFrom: "", dateTo: "", supplier: "", customer: "", product: "" };
const text = (value?: string) => (value || "").trim().toLocaleLowerCase("fa").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/\s+/g, " ");
const orderDate = (order: Order) => order.PIDate || order.InvoiceDate || "";

const DeferredTextFilter: React.FC<{ value: string; onCommit: (value: string) => void; placeholder: string; className: string; list?: string }> = React.memo(({ value, onCommit, placeholder, className, list }) => {
  const [localValue, setLocalValue] = useResponsiveText(value, onCommit);
  return <input list={list} value={localValue} onChange={(event) => setLocalValue(event.target.value)} placeholder={placeholder} className={className}/>;
});

export function useOrderListFilters(orders: Order[]) {
  const [filters, setFilters] = useState<OrderListFilterState>(emptyFilters);
  const deferredQuery = useDeferredValue(filters.query);
  const suppliers = useMemo(() => [...new Set(orders.map((order) => order.SupplierName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fa")), [orders]);
  const customers = useMemo(() => [...new Set(orders.map((order) => order.CustomerName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fa")), [orders]);
  const products = useMemo(() => [...new Set(orders.flatMap((order) => (order.items || []).map((item) => item.ProductName || item.ChemicalName || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fa")), [orders]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (filters.activity === "active" && !order.ActiveOrder) return false;
    if (filters.activity === "inactive" && order.ActiveOrder) return false;
    const query = text(deferredQuery);
    if (query) {
      const haystack = [
        order.ProformaInvoiceID,
        order.SupplierName,
        order.CustomerName,
        order.BLNo,
        order.TruckNo,
        order.DocumentsDelivered ? "مدارک تحویل شده documents delivered" : "مدارک تحویل نشده documents pending",
        ...(order.items || []).flatMap((item) => [item.ProductName, item.ChemicalName, item.HSCODE, item.ProductDescription]),
      ].map((value) => text(value)).join(" ");
      if (!haystack.includes(query)) return false;
    }
    const date = orderDate(order);
    if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
    if (filters.dateTo && (!date || date > filters.dateTo)) return false;
    if (filters.supplier && text(order.SupplierName) !== text(filters.supplier)) return false;
    if (filters.customer && text(order.CustomerName) !== text(filters.customer)) return false;
    if (filters.product) {
      const needle = text(filters.product);
      const found = (order.items || []).some((item) => text(`${item.ProductName || ""} ${item.ChemicalName || ""} ${item.HSCODE || ""} ${item.ProductDescription || ""}`).includes(needle));
      if (!found) return false;
    }
    return true;
  }), [orders, filters.activity, filters.dateFrom, filters.dateTo, filters.supplier, filters.customer, filters.product, deferredQuery]);
  return { filters, setFilters, filteredOrders, suppliers, customers, products, reset: () => setFilters(emptyFilters) };
}

export function exportOrderListExcel(filename: string, orders: Order[]) {
  const rows = orders.map((order) => ({
    "شماره PI": order.ProformaInvoiceID || "", "تاریخ": orderDate(order), "تأمین‌کننده": order.SupplierName || "",
    "مشتری": order.CustomerName || "", "کالا": (order.items || []).map((item) => item.ProductName || item.ChemicalName || "").filter(Boolean).join("، "),
    "مقدار": order.TotalQuantity || 0, "ارز": order.InvoiceCurrency || order.TransactionCurrency || "USD", "قیمت فروش": order.SellPrice || 0,
    "وضعیت": order.OrderStatus || (order.ActiveOrder ? "فعال" : "مختومه"), "تحویل مدارک": order.DocumentsDelivered ? "بله" : "خیر",
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Orders");
  XLSX.writeFile(workbook, `${filename.replace(/[\\/:*?"<>|]/g, "-")}.xlsx`);
}

interface Props extends ReturnType<typeof useOrderListFilters> {
  title?: string;
  exportName: string;
  compact?: boolean;
  toolbarControls?: React.ReactNode;
  visibleOrders?: Order[];
  onResetExtra?: () => void;
}

export const OrderListTools: React.FC<Props> = ({ filters, setFilters, filteredOrders, suppliers, customers, products, reset, title = "فیلتر فهرست سفارش‌ها", exportName, compact = false, toolbarControls, visibleOrders, onResetExtra }) => {
  const set = (patch: Partial<OrderListFilterState>) => setFilters((current) => ({ ...current, ...patch }));
  const [compactOpen, setCompactOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState<"row" | "grid">(() => {
    try { return window.localStorage.getItem("arca_order_filters_layout_v1") === "grid" ? "grid" : "row"; } catch { return "row"; }
  });
  useEffect(() => { try { window.localStorage.setItem("arca_order_filters_layout_v1", compactLayout); } catch { /* local preference is optional */ } }, [compactLayout]);
  if (compact) return <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" aria-expanded={compactOpen} onClick={() => setCompactOpen((open) => !open)} className="flex min-w-0 items-center gap-2 text-right">
        <span className={`text-slate-500 transition-transform ${compactOpen ? "rotate-90" : ""}`}>›</span>
        <span><b className="text-xs text-slate-800">{title}</b><span className="mr-2 text-[10px] text-slate-400">{(visibleOrders || filteredOrders).length} پرونده</span></span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCompactLayout((layout) => layout === "row" ? "grid" : "row")} className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700" title="تغییر چیدمان ماژول">چیدمان: {compactLayout === "row" ? "ردیفی" : "شبکه‌ای"}</button>
        <button type="button" onClick={() => { reset(); onResetExtra?.(); }} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600"><RotateCcw size={12}/>پاک‌کردن</button>
        <button type="button" onClick={() => exportOrderListExcel(exportName, visibleOrders || filteredOrders)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white"><Download size={12}/>خروجی Excel</button>
      </div>
    </div>
    {compactOpen && <div className="mt-2 border-t border-slate-100 pt-2">
      <div className={compactLayout === "row" ? "flex flex-wrap items-center gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5"}>
        <div className={`relative min-w-[220px] ${compactLayout === "row" ? "flex-1" : "sm:col-span-2 xl:col-span-1"}`}><Search size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"/><DeferredTextFilter value={filters.query} onCommit={(query) => set({ query })} placeholder="جست‌وجو: PI، خریدار، فروشنده، کالا، بارنامه…" className="w-full rounded-lg border border-slate-200 py-2 pr-7 pl-2 text-xs"/></div>
        {toolbarControls}
      </div>
      <details className="mt-2 border-t border-slate-100 pt-1.5">
        <summary className="cursor-pointer text-[10px] font-bold text-slate-500">فیلترهای بیشتر</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          <label className="text-[10px] text-slate-500">از تاریخ<input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/></label>
          <label className="text-[10px] text-slate-500">تا تاریخ<input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/></label>
          <label className="text-[10px] text-slate-500">تأمین‌کننده<select value={filters.supplier} onChange={(e) => set({ supplier: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">همه</option>{suppliers.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[10px] text-slate-500">مشتری<select value={filters.customer} onChange={(e) => set({ customer: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">همه</option>{customers.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[10px] text-slate-500">کالا<DeferredTextFilter list={`${exportName}-products`} value={filters.product} onCommit={(product) => set({ product })} placeholder="نام، HS Code…" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/><datalist id={`${exportName}-products`}>{products.map((item) => <option key={item} value={item}/>)}</datalist></label>
        </div>
      </details>
    </div>}
  </div>;
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs" dir="rtl">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-slate-800">{title}</b><span className="mr-2 text-[10px] text-slate-400">{filteredOrders.length} پرونده</span></div><div className="flex gap-1.5"><button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600"><RotateCcw size={12}/>پاک‌کردن</button><button type="button" onClick={() => exportOrderListExcel(exportName, filteredOrders)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white"><Download size={12}/>خروجی Excel</button></div></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      <label className="text-[10px] text-slate-500">وضعیت پرونده<select aria-label="فیلتر وضعیت فعالیت پرونده" value={filters.activity} onChange={e => set({ activity: e.target.value as OrderListFilterState["activity"] })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="all">همه پرونده‌ها</option><option value="active">پرونده‌های فعال</option><option value="inactive">پرونده‌های غیرفعال</option></select></label>
      <label className="col-span-2 text-[10px] text-slate-500 md:col-span-2">جست‌وجوی سریع<div className="relative mt-1"><Search size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"/><DeferredTextFilter value={filters.query} onCommit={(query) => set({ query })} placeholder="PI، مشتری، تأمین‌کننده، کالا یا HS Code" className="w-full rounded-lg border border-slate-200 py-2 pr-7 pl-2 text-xs"/></div></label>
      <label className="text-[10px] text-slate-500">از تاریخ<input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/></label>
      <label className="text-[10px] text-slate-500">تا تاریخ<input type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/></label>
      <label className="text-[10px] text-slate-500">تأمین‌کننده<select value={filters.supplier} onChange={(e) => set({ supplier: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">همه</option>{suppliers.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-[10px] text-slate-500">مشتری<select value={filters.customer} onChange={(e) => set({ customer: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">همه</option>{customers.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="col-span-2 text-[10px] text-slate-500 md:col-span-1">کالا<DeferredTextFilter list={`${exportName}-products`} value={filters.product} onCommit={(product) => set({ product })} placeholder="نام، HS Code..." className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/><datalist id={`${exportName}-products`}>{products.map((item) => <option key={item} value={item}/>)}</datalist></label>
    </div>
  </div>;
};
