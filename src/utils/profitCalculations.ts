import { calculateUnifiedProfit, isProfitCurrencyShare } from "./caseProfitEngine";
import { AppDatabase, IssuerCompanyShare, Order, Supplier } from "../types";
import { getOwnAccountRealization, getOrderProfitToUSDMultiplier, getOrderAmountInProfitCurrency, getOrderQuantityMT } from "./orderAccounting";

export interface ProfitBreakdown {
  quantityMT: number;
  directProfit: number;
  indirectProfit: number;
  indirectCompanyProfit: number;
  directArcaProfit: number;
  directArcaProfitPerMT: number;
  indirectArcaProfitPerMT: number;
  freightPerMT: number;
  landedCostToAgent: number;
  grossProfit: number;
  bankShare: number;
  otherExpenses: number;
  individualShares: number;
  distributableProfit: number;
  arcaShare: number;
  issuerCompanyShare: number;
  sellerCompanyProfit: number;
  agentCompanyProfit: number;
  totalCaseProfit: number;
}

const numberValue = (value?: number) => Number(value) || 0;
const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

export function calculateProfitBreakdown(order: Order, companies: IssuerCompanyShare[] = [], supplier?: Supplier, db?: AppDatabase): ProfitBreakdown {
  if (order.TradeOwnership !== "own_account") return calculateProfitBreakdownRaw(order, companies, supplier, db);
  const effective: Order = { ...order, profitPlan: { route: order.HasSalesAgent ? "agent" : "direct", ...order.profitPlan, profitBasis: "actual", accountingOverrides: undefined } };
  const result = calculateProfitBreakdownRaw(effective, companies, supplier, db);
  if (getOwnAccountRealization(db, order).recognized) return result;
  return Object.fromEntries(Object.entries(result).map(([key, amount]) => [key, key === "quantityMT" ? amount : 0])) as unknown as ProfitBreakdown;
}

function calculateProfitBreakdownRaw(order: Order, companies: IssuerCompanyShare[] = [], supplier?: Supplier, db?: AppDatabase): ProfitBreakdown {
  const unified = calculateUnifiedProfit(order, supplier, companies, db);
  if (unified) {
    const q = unified.quantityMT;
    const issuerShare = unified.allocations.filter((allocation) => allocation.beneficiaryRole === "company").reduce((sum, allocation) => sum + allocation.amount, 0);
    return {
      quantityMT: q, directProfit: q ? unified.issuerMargin / q : 0,
      indirectProfit: q ? unified.agentMargin / q : 0,
      indirectCompanyProfit: unified.arcatavAgentShare, directArcaProfit: unified.arcatavInternalShare,
      directArcaProfitPerMT: q ? unified.arcatavInternalShare / q : 0,
      indirectArcaProfitPerMT: q ? unified.arcatavAgentShare / q : 0,
      freightPerMT: unified.freightPerMT, landedCostToAgent: unified.landedAgentPricePerMT,
      grossProfit: unified.arcatavShare, bankShare: unified.bankCharge, otherExpenses: 0,
      individualShares: unified.commissionTotal, distributableProfit: unified.distributableMargin,
      arcaShare: unified.arcatavShare, issuerCompanyShare: issuerShare,
      sellerCompanyProfit: issuerShare, agentCompanyProfit: unified.agentProfitShare,
      totalCaseProfit: unified.totalMargin,
    };
  }
  // فرم اقلام با MT کار می‌کند؛ داده‌های قدیمیِ واردشده از Access ممکن است هنوز بر حسب کیلوگرم باشند.
  // A case may have actual accounting figures. They are deliberately kept in
  // profitPlan so an issued PI remains immutable while every profit widget uses
  // the same effective figures.
  const actual = order.profitPlan;
  const quantityMT = numberValue(actual?.calculationQuantityMT ?? getOrderQuantityMT(order));
  const costPrice = numberValue(actual?.calculationPurchasePricePerMT ?? (order.CostPrice || order.CFRNet || order.NetFob));
  const priceToAgent = numberValue(actual?.calculationPriceToAgentPerMT ?? (order.PriceToAgent || order.SellPrice));
  const endCustomerPrice = numberValue(actual?.calculationSellPricePerMT ?? (order.EndCustomerPrice || order.SellPrice));
  const company = companies.find((item) => item.id === order.IssuerCompanyId);
  const arcaPercent = numberValue(order.DirectArcaSharePercent ?? company?.arcaPercent ?? 66.6666666667);
  // قانون نمونهٔ آرکاتاو:
  // سود آروین/براکم = قیمت فروش آرکاتاو به آروین/براکم − قیمت خرید واقعی.
  // سود ایجنت فروش = قیمت فروش ایجنت به مشتری − (قیمت آروین/براکم + حمل ÷ وزن کل).
  // سود آرکاتاو = سهم آن از سود آروین/براکم + سهم آن از سود ایجنت فروش.
  const freightPerMT = quantityMT > 0 ? numberValue(actual?.calculationFreight ?? order.Freight) / quantityMT : 0;
  const landedCostToAgent = round(priceToAgent + freightPerMT, 2);
  const directProfit = priceToAgent - costPrice;
  const indirectProfit = endCustomerPrice - landedCostToAgent;
  // هیچ مرحلهٔ میانی گرد نمی‌شود؛ ابتدا دقیقاً طبق فرمول نمونه محاسبه و
  // فقط نتیجه‌های نمایشی/نهایی تا دو رقم اعشار گرد می‌شوند.
  // سهم هر تن در این قانون تا سه رقم نگه‌داری می‌شود (113.333 و 137.405 در نمونه)
  // و سپس در وزن ضرب می‌گردد؛ مبلغ‌های نهایی برای نمایش تا دو رقم گرد می‌شوند.
  const directArcaProfitPerMT = round(directProfit * (arcaPercent / 100), 3);
  const indirectArcaProfitPerMT = round(indirectProfit * (numberValue(order.AgentCompanySharePercent ?? 50) / 100), 3);
  const directArcaProfit = round(directArcaProfitPerMT * quantityMT, 2);
  const indirectCompanyProfit = round(indirectArcaProfitPerMT * quantityMT, 2);
  const grossProfit = round(directArcaProfit + indirectCompanyProfit, 2);
  const sellerCompanyProfit = round((directProfit - directArcaProfitPerMT) * quantityMT, 2);
  const agentCompanyProfit = round((indirectProfit - indirectArcaProfitPerMT) * quantityMT, 2);
  const totalCaseProfit = round(grossProfit + sellerCompanyProfit + agentCompanyProfit, 2);
  const bankShare = grossProfit * (numberValue(order.BankSharePercent) / 100);
  const otherExpenses = 0;
  // فیلدهای قدیمیِ سهم افراد دیگر در مدل جدید معتبر نیستند. تنها افرادِ انتخاب‌شده
  // در منوی «ذی‌نفعان پرونده» در محاسبات منظور می‌شوند.
  const individualShares = numberValue(order.OverPayment) + numberValue(order.CustomerRefund) +
    (order.customShares || []).filter(share => isProfitCurrencyShare(order, share)).reduce((total, share) => total + (getOrderAmountInProfitCurrency(order, numberValue(share.amount), share.currency) ?? 0), 0);
  const distributableProfit = round(grossProfit - bankShare - otherExpenses - individualShares, 2);

  // Calculations use the currency of the entered case prices, not the printed
  // invoice currency. Invoice conversion applies only to commercial totals.
  const monetary = (value: number) => round(value, 2);
  return {
    quantityMT,
    directProfit: monetary(directProfit),
    indirectProfit: monetary(indirectProfit),
    indirectCompanyProfit: monetary(indirectCompanyProfit),
    directArcaProfit: monetary(directArcaProfit),
    directArcaProfitPerMT: monetary(directArcaProfitPerMT),
    indirectArcaProfitPerMT: monetary(indirectArcaProfitPerMT),
    freightPerMT: monetary(freightPerMT),
    landedCostToAgent: monetary(landedCostToAgent),
    grossProfit: monetary(grossProfit),
    bankShare: monetary(bankShare),
    otherExpenses: monetary(otherExpenses),
    individualShares: monetary(individualShares),
    distributableProfit: monetary(distributableProfit),
    // سهم آرکاتاو همان خروجی قانون محاسبه است. سهم افراد و کسورات، تخصیص‌های بعدیِ
    // این مبلغ‌اند و نباید نتیجهٔ فرمول شرکت‌ها را تغییر دهند.
    arcaShare: monetary(grossProfit),
    issuerCompanyShare: monetary(round(directProfit * quantityMT * ((100 - arcaPercent) / 100), 2)),
    sellerCompanyProfit: monetary(sellerCompanyProfit),
    agentCompanyProfit: monetary(agentCompanyProfit),
    totalCaseProfit: monetary(totalCaseProfit),
  };
}

export function calculateReverseUnitPrice(agreedPrice: number, freight: number, quantityMT: number): number {
  if (!quantityMT) return 0;
  return Number(((quantityMT * agreedPrice - freight) / quantityMT).toFixed(2));
}

/** USD is the common reporting unit; missing FX is explicitly flagged for exclusion. */
export function calculateProfitBreakdownUSD(order: Order, companies: IssuerCompanyShare[] = [], supplier?: Supplier, db?: AppDatabase): ProfitBreakdown & { usdRateMissing: boolean } {
  const status = getOwnAccountRealization(db, order);
  const effective: Order = order.TradeOwnership === "own_account" ? { ...order, profitPlan: { route: order.HasSalesAgent ? "agent" : "direct", ...order.profitPlan, profitBasis: "actual", accountingOverrides: undefined } } : order;
  const native = calculateProfitBreakdown(effective, companies, supplier, db);
  if (!status.recognized) return { ...Object.fromEntries(Object.keys(native).map(key => [key, 0])) as unknown as ProfitBreakdown, usdRateMissing: getOrderProfitToUSDMultiplier(order) === null };
  const rate = getOrderProfitToUSDMultiplier(order);
  const converted = Object.fromEntries(Object.entries(native).map(([key, amount]) => [key, key === "quantityMT" ? amount : amount * (rate ?? 0)])) as unknown as ProfitBreakdown;
  return { ...converted, usdRateMissing: rate === null };
}
