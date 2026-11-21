import { InlineHelp } from "./InlineHelp";
import { prepareTwoStageProfit } from "../utils/twoStageProfit";
import { setCaseProfitInput, getCaseProfitInput, CaseProfitInput } from "../utils/caseProfitInputs";
import { usePartyDirectory } from "./PartyDirectory";
import React from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { AppDatabase, CashPartner, Order, ProfitAllocationRule, Supplier, IssuerCompanyShare } from "../types";
import { getIssuerProfitCompany, getCaseProfitPlan, calculateAgentStatement, calculateUnifiedProfit, getGeneralIssuerPercent, isProfitCurrencyShare } from "../utils/caseProfitEngine";
import { formatCurrency } from "../utils/formatters";
import { getOrderCurrency, getOrderProfitToInvoiceMultiplier, getOrderProfitCurrency, getOrderProfitToUSDMultiplier, getOrderQuantityMT } from "../utils/orderAccounting";

interface Props {
  order: Order;
  db: AppDatabase;
  issuerCompanyShares?: IssuerCompanyShare[];
  supplier?: Supplier;
  cashPartners: CashPartner[];
  onSaveCashPartner?: (partner: CashPartner) => void;
  onChange: (order: Order) => void;
}

const rule = (): ProfitAllocationRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  beneficiaryName: "",
  beneficiaryRole: "commission_party",
  basis: "distributable_margin",
  method: "percent",
  value: 0,
  visibility: "internal",
});

export const UnifiedProfitPanel: React.FC<Props> = ({ order, db, supplier, issuerCompanyShares, cashPartners, onSaveCashPartner, onChange }) => {
  const inherited = supplier?.profitProfile?.enabled ? supplier.profitProfile : undefined;
  const plan = getCaseProfitPlan(order, supplier);
  const changePlan = (patch: Partial<NonNullable<typeof plan>>) => onChange({
    ...(() => {
      const nextOrder: Order = { ...order, HasSalesAgent: (patch.route || plan?.route || "direct") === "agent", ...(patch.agentSharePercent !== undefined ? { AgentCompanySharePercent: 100 - patch.agentSharePercent } : {}), profitPlan: { route: "direct", ...(plan || {}), ...patch, calculationVersion: 2 } };
      // The agent allocation is produced by the profit engine and saved among
      // calculated allocations. Keeping another copy in customShares caused a
      // single agent to appear twice in reports and case-fund owners.
      const customShares = (order.customShares || []).filter((item) => item.id !== "agent-profit-beneficiary");
      const commissionTotal = customShares.filter((item) => isProfitCurrencyShare(nextOrder, item)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return { ...nextOrder, customShares, TotalCommission: commissionTotal, Commission: commissionTotal };
    })(),
  });
  const breakdown = calculateUnifiedProfit(order, supplier, issuerCompanyShares, db);
  const agentPricePreview = plan?.route === "agent" && breakdown?.isWaterfall
    ? calculateUnifiedProfit({ ...order, profitPlan: { ...plan, actualDistribution: "two_pools" } }, supplier, issuerCompanyShares, db)
    : null;
  const directory = usePartyDirectory();
  const agentStatement = calculateAgentStatement(order, supplier, db);
  const currency = getOrderProfitCurrency(order);
  const active = Boolean(plan);
  const issuerId = getIssuerProfitCompany(order, supplier);
  const issuerName = issuerCompanyShares?.find(company => company.id === issuerId)?.name || (issuerId === "arovin" ? "آروین" : issuerId === "bera" ? "براکم" : "آرکاتاو");
  const issuerSetting = plan?.issuerShareOverride || { enabled: plan?.issuerSharePercent !== undefined || order.DirectArcaSharePercent !== undefined, method: "percent" as const, value: plan?.issuerSharePercent ?? (order.DirectArcaSharePercent !== undefined ? 100 - order.DirectArcaSharePercent : getGeneralIssuerPercent(issuerId, issuerCompanyShares)), weightUnit: "MT" as const };
  const changeIssuer = (patch: Partial<typeof issuerSetting>) => changePlan({ issuerShareOverride: { ...issuerSetting, ...patch } });
  const [resultCurrency, setResultCurrency] = React.useState("both");
  const usdRate = getOrderProfitToUSDMultiplier(order);
  const invoiceCurrency = getOrderCurrency(order);
  const invoiceRate = getOrderProfitToInvoiceMultiplier(order);
  const resultFormats = (amount: number) => {
    const choices: Array<{ currency: string; amount: number }> = [];
    const add = (name: string, value: number) => { if (!choices.some(item => item.currency === name)) choices.push({ currency: name, amount: value }); };
    if (usdRate !== null && (resultCurrency === "both" || resultCurrency === "USD")) add("USD", amount * usdRate);
    if (resultCurrency === "both" || resultCurrency === currency) add(currency, amount);
    if (resultCurrency === "both" || resultCurrency === invoiceCurrency) add(invoiceCurrency, amount * invoiceRate);
    if (!choices.length) add(currency, amount);
    return choices;
  };
  const updateRule = (id: string, patch: Partial<ProfitAllocationRule>) => changePlan({
    rules: (plan?.rules || []).map((item) => item.id === id ? { ...item, ...patch } : item),
  });
  const valueOrDefault = (value: number | undefined, fallback: number) => value === undefined ? "" : value;
  const optionalNumber = (input: string) => input === "" ? undefined : Number(input);
  const piQuantity = getOrderQuantityMT(order);
  const piPurchase = Number(order.CostPrice || order.CFRNet || order.NetFob || 0);
  const piSell = Number(order.EndCustomerPrice || order.SellPrice || 0);
  const piAgent = Number(order.PriceToAgent || order.SellPrice || 0);
  const inputDefaults = calculateUnifiedProfit({ ...order, profitPlan: plan ? { ...plan, accountingOverrides: undefined } : undefined }, supplier, issuerCompanyShares, db);
  const changeInput = (key: CaseProfitInput, raw: string) => { if (plan) changePlan(setCaseProfitInput(plan, key, optionalNumber(raw))); };
  const landedCostPerMT = breakdown?.landedPurchasePricePerMT || 0;
  // A buyer/customer cannot be selected as a shareholder, agent or commission
  // recipient. Some older records only carry the role text, so cover both the
  // structured flag and that legacy label.
  const stakeholderOptions = cashPartners.filter((partner) => !partner.isCustomer && !/(customer|مشتری)/i.test(partner.role || ""));
  // Older Access cases keep people in custom shares rather than the cash
  // partner directory. Both are valid sources for an agent selection.
  const agentOptions = stakeholderOptions.filter((party) => party.category === "agent" || party.id === plan?.agentId);
  const hasMultipleProducts = (order.items || []).length > 1;
  const itemProfitInputs = plan?.itemProfitInputs || {};
  const updateItemProfitInput = (itemId: number, key: "quantityMT" | "purchasePricePerMT" | "sellPricePerMT" | "priceToAgentPerMT" | "freight", raw: string) => {
    if (!plan) return;
    const current = itemProfitInputs[String(itemId)] || {};
    const next = { ...current };
    if (raw === "") delete next[key]; else next[key] = Number(raw);
    changePlan({ itemProfitInputs: { ...itemProfitInputs, [String(itemId)]: next } });
  };
  const globalFreight = plan?.accountingOverrides?.freight ?? inputDefaults?.freight ?? Number(order.Freight || 0);
  const productQuantity = (item: typeof order.items[number], index: number) => {
    const entry = itemProfitInputs[String(item.OrderDetailID || index)] || {};
    return Number(entry.quantityMT ?? Number(item.Quantity || 0) * (item.QuantityUnit === "KG" ? 0.001 : 1));
  };
  const totalProductQuantity = (order.items || []).reduce((sum, item, index) => sum + productQuantity(item, index), 0);

  return <ResultCurrencyContext.Provider value={resultFormats}><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h4 className="flex items-center gap-1.5 font-bold text-slate-900"><Calculator className="text-indigo-600" size={16} /> مرکز یکپارچهٔ سهم و کمیسیون پرونده</h4>
        <Help>تنها محل تعریف و مشاهدهٔ سهم شرکت‌ها، ایجنت و کمیسیون‌ها. سود داخلی شرکت‌ها و سود مشترک با ایجنت جدا محاسبه می‌شوند؛ سهم نهایی آرکاتاو جمع سهم آن از هر دو بخش است.</Help></div>
      {!active ? <button type="button" onClick={() => changePlan({ route: "direct", rules: [] })} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">فعال‌سازی محاسبه جامع</button> :
        <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">فعال {inherited && !order.profitPlan ? "— از تنظیمات تأمین‌کننده" : "— برای این پرونده"}</span>}
    </div>
    <section data-two-stage-scenario className="mt-3 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs leading-6">
      <div className="font-bold text-indigo-950">سود دو‌مرحله‌ای شرکت و ایجنت</div>
      <details className="text-slate-600"><summary className="cursor-pointer">روش محاسبه و هزینه بانک</summary>      <p>مرحله اول: سود خرید تا قیمت اعلام‌شده به ایجنت، بین آرکاتاو و شرکت صادرکننده با نسبت تنظیم‌شده تقسیم می‌شود. مرحله دوم: سود قیمت ایجنت تا فروش نهایی، بین آرکاتاو و ایجنت با نسبت تنظیم‌شده تقسیم می‌شود.</p>
      <p>بانک (در صورت تعیین درصد): خرید خالص × درصد بانک × مقدار تن؛ این هزینه ابتدا از سود مرحله اول کسر و فقط مانده بین شرکت صادرکننده و آرکاتاو تقسیم می‌شود. سود مرحله دوم از فروش نهایی منهای قیمت ایجنت به‌اضافه حمل محاسبه می‌شود.</p>
      </details>
      <InlineHelp><p className="font-semibold">سهم نهایی آرکاتاو = سهم مرحله اول + سهم مرحله دوم</p></InlineHelp>
      <button type="button" onClick={() => changePlan(prepareTwoStageProfit(plan))} className="rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white">اعمال سناریوی سود دو‌مرحله‌ای با ایجنت</button>
      <InlineHelp><p className="text-slate-600">پس از انتخاب، نام ایجنت و درصد سهم را بررسی و پرونده را ذخیره کنید. عدد قیمت‌ها، هزینه‌ها و نسبت‌های موجود حفظ می‌شوند؛ خرید و قیمت ایجنت در این سناریو خالص و بدون حمل هستند. حمل به هر دو اضافه می‌شود؛ سهم ثابتِ دستی به تقسیم طبق نسبت برمی‌گردد.</p></InlineHelp>
    </section>
    {active && <>
      {plan?.manualShare && <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs">سهم دستی فعال است: {plan.manualShare.role === "issuer" ? "شرکت صادرکننده" : plan.manualShare.role === "agent" ? "ایجنت" : "آرکاتاو"} · {formatCurrency(plan.manualShare.amount, currency)}؛ سایر سهم‌ها از باقی‌مانده تنظیم می‌شوند. <button type="button" className="mr-2 font-bold text-indigo-700" onClick={() => changePlan({ manualShare: undefined })}>بازگشت به تقسیم طبق فرمول</button></div>}
      <div className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs sm:grid-cols-2">
        <label>مبنای سود<select className="mt-1 w-full rounded border bg-white p-2" value={plan!.profitBasis || "auto"} onChange={e => changePlan({ profitBasis: e.target.value as "auto" | "estimate" | "actual" })}><option value="auto">خودکار: واقعی پس از ثبت دریافت و پرداخت خرید</option><option value="estimate">برآورد از قیمت‌های معامله</option><option value="actual">واقعی از اسناد ثبت‌شده</option></select></label>
        <label>روش تقسیم سود<select className="mt-1 w-full rounded border bg-white p-2" value={plan!.actualDistribution || "two_pools"} onChange={e => changePlan({ actualDistribution: e.target.value as "two_pools" | "net_waterfall" })}><option value="two_pools">سود داخلی + سود مشترک ایجنت</option><option value="net_waterfall">سهم شرکت ← سهم رابط ← تقسیم با ایجنت</option></select></label>
        {getOrderCurrency(order) !== currency && <label className="sm:col-span-2">نرخ تسویه: هر ۱ {currency} معادل چند {getOrderCurrency(order)} است؟<input type="number" min="0.000001" step="any" className="mt-1 w-full rounded border bg-white p-2 font-mono" value={plan!.settlementExchangeRate ?? ""} placeholder={String(getOrderProfitToInvoiceMultiplier(order))} onChange={e => changePlan({ settlementExchangeRate: e.target.value === "" ? undefined : Number(e.target.value) })}/><Help>در حالت خالی، نرخ پرونده استفاده می‌شود. تغییر این نرخ، پروفورمای صادرشده را تغییر نمی‌دهد.</Help></label>}
        <Help>سود واقعی با هر تغییر سند به‌روز می‌شود؛ تا تکمیل دریافت‌ها و هزینه‌ها، نتیجه موقت است. وام، تأمین وجه، انتقال بین پرونده‌ها و پرداخت سهم سود، درآمد یا هزینهٔ معامله محسوب نمی‌شوند. کارمزد واقعی بانک را در هزینه‌های پرونده ثبت کنید.</Help>
        <Help>{plan!.actualDistribution === "net_waterfall" ? "روش مرحله‌ای: سود کل ← سهم شرکت و رابط طبق ترتیب انتخاب‌شده ← سایر سهم‌های تعریف‌شده ← تقسیم باقی‌مانده بین آرکاتاو و ایجنت. همین ترتیب در برآورد و تسویهٔ واقعی حفظ می‌شود." : "روش دو‌بخشی: فاصلهٔ خرید تا قیمت ایجنت، سود داخلی شرکت‌هاست؛ فاصلهٔ قیمت ایجنت تا فروش نهایی، سود مشترک است. درصد هر بخش جدا اعمال می‌شود."}</Help>
        <section className="sm:col-span-2 rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={issuerSetting.enabled} onChange={e => changeIssuer({ enabled: e.target.checked })}/> سهم اختصاصی شرکت صادرکننده: {issuerName}</label>
          {issuerSetting.enabled ? <div className="grid gap-2 sm:grid-cols-3">
            <label>نوع سهم<select value={issuerSetting.method} onChange={e => changeIssuer({ method: e.target.value as "percent" | "per_mt" })} className="mt-1 w-full rounded border p-2"><option value="percent">درصد از سود</option><option value="per_mt">سود در واحد وزن</option></select></label>
            <label>{issuerSetting.method === "percent" ? "درصد سهم شرکت (%)" : `سهم شرکت (${currency} / ${issuerSetting.weightUnit || "MT"})`}<input type="number" min="0" max={issuerSetting.method === "percent" ? 100 : undefined} step="any" value={issuerSetting.value} onChange={e => changeIssuer({ value: Number(e.target.value) })} className="mt-1 w-full rounded border p-2 font-mono"/></label>
            {issuerSetting.method === "per_mt" && <label>واحد وزن<select value={issuerSetting.weightUnit || "MT"} onChange={e => changeIssuer({ weightUnit: e.target.value as "MT" | "KG" })} className="mt-1 w-full rounded border p-2"><option value="MT">تن متریک (MT)</option><option value="KG">کیلوگرم (KG)</option></select></label>}
          </div> : <span className="block text-emerald-800">قرارداد عمومی تقسیم سود شرکت‌ها فعال است.</span>}
          <Help>در حالت فعال، فقط سهم اختصاصی این پرونده برای شرکت صادرکننده اعمال می‌شود و قرارداد عمومی یا قواعد تکراری همان شرکت دوباره محاسبه نمی‌شوند. با غیرفعال‌کردن، قرارداد عمومی برمی‌گردد. در روش دو‌بخشی، درصد از سود داخلی و در روش مرحله‌ای، از سود قابل تقسیم همان مرحله محاسبه می‌شود. سهم وزنی برابر مبلغ واحد ضربدر وزن واقعی است.</Help>
        </section>
        {currency !== "USD" && <label className="sm:col-span-2">نرخ تبدیل سود به دلار: هر ۱ {currency} چند USD است؟<input type="number" min="0.000001" step="any" value={plan!.profitToUSDExchangeRate ?? ""} placeholder={usdRate === null ? "نرخ دلار را ثبت کنید" : String(usdRate)} onChange={e => changePlan({ profitToUSDExchangeRate: e.target.value === "" ? undefined : Number(e.target.value) })} className="mt-1 w-full rounded border p-2 font-mono"/></label>}
        {plan!.actualDistribution === "net_waterfall" && <>
          <label>ترتیب کسر سهم شرکت و رابط<select className="mt-1 w-full rounded border bg-white p-2" value={plan!.commissionOrder || "after_issuer"} onChange={e => changePlan({ commissionOrder: e.target.value as "before_issuer" | "after_issuer" })}><option value="after_issuer">ابتدا سهم شرکت، سپس سهم رابط</option><option value="before_issuer">ابتدا سهم رابط، سپس سهم شرکت</option></select></label>
        </>}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-bold text-slate-700">۱. مبنای معامله و ارقام واقعی</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-xs">
          <label className="space-y-1 font-semibold text-slate-700">مسیر معامله<select value={plan!.route} onChange={(e) => changePlan({ route: e.target.value as "direct" | "agent" })} className="w-full rounded-md border border-slate-200 bg-white p-2 font-normal"><option value="direct">تأمین‌کننده ← خریدار نهایی</option><option value="agent">تأمین‌کننده ← ایجنت ← خریدار نهایی</option></select></label>
          <label className="space-y-1 font-semibold text-slate-700">کارمزد بانک از خرید خالص (%)<input aria-label="درصد بانک از خرید خالص" type="number" min="0" step="any" value={plan!.bankChargePercentOfPurchase || 0} onChange={(e) => changePlan({ ...setCaseProfitInput(plan!, "bankCharge", undefined), bankChargePercentOfPurchase: Number(e.target.value) })} className="w-full rounded-md border border-slate-200 bg-white p-2 font-mono font-normal" /></label>
          {plan!.actualDistribution !== "net_waterfall" && <label className="space-y-1 font-semibold text-slate-700">سهم تراکنش ($/MT)<input type="number" min="0" value={plan!.transactionSharePerMT || 0} onChange={(e) => changePlan({ transactionSharePerMT: Number(e.target.value) })} className="w-full rounded-md border border-slate-200 bg-white p-2 font-mono font-normal" /></label>}
          {plan!.route === "agent" && <><label className="space-y-1 font-semibold text-slate-700">ایجنت<select value={plan!.agentId || ""} onChange={(e) => { const item = agentOptions.find((x) => x.id === e.target.value); changePlan({ agentId: item?.id, agentName: item?.name }); }} className="w-full rounded-md border border-slate-200 bg-white p-2 font-normal"><option value="">انتخاب شخص / ایجنت...</option>{agentOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="space-y-1 font-semibold text-slate-700">سهم ایجنت از سود مشترک (%)<input type="number" min="0" max="100" step="any" value={plan!.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50))} onChange={(e) => changePlan({ agentSharePercent: Number(e.target.value) })} className="w-full rounded-md border border-slate-200 bg-white p-2 font-mono font-normal"/></label></>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 rounded border border-indigo-100 bg-indigo-50 p-3 text-xs"><label><input type="checkbox" checked={!!plan!.purchaseIncludesFreight} onChange={(e) => changePlan({ purchaseIncludesFreight: e.target.checked })}/> قیمت خرید شامل حمل است</label>{plan!.route === "agent" && <label><input type="checkbox" checked={!!plan!.agentQuoteIncludesFreight} onChange={(e) => changePlan({ agentQuoteIncludesFreight: e.target.checked })}/> قیمت اعلامی به ایجنت شامل حمل است</label>}</div>
      {hasMultipleProducts && <section className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3" dir="rtl">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div><b className="text-xs text-sky-950">ارقام سود به تفکیک کالا</b><InlineHelp><p className="mt-0.5 text-[10px] text-sky-800">قواعد معامله، ایجنت، کمیسیون و سهم‌ها در بالا یک‌بار تعیین می‌شوند. فقط مقدار و ارقام هر کالا را اینجا وارد کنید؛ جمع پرونده خودکار محاسبه می‌شود.</p></InlineHelp></div><span className="rounded bg-white px-2 py-1 text-[10px] font-bold text-sky-700">{order.items.length} کالا</span></div>
        <label className="mb-2 block max-w-sm text-[11px] font-semibold text-sky-950">هزینه حمل کل پرونده ({currency})<input aria-label="هزینه حمل کل پرونده" type="number" min="0" step="any" value={plan!.accountingOverrides?.freight ?? ""} placeholder={String(globalFreight)} onChange={e => changeInput("freight", e.target.value)} className="mt-1 w-full rounded border border-sky-300 bg-white p-2 font-mono font-normal"/><span className="mt-1 block font-normal text-sky-800">این مبلغ بر اساس مقدار هر کالا بین ردیف‌ها تقسیم می‌شود.</span></label>
        <div className="overflow-x-auto"><table className="min-w-[760px] w-full border-collapse text-xs"><thead><tr className="border-b border-sky-200 text-slate-600"><th className="p-1.5 text-right">کالا</th><th className="p-1.5 text-center">مقدار (MT)</th><th className="p-1.5 text-center">خرید / MT</th><th className="p-1.5 text-center">فروش / MT</th>{plan!.route === "agent" && <th className="p-1.5 text-center">قیمت ایجنت / MT</th>}<th className="p-1.5 text-center">سهم حمل</th><th className="p-1.5 text-center">سود ناخالص</th></tr></thead><tbody>{order.items.map((item, index) => { const id = item.OrderDetailID || index; const entry = itemProfitInputs[String(id)] || {}; const quantity = productQuantity(item, index); const purchase = entry.purchasePricePerMT ?? piPurchase; const sell = entry.sellPricePerMT ?? Number(item.UnitPrice || piSell); const agent = entry.priceToAgentPerMT ?? piAgent; const freight = totalProductQuantity ? globalFreight * quantity / totalProductQuantity : 0; const grossProfit = ((sell - purchase) * Number(quantity || 0)) - Number(freight || 0); return <tr key={id} className="border-b border-sky-100 last:border-0"><td className="p-1.5 font-semibold text-slate-800">{item.ProductName || item.ChemicalName || item.ProductDescription || `کالای ${index + 1}`}</td><td className="p-1"><input aria-label={`مقدار ${item.ProductName || index + 1}`} type="number" min="0" step="any" value={entry.quantityMT ?? quantity} onChange={e => updateItemProfitInput(id, "quantityMT", e.target.value)} className="w-24 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td><td className="p-1"><input aria-label={`خرید ${item.ProductName || index + 1}`} type="number" step="any" value={entry.purchasePricePerMT ?? ""} placeholder={String(purchase)} onChange={e => updateItemProfitInput(id, "purchasePricePerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td><td className="p-1"><input aria-label={`فروش ${item.ProductName || index + 1}`} type="number" step="any" value={entry.sellPricePerMT ?? ""} placeholder={String(sell)} onChange={e => updateItemProfitInput(id, "sellPricePerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td>{plan!.route === "agent" && <td className="p-1"><input aria-label={`قیمت ایجنت ${item.ProductName || index + 1}`} type="number" step="any" value={entry.priceToAgentPerMT ?? ""} placeholder={String(agent)} onChange={e => updateItemProfitInput(id, "priceToAgentPerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td>}<td className="p-1.5 text-center font-mono text-slate-700">{formatCurrency(freight, currency)}</td><td className={`p-1.5 text-center font-mono font-bold ${grossProfit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatCurrency(grossProfit, currency)}</td></tr>; })}</tbody></table></div>
        <InlineHelp><p className="mt-2 text-[10px] text-sky-800">برای بازگشت هر خانه به مقدار پیش‌فرض، مقدار آن را پاک کنید. جمع سود نهایی و سهم‌ها از مجموع همه ردیف‌ها محاسبه می‌شود.</p></InlineHelp>
      </section>}
      {!hasMultipleProducts && <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Help>ورودی‌ها با فرم جامع حسابداری مشترک‌اند. مقادیر دستی بر پیش‌فرض پرونده و اسناد اولویت دارند؛ با پاک‌کردن مقدار، محاسبه به پیش‌فرض برمی‌گردد.</Help>
          <label className="text-[10px] font-semibold text-slate-700">مقدار واقعی (MT)<input type="number" min="0" step="any" value={plan!.accountingOverrides?.quantityMT ?? ""} placeholder={String(inputDefaults?.quantityMT ?? piQuantity)} onChange={(e) => changeInput("quantityMT", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono font-normal"/></label>
          <label className="text-[10px] font-semibold text-slate-700">خرید واقعی / MT<input type="number" step="any" value={plan!.accountingOverrides?.purchasePricePerMT ?? ""} placeholder={String(inputDefaults?.purchasePricePerMT ?? piPurchase)} onChange={(e) => changeInput("purchasePricePerMT", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono font-normal"/></label>
          <label className="text-[10px] font-semibold text-slate-700">فروش واقعی / MT<input type="number" step="any" value={plan!.accountingOverrides?.sellPricePerMT ?? ""} placeholder={String(inputDefaults?.sellPricePerMT ?? piSell)} onChange={(e) => changeInput("sellPricePerMT", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono font-normal"/></label>
          {plan!.route === "agent" && <label className="text-[10px] font-semibold text-slate-700">قیمت اعلامی به ایجنت / MT<input type="number" step="any" value={plan!.accountingOverrides?.priceToAgentPerMT ?? ""} placeholder={String(plan!.calculationPriceToAgentPerMT ?? piAgent)} onChange={(e) => changeInput("priceToAgentPerMT", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono font-normal"/></label>}
          <label className="text-[10px] font-semibold text-slate-700">هزینه حمل واقعی<input type="number" min="0" step="any" value={plan!.accountingOverrides?.freight ?? ""} placeholder={String(inputDefaults?.freight ?? order.Freight ?? 0)} onChange={(e) => changeInput("freight", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono font-normal"/></label>
          <label className="text-[10px] font-semibold text-slate-700">سود دستی / MT<input aria-label="سود دستی مشترک / MT" type="number" step="any" value={getCaseProfitInput(plan!, "marginPerMT") ?? ""} placeholder={String(breakdown?.quantityMT ? breakdown.totalMargin / breakdown.quantityMT : 0)} onChange={e => changeInput("marginPerMT", e.target.value)} className="mt-1 w-full rounded border border-sky-200 bg-white p-2 text-xs font-mono"/></label>
          <label className="text-[10px] font-semibold text-slate-700">قیمت تمام‌شده / MT<input readOnly value={landedCostPerMT.toFixed(2)} className="mt-1 w-full rounded border border-amber-200 bg-amber-50 p-2 text-xs font-mono font-bold text-amber-900" title="خرید واقعی + (حمل واقعی ÷ مقدار واقعی)"/></label>
      </div>}
      {plan!.route === "agent" && <details className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs space-y-2">
        <summary className="cursor-pointer font-bold text-sky-900">کارکرد و مقایسهٔ قیمت اعلامی به ایجنت</summary>
        <Help>با در نظر گرفتن حمل، فاصلهٔ خرید تا قیمت ایجنت، سود داخلی شرکت‌ها و فاصلهٔ قیمت ایجنت تا فروش نهایی، سود مشترک آرکاتاو و ایجنت است. تغییر قیمت یا وضعیت حمل، این دو بخش را دوباره محاسبه می‌کند.</Help>
        {agentPricePreview ? <>
          <Help>اکنون روش مرحله‌ای برای نتیجهٔ نهایی فعال است. محاسبهٔ مقایسه‌ای زیر با قیمت ایجنت انجام می‌شود؛ برای اعمال آن به سهم‌ها، روش دو‌بخشی را فعال کنید.</Help>
          <ResultRow label="سود داخلی با قیمت ایجنت" amount={agentPricePreview.issuerMargin} currency={currency}/>
          <ResultRow label="سود مشترک با قیمت ایجنت" amount={agentPricePreview.agentMargin} currency={currency}/>
          <ResultRow label="سهم نهایی آرکاتاو در روش دو‌بخشی" amount={agentPricePreview.arcatavShare} currency={currency}/>
          <button type="button" onClick={() => changePlan({ actualDistribution: "two_pools" })} className="rounded bg-sky-700 px-3 py-2 font-bold text-white">اعمال روش دو‌بخشی بر اساس قیمت ایجنت</button>
        </> : <Help>روش دو‌بخشی فعال است؛ قیمت اعلامی به ایجنت مستقیماً در نتیجه و سهم‌های پایین صفحه اثر دارد.</Help>}
      </details>}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-bold text-slate-700">۲. قواعد واحد تخصیص</p>
        <Help>{plan!.actualDistribution === "net_waterfall" ? "کمیسیون رابط از اینجا تعریف می‌شود: ثابت، هر تن یا درصدی. مبنای «سود کل پیش از تقسیم» قبل از سهم شرکت است؛ «باقی‌مانده قابل تقسیم» بعد از سهم شرکت و طبق ترتیب انتخاب‌شده محاسبه می‌شود. سایر تخصیص‌ها پیش از تقسیم نهایی با ایجنت کسر می‌شوند. سهم اختصاصی شرکت صادرکننده در بخش بالای فرم تعیین می‌شود و در حالت فعال، جایگزین قرارداد عمومی است." : "هر ردیف تنها منبع یک سهم است. در مسیر ایجنت، قواعد عمومی و درصد صادرکننده از سود داخلی محاسبه می‌شوند؛ درصد ایجنت فقط روی سود مشترک اعمال می‌شود."}</Help>
        <div className="space-y-2">{(plan!.rules || []).map((item) => <React.Fragment key={item.id}><div className="grid grid-cols-2 gap-1.5 md:grid-cols-6">
          <select value={item.beneficiaryId || ""} onChange={(e) => { const partner = stakeholderOptions.find((entry) => entry.id === e.target.value); if (partner) updateRule(item.id, { beneficiaryId: partner.id, beneficiaryName: partner.name }); }} className="rounded border p-1.5 text-xs"><option value="">{item.beneficiaryName || "انتخاب ذی‌نفع..."}</option>{stakeholderOptions.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}{partner.role ? ` — ${partner.role}` : ""}</option>)}</select>
          <select value={item.beneficiaryRole} onChange={(e) => updateRule(item.id, { beneficiaryRole: e.target.value as ProfitAllocationRule["beneficiaryRole"] })} className="rounded border p-1.5 text-xs"><option value="company">شرکت</option><option value="commission_party">کمیسیون</option><option value="agent">ایجنت</option><option value="arcatav">آرکاتاو</option></select><select value={item.basis} onChange={(e) => updateRule(item.id, { basis: e.target.value as ProfitAllocationRule["basis"] })} className="rounded border p-1.5 text-xs"><option value="distributable_margin">{plan!.actualDistribution === "net_waterfall" ? "باقی‌مانده قابل تقسیم" : plan!.route === "agent" ? "سود داخلی قابل تقسیم" : "سود قابل تقسیم"}</option><option value="issuer_margin">{plan!.actualDistribution === "net_waterfall" ? "سود کل پیش از تقسیم" : "سود داخلی صادرکننده"}</option><option value="agent_margin">سود مشترک با ایجنت</option><option value="transaction_total">سهم تراکنش</option><option value="purchase_total">کل خرید</option></select><select value={item.method} onChange={(e) => updateRule(item.id, { method: e.target.value as ProfitAllocationRule["method"] })} className="rounded border p-1.5 text-xs"><option value="percent">درصد</option><option value="per_mt">هر تن</option><option value="fixed">ثابت</option></select><input type="number" value={item.value} onChange={(e) => updateRule(item.id, { value: Number(e.target.value) })} className="rounded border p-1.5 text-xs font-mono" /><button type="button" onClick={() => changePlan({ rules: (plan!.rules || []).filter((x) => x.id !== item.id) })} className="rounded border border-rose-200 text-rose-600 flex items-center justify-center"><Trash2 size={14} /></button></div>
          <button type="button" onClick={() => directory.open(p => updateRule(item.id, { beneficiaryId: p.id, beneficiaryName: p.name }))} className="text-right text-xs font-bold text-indigo-700">انتخاب / تعریف از فهرست یکپارچه</button></React.Fragment>)}</div>
        <button type="button" onClick={() => changePlan({ rules: [...(plan!.rules || []), rule()] })} className="mt-2 inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-1.5 text-xs font-bold text-indigo-800"><Plus size={13} /> افزودن قاعده</button>
      </div>
      {breakdown && <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-bold text-slate-800">۳. نتیجه محاسبه</h5><label className="text-xs">ارز نمایش <select value={resultCurrency} onChange={e => setResultCurrency(e.target.value)} className="rounded border bg-white p-2"><option value="both">نمایش هم‌زمان ارزها</option>{[...new Set(["USD", currency, invoiceCurrency])].map(name => <option key={name} value={name} disabled={name === "USD" && usdRate === null}>{name}</option>)}</select></label></div>
        {usdRate === null && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">نرخ تبدیل به USD ثبت نشده؛ این پرونده تا ثبت نرخ در جمع دلاری سود وارد نمی‌شود.</p>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap justify-between gap-2 text-xs">
          <div className="w-full"><ResultRow label="سود کل معامله، پیش از کارمزد و کمیسیون" amount={breakdown.totalMargin} currency={currency}/></div>
        </div>
        {breakdown.actuals && <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-2">
          <h6 className="font-bold text-emerald-900">مبنای واقعی از دفتر پرونده — {currency}</h6>
          <ResultRow label="دریافت خالص فروش" amount={breakdown.actuals.revenue} currency={currency}/>
          <ResultRow label="کسر پرداخت خالص خرید" amount={-breakdown.actuals.purchase} currency={currency}/>
          <ResultRow label="کسر هزینه‌های عملیاتی ثبت‌شده" amount={-breakdown.actuals.expenses} currency={currency}/>
          <ResultRow label="سود واقعی پیش از تقسیم سهم‌ها" amount={breakdown.totalMargin} currency={currency}/>
          <Help>مبالغ دفتر با نرخ تسعیر پرونده به ارز محاسبهٔ سود تبدیل شده‌اند. این نتیجه با اسناد فعلی محاسبه شده و تا تکمیل اسناد موقت است.</Help>
        </section>}
        {breakdown.isWaterfall ? <section className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs space-y-2">
          <h6 className="font-bold text-violet-900">{breakdown.isActual ? "ترتیب تقسیم سود واقعی" : "برآورد با همان ترتیب تقسیم نهایی"}</h6>
          <ResultRow label="۱. سود کل پیش از تقسیم" amount={breakdown.totalMargin} currency={currency}/>
          {Math.abs(breakdown.bankCharge) > .005 && <ResultRow label="کسر کارمزد برآوردی بانک" amount={-breakdown.bankCharge} currency={currency}/>}
          {plan!.commissionOrder === "before_issuer" && <ResultRow label="۲. کسر سهم رابط / کمیسیون" amount={-breakdown.commissionTotal} currency={currency}/>}
          <ResultRow label={`${plan!.commissionOrder === "before_issuer" ? "۳" : "۲"}. کسر سهم شرکت صادرکننده`} amount={-(breakdown.waterfallIssuerAmount || 0)} currency={currency}/>
          {plan!.commissionOrder !== "before_issuer" && <ResultRow label="۳. کسر سهم رابط / کمیسیون" amount={-breakdown.commissionTotal} currency={currency}/>}
          {(breakdown.waterfallDeductions || []).map(item => <ResultRow key={item.ruleId} label={`کسر تخصیص ${item.beneficiaryName || "ذی‌نفع"}`} amount={-item.amount} currency={currency}/>)}
          <ResultRow label="۴. باقی‌مانده برای آرکاتاو و ایجنت" amount={breakdown.agentMargin} currency={currency}/>
          <div className="border-t border-violet-200 pt-2"><ResultRow label="جمع سهم آرکاتاو" amount={breakdown.arcatavShare} currency={currency}/></div>
          <ResultRow label={`سهم ${plan!.agentName || "ایجنت"} از باقی‌مانده`} amount={breakdown.agentProfitShare} currency={currency}/>
        </section> : <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-xs space-y-2">
            <h6 className="font-bold text-sky-900">الف. {plan!.route === "agent" ? "سود داخلی شرکت‌ها" : "سود قابل تقسیم شرکت‌ها"}</h6>
            <Help>{plan!.route === "agent" ? "فاصلهٔ قیمت تمام‌شدهٔ خرید تا قیمت اعلامی به ایجنت، با احتساب وضعیت حمل." : "فاصلهٔ قیمت تمام‌شدهٔ خرید تا فروش نهایی."}</Help>
            <ResultRow label="سود اولیه" amount={plan!.route === "agent" ? breakdown.issuerMargin : breakdown.totalMargin} currency={currency}/>
            {Math.abs(breakdown.transactionTotal) > .005 && plan!.route === "agent" && <ResultRow label="افزوده از سهم تراکنش" amount={breakdown.transactionTotal} currency={currency}/>}
            {Math.abs(breakdown.bankCharge) > .005 && <ResultRow label="کسر کارمزد بانک" amount={-breakdown.bankCharge} currency={currency}/>}
            {Math.abs(breakdown.commissionTotal) > .005 && <ResultRow label="کسر کمیسیون‌ها" amount={-breakdown.commissionTotal} currency={currency}/>}
            <div className="border-t border-sky-200 pt-2"><ResultRow label="سود داخلی قابل تقسیم" amount={breakdown.internalDistributableMargin} currency={currency}/></div>
            <ResultRow label="سهم آرکاتاو از این بخش" amount={breakdown.arcatavInternalShare} currency={currency}/>
            {breakdown.allocations.filter(item => item.beneficiaryRole !== "arcatav" && item.beneficiaryRole !== "commission_party" && item.ruleId !== "agent-profit-beneficiary" && Math.abs(item.amount) > .005).map(item => <ResultRow key={item.ruleId} label={`سهم ${item.beneficiaryName || "ذی‌نفع"}`} amount={item.amount} currency={currency}/>)}
          </section>
          {plan!.route === "agent" && <section className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-xs space-y-2">
            <h6 className="font-bold text-violet-900">ب. سود مشترک آرکاتاو و ایجنت</h6>
            <Help>فاصلهٔ قیمت اعلامی به ایجنت تا فروش نهایی، با احتساب وضعیت حمل.</Help>
            <ResultRow label="سود اولیه" amount={breakdown.agentMargin + breakdown.transactionTotal} currency={currency}/>
            {Math.abs(breakdown.transactionTotal) > .005 && <ResultRow label="انتقال سهم تراکنش به سود داخلی" amount={-breakdown.transactionTotal} currency={currency}/>}
            <div className="border-t border-violet-200 pt-2"><ResultRow label="سود مشترک قابل تقسیم" amount={breakdown.agentMargin} currency={currency}/></div>
            <ResultRow label="سهم آرکاتاو از این بخش" amount={breakdown.arcatavAgentShare} currency={currency}/>
            <ResultRow label={`سهم ${plan!.agentName || "ایجنت"} (${plan!.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50))}٪)`} amount={breakdown.agentProfitShare} currency={currency}/>
          </section>}
        </div>}
        <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs space-y-2">
          <h6 className="font-bold text-indigo-950">{plan!.route === "agent" ? "ج" : "ب"}. جمع نهایی سهم‌ها</h6>
          <Help>{plan!.route === "agent" && !breakdown.isWaterfall ? "سهم نهایی آرکاتاو = سهم سود داخلی + سهم سود مشترک با ایجنت" : "سهم نهایی هر ذی‌نفع از معامله"}</Help>
          <div className="rounded bg-white p-2 text-sm text-indigo-950"><ResultRow label="جمع سهم آرکاتاو" amount={breakdown.arcatavShare} currency={currency}/></div>
          {breakdown.allocations.filter(item => item.beneficiaryRole !== "arcatav" && Math.abs(item.amount) > .005).map(item => <ResultRow key={item.ruleId} label={`${item.beneficiaryRole === "commission_party" ? "کمیسیون" : "سهم"} ${item.beneficiaryName || "ذی‌نفع"}`} amount={item.amount} currency={currency}/>)}
          <Help>این بخش جمع‌بندی سهم‌های بالاست؛ مبلغ تازه‌ای به سود اضافه نمی‌شود.</Help>
        </section>
      </div>}
      {agentStatement && <details className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950"><summary className="cursor-pointer font-bold">گزارش قابل نمایش به ایجنت</summary> مقدار {agentStatement.quantityMT} MT، قیمت اعلامی {formatCurrency(agentStatement.sellPricePerMT, currency)}/MT، قیمت ایجنت {formatCurrency(agentStatement.priceToAgentPerMT, currency)}/MT و سهم‌های قابل نمایش او. سود داخلی و بهای خرید نمایش داده نمی‌شود.</details>}
    </>}
  </section></ResultCurrencyContext.Provider>;
};

const Help: React.FC<{ children: React.ReactNode }> = ({ children }) => <details className="my-1 text-[11px] leading-5 text-slate-500"><summary className="cursor-pointer text-indigo-700">راهنما و توضیحات</summary><div className="mt-1">{children}</div></details>;
const ResultCurrencyContext = React.createContext<((amount: number) => Array<{ currency: string; amount: number }>) | null>(null);
const ResultRow: React.FC<{ label: string; amount: number; currency: string }> = ({ label, amount, currency }) => {
  const formats = React.useContext(ResultCurrencyContext);
  const values = formats ? formats(amount) : [{ amount, currency }];
  return <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span>{label}</span><span className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums" dir="ltr">{values.map(item => <b key={item.currency}>{formatCurrency(item.amount, item.currency)}</b>)}</span></div>;
};
