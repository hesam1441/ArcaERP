import { InlineHelp } from "./InlineHelp";
import { RialSalesPanel } from "./RialSalesPanel";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppDatabase, Language, Order, OrderDetail } from "../types";
import { Calculator, Plus, Search, Save, Trash2 } from "lucide-react";
import { entryIssuerId, entryNumber, loadEntryOrder, newEntryOrder, prepareEntrySave, recalculateEntry } from "../utils/proformaEntry";
import { getOrderCommercialTotal, getOrderCurrency, getOrderProfitCurrency, getOrderQuantityMT } from "../utils/orderAccounting";
import { getCaseFinancials } from "../utils/caseFinancials";
import { matchesWorkbenchSearch } from "../utils/accountingWorkbench";
import { formatNumber } from "../utils/formatters";
import { ProformaPreviewPopup } from "./ProformaPreviewPopup";

const inputClass = "w-full min-w-0 h-10 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11px] font-bold text-slate-800">{children}</span>;
interface Props { db: AppDatabase; language: Language; onSaveOrder: (order: Order) => void; onOpenOrder: (orderId?: number, section?: "general" | "shares" | "documents") => void; }

/** Compact commercial entry over the same orders, journal, numbering and document renderer. */
export const AccessOrderEntryPreview: React.FC<Props> = ({ db, language, onSaveOrder, onOpenOrder }) => {
  const fa = language === "fa";
  const l = (persian: string, english: string) => fa ? persian : english;
  const orders = useMemo(() => [...db.orders].sort((a, b) => String(b.PIDate || "").localeCompare(String(a.PIDate || "")) || b.OrderID - a.OrderID), [db.orders]);
  const [selectedId, setSelectedId] = useState<number | null>(() => orders[0]?.OrderID ?? null);
  const [draft, setDraft] = useState<Order>(() => orders[0] ? loadEntryOrder(orders[0]) : newEntryOrder(db));
  const [dirty, setDirty] = useState(false);
  const [autoNumber, setAutoNumber] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const source = useRef(orders[0] ? JSON.stringify(orders[0]) : "");
  const savedOrder = db.orders.find(item => item.OrderID === selectedId);
  const isNew = selectedId === null;
  const results = orders.filter(item => matchesWorkbenchSearch(item, search));
  const quantity = getOrderQuantityMT(draft);
  const financial = useMemo(() => getCaseFinancials({ ...db, orders: [...db.orders.filter(item => item.OrderID !== draft.OrderID), draft] }, draft), [db, draft]);
  const rate = Number(draft.ExchangeRateApplied ?? draft.ExchangeRate) || 0;
  const currency = getOrderCurrency(draft);
  const agreement = getOrderProfitCurrency(draft);

  useEffect(() => {
    if (dirty || !savedOrder) return;
    source.current = JSON.stringify(savedOrder); setDraft(loadEntryOrder(savedOrder));
  }, [savedOrder, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  const load = (id: number | null) => {
    if (dirty) { setError(l("ابتدا تغییرات را ذخیره یا با دکمهٔ بازگردانی لغو کنید.", "Save or discard your changes first.")); return; }
    const order = db.orders.find(item => item.OrderID === id);
    setSelectedId(order?.OrderID ?? null); setDraft(order ? loadEntryOrder(order) : newEntryOrder(db));
    source.current = order ? JSON.stringify(order) : ""; setAutoNumber(true); setError(""); setMessage("");
  };
  const patch = (values: Partial<Order>, recalc = false) => {
    setDraft(previous => {
      let next = { ...previous, ...values };
      if (isNew && autoNumber && next.SupplierID && (values.SupplierID != null || values.PIDate != null || values.IsDummy != null)) next.ProformaInvoiceID = entryNumber(db, next);
      return recalc ? recalculateEntry(next) : next;
    });
    setDirty(true); setError(""); setMessage("");
  };
  const updateItem = (index: number, values: Partial<OrderDetail>) => patch({ items: (draft.items || []).map((item, i) => i === index ? { ...item, ...values } : item) }, true);
  const addItem = () => patch({ items: [...(draft.items || []), { OrderDetailID: Date.now(), OrderID: draft.OrderID, ProductID: 0, ProductName: "", Quantity: 0, QuantityUnit: "MT", UnitPrice: 0, AgreedCustomerPrice: 0 }] }, true);
  const save = () => {
    try {
      if (!isNew && (!savedOrder || JSON.stringify(savedOrder) !== source.current)) throw new Error(l("پرونده در بخش دیگری تغییر کرده است؛ برای دریافت اطلاعات جدید، بازگردانی را بزنید.", "This case changed elsewhere. Reload it before saving."));
      const prepared = prepareEntrySave(db, draft, isNew, autoNumber);
      onSaveOrder(prepared); setDraft(loadEntryOrder(prepared)); setSelectedId(prepared.OrderID); source.current = JSON.stringify(prepared); setDirty(false); setError("");
      setMessage(l(`پروفورمای ${prepared.ProformaInvoiceID} ثبت شد.`, `Proforma ${prepared.ProformaInvoiceID} saved.`));
    } catch (err) { setError(err instanceof Error ? err.message : "ثبت انجام نشد."); }
  };
  const discard = () => { setDraft(savedOrder ? loadEntryOrder(savedOrder) : newEntryOrder(db)); source.current = savedOrder ? JSON.stringify(savedOrder) : ""; setDirty(false); setAutoNumber(true); setError(""); setMessage(""); };
  const openFull = (section: "general" | "shares" | "documents") => {
    if (dirty || isNew) { setError(l("ابتدا پروفورما را ذخیره کنید.", "Save the proforma first.")); return; }
    onOpenOrder(draft.OrderID, section);
  };
  const textField = (field: keyof Order, title: string, type = "text") => <label key={field}><Label>{title}</Label><input aria-label={title} type={type} className={inputClass} value={String(draft[field] ?? "")} onChange={e => patch({ [field]: type === "number" ? Number(e.target.value) : e.target.value })}/></label>;
  const previewReady = !dirty && !!savedOrder;

  return <div className="min-w-0 rounded-2xl border border-slate-500 bg-[#838383] p-3 md:p-5" dir="ltr">
    <header className="flex flex-wrap items-center justify-between gap-3 bg-[#3d3d3d] p-4 text-white"><div><h1 className="text-2xl font-black">Order Entry Form</h1><InlineHelp><p className="mt-1 text-xs text-slate-300">{l("ثبت و ویرایش پروفورما — متصل به پرونده و حسابداری", "Proforma entry — shared cases and accounting")}</p></InlineHelp></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => load(null)} className="flex items-center gap-1 rounded bg-green-600 px-4 py-2 text-sm"><Plus size={16}/>{l("پروفورمای جدید", "New proforma")}</button><button type="button" onClick={() => openFull("general")} className="rounded bg-black px-4 py-2 text-sm">{l("ویرایش کامل پرونده", "Full case editor")}</button><button type="button" onClick={save} className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm"><Save size={16}/>{l("ذخیره پروفورما", "Save proforma")}</button></div></header>
    <div className="grid gap-3 border-b border-slate-500 bg-slate-100 p-3 md:grid-cols-[1fr_auto_2fr]"><input aria-label="Search proforma" placeholder={l("شماره پروفورما، مشتری، فروشنده یا کالا…", "PI number, buyer, supplier or product…")} value={search} onChange={e => setSearch(e.target.value)} className={inputClass}/><button type="button" onClick={() => results[0] ? load(results[0].OrderID) : setError(l("پرونده‌ای پیدا نشد.", "No matching case."))} className="flex items-center justify-center gap-1 rounded bg-green-600 px-4 py-2 text-sm text-white"><Search size={15}/>{l("نمایش نتیجه", "Show result")}</button><select aria-label="Select proforma" value={selectedId ?? ""} onChange={e => load(Number(e.target.value) || null)} className={inputClass}><option value="">{l("پروفورمای جدید", "New proforma")}</option>{savedOrder && !results.some(item => item.OrderID === selectedId) && <option value={savedOrder.OrderID}>{savedOrder.ProformaInvoiceID} — {l("پروندهٔ باز، خارج از جست‌وجو", "current case outside search")}</option>}{results.map(item => <option key={item.OrderID} value={item.OrderID}>{item.ProformaInvoiceID} — {item.CustomerName}</option>)}</select><p className="text-xs text-slate-500 md:col-span-3">{results.length} {l("پرونده", "cases")}{dirty ? ` · ${l("تغییرات ذخیره نشده", "Unsaved changes")}` : ""}</p></div>
    {error && <p role="alert" dir="auto" className="m-3 rounded bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" dir="auto" className="m-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-5"><div className="grid gap-3 sm:grid-cols-3"><label><Label>Order ID</Label><input aria-label="Order ID" className={inputClass} value={isNew ? "New" : draft.OrderID} readOnly/></label>{textField("SC_Valid_Days", "SC Valid Days", "number")}<label><Label>Proforma Invoice No.</Label><input aria-label="Proforma Invoice No." className={inputClass} value={draft.ProformaInvoiceID} onChange={e => { setAutoNumber(false); patch({ ProformaInvoiceID: e.target.value }); }}/></label>{textField("PI_Valid_Days", "PI Valid Days", "number")}{textField("PIDate", "PI Date", "date")}<label><Label>{l("وضعیت پرونده", "Case status")}</Label><select aria-label="Case status" className={inputClass} value={draft.ActiveOrder ? "active" : "inactive"} onChange={e => patch({ ActiveOrder: e.target.value === "active", LifecycleStatus: e.target.value === "active" ? "active" : "completed" })}><option value="active">{l("فعال", "Active")}</option><option value="inactive">{l("غیرفعال", "Inactive")}</option></select></label></div>
      <div className="grid gap-3 border-t border-slate-500 pt-4 sm:grid-cols-2"><label><Label>Supplier Name</Label><select aria-label="Supplier Name" value={draft.SupplierID} className={inputClass} onChange={e => { const supplier = db.suppliers.find(item => item.SupplierID === Number(e.target.value)); patch({ SupplierID: supplier?.SupplierID || 0, SupplierName: supplier?.SupplierName || "", IssuerCompanyId: entryIssuerId(supplier, draft.IssuerCompanyId), ...(isNew ? { CountryOfBeneficiary: supplier?.Country || ({ arovin: "United Arab Emirates", bera: "Turkey", bullschem: "South Korea", "arca-tav": "Iran" } as Record<string, string>)[entryIssuerId(supplier)] || "", NameOfSignatory: supplier?.Signatory || "" } : {}) }); }}><option value={0}>{l("انتخاب فروشنده…", "Select supplier…")}</option>{[...db.suppliers].sort((a,b)=>a.SupplierName.localeCompare(b.SupplierName)).map(item => <option key={item.SupplierID} value={item.SupplierID}>{item.SupplierName}</option>)}</select></label><label><Label>Customer Name</Label><select aria-label="Customer Name" value={draft.CustomerID} className={inputClass} onChange={e => patch({ CustomerID: Number(e.target.value), CustomerName: db.customers.find(item => item.CustomerID === Number(e.target.value))?.CustomerName || "" })}><option value={0}>{l("انتخاب خریدار…", "Select buyer…")}</option>{[...db.customers].sort((a,b)=>a.CustomerName.localeCompare(b.CustomerName)).map(item => <option key={item.CustomerID} value={item.CustomerID}>{item.CustomerName}</option>)}</select></label>
      {textField("TermsOfDelivery", "Terms Of Delivery")}{textField("TermsOfPayment", "Terms Of Payment")}{textField("TransportaionMode", "Transportation Mode")}{textField("CountryOfOrigin", "Country Of Origin")}{textField("CountryOfDestination", "Country Of Destination")}{textField("CountryOfBeneficiary", "Country Of Beneficiary")}{textField("PortOfLoading", "Port Of Loading")}{textField("PortOfDischarge", "Port Of Discharge")}{textField("FinalPlaceOfDelivery", "Final Place Of Delivery")}{textField("TotalGrossWeight", "Total Gross Weight (KG)")}
      </div>
      <div className="grid gap-3 border-t border-slate-500 pt-4 sm:grid-cols-3"><label><Label>Agreement Currency</Label><input aria-label="Agreement Currency" value={agreement} maxLength={3} className={inputClass} onChange={e => { const next=e.target.value.toUpperCase(); patch({ AgreementCurrency: next, ScCurrency: next, IsExchangeRateUsed: next !== currency, ...(next === currency ? { ExchangeRateApplied: 1, ExchangeRate: 1 } : {}) }, true); }}/></label><label><Label>Invoice Currency</Label><input aria-label="Invoice Currency" value={currency} maxLength={3} className={inputClass} onChange={e => { const next=e.target.value.toUpperCase(); patch({ InvoiceCurrency: next, TransactionCurrency: next, IsExchangeRateUsed: next !== agreement, ...(next === agreement ? { ExchangeRateApplied: 1, ExchangeRate: 1 } : {}) }, true); }}/></label><label><Label>Exchange Rate ({agreement} → {currency})</Label><input aria-label="Exchange Rate" type="number" step="any" className={inputClass} value={rate} onChange={e => patch({ ExchangeRateApplied: Number(e.target.value), ExchangeRate: Number(e.target.value) }, true)}/></label><label><Label>Total Freight ({agreement})</Label><input aria-label="Total Freight" type="number" min="0" step="any" value={draft.Freight} className={inputClass} onChange={e => patch({ Freight: Number(e.target.value) }, true)}/></label><label><Label>Total Quantity (MT)</Label><input aria-label="Total Quantity" value={quantity} readOnly className={inputClass}/></label><label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={!!draft.IsDummy} onChange={e => patch({ IsDummy: e.target.checked, ExcludeFromCalculations: e.target.checked })}/>{l("پروفورمای صوری؛ خارج از محاسبات مالی", "Dummy PI — excluded from financial totals")}</label></div>
      <div className="min-w-0 rounded border border-slate-500 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#91a7c5]"><tr>{["Product", "Quantity (MT)", `Agreed Price (${agreement}/MT)`, "Origin Price X", `Total (${agreement})`, ""].map((name,index)=><th key={index} className="p-2">{name}</th>)}</tr></thead><tbody>{(draft.items || []).map((item,index) => <tr key={item.OrderDetailID} className="border-t"><td className="p-2"><select aria-label={`Product ${index+1}`} className={`${inputClass} min-w-48`} value={item.ProductID} onChange={e=>{ const product=db.products.find(p=>p.ProductID===Number(e.target.value)); if(product)updateItem(index,{ ProductID:product.ProductID,ProductName:product.ProductName,ChemicalName:product.ChemicalName,HSCODE:product.HSCODE,ProductDescription:product.ExportGrade,NosAndKindOfPackages:product.PackingDetail }); }}><option value={0}>Select product…</option>{item.ProductID && !db.products.some(product=>product.ProductID===item.ProductID) ? <option value={item.ProductID}>{item.ProductName}</option> : null}{db.products.map(product=><option key={product.ProductID} value={product.ProductID}>{product.ProductName}</option>)}</select></td><td className="p-2"><input aria-label={`Quantity ${index+1}`} className={`${inputClass} min-w-24`} type="number" min="0" step="any" value={item.Quantity} onChange={e=>updateItem(index,{Quantity:Number(e.target.value)})}/></td><td className="p-2"><input aria-label={`Agreed Price ${index+1}`} className={`${inputClass} min-w-28`} type="number" min="0" step="any" value={item.AgreedCustomerPrice ?? item.UnitPrice} onChange={e=>updateItem(index,{AgreedCustomerPrice:Number(e.target.value),UnitPrice:Number(e.target.value)})}/>{item.UseManualInvoicePrice && <span className="text-amber-700">{l("قیمت چاپی دستی محفوظ است", "Manual print price retained")}</span>}</td><td className="p-2 font-mono">{formatNumber((item.AgreedCustomerPrice ?? item.UnitPrice) - (quantity ? draft.Freight/quantity : 0))}</td><td className="p-2 font-mono">{formatNumber(item.Quantity*(item.AgreedCustomerPrice ?? item.UnitPrice))}</td><td className="p-2"><button aria-label={`Remove product ${index+1}`} type="button" onClick={()=>patch({items:draft.items?.filter((_,i)=>i!==index)},true)} className="p-2 text-rose-600"><Trash2 size={16}/></button></td></tr>)}</tbody></table></div><button type="button" onClick={addItem} className="m-3 flex items-center gap-1 rounded bg-blue-50 px-3 py-2 text-sm text-blue-800"><Plus size={15}/>{l("افزودن کالا", "Add product")}</button></div></section>
      <aside className="min-w-0 space-y-4"><div className="border border-white bg-[#acd18e]"><h2 className="flex items-center gap-2 bg-[#24558c] p-3 text-xl font-bold text-white"><Calculator/>CALCULATOR</h2><div className="space-y-3 p-3 text-sm"><p>Weight: <b>{formatNumber(quantity)} MT</b></p><p>Total Freight: <b>{formatNumber(draft.Freight)} {agreement}</b></p><p className="bg-white/70 p-2">X = Agreed Price − Freight ÷ Total Weight</p><p>Agreed Total: <b>{formatNumber((draft.items||[]).reduce((s,i)=>s+i.Quantity*(i.AgreedCustomerPrice??i.UnitPrice),0))} {agreement}</b></p><p data-entry-invoice-total className="bg-[#557fb4] p-3 text-xl font-black text-white">PI Total: {formatNumber(getOrderCommercialTotal(draft))} {currency}</p><div className="border-t border-green-700 pt-3"><b>{l("سود طبق محاسبات مشترک", "Shared profit calculation")}</b><p className="mt-2">{financial.statusLabel}</p><p>{formatNumber(financial.profit.totalCaseProfit)} {financial.profitCurrency}</p><button type="button" onClick={()=>openFull("shares")} className="mt-2 rounded bg-white/70 px-3 py-2 text-xs">{l("تنظیم سود و سهم‌ها", "Profit and shares")}</button></div></div></div><label><Label>Note / Sales Contract Note</Label><textarea aria-label="Note" className="min-h-48 w-full rounded border border-slate-400 bg-white p-3 text-sm" value={draft.Note} onChange={e=>patch({Note:e.target.value})}/></label><details className="rounded bg-white/80 p-3 text-xs"><summary className="cursor-pointer">{l("راهنما", "Help")}</summary><p className="mt-2 leading-6">{l("مقادیر و قیمت‌ها به تن و ارز توافق هستند. تسعیر فقط مبلغ پروفورما را تبدیل می‌کند. X از قیمت توافقی و سهم حمل به دست می‌آید؛ قیمت خرید و هزینه واقعی از دفتر پرونده خوانده می‌شوند. برای ثبت پرداخت، مالکیت اقتصادی، شریک یا تنظیمات تکمیلی، ویرایش کامل پرونده را باز کنید.", "Quantities are MT and prices use agreement currency. FX changes invoice values only. X excludes allocated freight; actual purchase and expense postings remain in the case ledger. Use the full case editor for ownership, partners, payments and advanced settings.")}</p></details></aside>
    </div>
    <footer className="flex flex-wrap items-center gap-3 bg-[#f7cda9] p-4"><button type="button" disabled={!previewReady} onClick={()=>setPreview(true)} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-40">{l("پیش‌نمایش پروفورما", "Proforma preview")}</button><button type="button" onClick={()=>openFull("documents")} className="rounded bg-orange-600 px-4 py-2 text-sm text-white">{l("مدارک پرونده", "Case documents")}</button><span className="mx-auto font-mono text-xl font-black">TOTAL {formatNumber(getOrderCommercialTotal(draft))} {currency}</span><button type="button" onClick={discard} className="rounded border border-slate-500 px-4 py-2 text-sm">{l("بازگردانی", "Discard changes")}</button><button type="button" onClick={save} className="flex items-center gap-1 rounded bg-green-700 px-4 py-2 text-sm text-white"><Save size={16}/>{l("ذخیره", "Save")}</button></footer>
    {savedOrder && <div className="mt-3"><RialSalesPanel key={`rial-entry-${savedOrder.OrderID}`} order={savedOrder} db={db} onSave={onSaveOrder} disabled={dirty}/></div>}
    {preview && savedOrder && <ProformaPreviewPopup order={savedOrder} db={db} onClose={()=>setPreview(false)} onUpdateOrder={onSaveOrder}/>}
  </div>;
};
