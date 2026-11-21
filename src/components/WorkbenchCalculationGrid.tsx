import { InlineHelp } from "./InlineHelp";
import { ReferenceWorkflow } from "./ReferenceWorkflow";
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AppDatabase, CaseProfitPlan, Order } from "../types";
import { getAccountingWorkbenchSnapshot } from "../utils/accountingWorkbench";
import { projectCaseProfit, getIssuerProfitCompany } from "../utils/caseProfitEngine";
import { formatCurrency } from "../utils/formatters";
import { usePartyDirectory } from "./PartyDirectory";
import { UnifiedProfitPanel } from "./UnifiedProfitPanel";
import { setCaseProfitInput } from "../utils/caseProfitInputs";

type Overrides = NonNullable<CaseProfitPlan["accountingOverrides"]>;
type WorkbenchCalculationGridProps = { guided?: boolean; db: AppDatabase; order: Order; onSave: (order: Order) => void; onDirty: (dirty: boolean) => void; onPreview?: (order: Order | null) => void };

// Searches and filters in the parent accounting workspace must not re-render
// this complete calculation form.  Its props stay referentially stable while
// the same case is open, so memoization isolates all its inputs from that work.
export const WorkbenchCalculationGrid: React.FC<WorkbenchCalculationGridProps> = React.memo(({ guided = false, db, order, onSave, onDirty, onPreview }) => {
  // The calculation engine is intentionally separate from immediate input
  // state.  Recalculating a full case (and every allocation) on each keydown
  // made accounting fields visibly lag on larger databases.
  const source = useMemo(() => getAccountingWorkbenchSnapshot(db, order), [db, order]);
  const [draft, setDraft] = useState<CaseProfitPlan | null>(null);
  const deferredDraft = useDeferredValue(draft);
  const [letter, setLetter] = useState<string | null>(null);
  const [step,setStep] = useState("inputs");
  const [error, setError] = useState("");
  const [showFormulaSettings, setShowFormulaSettings] = useState(false);
  const directory = usePartyDirectory();
  const emptyPlan = useMemo(() => ({ route: "direct" as const }), []);
  const plan = draft || source.plan || emptyPlan;
  const calculationPlan = deferredDraft || source.plan || emptyPlan;
  const issuerId = getIssuerProfitCompany(order, db.suppliers.find(s => s.SupplierID === order.SupplierID));
  const hasSeparateIssuer = issuerId === "arovin" || issuerId === "bera";
  const candidate = useMemo(() => ({ ...order, profitPlan: calculationPlan }), [order, calculationPlan]);
  useEffect(() => {
    // The parent preview runs the same full accounting engine.  Sending only
    // a deferred draft prevents it from blocking every keystroke in this form.
    onPreview?.(deferredDraft ? { ...order, profitPlan: deferredDraft } : null);
  }, [deferredDraft, order, onPreview]);
  const current = useMemo(() => getAccountingWorkbenchSnapshot(db, deferredDraft || source.plan ? candidate : order), [db, order, source.plan, deferredDraft, candidate]);
  const calc = current.unified;
  const defaults = useMemo(() => getAccountingWorkbenchSnapshot(db, { ...order, profitPlan: { ...calculationPlan, accountingOverrides: undefined } }).unified, [db, order, calculationPlan]);
  const hasMultipleProducts = (order.items || []).length > 1;
  const itemProfitInputs = plan.itemProfitInputs || {};
  const totalItemQuantity = (order.items || []).reduce((sum, item, index) => sum + Number((itemProfitInputs[String(item.OrderDetailID || index)] || {}).quantityMT ?? Number(item.Quantity || 0) * (item.QuantityUnit === "KG" ? 0.001 : 1)), 0);
  const totalFreight = plan.accountingOverrides?.freight ?? defaults?.freight ?? Number(order.Freight || 0);
  const change = (next: CaseProfitPlan) => {
    // Controlled inputs must receive their new value on every keystroke.
    // Expensive calculations continue to consume deferredDraft separately.
    setDraft(next);
    onDirty(true);
    setError("");
  };
  // Profit inputs are accounting data, not a temporary calculator. Persist a
  // quiet draft after the user pauses typing so refresh/navigation cannot lose it.
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => {
      const saved = projectCaseProfit({ ...order, HasSalesAgent: draft.route === "agent", AgentCompanySharePercent: 100 - (draft.agentSharePercent ?? 50), profitPlan: draft }, db.suppliers.find(s => s.SupplierID === order.SupplierID), db.issuerCompanyShares, db);
      onSave(saved);
      setDraft(null);
      onDirty(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, order, db, onSave, onDirty]);
  const set = (key: keyof Overrides, raw: string, factor = 1) => {
    change(setCaseProfitInput(plan, key, raw === "" ? undefined : Number(raw) / factor));
  };
  /** Product figures belong to the case plan, so the engine and every report use
   * the same source of truth rather than a second calculator-only state. */
  const setItem = (itemId: string | number, key: "quantityMT" | "purchasePricePerMT" | "sellPricePerMT" | "priceToAgentPerMT" | "freight", raw: string) => {
    const previous = itemProfitInputs[String(itemId)] || {};
    const next = { ...previous };
    if (raw === "") delete next[key]; else next[key] = Number(raw);
    change({ ...plan, itemProfitInputs: { ...itemProfitInputs, [String(itemId)]: next } });
  };
  const row = (label: string, key: keyof Overrides, fallback: number, factor = 1) => <tr key={key} className="border-b border-slate-100"><th className="p-2 text-right font-normal">{label}</th><td className="p-1"><input aria-label={label} type="number" step="any" disabled={!!order.RialSalesEnabled && ["marginPerMT", "sellPricePerMT"].includes(key)} title={order.RialSalesEnabled && ["marginPerMT", "sellPricePerMT"].includes(key) ? "مبنای فروش از بخش فروش ریالی خوانده می‌شود" : undefined} value={plan.accountingOverrides?.[key] === undefined ? "" : plan.accountingOverrides[key]! * factor} placeholder={String(Number((fallback * factor).toFixed(6)))} onChange={e => set(key, e.target.value, factor)} className={`w-full min-w-0 rounded border p-2 text-left font-mono ${plan.accountingOverrides?.[key] !== undefined ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} dir="ltr"/></td></tr>;
  const result = (label: string, value: number) => <tr className="border-b border-slate-100"><th className="p-2 text-right font-normal">{label}</th><td className="p-2 text-left font-mono font-bold" dir="ltr">{formatCurrency(value, current.profitCurrency)}</td></tr>;
  const shareRow = (label: string, role: "issuer" | "arcatav" | "agent", amount: number) => <tr className="border-b border-indigo-100"><th className="p-2 text-right font-normal">{label}</th><td className="p-1"><input aria-label={label} type="number" step="any" disabled={(role === "agent" && plan.route !== "agent") || (role === "issuer" && !hasSeparateIssuer) || (role === "arcatav" && !hasSeparateIssuer && plan.route !== "agent")} value={plan.manualShare?.role === role ? plan.manualShare.amount : ""} placeholder={String(Number(amount.toFixed(6)))} onChange={e => change({ ...plan, manualShare: e.target.value === "" ? undefined : { role, amount: Number(e.target.value) } })} className={`w-full rounded border p-2 text-left font-mono ${plan.manualShare?.role === role ? "border-amber-300 bg-amber-50" : "border-indigo-100"}`} dir="ltr"/><small className="block p-1 text-left text-slate-500" dir="ltr">{formatCurrency(amount, current.profitCurrency)}</small></td></tr>;
  const reset = () => { setDraft(null); setLetter(null); onDirty(false); setError(""); };
  const save = () => {
    if (plan.capitalPartners && (plan.capitalPartners.reduce((n, p) => n + p.sharePercent, 0) > 100 || plan.capitalPartners.some(p => !Number.isFinite(p.sharePercent) || p.sharePercent <= 0))) { setError("درصد هر شریک باید مثبت و جمع سهم شرکا حداکثر صد باشد."); return; }
    if (plan.manualShare) {
      const pool = (calc?.arcatavShare || 0) + (calc?.agentProfitShare || 0) + (calc?.allocations.filter(a => a.beneficiaryRole === "company").reduce((n, a) => n + a.amount, 0) || 0);
      if (!Number.isFinite(plan.manualShare.amount) || plan.manualShare.amount < Math.min(0, pool) || plan.manualShare.amount > Math.max(0, pool)) { setError("سهم دستی باید در محدوده سود قابل تقسیم باشد."); return; }
    }
    for (const [key, value] of Object.entries(plan.accountingOverrides || {}) as [string, number][]) {
      if (!Number.isFinite(value) || (key !== "marginPerMT" && value < 0) || (key === "quantityMT" && value <= 0)) { setError("مقدار معتبر وارد کنید؛ وزن باید مثبت باشد."); return; }
    }
    if ((plan.rules || []).some(rule => !Number.isFinite(rule.value) || rule.value < 0 || (rule.method === "percent" && rule.value > 100))) { setError("مبلغ کمیسیون غیرمنفی و درصد بین صفر و صد وارد کنید."); return; }
    if (letter !== null && letter !== "" && (!Number.isFinite(Number(letter)) || Number(letter) < 0)) { setError("مبلغ نامه باید غیرمنفی باشد."); return; }
    onSave(projectCaseProfit({ ...order, HasSalesAgent: plan.route === "agent", AgentCompanySharePercent: 100 - (plan.agentSharePercent ?? 50), profitPlan: plan, ...(letter !== null ? { CommissionLetterAmount: letter === "" ? undefined : Number(letter) } : {}) }, db.suppliers.find(s => s.SupplierID === order.SupplierID), db.issuerCompanyShares, db));
    reset();
  };
  return <div className="mt-3 text-xs">
    {guided&&<ReferenceWorkflow title="خرید، فروش و تقسیم سود" description="اول ارقام معامله را وارد کنید؛ سپس سهم هر شخص را بررسی کنید. تغییرات ارقام خودکار ذخیره می‌شوند." value={step} onChange={setStep} steps={[{id:'inputs',title:'ارقام معامله',hint:'خرید، وزن، حمل، فروش و سود دستی'},{id:'distribution',title:'سهم‌ها و کمیسیون',hint:'صادرکننده، آرکاتاو، ایجنت و اشخاص'}]}/>}
    <div className="mb-2 flex justify-between"><b>جدول محاسبات و کمیسیون</b><span>{current.profitCurrency} · قیمت / تن</span></div>
    <details className="mb-3 rounded border border-indigo-100 p-2" onToggle={(event) => setShowFormulaSettings((event.currentTarget as HTMLDetailsElement).open)}><summary className="cursor-pointer font-bold text-indigo-700">تنظیم فرمول سود، شرکت و ایجنت</summary>{showFormulaSettings && <UnifiedProfitPanel order={{...order,profitPlan:plan}} db={db} supplier={db.suppliers.find(s => s.SupplierID === order.SupplierID)} issuerCompanyShares={db.issuerCompanyShares} cashPartners={db.cashPartners} onChange={next => change(next.profitPlan!)} />}</details>
    <p className="mb-2 text-slate-500">{plan.route === "agent" ? `ایجنت: ${plan.agentName || "تعیین نشده"} · سهم از سود مشترک: ${plan.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50))}%` : "ایجنت فروش برای این پرونده فعال نیست؛ از تنظیم فرمول سود انتخاب کنید."}</p>
    {order.TradeOwnership === "own_account" && <section className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3"><h4 className="mb-2 font-bold text-violet-900">شرکای سرمایه‌گذار و سهم توافقی پرونده</h4>{(plan.capitalPartners || []).map(partner => <div key={partner.partyId} className="mb-2 flex flex-wrap items-center gap-2"><span className="min-w-32">{db.cashPartners.find(p => p.id === partner.partyId)?.name || partner.partyId}</span><label>سهم سود و زیان (%) <input aria-label={`سهم سرمایه‌گذار ${partner.partyId}`} type="number" min="0" max="100" step="any" value={partner.sharePercent || ""} onChange={e => change({ ...plan, capitalPartners: plan.capitalPartners!.map(p => p.partyId === partner.partyId ? { ...p, sharePercent: Number(e.target.value) } : p) })} className="w-24 rounded border p-2"/></label><button type="button" onClick={() => change({ ...plan, capitalPartners: plan.capitalPartners!.filter(p => p.partyId !== partner.partyId) })} className="rounded border px-2 py-1 text-red-700">حذف شریک</button></div>)}<div className="flex flex-wrap items-center gap-3"><button type="button" className="rounded bg-violet-600 px-3 py-2 text-white" onClick={() => directory.open(p => { if (p.id === order.EconomicOwnerPartyId || p.isCustomer || p.category === "customer") { setError("شریکی غیر از مالک پرونده و مشتری انتخاب کنید."); return; } if (plan.capitalPartners?.some(row => row.partyId === p.id)) return; change({ ...plan, capitalPartners: [...(plan.capitalPartners || []), { partyId: p.id, sharePercent: 0 }] }); })}>+ انتخاب / تعریف شریک از فهرست اشخاص</button><b>سهم باقی‌مانده مالک: {Math.max(0, 100 - (plan.capitalPartners || []).reduce((n, p) => n + p.sharePercent, 0))}%</b></div><details className="mt-2 text-slate-500"><summary className="cursor-pointer">راهنمای سرمایه و سهم توافقی</summary><p className="mt-2 leading-6">درصدها از ابتدای پرونده توافق می‌شوند و با واریز یا بازپرداخت تغییر نمی‌کنند. آورده واقعی هر نفر و بازپرداخت اصل سرمایه را در دفتر دریافت و پرداخت، با انتخاب همان شخص ثبت کنید. قرض شرکت‌ها سهم سرمایه‌گذاری ایجاد نمی‌کند. نتیجه خالص شرکت‌ها پس از هزینه‌ها و سهم‌های قراردادی اشخاص و ایجنت، چه سود و چه زیان، به نسبت توافقی تقسیم می‌شود. سهم قراردادی ایجنت با ورود سرمایه‌گذار کاهش نمی‌یابد.</p></details></section>}
    {(!guided||step==='inputs') && hasMultipleProducts && <section className="mb-4 overflow-hidden rounded-lg border border-sky-200 bg-sky-50" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 px-3 py-2"><div><b className="text-sky-950">محاسبه سود به تفکیک کالا</b><InlineHelp><p className="mt-0.5 text-[11px] text-sky-800">تنظیمات ایجنت، کمیسیون و سهم‌ها یک‌بار در بالای صفحه تعیین می‌شود. فقط ارقام هر کالا را وارد کنید؛ جمع پرونده خودکار محاسبه می‌شود.</p></InlineHelp></div><span className="rounded bg-white px-2 py-1 font-bold text-sky-700">{order.items.length} کالا</span></div>
      <label className="m-3 block max-w-sm font-semibold text-sky-950">هزینه حمل کل پرونده ({current.profitCurrency})<input aria-label="هزینه حمل کل پرونده" type="number" min="0" step="any" value={plan.accountingOverrides?.freight ?? ""} placeholder={String(totalFreight)} onChange={e => set("freight", e.target.value)} className="mt-1 block w-full rounded border border-sky-300 bg-white p-2 font-mono font-normal"/><small className="mt-1 block font-normal text-sky-800">به نسبت مقدار هر کالا، خودکار تقسیم می‌شود.</small></label>
      <div className="overflow-x-auto"><table className="min-w-[760px] w-full border-collapse text-xs"><thead><tr className="border-b border-sky-200 text-slate-600"><th className="p-2 text-right">کالا</th><th className="p-2 text-center">مقدار (MT)</th><th className="p-2 text-center">خرید / MT</th><th className="p-2 text-center">فروش / MT</th>{plan.route === "agent" && <th className="p-2 text-center">قیمت ایجنت / MT</th>}<th className="p-2 text-center">حمل</th><th className="p-2 text-center">سود ناخالص</th></tr></thead><tbody>{order.items.map((item, index) => { const id = item.OrderDetailID || index; const input = itemProfitInputs[String(id)] || {}; const quantity = input.quantityMT ?? Number(item.Quantity || 0) * (item.QuantityUnit === "KG" ? 0.001 : 1); const purchase = input.purchasePricePerMT ?? Number(defaults?.purchasePricePerMT || 0); const sell = input.sellPricePerMT ?? Number(item.UnitPrice || defaults?.sellPricePerMT || 0); const agent = input.priceToAgentPerMT ?? Number(plan.calculationPriceToAgentPerMT ?? order.PriceToAgent ?? order.SellPrice ?? 0); const freight = input.freight ?? Number(item.FreightAllocation || 0); const margin = (sell - purchase) * quantity - freight; const name = item.ProductName || item.ChemicalName || item.ProductDescription || `کالای ${index + 1}`; return <tr key={String(id)} className="border-b border-sky-100 last:border-0"><td className="p-2 font-semibold text-slate-800">{name}</td><td className="p-1"><input aria-label={`مقدار ${name}`} type="number" min="0" step="any" value={input.quantityMT ?? quantity} onChange={e => setItem(id, "quantityMT", e.target.value)} className="w-24 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td><td className="p-1"><input aria-label={`خرید ${name}`} type="number" step="any" value={input.purchasePricePerMT ?? ""} placeholder={String(purchase)} onChange={e => setItem(id, "purchasePricePerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td><td className="p-1"><input aria-label={`فروش ${name}`} type="number" step="any" value={input.sellPricePerMT ?? ""} placeholder={String(sell)} onChange={e => setItem(id, "sellPricePerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td>{plan.route === "agent" && <td className="p-1"><input aria-label={`قیمت ایجنت ${name}`} type="number" step="any" value={input.priceToAgentPerMT ?? ""} placeholder={String(agent)} onChange={e => setItem(id, "priceToAgentPerMT", e.target.value)} className="w-28 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td>}<td className="p-1"><input aria-label={`حمل ${name}`} type="number" min="0" step="any" value={input.freight ?? ""} placeholder={String(freight)} onChange={e => setItem(id, "freight", e.target.value)} className="w-24 rounded border border-sky-200 bg-white px-2 py-1 text-center font-mono"/></td><td className={`p-2 text-center font-mono font-bold ${margin < 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatCurrency(margin, current.profitCurrency)}</td></tr>; })}</tbody></table></div>
      <InlineHelp><p className="px-3 py-2 text-[11px] text-sky-800">برای بازگشت هر خانه به مقدار پیش‌فرض، آن را پاک کنید. سود و سهم‌های پایین صفحه از مجموع همه کالاها ساخته می‌شود.</p></InlineHelp>
    </section>}
    <div className={`grid gap-4 ${guided?"":"lg:grid-cols-2"}`}><table hidden={guided&&step!=="inputs"} className="w-full table-fixed overflow-hidden rounded-lg border"><tbody>
      {!hasMultipleProducts && row("خرید خالص / تن", "purchasePricePerMT", defaults?.purchasePricePerMT || 0)}
      {!hasMultipleProducts && row("وزن کل (کیلوگرم)", "quantityMT", defaults?.quantityMT || source.quantityMT, 1000)}
      {!hasMultipleProducts && row("حمل و هزینه عملیاتی کل", "freight", defaults?.freight || 0)}
      {result("قیمت تمام‌شده CFR / تن (خودکار)", calc?.landedPurchasePricePerMT || 0)}
      {!hasMultipleProducts && row("قیمت اعلامی به ایجنت / تن", "priceToAgentPerMT", plan.calculationPriceToAgentPerMT ?? order.PriceToAgent ?? order.SellPrice ?? 0)}
      {!hasMultipleProducts && row("فروش نهایی / تن", "sellPricePerMT", defaults?.sellPricePerMT || 0)}
      {!hasMultipleProducts && row("سود دستی / تن", "marginPerMT", calc?.quantityMT ? calc.totalMargin / calc.quantityMT : 0)}
      {result("سود / تن", calc?.quantityMT ? calc.totalMargin / calc.quantityMT : 0)}
      {result("سود کل", calc?.totalMargin ?? current.profit.totalCaseProfit)}
    </tbody></table><table hidden={guided&&step!=="distribution"} className="w-full table-fixed overflow-hidden rounded-lg border"><tbody>
      {row("کارمزد بانک (مبلغ دستی جایگزین درصد)", "bankCharge", defaults?.bankCharge || 0)}
      {result("جمع کمیسیون افراد", calc?.commissionTotal || 0)}
      {plan.route === "agent" && calc && !calc.isWaterfall && result("سود مرحله اول پس از کسر بانک و کمیسیون", calc.internalDistributableMargin)}
      {shareRow("سهم شرکت صادرکننده", "issuer", calc?.waterfallIssuerAmount ?? calc?.allocations.filter(a => a.beneficiaryRole === "company").reduce((s, a) => s + a.amount, 0) ?? 0)}
      {plan.route === "agent" && calc && !calc.isWaterfall && <>
        {result("آرکاتاو — سهم سود با شرکت صادرکننده", calc.arcatavInternalShare)}
        {result("آرکاتاو — سهم سود مشترک با ایجنت", calc.arcatavAgentShare)}
      </>}
      {shareRow("سهم آرکاتاو", "arcatav", calc?.arcatavShare ?? current.profit.arcaShare)}
      {shareRow("سهم ایجنت", "agent", calc?.agentProfitShare ?? current.profit.agentCompanyProfit)}
      {result("جمع تخصیص سود (سهم‌ها، کمیسیون و بانک)", calc ? calc.arcatavShare + calc.bankCharge + calc.allocations.filter(a => a.beneficiaryRole !== "arcatav").reduce((sum, a) => sum + a.amount, 0) : current.profit.totalCaseProfit)}
      <tr><th className="p-2 text-right font-normal">مبلغ نامه کمیسیون ({current.invoiceCurrency})</th><td className="p-1"><input aria-label="مبلغ نامه کمیسیون" type="number" step="any" value={letter ?? order.CommissionLetterAmount ?? ""} placeholder={String((calc?.commissionTotal || 0) * current.profitToInvoice)} onChange={e => { setLetter(e.target.value); onDirty(true); }} className="w-full rounded border p-2 text-left" dir="ltr"/></td></tr>
    </tbody></table></div>
    <div hidden={guided&&step!=='distribution'}>
    <InlineHelp><p className="mt-2 text-slate-500">آخرین سهمی که دستی وارد می‌کنید ثابت می‌ماند؛ دو سهم دیگر به نسبت فرمول اصلی از باقی‌مانده تنظیم می‌شوند. با پاک‌کردن سهم دستی، تقسیم اصلی برمی‌گردد.</p></InlineHelp>
    <details className="my-2 text-slate-500"><summary className="cursor-pointer">جمع کمیسیون افراد چیست؟</summary><p className="mt-2 leading-6">مجموع کمیسیون رابط‌ها و اشخاص تعریف‌شده در پرونده است و سهم شرکت و ایجنت را شامل نمی‌شود. صفر یعنی کمیسیون مستقلی در محاسبه فعال نیست. سهم‌های قدیمی واردشده از اکسس تا تعریف در فرمول جدید، خودکار کسر نمی‌شوند.</p></details>
    <div className="mt-3 space-y-2">{(plan.rules || []).filter(rule => rule.beneficiaryRole === "commission_party").map(rule => <div key={rule.id} className="grid grid-cols-[1fr_80px_72px_24px] items-center gap-1 rounded bg-blue-50 p-2">
      <span className="break-words">{db.cashPartners.find(p => p.id === rule.beneficiaryId)?.name || rule.beneficiaryName}</span>
      <input aria-label={`کمیسیون ${rule.beneficiaryName}`} type="number" step="any" value={rule.value} onChange={e => change({ ...plan, rules: plan.rules!.map(r => r.id === rule.id ? { ...r, value: Number(e.target.value) } : r) })} className="w-full rounded border p-1"/>
      <select aria-label={`روش کمیسیون ${rule.beneficiaryName}`} value={rule.method} onChange={e => change({ ...plan, rules: plan.rules!.map(r => r.id === rule.id ? { ...r, method: e.target.value as typeof r.method } : r) })} className="w-full rounded border p-1"><option value="fixed">مبلغ</option><option value="percent">درصد</option><option value="per_mt">در تن</option></select>
      <button aria-label={`حذف کمیسیون ${rule.beneficiaryName}`} onClick={() => change({ ...plan, rules: plan.rules!.filter(r => r.id !== rule.id) })}>×</button>
    </div>)}</div>
    <button type="button" className="mt-2 rounded bg-indigo-50 px-3 py-2 text-indigo-700" onClick={() => directory.open(party => {
      if ((plan.rules || []).some(r => r.beneficiaryRole === "commission_party" && r.beneficiaryId === party.id)) return;
      change({ ...plan, rules: [...(plan.rules || []), { id: `commission:${crypto.randomUUID()}`, beneficiaryId: party.id, beneficiaryName: party.name, beneficiaryRole: "commission_party", basis: "distributable_margin", method: "fixed", value: 0, visibility: "internal" }] });
    })}>+ انتخاب / تعریف دریافت‌کننده کمیسیون</button>
    </div>
    <details className="my-3 text-slate-500"><summary className="cursor-pointer">راهنمای مقادیر و اولویت محاسبه</summary><p className="mt-2 leading-6">خانه خالی از اطلاعات فعلی پرونده و اسناد پیروی می‌کند. مقدار دستی، حتی صفر، اولویت دارد؛ برای بازگشت به پیش‌فرض آن را پاک کنید. قیمت تمام‌شده با تغییر خرید، حمل و وزن خودکار محاسبه می‌شود؛ اگر خرید شامل حمل باشد، حمل دوباره اضافه نمی‌شود. سود برابر اختلاف فروش و قیمت تمام‌شده است؛ سود دستی جایگزین این اختلاف می‌شود. بانک جداگانه را فقط برای هزینه‌ای وارد کنید که در هزینه‌های عملیاتی ثبت نشده است. سهم شرکت‌ها و ایجنت از تنظیمات سود محاسبه می‌شود؛ تغییر مقادیر این جدول دریافت یا پرداخت نقدی ایجاد نمی‌کند.</p></details>
    {error && <p role="alert" className="my-2 text-red-700">{error}</p>}
    {(draft || letter !== null) && <div className="flex gap-2"><button onClick={save} className="rounded bg-indigo-600 px-3 py-2 font-bold text-white">ذخیره محاسبات</button><button onClick={reset} className="rounded border px-3 py-2">لغو محاسبات</button></div>}
  </div>;
});
