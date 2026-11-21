import { InlineHelp } from "./InlineHelp";
import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Search, Trash2 } from "lucide-react";
import { AppDatabase } from "../types";

const CFR_STORAGE_KEY = "arcatav.cfr-estimator.last-calculation";
type SavedCfrCalculation = { productId: number; productQuery: string; fob: number; freight: number; capacity: number; margin: number };

const loadSavedCalculation = (): Partial<SavedCfrCalculation> => {
  try {
    const saved = localStorage.getItem(CFR_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

export const DashboardCfrEstimator: React.FC<{ db: AppDatabase }> = ({ db }) => {
  const [saved] = useState(loadSavedCalculation);
  const [productId, setProductId] = useState(saved.productId || 0);
  const [fob, setFob] = useState(saved.fob ?? 0);
  const [freight, setFreight] = useState(saved.freight ?? 0);
  const [capacity, setCapacity] = useState(saved.capacity ?? 0);
  const [margin, setMargin] = useState(saved.margin ?? 0);
  const [productQuery, setProductQuery] = useState(saved.productQuery || "");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const product = useMemo(() => db.products.find((item) => item.ProductID === productId), [db.products, productId]);

  useEffect(() => { if (productId && product) setProductQuery(product.ProductName); }, [product, productId]);
  useEffect(() => {
    localStorage.setItem(CFR_STORAGE_KEY, JSON.stringify({ productId, productQuery, fob, freight, capacity, margin }));
  }, [productId, productQuery, fob, freight, capacity, margin]);

  const matchingProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase();
    if (!query) return db.products.slice(0, 20);
    return db.products.filter((item) => `${item.ProductName || ""} ${item.ChemicalName || ""} ${item.HSCODE || ""}`.toLocaleLowerCase().includes(query)).slice(0, 20);
  }, [db.products, productQuery]);
  const freightPerMt = capacity > 0 ? freight / capacity : 0;
  const cfr = fob + freightPerMt;
  const suggested = cfr + margin;
  const input = (value: number, setValue: (next: number) => void) => <input type="number" value={value} onChange={(event) => setValue(Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-sm text-slate-900 outline-none focus:border-indigo-400" />;
  const selectProduct = (next: typeof db.products[number]) => {
    setProductId(next.ProductID); setProductQuery(next.ProductName); setProductMenuOpen(false);
    if (next.DefaultUnitPrice) setFob(next.DefaultUnitPrice);
  };
  const clearCalculation = () => {
    setProductId(0); setProductQuery(""); setFob(0); setFreight(0); setCapacity(0); setMargin(0); setProductMenuOpen(false);
    localStorage.removeItem(CFR_STORAGE_KEY);
  };

  return <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-2xs" dir="rtl">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-bold text-violet-950"><Calculator size={18} className="text-violet-600" />ماشین‌حساب برآورد CFR</h2><InlineHelp><p className="mt-1 text-[11px] text-slate-500">FOB + (کرایهٔ کانتینر ÷ ظرفیت) + مارجین. این برآورد هیچ مبلغی را در سود پرونده ثبت نمی‌کند.</p></InlineHelp></div>
      <div className="flex items-center gap-2">{product && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">{product.ProductName}</span>}<button type="button" onClick={clearCalculation} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={14} />پاک کردن</button></div>
    </div>
    {!db.products.length ? <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">برای استفاده ابتدا یک کالا در کاتالوگ تعریف کنید.</div> : <div className="grid gap-3 lg:grid-cols-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
        <label className="relative text-xs font-semibold text-slate-600">کالا<div className="relative mt-1"><Search size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={productQuery} onFocus={() => setProductMenuOpen(true)} onBlur={() => window.setTimeout(() => setProductMenuOpen(false), 120)} onChange={(event) => { setProductQuery(event.target.value); setProductMenuOpen(true); }} placeholder="بخشی از نام کالا را تایپ کنید…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-indigo-400" />{productMenuOpen && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">{matchingProducts.map((item) => <button key={item.ProductID} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(item)} className="block w-full rounded-md px-3 py-2 text-right text-xs hover:bg-violet-50"><b>{item.ProductName}</b>{item.ChemicalName && <span className="mr-2 text-slate-400">{item.ChemicalName}</span>}</button>)}{matchingProducts.length === 0 && <div className="px-3 py-3 text-center text-xs text-slate-400">کالای منطبق پیدا نشد</div>}</div>}</div></label>
        <label className="text-xs font-semibold text-slate-600">FOB / MT (USD){input(fob, setFob)}</label><label className="text-xs font-semibold text-slate-600">کرایهٔ کانتینر (USD){input(freight, setFreight)}</label><label className="text-xs font-semibold text-slate-600">ظرفیت کانتینر (MT){input(capacity, setCapacity)}</label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">مارجین پیشنهادی / MT (USD){input(margin, setMargin)}</label>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-slate-900 to-violet-950 p-4 text-white"><div className="text-[11px] font-bold text-violet-200">نتیجهٔ برآورد</div><div className="mt-3 space-y-2 border-t border-white/15 pt-3 text-xs"><div className="flex justify-between"><span className="text-slate-300">کرایه / MT</span><b className="font-mono">{freightPerMt.toFixed(2)} USD</b></div><div className="flex justify-between"><span className="text-slate-300">CFR / MT</span><b className="font-mono">{cfr.toFixed(2)} USD</b></div><div className="mt-3 rounded-lg bg-emerald-400/15 p-3"><span className="block text-[10px] text-emerald-200">فروش پیشنهادی / MT</span><b className="mt-1 block font-mono text-xl text-emerald-300">{suggested.toFixed(2)} USD</b></div></div></div>
    </div>}
  </section>;
};
