import { validateProfitSettlementConfirmations } from "./profitSettlementValidation";
import { ownedCompanyFor } from "./partnerIdentity";
import { AppDatabase, OrderTransaction } from "../types";
import { getOwnAccountCapital, isExcludedFromFinancialCalculations, normalizeCurrency } from "./orderAccounting";

export const isExternallyFundedPayment = (entry: OrderTransaction) => Boolean(entry.FundingPartyId) && !entry.IsFundingRepayment && ["supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(entry.TransactionType || "");
export const isFundingPrincipal = (entry: OrderTransaction) => isExternallyFundedPayment(entry) || (entry.TransactionType === "company_loan_receipt" && Boolean(entry.FundingPartyId));

/** Claims are derived from the original journal, never separately stored balances. */
export const getFundingActivity = (db: AppDatabase, includeExcluded = false) => (db.orderTransactions || [])
  .filter(isFundingPrincipal)
  .flatMap((payment) => {
    const order = db.orders.find((item) => item.OrderID === payment.OrderID);
    if (!order || (!includeExcluded && isExcludedFromFinancialCalculations(order))) return [];
    const ownerFunded = order.TradeOwnership === "own_account" && order.EconomicOwnerPartyId === payment.FundingPartyId;
    const currency = normalizeCurrency(payment.PaymentCurrency);
    const repayments = (db.orderTransactions || []).filter((entry) => entry.IsFundingRepayment && entry.LinkedTransactionID === payment.TransactionID && entry.FundingPartyId === payment.FundingPartyId && entry.OrderID === payment.OrderID && normalizeCurrency(entry.PaymentCurrency) === currency);
    const repaid = repayments.reduce((sum, entry) => sum + Number(entry.Amount || 0), 0);
    return [{ payment, order, currency, ownerFunded, repaid, outstanding: ownerFunded ? 0 : Number(payment.Amount || 0) - repaid, repayments, name: db.cashPartners.find((party) => party.id === payment.FundingPartyId)?.name || payment.FundingPartyName || payment.FundingPartyId! }];
  });

export const getFundingClaims = (db: AppDatabase, includeExcluded = false) => getFundingActivity(db, includeExcluded).filter((entry) => !entry.ownerFunded);

/** Run against the complete proposed journal, including after concurrent merges. */
export const validatePaymentFunding = (db: AppDatabase, previous?: AppDatabase): string | null => {
  for (const entity of [...(db.orders||[]),...(db.financialGroups||[])]) { const error=validateProfitSettlementConfirmations(entity.profitSettlementConfirmations); if(error)return error; }
  // Shared financial validation runs on both client saves and merged server writes.
  for (const order of db.orders || []) {
    const partners = order.profitPlan?.capitalPartners;
    if (partners && ((partners.length > 0 && order.TradeOwnership !== "own_account") || new Set(partners.map(p => p.partyId)).size !== partners.length || partners.reduce((sum, p) => sum + p.sharePercent, 0) > 100 || partners.some(p => !Number.isFinite(p.sharePercent) || p.sharePercent <= 0 || p.sharePercent > 100 || p.partyId === order.EconomicOwnerPartyId || !db.cashPartners.some(party => party.id === p.partyId && !party.isCustomer && party.category !== "customer")))) return "شریک سرمایه‌گذار و درصد سهم پرونده معتبر نیست؛ جمع درصد شرکا نباید بیشتر از صد باشد.";
    const manualShare = order.profitPlan?.manualShare;
    if (manualShare && (!Number.isFinite(manualShare.amount) || !["issuer", "arcatav", "agent"].includes(manualShare.role) || (manualShare.role === "agent" && order.profitPlan?.route !== "agent"))) return "سهم دستی یا ایجنت پرونده معتبر نیست.";
    for (const [key, amount] of Object.entries(order.profitPlan?.accountingOverrides || {})) {
      if (!Number.isFinite(amount) || (key !== "marginPerMT" && amount < 0) || (key === "quantityMT" && amount <= 0)) return `مقادیر دستی محاسبات پرونده ${order.ProformaInvoiceID || order.OrderID} معتبر نیست.`;
    }
    const override = order.profitPlan?.issuerShareOverride;
    if (override?.enabled && (!Number.isFinite(override.value) || override.value < 0 ||
      !["percent", "per_mt"].includes(override.method) ||
      (override.method === "percent" && override.value > 100) ||
      (override.weightUnit !== undefined && !["MT", "KG"].includes(override.weightUnit)))) {
      return `سهم اختصاصی شرکت در پرونده ${order.ProformaInvoiceID || order.OrderID} معتبر نیست؛ درصد بین صفر و صد یا مبلغ وزنی غیرمنفی وارد کنید.`;
    }
    for (const rate of [order.profitPlan?.profitToUSDExchangeRate, order.profitPlan?.settlementExchangeRate]) {
      if (rate !== undefined && (!Number.isFinite(rate) || rate <= 0)) return `نرخ تسعیر پرونده ${order.ProformaInvoiceID || order.OrderID} باید عدد مثبت باشد.`;
    }
  }
  const entries = db.orderTransactions || [];
  for (const capitalOrder of db.orders.filter(o => o.TradeOwnership === "own_account")) {
    if (getOwnAccountCapital(db, capitalOrder).some(p => p.returned > p.invested + .005)) return "بازپرداخت اصل سرمایه از آورده ثبت‌شده بیشتر است؛ پرداخت سود را جداگانه ثبت کنید.";
  }
  for (const entry of entries.filter(e => ["capital_repayment", "stakeholder_fund_contribution"].includes(e.TransactionType || ""))) {
    const capitalOrder = db.orders.find(o => o.OrderID === entry.OrderID);
    if (entry.TransactionType === "capital_repayment" && capitalOrder?.TradeOwnership !== "own_account") return "بازپرداخت سرمایه فقط مربوط به پرونده ملکی است.";
    if (capitalOrder?.TradeOwnership === "own_account" && (!entry.PartnerId || !db.cashPartners.some(p => p.id === entry.PartnerId))) return "صاحب سرمایه را از فهرست مشترک اشخاص و شرکت‌ها انتخاب کنید.";
  }

  for (const entry of entries.filter(e => ["own_sale_receipt", "own_sale_refund"].includes(e.TransactionType || ""))) {
    if (db.orders.find(o => o.OrderID === entry.OrderID)?.TradeOwnership !== "own_account") return "وصول فروش ملکی فقط برای پرونده با مالکیت اقتصادی شرکت‌های خودم مجاز است.";
  }
  for (const order of db.orders) {
    const prior = previous?.orders.find((item) => item.OrderID === order.OrderID);
    if (prior?.TradeOwnership === "own_account" && (order.TradeOwnership !== prior.TradeOwnership || order.EconomicOwnerPartyId !== prior.EconomicOwnerPartyId) && (previous?.orderTransactions || []).some((entry) => entry.OrderID === order.OrderID && entry.FundingPartyId)) return "این پرونده دارای اسناد تأمین وجه است؛ تغییر مالک یا نوع مالکیت، بدون اصلاح اسناد مرتبط مجاز نیست.";
    if (order.TradeOwnership !== "own_account") continue;
    if (!order.EconomicOwnerPartyId || !db.cashPartners?.some((party) => party.id === order.EconomicOwnerPartyId && ownedCompanyFor(party.name))) return "مالک اقتصادی فقط می‌تواند آرکاتاو، آروین یا براکم باشد.";
    if (entries.some((entry) => (entry.OrderID === order.OrderID || entry.SourceOrderID === order.OrderID) && (!entry.TransactionType || ["customer_receipt", "customer_refund", "credit_allocation", "temporary_credit_allocation", "temporary_credit_repayment"].includes(entry.TransactionType)))) return "پروندهٔ شخصی نمی‌تواند دریافت، عودت یا اعتبار مشتری داشته باشد؛ ابتدا اسناد قبلی را با منبع واقعی تطبیق دهید.";
  }
  for (const entry of entries) {
    if (!entry.FundingPartyId && !entry.IsFundingRepayment && entry.TransactionType !== "funding_repayment" && entry.TransactionType !== "company_loan_receipt") continue;
    if (entries.filter((item) => item.TransactionID === entry.TransactionID).length !== 1) return "شماره سند مالی تکراری است.";
    if (!db.orders.some((order) => order.OrderID === entry.OrderID)) return "پرونده سند تأمین وجه پیدا نشد.";
    if (!entry.FundingPartyId || !db.cashPartners?.some((party) => party.id === entry.FundingPartyId)) return "منبع پرداخت باید به شخص یا شرکت مشخص متصل باشد.";
    if (!Number.isFinite(entry.Amount) || entry.Amount <= 0 || !Number.isFinite(entry.Exchange_Rate) || entry.Exchange_Rate <= 0 || !entry.PaymentCurrency) return "مبلغ، ارز یا نرخ سند تأمین وجه معتبر نیست.";
    if (!Number.isFinite(entry.ConvertedAmount) || Math.abs(entry.ConvertedAmount! - entry.Amount * entry.Exchange_Rate) > 0.01) return "معادل سند با مبلغ و نرخ تبدیل یکسان نیست.";
    const order = db.orders.find((item) => item.OrderID === entry.OrderID)!;
    const fromOwner = order.TradeOwnership === "own_account" && order.EconomicOwnerPartyId === entry.FundingPartyId;
    if (fromOwner && (entry.TransactionType === "company_loan_receipt" || entry.IsFundingRepayment)) return "تأمین از منابع خود مالک قرض نیست؛ پرداخت فروشنده یا هزینه را با منبع مالک ثبت کنید.";
    if (entry.IsFundingRepayment || entry.TransactionType === "funding_repayment") {
      const loan = entries.find((item) => item.TransactionID === entry.LinkedTransactionID);
      if (!entry.IsFundingRepayment || entry.TransactionType !== "funding_repayment" || !loan || !isFundingPrincipal(loan) || loan.OrderID !== entry.OrderID || loan.FundingPartyId !== entry.FundingPartyId || normalizeCurrency(loan.PaymentCurrency) !== normalizeCurrency(entry.PaymentCurrency) || entry.FundingSource !== "buyer_funds") return "بازپرداخت باید با همان منبع، پرونده و ارز به سند تأمین وجه متصل باشد.";
    } else if (!isFundingPrincipal(entry) || entry.FundingSource !== "other") return "منبع مشخص فقط برای تأمین وجه بابت پرونده قابل ثبت است.";
    if (entry.TransactionType === "company_loan_receipt" && !db.cashPartners.find((party) => party.id === entry.FundingPartyId)?.fundingCompany) return "برای قرض شرکتی، منبع را به دفتر آرکاتاو، براکم یا آروین متصل کنید.";
  }
  if (getFundingClaims(db, true).some((claim) => claim.outstanding < -0.005)) return "بازپرداخت از اصل بدهی به منبع بیشتر است؛ ابتدا اسناد مرتبط را اصلاح کنید.";
  return null;
};

/** The company view projects the same journal; no duplicate company postings. */
export const getCompanyFundingMovements = (db: AppDatabase) => getFundingActivity(db).flatMap((claim) => {
  const company = db.cashPartners.find((party) => party.id === claim.payment.FundingPartyId)?.fundingCompany;
  if (!company) return [];
  return [
    { id: `case-funding-${claim.payment.TransactionID}`, company, type: "payment" as const, amount: claim.payment.Amount, currency: claim.currency, date: claim.payment.PaytDate, description: `${claim.ownerFunded ? "پرداخت از منابع خود مالک" : "قرض / تأمین وجه"} ${claim.order.ProformaInvoiceID}`, reference: `#${claim.payment.TransactionID}`, orderId: claim.order.OrderID },
    ...claim.repayments.map((entry) => ({ id: `case-funding-${entry.TransactionID}`, company, type: "receipt" as const, amount: entry.Amount, currency: claim.currency, date: entry.PaytDate, description: `بازپرداخت قرض ${claim.order.ProformaInvoiceID}`, reference: `#${entry.TransactionID} ← #${claim.payment.TransactionID}`, orderId: claim.order.OrderID })),
  ];
});
