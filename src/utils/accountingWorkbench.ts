import { getCaseFinancials } from "./caseFinancials";
import { AppDatabase, Order } from "../types";
import { calculateUnifiedProfit, getCaseProfitPlan, getCaseShareRecipients, getIssuerProfitCompany } from "./caseProfitEngine";
import { calculateProfitBreakdown } from "./profitCalculations";
import { getOwnAccountCapital, getOwnAccountRealization, getCentralCaseLedger, getOrderCurrency, getOrderPaymentSummary, getOrderProfitCurrency, getOrderProfitToInvoiceMultiplier, getOrderProfitToUSDMultiplier, getOrderQuantityMT } from "./orderAccounting";

export const normalizeWorkbenchSearch = (input: unknown) => String(input || "")
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
  .replace(/ي/g, "ی").replace(/ك/g, "ک")
  .replace(/[\u200c\u200e\u200f]/g, "").replace(/[‐‑‒–—−]/g, "-")
  .trim().toLocaleLowerCase();

export const matchesWorkbenchSearch = (order: Order, query: string) => {
  const content = normalizeWorkbenchSearch([order.ProformaInvoiceID, order.OrderID, order.CustomerName, order.SupplierName,
    ...(order.items || []).map(item => item.ProductName || item.ProductDescription)].join(" "));
  return normalizeWorkbenchSearch(query).split(/\s+/).filter(Boolean).every(token => content.includes(token));
};

/** One read projection; the preview never stores balances or creates parallel journal entries. */
export function getAccountingWorkbenchSnapshot(db: AppDatabase, order: Order) {
  const supplier = db.suppliers.find(item => item.SupplierID === order.SupplierID);
  const plan = getCaseProfitPlan(order, supplier);
  const unified = calculateUnifiedProfit(order, supplier, db.issuerCompanyShares, db);
  const financial = getCaseFinancials(db, order);
  const profit = financial.profit;
  const estimateOrder: Order = plan ? { ...order, profitPlan: { ...plan, profitBasis: "estimate" } } : order;
  const estimate = calculateProfitBreakdown(estimateOrder, db.issuerCompanyShares, supplier, db);
  const issuerId = getIssuerProfitCompany(order, supplier);
  // Match the central quantity reader when an Access row has no explicit unit.
  const rawQuantity = Number(order.TotalQuantity) || 0;
  const rawLineQuantity = (order.items || []).reduce((sum, item) => sum + (Number(item.Quantity) || 0), 0);
  const linesAreMT = rawQuantity >= 1000 && rawLineQuantity > 0 && Math.abs(rawLineQuantity * 1000 - rawQuantity) <= Math.max(1, rawQuantity * .01);
  return {
    order, plan, unified, profit, estimate, realization: getOwnAccountRealization(db, order), capitalPartners: getOwnAccountCapital(db, order),
    ledger: getCentralCaseLedger(db, order), payment: getOrderPaymentSummary(db, order),
    shares: financial.shares, financial,
    invoiceCurrency: getOrderCurrency(order), profitCurrency: getOrderProfitCurrency(order),
    profitToInvoice: getOrderProfitToInvoiceMultiplier(order), profitToUSD: getOrderProfitToUSDMultiplier(order),
    quantityMT: getOrderQuantityMT(order),
    implicitItemUnit: rawQuantity >= 1000 && !linesAreMT ? "KG" : "MT",
    issuerName: db.issuerCompanyShares?.find(company => company.id === issuerId)?.name || (issuerId === "arovin" ? "آروین" : issuerId === "bera" ? "براکم" : "آرکاتاو"),
    economicOwnerName: db.cashPartners.find(party => party.id === order.EconomicOwnerPartyId)?.name || "—",
  };
}

export const workbenchTransactionLabels: Record<string, string> = {
  commission_advance: "علی‌الحساب کمیسیون", commission_advance_repayment: "برگشت علی‌الحساب کمیسیون", commission_receipt: "دریافت کمیسیون",
  capital_repayment: "بازپرداخت اصل سرمایه",
  own_sale_receipt: "وصول فروش پروندهٔ ملکی", own_sale_refund: "برگشت وصول فروش ملکی",
  customer_receipt: "دریافت مشتری", supplier_payment: "پرداخت خرید", supplier_refund: "برگشت خرید",
  order_expense: "هزینه پرونده", partner_settlement: "پرداخت سهم / تسویه", customer_refund: "استرداد مشتری",
  company_loan_receipt: "قرض دریافتی شرکت", funding_repayment: "بازپرداخت منبع", arca_loan_repayment: "بازپرداخت آرکاتاو",
  credit_allocation: "استفاده از اعتبار مشتری", temporary_credit_allocation: "اعتبار امانی", temporary_credit_repayment: "بازپرداخت اعتبار امانی",
  stakeholder_fund_contribution: "واریز صاحب سهم", case_fund_transfer: "انتقال بین پرونده‌ها",
  stakeholder_case_loan: "قرض بین پرونده‌ها", stakeholder_case_loan_repayment: "بازپرداخت قرض پرونده",
};
