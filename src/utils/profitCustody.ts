import { AppDatabase, Order } from "../types";
import { getReportingFinancials, getBeneficiarySettlement, getCaseFinancials, isCaseCommissionSettled } from "./caseFinancials";
import { getOrderAmountInProfitCurrency } from "./orderAccounting";
import { getCaseProfitPlan } from "./caseProfitEngine";
import { normalizePartnerName, ownedCompanyFor } from "./partnerIdentity";

/** A liability-backed view of profit held for beneficiaries, never an extra cash receipt or expense. */
export function getCaseProfitCustody(db: AppDatabase, order: Order) {
  const financial = getCaseFinancials(db, order);
  const supplier = db.suppliers.find(item => item.SupplierID === order.SupplierID);
  const issuerId = (order.IssuerCompanyId || "").toLowerCase();
  const owned = ownedCompanyFor(supplier?.SupplierName || order.SupplierName)
    || ownedCompanyFor(({ bera: "Berakem", berakem: "Berakem", arovin: "Arovin", "arca-tav": "Arcatav", arcatav: "Arcatav" } as Record<string, string>)[issuerId]);
  const issuer = { id: owned?.id || `supplier:${order.SupplierID}`, name: owned?.name || supplier?.SupplierName || order.SupplierName || "صادرکننده نامشخص" };
  const groups = new Map<string, { id: string; name: string; amount: number }>();
  for (const share of financial.shares) {
    const party = db.cashPartners.find(item => item.id === share.id || [item.name, item.nameEn, ...(item.aliases || [])].some(name => name && normalizePartnerName(name) === normalizePartnerName(share.name)));
    const key = party?.id || normalizePartnerName(share.name) || share.id;
    const previous = groups.get(key);
    groups.set(key, { id: party?.id || share.id, name: previous?.name || share.name, amount: (previous?.amount || 0) + share.amount });
  }
  const beneficiaries = [...groups.values()].map(share => {
    const settlement = getBeneficiarySettlement(order, share.name, db);
    const entitlement = Math.max(0, share.amount);
    const remaining = Math.max(0, entitlement - settlement.paid);
    return { ...share, entitlement, paid: settlement.paid, remaining, advance: settlement.advance,
      overpaid: Math.max(0, settlement.paid - entitlement), missingFX: settlement.missingFX,
      status: settlement.missingFX ? "missing_fx" : remaining <= .005 ? "settled" : settlement.paid > .005 ? "partial" : "unpaid" };
  });
  const missingFX = financial.status === "missing_fx" || beneficiaries.some(item => item.missingFX);
  const sum = (field: "entitlement" | "paid" | "remaining" | "overpaid") => beneficiaries.reduce((total, item) => total + item[field], 0);
  const eligible = financial.reportable && !missingFX;
  const confirmed=(order.profitSettlementConfirmations||[]).some(item=>item.receiptConfirmed && item.currency===financial.profitCurrency && Math.abs(item.profitAmount-financial.profit.totalCaseProfit)<.005 && beneficiaries.every(person=>item.shares.some(share=>normalizePartnerName(share.partyName)===normalizePartnerName(person.name)&&Math.abs(share.entitlement-person.amount)<.005)));
  const estimated = !(confirmed || financial.unified?.isActual || (order.TradeOwnership === "own_account" && financial.realization.recognized));
  return { order, issuer, financial, beneficiaries, missingFX, eligible, estimated,
    entitled: sum("entitlement"), paid: sum("paid"), remaining: sum("remaining"), overpaid: sum("overpaid"),
    heldUSD: eligible && !estimated ? sum("remaining") * financial.profitRate! : 0,
    estimatedUSD: eligible && estimated ? sum("remaining") * financial.profitRate! : 0,
  };
}

export function summarizeProfitCustody(db: AppDatabase, orders: Order[] = db.orders) {
  const cases = getReportingFinancials(db, orders).map(financial => getCaseProfitCustody(db, financial.order));
  const issuers = new Map<string, { id: string; name: string; heldUSD: number; estimatedUSD: number; paidUSD: number; entitledUSD: number; cases: typeof cases }>();
  for (const item of cases) {
    if (!item.eligible || !item.beneficiaries.some(person => person.entitlement > .005 || person.paid > .005)) continue;
    const row = issuers.get(item.issuer.id) || { ...item.issuer, heldUSD: 0, estimatedUSD: 0, paidUSD: 0, entitledUSD: 0, cases: [] };
    row.heldUSD += item.heldUSD; row.estimatedUSD += item.estimatedUSD;
    if (!item.estimated) { row.paidUSD += item.paid * item.financial.profitRate!; row.entitledUSD += item.entitled * item.financial.profitRate!; }
    row.cases.push(item); issuers.set(row.id, row);
  }
  return { cases, issuers: [...issuers.values()], heldUSD: [...issuers.values()].reduce((sum, item) => sum + item.heldUSD, 0), estimatedUSD: [...issuers.values()].reduce((sum, item) => sum + item.estimatedUSD, 0), missingFXCount: cases.filter(item => item.missingFX).length };
}

/** Record a partial or final delivery in the existing ledger, so every financial view updates together. */
export function recordProfitDelivery(db: AppDatabase, order: Order, input: { beneficiaryId: string; amount: number; currency: string; date: string; note?: string }) {
  const custody = getCaseProfitCustody(db, order);
  const beneficiary = custody.beneficiaries.find(item => item.id === input.beneficiaryId);
  if (!custody.eligible || !beneficiary) throw new Error("سهم قابل پرداخت نیست؛ وضعیت محاسبه و نرخ تبدیل پرونده را بررسی کنید.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("مبلغ تحویل باید بزرگ‌تر از صفر باشد.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error("تاریخ تحویل معتبر نیست.");
  const amount = getOrderAmountInProfitCurrency(order, input.amount, input.currency);
  if (amount === null) throw new Error("نرخ تبدیل ارز پرداخت ثبت نشده است.");
  if (amount > beneficiary.remaining + .005) throw new Error("مبلغ تحویل از ماندهٔ سهم بیشتر است.");
  const updated = { ...order, commissionSettlements: [...(order.commissionSettlements || []), {
    id: `profit-delivery-${(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)}`, type: "paid" as const, partyId: beneficiary.id, partyName: beneficiary.name,
    amount: input.amount, currency: input.currency, date: input.date, note: input.note || "تحویل سود به صاحب سهم", createdAt: new Date().toISOString(),
  }] };
  return { ...updated, CommissionPaid: isCaseCommissionSettled(db, updated) };
}

/** Edit the existing allocation source, never a second display-only balance. */
export function updateProfitShare(db: AppDatabase, order: Order, beneficiaryId: string, amount: number): Order {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("مبلغ سهم باید عددی معتبر و صفر یا بیشتر باشد.");
  if(order.ConsolidatedGroupId) throw new Error("سهم این پرونده از گروه تجمیعی محاسبه می‌شود؛ آن را در گروه مالی ویرایش کنید.");
  const custody = getCaseProfitCustody(db, order);
  const person = custody.beneficiaries.find(item => item.id === beneficiaryId);
  if (!person || !custody.eligible) throw new Error("سهم قابل ویرایش نیست؛ وضعیت پرونده و نرخ ارز را بررسی کنید.");
  const matches = (id?: string, name?: string) => id === person.id || normalizePartnerName(name) === normalizePartnerName(person.name);
  const shares = custody.financial.shares.filter(item => matches(item.id, item.name));
  const supplier = db.suppliers.find(item => item.SupplierID === order.SupplierID);
  const plan = getCaseProfitPlan(order, supplier);
  let updated: Order = { ...order };
  if (plan) {
    if (shares.some(item => item.role === "investor")) throw new Error("سهم سرمایه‌گذار از نسبت سرمایه محاسبه می‌شود؛ نسبت را در تنظیمات سرمایه ویرایش کنید.");
    const role = normalizePartnerName(person.name) === "arcatav" ? "arcatav" : shares.some(item => item.role === "company") ? "issuer" : shares.some(item => item.role === "agent") ? "agent" : undefined;
    if (role) updated.profitPlan = { ...plan, manualShare: { role, amount } };
    else {
      const rules = (plan.rules || []).filter(rule => matches(rule.beneficiaryId, rule.beneficiaryName));
      const custom = (order.customShares || []).filter(item => matches(item.partnerId, item.partnerName));
      if (rules.length === 1 && !custom.length) updated.profitPlan = { ...plan, rules: (plan.rules || []).map(rule => rule.id === rules[0].id ? { ...rule, method: "fixed", value: amount } : rule) };
      else if (!rules.length && custom.length === 1) {
        const rate = getOrderAmountInProfitCurrency(order, 1, custom[0].currency);
        if (!rate) throw new Error("نرخ ارز سهم مشخص نیست.");
        updated.customShares = order.customShares!.map(item => item === custom[0] ? { ...item, amount: amount / rate } : item);
      } else throw new Error("این سهم چند منبع دارد؛ قوانین سهم را در بخش خرید، فروش و سود ویرایش کنید.");
    }
  } else {
    const company = (order.companyProfitShares || []).filter(item => matches(undefined, item.companyName));
    const custom = (order.customShares || []).filter(item => matches(item.partnerId, item.partnerName));
    if (company.length + custom.length !== 1) throw new Error("برای تغییر این سهم، قوانین محاسبهٔ پرونده را ویرایش کنید.");
    if (company.length) updated.companyProfitShares = order.companyProfitShares!.map(item => item === company[0] ? { ...item, amount } : item);
    else {
      const rate = getOrderAmountInProfitCurrency(order, 1, custom[0].currency);
      if (!rate) throw new Error("نرخ ارز سهم مشخص نیست.");
      updated.customShares = order.customShares!.map(item => item === custom[0] ? { ...item, amount: amount / rate } : item);
    }
  }
  const nextDB = { ...db, orders: db.orders.map(item => item.OrderID === order.OrderID ? updated : item) };
  const next = getCaseProfitCustody(nextDB, updated);
  const edited = next.beneficiaries.find(item => matches(item.id, item.name));
  if (Math.abs((edited?.amount || 0) - amount) > .011) throw new Error("این تغییر با فرمول فعلی سازگار نیست؛ تنظیمات سهم را در بخش خرید، فروش و سود بررسی کنید.");
  if (custody.beneficiaries.some(item => item.paid > .005 && !next.beneficiaries.some(person => person.id === item.id))) throw new Error("برای صفرکردن این سهم، ابتدا پرداخت‌های ثبت‌شدهٔ آن را بررسی و اصلاح کنید.");
  if (next.beneficiaries.some(item => item.amount < -.005)) throw new Error("مبلغ سهم از سود قابل تقسیم بیشتر است و سهم دیگری را منفی می‌کند.");
  return { ...updated, CommissionPaid: isCaseCommissionSettled(nextDB, updated) };
}

/** Revalidate an existing delivery after excluding itself from the paid balance. */
export function updateProfitDelivery(db: AppDatabase, order: Order, entryId: string, input: { amount: number; date: string; note?: string }): Order {
  const entry = order.commissionSettlements?.find(item => item.id === entryId);
  if (!entry || entry.type !== "paid") throw new Error("این سند از دفتر اصلی خودش قابل ویرایش است.");
  const without = { ...order, commissionSettlements: order.commissionSettlements!.filter(item => item.id !== entryId) };
  const person = getCaseProfitCustody(db, without).beneficiaries.find(item => item.id === entry.partyId || normalizePartnerName(item.name) === normalizePartnerName(entry.partyName));
  if (!person) throw new Error("صاحب سهم پیدا نشد.");
  const validationDB = { ...db, orders: db.orders.map(item => item.OrderID === order.OrderID ? without : item), orderTransactions: (db.orderTransactions || []).filter(item => item.JournalID !== `commission:${order.OrderID}:${entryId}`) };
  recordProfitDelivery(validationDB, without, { beneficiaryId: person.id, currency: entry.currency, ...input });
  const updated = { ...order, commissionSettlements: order.commissionSettlements!.map(item => item.id === entryId ? { ...item, ...input } : item) };
  return { ...updated, CommissionPaid: isCaseCommissionSettled(db, updated) };
}
