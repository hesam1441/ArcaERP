import { financialGroupForOrder, financialGroupContext } from "./financialGroups";
import { rialSalesSummary } from "./rialSales";
import { normalizePartnerName } from "./partnerIdentity";
import { AppDatabase, Order } from "../types";
import { calculateUnifiedProfit, getCaseShareRecipients, getActualCaseProfit } from "./caseProfitEngine";
import { calculateProfitBreakdown, ProfitBreakdown } from "./profitCalculations";
import { getOwnAccountRealization, getOrderCurrency, getOrderProfitCurrency, getOrderProfitToUSDMultiplier, getOrderCommercialTotalUSD, isExcludedFromFinancialCalculations, getOrderAmountInProfitCurrency, transactionAmountInOrderCurrency, getOrderProfitToInvoiceMultiplier } from "./orderAccounting";

export type ProfitReportStatus = "ready" | "excluded" | "suspended" | "incomplete" | "missing_fx" | "consolidated";
export const profitReportStatusLabels: Record<ProfitReportStatus, string> = {
  consolidated: "محاسبه در گروه مالی؛ سود مستقل ندارد", ready: "محاسبه‌شده", excluded: "خارج از محاسبات", suspended: "در انتظار تحقق فروش و تسویه", incomplete: "اطلاعات محاسبه سود ناقص", missing_fx: "نرخ تبدیل سود یا سهم ثبت نشده",
};
const zeroProfit = (profit: ProfitBreakdown): ProfitBreakdown => Object.fromEntries(Object.entries(profit).map(([key, value]) => [key, key === "quantityMT" ? value : 0])) as unknown as ProfitBreakdown;

/** Every financial consumer reads this projection. Inputs and postings are never rewritten by a report. */
export function getCaseFinancials(db: AppDatabase, order: Order) {
  if (order.ConsolidatedGroupId) {
    const group = db.financialGroups?.find(item => item.id === order.ConsolidatedGroupId);
    const context = group && financialGroupContext(db, group);
    if (context) { db = context.db; order = { ...context.order, profitPlan: order.profitPlan || context.order.profitPlan, customShares: order.customShares || context.order.customShares, commissionSettlements: order.commissionSettlements || context.order.commissionSettlements }; }
  }
  const financialGroup = order.ConsolidatedGroupId ? undefined : financialGroupForOrder(db, order.OrderID);
  const supplier = db.suppliers.find(item => item.SupplierID === order.SupplierID);
  const unified = calculateUnifiedProfit(order, supplier, db.issuerCompanyShares, db);
  const rawProfit = calculateProfitBreakdown(order, db.issuerCompanyShares, supplier, db);
  const realization = getOwnAccountRealization(db, order);
  // An explicit zero/manual loss is valid. A plan object alone is not proof of complete inputs.
  const manualMargin = order.profitPlan?.accountingOverrides?.marginPerMT;
  const inputCompleteBase = unified
    ? unified.quantityMT > 0 && (manualMargin !== undefined || (unified.isActual && (getActualCaseProfit(db, order).hasReceiptAndPurchase || (order.TradeOwnership === "own_account" && realization.recognized))) || ((unified.purchasePricePerMT > 0 || order.profitPlan?.accountingOverrides?.purchasePricePerMT === 0) && (unified.sellPricePerMT > 0 || order.profitPlan?.accountingOverrides?.sellPricePerMT === 0)))
    : rawProfit.quantityMT > 0 && Number(order.CostPrice || order.CFRNet || order.NetFob) > 0 && Number(order.EndCustomerPrice || order.SellPrice) > 0;
  const rialSales = rialSalesSummary(order);
  const inputComplete = order.RialSalesEnabled ? inputCompleteBase && rialSales.hasSales && !rialSales.invalid && getActualCaseProfit(db, order).hasReceiptAndPurchase : inputCompleteBase;
  const profitRate = getOrderProfitToUSDMultiplier(order);
  const missingShareFX = (order.customShares || []).some(share => share.id !== "agent-profit-beneficiary" && !String(share.notes || "").includes("Migrated from Access fixed share field") && Math.abs(Number(share.amount || 0)) > .005 && getOrderAmountInProfitCurrency(order, Number(share.amount), share.currency) === null);
  const nativeStatus = isExcludedFromFinancialCalculations(order) ? "excluded" : financialGroup ? "consolidated" : order.ConsolidatedMissingFX ? "missing_fx" : !realization.recognized ? "suspended" : rialSales.invalid && rialSales.enabled ? "missing_fx" : !inputComplete ? "incomplete" : missingShareFX ? "missing_fx" : "ready";
  const status: ProfitReportStatus = nativeStatus === "ready" && profitRate === null ? "missing_fx" : nativeStatus;
  const profit = nativeStatus === "ready" ? rawProfit : zeroProfit(rawProfit);
  const usdProfit = Object.fromEntries(Object.entries(profit).map(([key, value]) => [key, key === "quantityMT" ? value : value * (profitRate ?? 0)])) as unknown as ProfitBreakdown;
  const shares = nativeStatus === "ready" ? getCaseShareRecipients(order, supplier, db.issuerCompanyShares, db) : [];
  return { order, unified, realization, inputComplete, nativeStatus, status, statusLabel: financialGroup ? `محاسبه در گروه مالی: ${financialGroup.name}` : profitReportStatusLabels[status], financialGroup,
    reportable: status === "ready", profit, usdProfit, profitRate,
    profitCurrency: getOrderProfitCurrency(order), invoiceCurrency: getOrderCurrency(order),
    invoiceTotalUSD: order.ConsolidatedGroupId ? 0 : isExcludedFromFinancialCalculations(order) ? null : getOrderCommercialTotalUSD(order),
    rialSales, shares, usdShares: profitRate === null ? [] : shares.map(share => ({ ...share, amount: share.amount * profitRate })),
  };
}

export function getReportingFinancials(db: AppDatabase, orders: Order[] = db.orders) {
  const selected = new Set(orders.map(order => order.OrderID));
  const groups = (db.financialGroups || []).filter(group => group.orderIds.every(id => selected.has(id)));
  return [...orders.map(order => getCaseFinancials(db, order)), ...groups.flatMap(group => { const context = financialGroupContext(db, group); return context ? [getCaseFinancials(context.db, context.order)] : []; })];
}

export function summarizeCaseFinancials(db: AppDatabase, orders: Order[] = db.orders) {
  const cases = getReportingFinancials(db, orders);
  const ready = cases.filter(item => item.reportable);
  const selected = new Set(orders.map(order=>order.OrderID));
  const partialGroups = (db.financialGroups||[]).filter(group=>group.orderIds.some(id=>selected.has(id))&&!group.orderIds.every(id=>selected.has(id)));
  return { cases, ready, partialGroups, totalProfitUSD: ready.reduce((sum, item) => sum + item.usdProfit.totalCaseProfit, 0),
    arcatavShareUSD: ready.reduce((sum, item) => sum + item.usdProfit.arcaShare, 0),
    issuerShareUSD: ready.reduce((sum, item) => sum + item.usdProfit.issuerCompanyShare, 0),
    commissionUSD: ready.reduce((sum, item) => sum + item.usdProfit.individualShares, 0),
    counts: Object.fromEntries(Object.keys(profitReportStatusLabels).map(status => [status, cases.filter(item => item.status === status).length])) as Record<ProfitReportStatus, number>,
  };
}

/** Settlements are stored in their original currency and read in the case-profit currency. */
export function getBeneficiarySettlement(order: Order, name: string, db?: AppDatabase) {
  const group = order.ConsolidatedGroupId && db?.financialGroups?.find(item => item.id === order.ConsolidatedGroupId);
  const context = group && db && financialGroupContext(db, group);
  if (context) { db = context.db; order = { ...context.order, commissionSettlements: order.commissionSettlements || context.order.commissionSettlements }; }
  let paid = 0, advance = 0, missingFX = false;
  const partyMatches = (id: string | undefined, label: string | undefined) => {
    const party = db?.cashPartners.find(item => item.id === id);
    const target = db?.cashPartners.find(item => [item.name, item.nameEn, ...(item.aliases || [])].some(value => value && normalizePartnerName(value) === normalizePartnerName(name)));
    return !!(id && target?.id === id) || [label, party?.name, party?.nameEn, ...(party?.aliases || [])].some(value => value && normalizePartnerName(value) === normalizePartnerName(name));
  };
  for (const entry of [...(order.commissionSettlements || []), ...(order.ConsolidatedMemberOffsets || [])]) {
    if (!partyMatches(entry.partyId, entry.partyName)) continue;
    const amount = getOrderAmountInProfitCurrency(order, Number(entry.amount || 0), entry.currency);
    if (amount === null) { missingFX = true; continue; }
    if (entry.type === "paid" || entry.type === "advance_offset") paid += amount;
    if (entry.type === "advance") advance += amount;
    if (entry.type === "advance_repayment" || entry.type === "advance_offset") advance -= amount;
  }
  for (const entry of db?.orderTransactions || []) {
    if (entry.OrderID !== order.OrderID || !["partner_settlement", "commission_advance", "commission_advance_repayment"].includes(entry.TransactionType || "")) continue;
    if ((order.commissionSettlements || []).some(item => entry.JournalID === `commission:${order.OrderID}:${item.id}`)) continue;
    if (!partyMatches(entry.PartnerId, entry.Counterparty)) continue;
    const hasConverted = entry.ConvertedAmount != null && String(entry.ConvertedAmount) !== "" && Number.isFinite(Number(entry.ConvertedAmount));
    const amount = hasConverted || Number(entry.Exchange_Rate) > 0
      ? getOrderAmountInProfitCurrency(order, transactionAmountInOrderCurrency(order, entry), getOrderCurrency(order))
      : getOrderAmountInProfitCurrency(order, Number(entry.Amount || 0), entry.PaymentCurrency || entry.ProformaCurrency || getOrderCurrency(order));
    if (amount === null) { missingFX = true; continue; }
    if (entry.TransactionType === "partner_settlement") paid += amount;
    else advance += (entry.TransactionType === "commission_advance" ? 1 : -1) * amount;
  }
  for (const confirmation of order.profitSettlementConfirmations || []) for (const share of confirmation.shares) {
    if (!partyMatches(share.partyId,share.partyName)) continue;
    const settled=getOrderAmountInProfitCurrency(order,share.additionalPaid,confirmation.currency);
    const applied=getOrderAmountInProfitCurrency(order,share.advanceApplied,confirmation.currency);
    if(settled===null||applied===null){missingFX=true;continue;}
    paid+=settled;advance-=applied;
  }
  return { paid, advance, missingFX };
}

/** Same per-beneficiary settlement decision for every editor and report. */
export function isCaseCommissionSettled(db: AppDatabase, order: Order) {
  const financial = getCaseFinancials(db, order);
  if (financial.nativeStatus !== "ready") return false;
  const allocations = financial.unified?.allocations.filter(item => item.beneficiaryRole === "commission_party") || [];
  const due = new Map<string, { name: string; amount: number }>();
  allocations.forEach(item => { const key = normalizePartnerName(item.beneficiaryName); const previous = due.get(key); due.set(key, { name: item.beneficiaryName, amount: (previous?.amount || 0) + item.amount }); });
  return due.size > 0 && [...due.values()].every(item => { const settlement = getBeneficiarySettlement(order, item.name, db); return !settlement.missingFX && settlement.paid + .005 >= item.amount; });
}
