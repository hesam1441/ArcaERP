import { normalizePartnerName } from "./partnerIdentity";
import { AppDatabase, Order, OrderTransaction } from "../types";

export const normalizeCurrency = (value?: string) => {
  const currency = (value || "USD").trim().toUpperCase();
  if (currency === "$" || currency === "US$" || currency === "USD/MT") return "USD";
  if (currency === "€" || currency === "EUR/MT") return "EUR";
  return currency || "USD";
};

export const getOrderCurrency = (order?: Order) => normalizeCurrency(order?.InvoiceCurrency || order?.TransactionCurrency || "USD");

/**
 * Profit is calculated in the currency in which the case prices were agreed.
 * A printed PI can use another invoice currency, but that must not silently
 * convert the underlying buy/sell/margin figures.
 */
export const getOrderProfitCurrency = (order?: Order) => normalizeCurrency(order?.AgreementCurrency || order?.ScCurrency || order?.TransactionCurrency || order?.InvoiceCurrency || "USD");

/** Dummy proformas are records only: never include them in financial or statistical aggregates. */
export const isExcludedFromFinancialCalculations = (order?: Pick<Order, "IsDummy" | "ExcludeFromCalculations">) => Boolean(order?.IsDummy || order?.ExcludeFromCalculations);

/** New forms store MT; legacy Access imports may store KG. */
export const getOrderQuantityMT = (order: Pick<Order, "TotalQuantity" | "items">) => {
  if (order.items?.length) {
    const rawOrderQuantity = Number(order.TotalQuantity) || 0;
    const rawLineQuantity = order.items.reduce((sum, item) => sum + (Number(item.Quantity) || 0), 0);
    // بعضی پرونده‌های Access وزن کل را KG و ردیف‌های کالا را MT ذخیره کرده‌اند
    // (مثلاً 43,200 در سربرگ و 43.2 در اقلام). در این حالت نباید اقلام دوباره
    // بر 1000 تقسیم شوند؛ وگرنه تمام هزینه‌ها و سود هزار برابر نادرست می‌شوند.
    const linesAreMT = rawOrderQuantity >= 1000 && rawLineQuantity > 0 && Math.abs(rawLineQuantity * 1000 - rawOrderQuantity) <= Math.max(1, rawOrderQuantity * 0.01);
    return order.items.reduce((sum, item) => {
      const quantity = Number(item.Quantity) || 0;
      if (item.QuantityUnit === "KG") return sum + quantity / 1000;
      if (item.QuantityUnit === "MT") return sum + quantity;
      return sum + (linesAreMT ? quantity : getOrderItemQuantityMT(order, item));
    }, 0);
  }
  const rawQuantity = Number(order.TotalQuantity) || 0;
  return rawQuantity >= 1000 ? rawQuantity / 1000 : rawQuantity;
};

export const getOrderItemQuantityMT = (order: Pick<Order, "TotalQuantity">, item: { Quantity?: number }) => {
  const quantity = Number(item.Quantity) || 0;
  if ((item as { QuantityUnit?: string }).QuantityUnit === "KG") return quantity / 1000;
  if ((item as { QuantityUnit?: string }).QuantityUnit === "MT") return quantity;
  // Imported legacy orders keep both order and line quantities in KG.
  return Number(order.TotalQuantity) >= 1000 ? quantity / 1000 : quantity;
};

/** A record may remain visible for repair, but incomplete records must not affect financial or statistical totals. */
export const hasCompleteCalculationData = (order: Order) => {
  if (isExcludedFromFinancialCalculations(order) || !order.PIDate || !order.CustomerID || !order.SupplierID) return false;
  if (getOrderQuantityMT(order) <= 0) return false;
  if (!order.items?.length || order.items.some((item) => !item.ProductID || !Number(item.Quantity) || !Number(item.UnitPrice))) return false;
  const costPrice = Number(order.CostPrice || order.CFRNet || order.NetFob) || 0;
  const priceToAgent = Number(order.PriceToAgent || order.SellPrice) || 0;
  const endCustomerPrice = Number(order.EndCustomerPrice || order.SellPrice) || 0;
  return costPrice > 0 && priceToAgent > 0 && endCustomerPrice > 0;
};

/** Agreement amounts must never be recovered from an already converted total. */
export const getOrderAgreementTotal = (order: Order) => order.items?.length
  ? order.items.reduce((sum, item) => sum + (Number(item.Quantity) || 0) * (Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0), 0)
  : getOrderQuantityMT(order) * (Number(order.SellPrice) || 0);

/** Uses exactly the same line price and FX as the issued commercial document. */
export const getOrderCommercialLineTotal = (order: Order, item: NonNullable<Order["items"]>[number]) => {
  const unitPrice = item.UseManualInvoicePrice ? Number(item.InvoiceUnitPrice ?? item.UnitEx) || 0
    : (Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0) * getOrderInvoiceConversionMultiplier(order);
  return (Number(item.Quantity) || 0) * unitPrice;
};
export const getOrderCommercialLineTotalUSD = (order: Order, item: NonNullable<Order["items"]>[number]): number | null => {
  const rate = getOrderInvoiceToUSDMultiplier(order);
  return rate === null ? null : getOrderCommercialLineTotal(order, item) * rate;
};

export const getOrderCommercialTotal = (order: Order) => {
  // Line inputs are authoritative. Historical converted totals may have been
  // multiplied repeatedly when the exchange-rate controls were changed.
  if (order.items?.length) {
    return order.items.reduce((sum, item) => sum + getOrderCommercialLineTotal(order, item), 0);
  }
  // مبلغ این تابع در همهٔ صفحات مالی با «ارز صدور پروفرما» نمایش داده می‌شود.
  // در پرونده‌های تسعیرشده، جمع اقلام پایه ممکن است هنوز به ارز توافق (مثلاً USD)
  // باشد؛ بنابراین مبلغ تبدیل‌شدهٔ ذخیره‌شده، مرجع صحیح برای فاکتور AED/EUR است.
  const invoiceCurrency = normalizeCurrency(order.InvoiceCurrency || order.TransactionCurrency);
  // ConvertedTotalAmount is populated by the currency-conversion screen and is
  // already expressed in the invoice currency.  Some legacy records keep the
  // agreement currency equal to InvoiceCurrency, so do not use that comparison
  // to discard an explicitly converted invoice total.
  if (Boolean(order.IsExchangeRateUsed) && Number(order.ConvertedTotalAmount) > 0) {
    return Number(order.ConvertedTotalAmount);
  }
  const lineTotal = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.ExtPrice) || (Number(item.Quantity) || 0) * (Number(item.UnitPrice) || 0)),
    0
  );
  const baseTotal = lineTotal > 0 ? lineTotal : getOrderQuantityMT(order) * (Number(order.SellPrice) || 0);
  return baseTotal * getOrderInvoiceConversionMultiplier(order);
};

/** Multiplier from the agreement currency to the currency printed on the proforma. */
export const getOrderInvoiceConversionMultiplier = (order: Order) => {
  const agreementCurrency = normalizeCurrency(order.AgreementCurrency || order.ScCurrency || order.InvoiceCurrency || order.TransactionCurrency);
  const invoiceCurrency = getOrderCurrency(order);
  if (agreementCurrency === invoiceCurrency) return 1;
  const explicitRate = Number(order.ExchangeRateApplied);
  if (Boolean(order.IsExchangeRateUsed) && explicitRate > 0) return explicitRate;
  const legacyRate = Number(order.ExchangeRate);
  if (!(legacyRate > 0)) return 1;
  const pair = String(order.TypeOfEXRate || "").toUpperCase().replace(/\s/g, "");
  // نمونهٔ قدیمی AED/USD با نرخ 0.27248 یعنی هر AED برابر 0.27248 USD است؛
  // پس برای نمایش مبلغ پایهٔ USD در AED باید مبلغ بر نرخ تقسیم شود.
  if (pair === `${invoiceCurrency}/${agreementCurrency}`) return 1 / legacyRate;
  if (pair === `${agreementCurrency}/${invoiceCurrency}`) return legacyRate;
  return 1;
};

/** Settlement FX is independent of the rate printed on the commercial document. */
export const getOrderProfitToInvoiceMultiplier = (order: Order) => {
  if (getOrderProfitCurrency(order) === getOrderCurrency(order)) return 1;
  const explicit = Number(order.profitPlan?.settlementExchangeRate);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : getOrderInvoiceConversionMultiplier(order);
};

/**
 * Multiplier from the currency printed on a proforma to USD.
 * Returns null when the historical USD rate was never recorded; callers must
 * then show the case separately instead of silently mixing currencies.
 */
export const getOrderInvoiceToUSDMultiplier = (order: Order): number | null => {
  const invoiceCurrency = getOrderCurrency(order);
  if (invoiceCurrency === "USD") return 1;
  const agreementCurrency = normalizeCurrency(order.AgreementCurrency || order.ScCurrency || order.InvoiceCurrency || order.TransactionCurrency);
  // If agreement was USD, the existing invoice multiplier already gives us an
  // exact inverse path from invoice currency back to USD.
  if (agreementCurrency === "USD") {
    const pair = String(order.TypeOfEXRate || "").toUpperCase().replace(/\s/g, "");
    const hasExplicitRate = Boolean(order.IsExchangeRateUsed) && Number(order.ExchangeRateApplied) > 0;
    const hasLegacyRate = Number(order.ExchangeRate) > 0 && [ `${invoiceCurrency}/USD`, `USD/${invoiceCurrency}` ].includes(pair);
    if (!hasExplicitRate && !hasLegacyRate) return null;
    const invoiceMultiplier = getOrderInvoiceConversionMultiplier(order);
    return invoiceMultiplier > 0 ? 1 / invoiceMultiplier : null;
  }
  const legacyRate = Number(order.ExchangeRate || order.ExchangeRateApplied);
  const pair = String(order.TypeOfEXRate || "").toUpperCase().replace(/\s/g, "");
  // Legacy pairs store the right-hand currency per one unit of the left-hand
  // currency: EUR/USD=1.18 means 1 EUR equals 1.18 USD; AED/USD=.272 means
  // 1 AED equals .272 USD.
  if (legacyRate > 0 && pair === `${invoiceCurrency}/USD`) return legacyRate;
  if (legacyRate > 0 && pair === `USD/${invoiceCurrency}`) return 1 / legacyRate;
  return null;
};

export const getOrderProfitToUSDMultiplier = (order: Order): number | null => {
  if (getOrderProfitCurrency(order) === "USD") return 1;
  const explicit = Number(order.profitPlan?.profitToUSDExchangeRate);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const invoiceUSD = getOrderInvoiceToUSDMultiplier(order);
  return invoiceUSD === null ? null : getOrderProfitToInvoiceMultiplier(order) * invoiceUSD;
};

export const getOrderCommercialTotalUSD = (order: Order): number | null => {
  const multiplier = getOrderInvoiceToUSDMultiplier(order);
  return multiplier === null ? null : getOrderCommercialTotal(order) * multiplier;
};

export const convertedTransactionAmount = (transaction: OrderTransaction) => {
  if (transaction.ConvertedAmount != null && String(transaction.ConvertedAmount) !== "" && Number.isFinite(Number(transaction.ConvertedAmount))) return Number(transaction.ConvertedAmount) || 0;
  return (Number(transaction.Amount) || 0) * (Number(transaction.Exchange_Rate) || 1);
};

/** Amount expressed in the related proforma's currency, for case balances. */
export const transactionAmountInOrderCurrency = (order: Order, transaction: OrderTransaction) => {
  const amount = Number(transaction.Amount) || 0;
  const paymentCurrency = normalizeCurrency(transaction.PaymentCurrency || transaction.ProformaCurrency || getOrderCurrency(order));
  const orderCurrency = getOrderCurrency(order);
  // When the money was received in the PI currency, Amount is already the
  // correct ledger value. ConvertedAmount may instead be a reporting USD
  // equivalent and must never be summed into an AED/EUR PI balance.
  if (paymentCurrency === orderCurrency) return amount;
  if (transaction.ConvertedAmount != null && String(transaction.ConvertedAmount) !== "" && Number.isFinite(Number(transaction.ConvertedAmount))) return Number(transaction.ConvertedAmount) || 0;
  return amount * (Number(transaction.Exchange_Rate) || 1);
};

/**
 * Old purchase-ledger rows used to live only inside an order form. Project
 * them into the central journal so historic supplier payments and refunds
 * participate in exactly the same balances and reports as new transactions.
 */
const legacyPurchasePostings = (order: Order): OrderTransaction[] => (order.purchaseProforma?.ledger || []).map((entry, index) => {
  const type: OrderTransaction["TransactionType"] = entry.type === "supplier_payment" ? "supplier_payment"
    : entry.type === "case_expense" ? "order_expense"
      : "supplier_refund";
  const stableId = -Math.abs(Array.from(`${order.OrderID}:${entry.id || index}`).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0) || index + 1);
  return {
    TransactionID: stableId,
    JournalID: `legacy-purchase-${order.OrderID}-${entry.id || index}`,
    OrderID: order.OrderID,
    Amount: Number(entry.amount) || 0,
    ConvertedAmount: Number(entry.amount) || 0,
    Exchange_Rate: 1,
    PaytDate: entry.date || "",
    PaymentCurrency: entry.currency || getOrderCurrency(order),
    ProformaCurrency: getOrderCurrency(order),
    TransactionType: type,
    Counterparty: order.purchaseProforma?.supplierName || order.SupplierName,
    Description: entry.description || "",
    Slip: entry.reference,
    Note: "ثبت قدیمیِ دفتر خرید؛ در دفتر مرکزی خوانده می‌شود.",
    FundingSource: "other",
    IsDerivedLegacyPosting: true,
  };
});

/** Historical commission settlements remain one source record, projected into cash without changing profit. */
const commissionPostings = (db: AppDatabase, order: Order): OrderTransaction[] => (order.commissionSettlements || []).flatMap((entry, index) => {
  if (entry.type === "advance_offset") return []; // Non-cash use of an already paid advance.
  const native = getOrderAmountInProfitCurrency(order, Number(entry.amount || 0), entry.currency);
  if (native === null) return [];
  const converted = native * getOrderProfitToInvoiceMultiplier(order);
  return [{ TransactionID: -Math.abs(Array.from(`commission:${order.OrderID}:${entry.id || index}`).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0) || index + 1),
    JournalID: `commission:${order.OrderID}:${entry.id}`, OrderID: order.OrderID,
    TransactionType: entry.type === "paid" ? "partner_settlement" : entry.type === "advance" ? "commission_advance" : entry.type === "advance_repayment" ? "commission_advance_repayment" : "commission_receipt",
    Amount: Number(entry.amount || 0), ConvertedAmount: converted, Exchange_Rate: Number(entry.amount) ? converted / Number(entry.amount) : 1,
    PaymentCurrency: entry.currency, ProformaCurrency: getOrderCurrency(order), PaytDate: entry.date,
    PartnerId: entry.partyId || db.cashPartners?.find(p => [p.name, p.nameEn, ...(p.aliases || [])].some(name => normalizePartnerName(name) === normalizePartnerName(entry.partyName)))?.id, Counterparty: entry.partyName, Description: entry.note || "تسویه ذی‌نفع", Note: "ثبت مشترک تسویه؛ ویرایش از دفتر کمیسیون", IsDerivedLegacyPosting: true }];
});

export const isCaseCashOutgoing = (entry: OrderTransaction) => ["commission_advance", "capital_repayment", "own_sale_refund", "supplier_payment", "order_expense", "partner_settlement", "customer_refund", "funding_repayment", "arca_loan_repayment", "stakeholder_case_loan_repayment", "temporary_credit_repayment"].includes(entry.TransactionType || "");
export const isCaseCashIncoming = (entry: OrderTransaction) => !entry.TransactionType || ["customer_receipt", "own_sale_receipt", "credit_allocation", "temporary_credit_allocation", "case_fund_transfer", "company_loan_receipt", "supplier_refund", "stakeholder_fund_contribution", "commission_advance_repayment", "commission_receipt"].includes(entry.TransactionType || "");

/** The central journal and its visible running balance use this exact movement. */
export function getCaseCashMovement(db: AppDatabase, order: Order, entry: OrderTransaction) {
  if (entry.OrderID !== order.OrderID) {
    if (entry.SourceOrderID === order.OrderID && entry.TransactionType === "case_fund_transfer") return { incoming: 0, outgoing: Number(entry.SourceAmount) || transactionAmountInOrderCurrency(order, entry) };
    if (entry.SourceOrderID === order.OrderID && entry.TransactionType === "temporary_credit_repayment") return { incoming: Number(entry.SourceAmount) || convertedTransactionAmount(entry), outgoing: 0 };
    return { incoming: 0, outgoing: 0 };
  }
  const amount = entry.TransactionType === "temporary_credit_repayment" ? temporaryCreditRepaymentTargetAmount(db, entry) : transactionAmountInOrderCurrency(order, entry);
  const funding = entry.FundingPartyId && !entry.IsFundingRepayment && ["supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(entry.TransactionType || "") ? amount : 0;
  return { incoming: (isCaseCashIncoming(entry) ? amount : 0) + funding, outgoing: isCaseCashOutgoing(entry) ? amount : 0 };
}

/**
 * Single source of truth for a case's financial position.
 *
 * Every screen must derive its balances from orderTransactions through this
 * function. No UI is allowed to persist a calculated balance. This mirrors an
 * accounting query: one journal, many reports.
 */
export const getCentralCaseLedger = (db: AppDatabase, order: Order) => {
  const posted = db.orderTransactions || [];
  const derived = [...legacyPurchasePostings(order), ...commissionPostings(db, order)].filter(entry => !posted.some(item => item.JournalID && item.JournalID === entry.JournalID));
  const all = [...posted, ...derived];
  const relatedEntries = all.filter((entry) => entry.OrderID === order.OrderID || entry.SourceOrderID === order.OrderID);
  const targetEntries = all.filter((entry) => entry.OrderID === order.OrderID);
  const amount = (entry: OrderTransaction) => transactionAmountInOrderCurrency(order, entry);
  const sum = (entries: OrderTransaction[]) => entries.reduce((total, entry) => total + amount(entry), 0);
  const isOperationalOut = isCaseCashOutgoing;
  const customerReceipts = sum(targetEntries.filter((entry) => !entry.TransactionType || entry.TransactionType === "customer_receipt"));
  const creditApplied = sum(targetEntries.filter((entry) => entry.TransactionType === "credit_allocation" || entry.TransactionType === "temporary_credit_allocation"));
  const caseFundReceived = sum(targetEntries.filter((entry) => entry.TransactionType === "case_fund_transfer"));
  const caseFundSent = relatedEntries.filter((entry) => entry.TransactionType === "case_fund_transfer" && entry.SourceOrderID === order.OrderID)
    .reduce((total, entry) => total + (Number(entry.SourceAmount) || amount(entry)), 0);
  const operationalPayments = targetEntries.reduce((total, entry) => total + getCaseCashMovement(db, order, entry).outgoing, 0);
  const stakeholderFundContributions = sum(targetEntries.filter((entry) => entry.TransactionType === "stakeholder_fund_contribution"));
  const caseFundBalance = stakeholderFundContributions + caseFundReceived - caseFundSent;
  const stakeholderLoansGiven = relatedEntries.filter((entry) => entry.TransactionType === "stakeholder_case_loan" && entry.SourceOrderID === order.OrderID);
  const stakeholderLoansReceived = targetEntries.filter((entry) => entry.TransactionType === "stakeholder_case_loan");
  const repaymentFor = (loan: OrderTransaction) => sum(all.filter((entry) => entry.TransactionType === "stakeholder_case_loan_repayment" && entry.LinkedTransactionID === loan.TransactionID));
  const stakeholderReceivable = stakeholderLoansGiven.reduce((total, loan) => total + Math.max(0, amount(loan) - repaymentFor(loan)), 0);
  const stakeholderDebt = stakeholderLoansReceived.reduce((total, loan) => total + Math.max(0, amount(loan) - repaymentFor(loan)), 0);
  const otherCaseReceipts = sum(targetEntries.filter((entry) => ["supplier_refund", "commission_advance_repayment", "commission_receipt"].includes(entry.TransactionType || "")));
  const externalFunding = sum(targetEntries.filter((entry) => entry.FundingPartyId && !entry.IsFundingRepayment && ["supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(entry.TransactionType || "")));
  const ownerCapitalReceipts = sum(targetEntries.filter(entry => order.TradeOwnership === "own_account" && entry.TransactionType === "stakeholder_fund_contribution" && entry.PartnerId === order.EconomicOwnerPartyId));
  const ownerFunding = ownerCapitalReceipts + sum(targetEntries.filter((entry) => order.TradeOwnership === "own_account" && entry.FundingPartyId === order.EconomicOwnerPartyId && !entry.IsFundingRepayment && ["supplier_payment", "order_expense", "partner_settlement"].includes(entry.TransactionType || "")));
  const companyLoanReceipts = sum(targetEntries.filter((entry) => entry.TransactionType === "company_loan_receipt"));
  const fundingRepaid = sum(targetEntries.filter((entry) => entry.IsFundingRepayment));
  // Outstanding principal at the original posting rate; repayment FX must not
  // change the lender's original-currency claim.
  const fundingDebt = targetEntries.filter((entry) => entry.FundingPartyId && !entry.IsFundingRepayment && !(order.TradeOwnership === "own_account" && order.EconomicOwnerPartyId === entry.FundingPartyId) && ["company_loan_receipt", "supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(entry.TransactionType || ""))
    .reduce((total, loan) => {
      const repaid = targetEntries.filter((entry) => entry.IsFundingRepayment && entry.LinkedTransactionID === loan.TransactionID).reduce((value, entry) => value + Number(entry.Amount || 0), 0);
      return total + amount(loan) * Math.max(0, 1 - repaid / Number(loan.Amount || 1));
    }, 0);
  const ownSaleReceipts = sum(targetEntries.filter(entry => entry.TransactionType === "own_sale_receipt"));
  const caseCashIn = relatedEntries.reduce((total, entry) => total + getCaseCashMovement(db, order, entry).incoming, 0);
  const caseCashOut = relatedEntries.reduce((total, entry) => total + getCaseCashMovement(db, order, entry).outgoing, 0);
  const caseCashBalance = caseCashIn - caseCashOut;
  return { ownerFunding, companyLoanReceipts, externalFunding, fundingRepaid, fundingDebt, caseCashOut, relatedEntries, customerReceipts, creditApplied, caseFundReceived, caseFundSent, operationalPayments, otherCaseReceipts, stakeholderFundContributions, caseFundBalance, stakeholderLoansGiven, stakeholderLoansReceived, stakeholderReceivable, stakeholderDebt, caseCashIn, caseCashBalance };
};

/** A temporary credit repayment restores the source amount and reverses the linked target credit at its original rate. */
export function temporaryCreditRepaymentTargetAmount(db: AppDatabase, entry: OrderTransaction) {
  const allocation = (db.orderTransactions || []).find(item => item.TransactionID === entry.LinkedTransactionID);
  const target = allocation && db.orders.find(order => order.OrderID === allocation.OrderID);
  const sourceAmount = Number(entry.SourceAmount) || convertedTransactionAmount(entry);
  const allocatedSource = Number(allocation?.SourceAmount) || Number(allocation?.Amount) || 0;
  return target && allocation && allocatedSource > 0 ? sourceAmount * transactionAmountInOrderCurrency(target, allocation) / allocatedSource : Number(entry.Amount) || 0;
}

/**
 * The canonical accounting position of one proforma/case.
 *
 * Screens must consume this object rather than independently deciding whether
 * an entry changes a receivable, case funding, cash, or a stakeholder debt.
 * The customer receivable and the funding need are intentionally separate:
 * funding from another case settles the latter while preserving the former.
 */
export const getCaseAccountingPosition = (db: AppDatabase, order: Order) => {
  const ledger = getCentralCaseLedger(db, order);
  const invoiceTotal = getOrderCommercialTotal(order);
  const refunded = ledger.relatedEntries.filter(entry => entry.OrderID === order.OrderID && entry.TransactionType === "customer_refund").reduce((sum, entry) => sum + transactionAmountInOrderCurrency(order, entry), 0);
  const repaidCredit = ledger.relatedEntries.filter(entry => entry.OrderID === order.OrderID && entry.TransactionType === "temporary_credit_repayment").reduce((sum, entry) => sum + temporaryCreditRepaymentTargetAmount(db, entry), 0);
  const customerPayments = ledger.customerReceipts - refunded;
  const customerCredits = ledger.creditApplied - repaidCredit;
  const interCaseFunding = ledger.caseFundReceived;
  const customerReceivable = order.TradeOwnership === "own_account" ? 0 : Math.max(0, invoiceTotal - customerPayments - customerCredits);
  const fundedAmount = customerPayments + customerCredits + interCaseFunding + ledger.externalFunding + ledger.companyLoanReceipts;
  // An own-account PI is a documentary value, not a customer cash obligation.
  const fundingOutstanding = order.TradeOwnership === "own_account" ? Math.max(0, -ledger.caseCashBalance) : Math.max(0, invoiceTotal - fundedAmount);
  return {
    ...ledger,
    invoiceTotal,
    customerPayments,
    customerCredits,
    interCaseFunding,
    customerReceivable,
    fundedAmount,
    fundingOutstanding,
  };
};

export const getOrderPaymentSummary = (db: AppDatabase, order: Order) => {
  const transactions = db.orderTransactions || [];
  // A transfer into a case finances that case and therefore reduces its
  // outstanding funding requirement. It remains separately exposed as a
  // stakeholder/case liability; it must never be mistaken for customer cash.
  const position = getCaseAccountingPosition(db, order);
  const incoming = transactions.filter((item) => item.OrderID === order.OrderID &&
    (!item.TransactionType || item.TransactionType === "customer_receipt" || item.TransactionType === "credit_allocation" || item.TransactionType === "temporary_credit_allocation"));
  const directReceipts = incoming.filter((item) => !item.TransactionType || item.TransactionType === "customer_receipt")
    .reduce((sum, item) => sum + transactionAmountInOrderCurrency(order, item), 0);
  const allocatedIn = incoming.filter((item) => item.TransactionType === "credit_allocation" || item.TransactionType === "temporary_credit_allocation")
    .reduce((sum, item) => sum + transactionAmountInOrderCurrency(order, item), 0);
  const fundingApplied = position.interCaseFunding;
  const customerOutstanding = position.customerReceivable;
  const applied = position.fundedAmount;
  const invoiceTotal = position.invoiceTotal;
  // Financing paid by a third party never becomes the customer's spendable credit.
  const generatedCredit = order.TradeOwnership === "own_account" ? 0 : Math.max(0, position.customerPayments + position.customerCredits - invoiceTotal);
  const allocatedOut = transactions.filter((item) => (item.TransactionType === "credit_allocation" || item.TransactionType === "temporary_credit_allocation") && item.SourceOrderID === order.OrderID)
    .reduce((sum, item) => sum + (Number(item.SourceAmount) || Number(item.Amount) || 0), 0);
  const temporaryRestored = transactions.filter((item) => item.TransactionType === "temporary_credit_repayment" && item.SourceOrderID === order.OrderID)
    .reduce((sum, item) => sum + (Number(item.SourceAmount) || convertedTransactionAmount(item)), 0);
  const refunded = transactions.filter((item) => item.TransactionType === "customer_refund" && item.OrderID === order.OrderID)
    .reduce((sum, item) => sum + transactionAmountInOrderCurrency(order, item), 0);
  const availableCredit = Math.max(0, generatedCredit - allocatedOut + temporaryRestored);
  const outstanding = position.fundingOutstanding;
  const temporaryDebt = transactions.filter((item) => item.TransactionType === "temporary_credit_allocation" && item.OrderID === order.OrderID)
    .reduce((sum, allocation) => {
      const repaid = transactions.filter((item) => item.TransactionType === "temporary_credit_repayment" && item.LinkedTransactionID === allocation.TransactionID)
        .reduce((total, item) => total + (Number(item.SourceAmount) || convertedTransactionAmount(item)), 0);
      const sourceOutstanding = Math.max(0, (Number(allocation.SourceAmount) || Number(allocation.Amount) || 0) - repaid);
      const targetPerSource = (Number(allocation.ConvertedAmount) || 0) / (Number(allocation.SourceAmount) || Number(allocation.Amount) || 1);
      return sum + sourceOutstanding * targetPerSource;
    }, 0);
  const stakeholderLoanDebt = position.stakeholderDebt;
  const status = outstanding > 0.005 ? "debtor" : temporaryDebt > 0.005 || position.fundingDebt > 0.005 ? "temporary_debt" : availableCredit > 0.005 ? "creditor" : "settled";
  const customerStatus = customerOutstanding > .005 ? "debtor" : availableCredit > .005 ? "creditor" : "settled";
  return { customerStatus, ownerFunding: position.ownerFunding, ownAccount: order.TradeOwnership === "own_account", companyLoanReceipts: position.companyLoanReceipts, fundingDebt: position.fundingDebt, invoiceTotal, directReceipts, allocatedIn, fundingApplied, customerOutstanding, applied, outstanding, generatedCredit, allocatedOut, temporaryRestored, refunded, availableCredit, temporaryDebt, caseFundReceived: position.caseFundReceived, caseFundSent: position.caseFundSent, stakeholderLoanDebt, caseCashIn: position.caseCashIn, operationalOut: position.operationalPayments, caseCashBalance: position.caseCashBalance, status };
};

/** Convert a recorded amount only when its currency has a documented USD path. */
export const getOrderAmountInUSD = (order: Order, amount: number, currency = getOrderProfitCurrency(order)): number | null => {
  const source = normalizeCurrency(currency);
  if (source === "USD") return amount;
  const profitUSD = getOrderProfitToUSDMultiplier(order);
  if (source === getOrderProfitCurrency(order)) return profitUSD === null ? null : amount * profitUSD;
  if (source === getOrderCurrency(order)) return profitUSD === null ? null : amount * profitUSD / getOrderProfitToInvoiceMultiplier(order);
  return null;
};

/** Convert only along the case's documented invoice/profit/USD paths. */
export function getOrderAmountInProfitCurrency(order: Order, amount: number, currency = getOrderProfitCurrency(order)): number | null {
  const source = normalizeCurrency(currency);
  if (source === getOrderProfitCurrency(order)) return amount;
  if (source === getOrderCurrency(order)) return amount / getOrderProfitToInvoiceMultiplier(order);
  const usd = getOrderAmountInUSD(order, amount, source);
  const rate = getOrderProfitToUSDMultiplier(order);
  return usd === null || rate === null || rate <= 0 ? null : usd / rate;
}

/** Recognition is based on actual sale collections, never PI prices or company financing. */
export function getOwnAccountRealization(db: AppDatabase | undefined, order: Order) {
  const entries = db ? getCentralCaseLedger(db, order).relatedEntries.filter(e => e.OrderID === order.OrderID) : [];
  const sum = (types: string[]) => entries.filter(e => types.includes(e.TransactionType || "")).reduce((total, entry) => total + transactionAmountInOrderCurrency(order, entry), 0);
  const collected = sum(["own_sale_receipt"]) - sum(["own_sale_refund"]);
  const capital = sum(["supplier_payment", "order_expense"]) - sum(["supplier_refund"]);
  const result = collected - capital;
  const recognized = order.TradeOwnership !== "own_account" || (!!db && !isExcludedFromFinancialCalculations(order) && ((capital > .005 && result > .005) || (order.OwnAccountSaleSettled === true && (capital > .005 || collected > .005))));
  return { collected, capital, result, recognized, awaitingRealization: order.TradeOwnership === "own_account" && !recognized };
}

/** Original actual capital sets the partnership ratio; returning it is not an expense. */
export function getOwnAccountCapital(db: AppDatabase | undefined, order: Order) {
  const capital = new Map<string, number>();
  const returned = new Map<string, number>();
  const profitPaid = new Map<string, number>();
  if (!db || order.TradeOwnership !== "own_account") return [];
  const add = (map: Map<string, number>, id: string | undefined, amount: number) => { if (id) map.set(id, (map.get(id) || 0) + amount); };
  for (const entry of getCentralCaseLedger(db, order).relatedEntries.filter(e => e.OrderID === order.OrderID)) {
    const amount = transactionAmountInOrderCurrency(order, entry);
    if (entry.TransactionType === "stakeholder_fund_contribution") add(capital, entry.PartnerId, amount);
    if (["supplier_payment", "order_expense"].includes(entry.TransactionType || "") && entry.FundingPartyId === order.EconomicOwnerPartyId && !entry.IsFundingRepayment) add(capital, order.EconomicOwnerPartyId, amount);
    if (entry.TransactionType === "capital_repayment") add(returned, entry.PartnerId, amount);
    if (entry.TransactionType === "partner_settlement") add(profitPaid, entry.PartnerId, amount);
  }
  returned.forEach((_, id) => { if (!capital.has(id)) capital.set(id, 0); });
  const total = [...capital.values()].reduce((sum, amount) => sum + amount, 0);
  const agreed = order.profitPlan?.capitalPartners;
  if (agreed) {
    agreed.forEach(p => { if (!capital.has(p.partyId)) capital.set(p.partyId, 0); });
    if (order.EconomicOwnerPartyId && !capital.has(order.EconomicOwnerPartyId)) capital.set(order.EconomicOwnerPartyId, 0);
  }
  const ownerRatio = agreed ? Math.max(0, 1 - agreed.reduce((sum, p) => sum + p.sharePercent / 100, 0)) : 0;
  return [...capital].map(([partyId, invested]) => ({ partyId, name: db.cashPartners.find(p => p.id === partyId)?.name || partyId, invested, returned: returned.get(partyId) || 0, profitPaid: profitPaid.get(partyId) || 0, ratio: agreed ? (partyId === order.EconomicOwnerPartyId ? ownerRatio : (agreed.find(p => p.partyId === partyId)?.sharePercent || 0) / 100) : total > 0 ? invested / total : 0, isOwner: partyId === order.EconomicOwnerPartyId }));
}
