import { InlineHelp } from "./InlineHelp";
import React, { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, RotateCcw, Save } from "lucide-react";
import { AppDatabase, CaseProfitPlan, Order } from "../types";
import { calculateUnifiedProfit } from "../utils/caseProfitEngine";
import { formatCurrency } from "../utils/formatters";
import { getOrderProfitCurrency, getOrderQuantityMT } from "../utils/orderAccounting";

interface Props {
  db: AppDatabase;
  onSaveOrder: (order: Order) => void;
}

type Inputs = {
  purchasePricePerMT: string;
  quantityMT: string;
  freight: string;
  sellPricePerMT: string;
};

const asInput = (value: number | undefined) => Number.isFinite(Number(value)) ? String(Number(value)) : "";
const number = (value: string) => Number(value) || 0;

const defaultsFor = (order: Order): Inputs => ({
  purchasePricePerMT: asInput(order.profitPlan?.calculationPurchasePricePerMT ?? order.CostPrice ?? order.CFRNet ?? order.NetFob),
  quantityMT: asInput(order.profitPlan?.calculationQuantityMT ?? getOrderQuantityMT(order)),
  freight: asInput(order.profitPlan?.calculationFreight ?? order.Freight),
  sellPricePerMT: asInput(order.profitPlan?.calculationSellPricePerMT ?? order.EndCustomerPrice ?? order.SellPrice),
});

const fallbackPlan = (order: Order, db: AppDatabase): CaseProfitPlan => {
  if (order.profitPlan) return order.profitPlan;
  const supplier = db.suppliers.find((item) => item.SupplierID === order.SupplierID);
  const profile = supplier?.profitProfile;
  return {
    profileId: profile?.id,
    route: profile?.route || "direct",
    agentSharePercent: profile?.agentSharePercent,
    bankChargePercentOfPurchase: profile?.bankChargePercentOfPurchase,
    bankChargeName: profile?.bankChargeName,
    transactionSharePerMT: profile?.transactionSharePerMT,
    rules: profile?.rules || [],
    calculationVersion: 1,
  };
};

export const ProfitCalculatorPreview: React.FC<Props> = ({ db, onSaveOrder }) => {
  const orders = useMemo(() => [...db.orders].sort((a, b) => String(b.PIDate || "").localeCompare(String(a.PIDate || ""))), [db.orders]);
  const [orderId, setOrderId] = useState<number | "">(orders[0]?.OrderID ?? "");
  const order = orders.find((item) => item.OrderID === orderId);
  const [inputs, setInputs] = useState<Inputs>(() => order ? defaultsFor(order) : { purchasePricePerMT: "", quantityMT: "", freight: "", sellPricePerMT: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (order) setInputs(defaultsFor(order));
    setSaved(false);
  }, [orderId]);

  const previewOrder = useMemo<Order | undefined>(() => order ? ({
    ...order,
    profitPlan: {
      ...fallbackPlan(order, db),
      calculationPurchasePricePerMT: number(inputs.purchasePricePerMT),
      calculationQuantityMT: number(inputs.quantityMT),
      calculationFreight: number(inputs.freight),
      calculationSellPricePerMT: number(inputs.sellPricePerMT),
      calculationVersion: 1,
    },
  }) : undefined, [db, inputs, order]);

  const supplier = order ? db.suppliers.find((item) => item.SupplierID === order.SupplierID) : undefined;
  const result = previewOrder ? calculateUnifiedProfit(previewOrder, supplier, db.issuerCompanyShares, db) : null;
  const currency = getOrderProfitCurrency(order);
  const cfr = result ? result.purchasePricePerMT + result.freightPerMT : 0;
  const marginPerMT = result ? result.sellPricePerMT - cfr : 0;
  const namedShares = result ? [
    { id: "commission", name: "Commission / کمیسیون", amount: result.commissionTotal },
    { id: "bank", name: previewOrder?.profitPlan?.bankChargeName || "Bera Bank / سهم بانک", amount: result.bankCharge },
    ...result.allocations.filter((item) => item.beneficiaryRole !== "arcatav").map((item) => ({ id: item.ruleId, name: item.beneficiaryName || "سهم بدون نام", amount: item.amount })),
    { id: "arcatav", name: "Arca Share / سهم آرکاتاو", amount: result.arcatavShare },
  ].filter((item, index, list) => item.amount !== 0 || item.id === "arcatav" || list.length <= 2) : [];

  const update = (key: keyof Inputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const saveActuals = () => {
    if (!previewOrder) return;
    onSaveOrder(previewOrder);
    setSaved(true);
  };

  return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-7" dir="rtl">
    <header className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-bold text-amber-300"><Calculator size={14}/> فرم آزمایشی — مستقل از فرم پروفورما</div><h1 className="text-xl font-black md:text-2xl">محاسبه ساده سود پرونده</h1><InlineHelp><p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">اعداد اولیه از پروفورما خوانده می‌شوند. تغییرات این صفحه سند چاپی را تغییر نمی‌دهد و فقط در صورت زدن دکمه ذخیره، به‌عنوان ارقام واقعی حسابداری ثبت می‌شود.</p></InlineHelp></div>
        {saved && <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-300"><CheckCircle2 size={15}/> ارقام حسابداری ذخیره شد</span>}
      </div>
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <label className="block text-xs font-bold text-slate-700">انتخاب پرونده / پروفورما</label>
      <select value={orderId} onChange={(event) => setOrderId(event.target.value ? Number(event.target.value) : "")} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-bold outline-none focus:border-indigo-500 md:max-w-2xl">
        {!orders.length && <option value="">پرونده‌ای موجود نیست</option>}
        {orders.map((item) => <option key={item.OrderID} value={item.OrderID}>{item.ProformaInvoiceID || `#${item.OrderID}`} — {item.CustomerName || "بدون مشتری"} — {item.SupplierName || "بدون تأمین‌کننده"}</option>)}
      </select>
    </section>

    {order && result && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4"><h2 className="font-black text-slate-900">چهار عدد اصلی</h2><InlineHelp><p className="mt-1 text-[11px] text-slate-500">هر چهار مقدار در یک مسیر محاسباتی واحد استفاده می‌شوند؛ با تغییر هر عدد، همه نتایج و سهم‌ها همان لحظه تازه می‌شوند.</p></InlineHelp></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {([
            ["purchasePricePerMT", "Net FOB / MT", "قیمت خرید خالص هر تن"],
            ["quantityMT", "مقدار واقعی (MT)", "وزن واقعی به تن"],
            ["freight", "حمل واقعی", "کل هزینه حمل"],
            ["sellPricePerMT", "قیمت فروش / MT", "قیمت فروش هر تن"],
          ] as const).map(([key, label, hint]) => <label key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-800"><span>{label}</span><input type="number" min={key === "quantityMT" || key === "freight" ? 0 : undefined} step="any" value={inputs[key]} onChange={(event) => update(key, event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-left font-mono text-base font-black outline-none focus:border-indigo-500" dir="ltr"/><small className="mt-1.5 block font-normal text-slate-500">{hint}</small></label>)}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm md:p-6">
        <h2 className="mb-4 font-black text-indigo-950">نتیجه روشن و فوری</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">CFR / MT</p><strong className="mt-2 block font-mono text-xl text-indigo-700">{formatCurrency(cfr, currency)}</strong><p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-600">CFR / MT = Net FOB + (حمل ÷ مقدار)</p></div>
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">سود / MT</p><strong className={`mt-2 block font-mono text-xl ${marginPerMT < 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatCurrency(marginPerMT, currency)}</strong><p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-600">سود / MT = قیمت فروش − CFR</p></div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-700 p-4 text-white shadow-sm"><p className="text-xs font-bold text-indigo-100">سود کل</p><strong className="mt-2 block font-mono text-2xl">{formatCurrency(result.totalMargin, currency)}</strong><p className="mt-3 border-t border-indigo-500 pt-3 text-[11px] text-indigo-100">سود کل = سود / MT × مقدار</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4"><h2 className="font-black text-slate-900">سهم‌ها</h2><InlineHelp><p className="mt-1 text-[11px] text-slate-500">تمام سهم‌های تعریف‌شده پرونده، کمیسیون، بانک و سهم آرکاتاو در همین بخش و از همین محاسبه نمایش داده می‌شوند.</p></InlineHelp></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{namedShares.map((share) => <div key={share.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold text-slate-700">{share.name}</span><strong className="whitespace-nowrap font-mono text-sm text-slate-950">{formatCurrency(share.amount, currency)}</strong></div>)}</div>
        {!result.allocations.length && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800">برای این پرونده هنوز سهم شخص یا شرکت دیگری تعریف نشده است. سهم‌های موجود پس از تعریف در تنظیمات پرونده، خودکار در اینجا دیده می‌شوند.</p>}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setInputs(defaultsFor(order))} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700"><RotateCcw size={15}/> بازگشت به ارقام ثبت‌شده</button>
        <button type="button" onClick={saveActuals} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Save size={15}/> ذخیره فقط برای حسابداری</button>
      </div>
    </>}
  </div>;
};
