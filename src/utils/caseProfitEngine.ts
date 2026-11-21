import { rialSalesSummary } from "./rialSales";
import { normalizePartnerName, ownedCompanyFor, isPetromac } from "./partnerIdentity";
import { AppDatabase, CaseProfitPlan, Order, OrderCustomShare, ProfitAllocationRule, Supplier, IssuerCompanyShare } from "../types";
import { getOwnAccountCapital, getOwnAccountRealization, getCentralCaseLedger, getOrderProfitToInvoiceMultiplier, getOrderProfitToUSDMultiplier, getOrderProfitCurrency, getOrderAmountInProfitCurrency, getOrderQuantityMT, normalizeCurrency, transactionAmountInOrderCurrency } from "./orderAccounting";

export interface UnifiedProfitAllocation {
  ruleId: string;
  beneficiaryId?: string;
  beneficiaryName: string;
  beneficiaryRole: ProfitAllocationRule["beneficiaryRole"];
  amount: number;
  visibility: ProfitAllocationRule["visibility"];
}

export interface UnifiedProfitBreakdown {
  actuals?: { revenue: number; purchase: number; expenses: number; margin: number };
  isActual: boolean;
  isWaterfall: boolean;
  waterfallIssuerAmount?: number;
  waterfallDeductions?: UnifiedProfitAllocation[];
  quantityMT: number;
  purchasePricePerMT: number;
  sellPricePerMT: number;
  freight: number;
  freightPerMT: number;
  totalMargin: number;
  issuerMargin: number;
  agentMargin: number;
  transactionTotal: number;
  bankCharge: number;
  commissionTotal: number;
  agentProfitShare: number;
  /** Margin left after bank charges, registered commissions and agent share. */
  distributableMargin: number;
  allocations: UnifiedProfitAllocation[];
  arcatavShare: number;
  currencyMultiplier: number;
  landedPurchasePricePerMT: number;
  landedAgentPricePerMT: number;
  arcatavInternalShare: number;
  arcatavAgentShare: number;
  internalDistributableMargin: number;
}

/** The one canonical recipient list for all share, commission and company reports. */
export interface CaseShareRecipient {
  id: string;
  name: string;
  role: string;
  amount: number;
  source: "calculated" | "legacy";
}

const value = (input?: number) => Number(input) || 0;
const money = (input: number) => Number(input.toFixed(2));

export function getIssuerProfitCompany(order: Order, supplier?: Supplier) {
  if (order.IssuerCompanyId) return order.IssuerCompanyId;
  const company = ownedCompanyFor(supplier?.SupplierName || order.SupplierName);
  return company?.key === "Berakem" ? "bera" : company?.key === "Arovin" ? "arovin" : "arca-tav";
}

export const getGeneralIssuerPercent = (issuerId: string, companies: IssuerCompanyShare[] = []) =>
  Math.max(0, 100 - (companies.find(company => company.id === issuerId)?.arcaPercent ?? (issuerId === "arovin" ? 66.6666666667 : issuerId === "bera" ? 60 : 100)));

/** Only a share explicitly recorded in the case-profit currency can reduce
 * that currency's profit. Imported Access fixed shares are historical records,
 * not automatic deductions from the new profit model. */
export const isProfitCurrencyShare = (order: Order, share: OrderCustomShare) =>
  share.id !== "agent-profit-beneficiary" &&
  !String(share.notes || "").includes("Migrated from Access fixed share field") &&
  getOrderAmountInProfitCurrency(order, Number(share.amount || 0), share.currency) !== null;

/**
 * One calculation model for every supplier. The company name never determines a
 * formula; a case plan and its data rules do. Amounts remain in the currency
 * in which the case prices were entered; a printed PI may use another currency.
 */
export function getCaseProfitPlan(order: Order, supplier?: Supplier): CaseProfitPlan | undefined {
  if (order.profitPlan) return order.profitPlan;
  const agent = order.customShares?.find((share) => share.id === "agent-profit-beneficiary");
  const inherited = supplier?.profitProfile?.enabled ? supplier.profitProfile : undefined;
  if (!inherited && !order.HasSalesAgent) return undefined;
  return {
    ...(inherited ? { profileId: inherited.id, bankChargePercentOfPurchase: inherited.bankChargePercentOfPurchase, bankChargeName: inherited.bankChargeName, transactionSharePerMT: inherited.transactionSharePerMT, rules: inherited.rules } : {}),
    route: order.HasSalesAgent ? "agent" : inherited!.route,
    agentId: agent?.partnerId, agentName: agent?.partnerName,
    agentSharePercent: inherited?.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50)),
    calculationVersion: 2,
  };
}

/** Operational profit excludes financing, transfers and distribution of profit. */
export function getActualCaseProfit(db: AppDatabase, order: Order) {
  const entries = getCentralCaseLedger(db, order).relatedEntries.filter(entry => entry.OrderID === order.OrderID);
  const divisor = getOrderProfitToInvoiceMultiplier(order);
  const sum = (types: string[]) => entries.filter(entry => types.includes(entry.TransactionType || "customer_receipt"))
    .reduce((total, entry) => total + transactionAmountInOrderCurrency(order, entry) / divisor, 0);
  const rial = rialSalesSummary(order);
  const usdRate = getOrderProfitToUSDMultiplier(order);
  const revenue = order.ConsolidatedSalesUSD !== undefined ? order.ConsolidatedSalesUSD : rial.enabled ? (usdRate && !rial.invalid ? rial.usd / usdRate : 0) : sum(["own_sale_receipt", "customer_receipt", "credit_allocation"]) - sum(["own_sale_refund", "customer_refund"]);
  const purchase = sum(["supplier_payment"]) - sum(["supplier_refund"]);
  const expenses = sum(["order_expense"]);
  return { revenue, purchase, expenses, margin: revenue - purchase - expenses,
    hasReceiptAndPurchase: (order.ConsolidatedSalesUSD !== undefined ? !!order.ConsolidatedHasSales : rial.enabled ? rial.hasSales && !rial.invalid && usdRate !== null : entries.some(e => ["own_sale_receipt", "customer_receipt", "credit_allocation"].includes(e.TransactionType || "customer_receipt"))) && entries.some(e => e.TransactionType === "supplier_payment") };
}

/** All rule methods use the same evaluator, regardless of the selected scenario. */
const evaluateProfitRule = (rule: ProfitAllocationRule, basis: number, quantity: number) =>
  rule.method === "fixed" ? value(rule.value) : rule.method === "per_mt" ? value(rule.value) * quantity : basis * value(rule.value) / 100;

function calculateWaterfall(order: Order, plan: CaseProfitPlan, actuals: ReturnType<typeof getActualCaseProfit> | undefined, base: Pick<UnifiedProfitBreakdown, "quantityMT" | "purchasePricePerMT" | "sellPricePerMT" | "freight" | "freightPerMT" | "totalMargin" | "landedPurchasePricePerMT" | "landedAgentPricePerMT">, issuerId: string, companies: IssuerCompanyShare[], bankCharge: number): UnifiedProfitBreakdown {
  const customIssuer = plan.issuerShareOverride;
  const issuerPercent = customIssuer ? (customIssuer.enabled ? (customIssuer.method === "percent" ? customIssuer.value : 0) : getGeneralIssuerPercent(issuerId, companies)) : Math.max(0, Math.min(100, plan.issuerSharePercent ?? (100 - (order.DirectArcaSharePercent ?? companies.find(company => company.id === issuerId)?.arcaPercent ?? (issuerId === "arovin" ? 66.6666666667 : issuerId === "bera" ? 60 : 100)))));
  const rate = getOrderProfitToInvoiceMultiplier(order);
  const roundSettlement = (amount: number) => money(amount * rate) / rate;
  const openingMargin = base.totalMargin - bankCharge;
  const ruleBase = (rule: ProfitAllocationRule, remaining: number) => rule.basis === "purchase_total" ? base.purchasePricePerMT * base.quantityMT : rule.basis === "issuer_margin" ? openingMargin : rule.basis === "transaction_total" ? value(plan.transactionSharePerMT) * base.quantityMT : remaining;
  const allocate = (rule: ProfitAllocationRule, remaining: number): UnifiedProfitAllocation => ({ ruleId: rule.id, beneficiaryId: rule.beneficiaryId, beneficiaryName: rule.beneficiaryName, beneficiaryRole: rule.beneficiaryRole, amount: roundSettlement(evaluateProfitRule(rule, ruleBase(rule, remaining), base.quantityMT)), visibility: rule.visibility });
  const rules = plan.rules || [];
  const issuerKey = issuerId === "arovin" ? "Arovin" : issuerId === "bera" ? "Berakem" : "Arcatav";
  const isIssuer = (rule: ProfitAllocationRule) => rule.beneficiaryRole === "company" && (ownedCompanyFor(rule.beneficiaryName)?.key === issuerKey || rule.beneficiaryId === issuerId || rule.beneficiaryId === `owned:${issuerKey}`);
  const issuerRules = customIssuer ? [] : rules.filter(isIssuer);
  const commissionBase = (remaining: number): UnifiedProfitAllocation[] => [
    ...(order.customShares || []).filter(share => isProfitCurrencyShare(order, share)).map(share => ({ ruleId: `legacy-share-${share.id}`, beneficiaryId: share.partnerId, beneficiaryName: share.partnerName, beneficiaryRole: "commission_party" as const, amount: roundSettlement(getOrderAmountInProfitCurrency(order, value(share.amount), share.currency) ?? 0), visibility: "internal" as const })),
    ...rules.filter(rule => rule.beneficiaryRole === "commission_party").map(rule => allocate(rule, remaining)),
  ];
  let commissions = plan.commissionOrder === "before_issuer" ? commissionBase(openingMargin) : [];
  const beforeIssuerCommission = commissions.reduce((sum, item) => sum + item.amount, 0);
  const issuerBase = openingMargin - beforeIssuerCommission;
  const issuerAllocations: UnifiedProfitAllocation[] = issuerRules.length ? issuerRules.map(rule => ({ ...allocate(rule, issuerBase), amount: roundSettlement(evaluateProfitRule(rule, issuerBase, base.quantityMT)) })) : [{ ruleId: "issuer-company-default", beneficiaryId: issuerId, beneficiaryName: issuerId === "arovin" ? "آروین" : issuerId === "bera" ? "براکم" : "آرکاتاو", beneficiaryRole: "company", amount: roundSettlement(customIssuer?.enabled && customIssuer.method === "per_mt" ? customIssuer.value * base.quantityMT * (customIssuer.weightUnit === "KG" ? 1000 : 1) : issuerBase * issuerPercent / 100), visibility: "internal" }];
  const issuerAmount = issuerAllocations.reduce((sum, item) => sum + item.amount, 0);
  const afterIssuer = openingMargin - issuerAmount;
  if (plan.commissionOrder !== "before_issuer") commissions = commissionBase(afterIssuer);
  const commissionTotal = commissions.reduce((sum, item) => sum + item.amount, 0);
  const afterCommission = afterIssuer - commissionTotal;
  // Additional rules share a stable basis; reordering the rows cannot alter percentages.
  const extra = rules.filter(rule => !isIssuer(rule) && rule.beneficiaryRole !== "commission_party" && !(rule.beneficiaryRole === "agent" && ((plan.agentId && rule.beneficiaryId === plan.agentId) || (plan.agentName && normalizePartnerName(rule.beneficiaryName) === normalizePartnerName(plan.agentName))))).map(rule => allocate(rule, afterCommission));
  if (issuerKey === "Arcatav") issuerAllocations.forEach(item => { item.beneficiaryRole = "arcatav"; });
  const reservedArcatav = (issuerKey === "Arcatav" ? issuerAmount : 0) + extra.filter(item => item.beneficiaryRole === "arcatav").reduce((sum, item) => sum + item.amount, 0);
  const shared = afterCommission - extra.reduce((sum, item) => sum + item.amount, 0);
  const agentProfitShare = plan.route === "agent" ? roundSettlement(shared * (plan.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50))) / 100) : 0;
  // Give the rounding residual to Arcatav; never create or lose an extra cent.
  const arcatavShare = reservedArcatav + shared - agentProfitShare;
  const allocations: UnifiedProfitAllocation[] = [...commissions, ...issuerAllocations.filter(item => Math.abs(item.amount) > .000001), ...extra];
  if (plan.route === "agent") allocations.push({ ruleId: "agent-profit-beneficiary", beneficiaryId: plan.agentId || "unassigned-sales-agent", beneficiaryName: plan.agentName || "ایجنت تعیین نشده", beneficiaryRole: "agent", amount: agentProfitShare, visibility: "internal" });
  return { ...base, isActual: !!actuals, isWaterfall: true, actuals, issuerMargin: 0, agentMargin: shared, transactionTotal: 0, bankCharge, commissionTotal, agentProfitShare, distributableMargin: arcatavShare, allocations, arcatavShare, currencyMultiplier: 1, arcatavInternalShare: reservedArcatav, arcatavAgentShare: shared - agentProfitShare, internalDistributableMargin: 0, waterfallIssuerAmount: issuerAmount, waterfallDeductions: extra };
}

export function calculateUnifiedProfit(order: Order, supplier?: Supplier, companies: IssuerCompanyShare[] = [], db?: AppDatabase): UnifiedProfitBreakdown | null {
  if (order.TradeOwnership === "own_account" && getOwnAccountRealization(db, order).recognized) order = { ...order, profitPlan: { route: order.HasSalesAgent ? "agent" : "direct", ...getCaseProfitPlan(order, supplier), profitBasis: "actual", accountingOverrides: undefined } };
  let result = calculateBaseProfit(order, supplier, companies, db);
  const investors = getOwnAccountCapital(db, order).filter(p => !p.isOwner && p.ratio > 0);
  if (result && investors.length) {
    const base = result;
    const factor = Math.max(0, 1 - investors.reduce((sum, p) => sum + p.ratio, 0));
    // Investment shares the owners' net result. Contractual agent fees and
    // commissions remain intact; capital ownership must not rewrite them.
    const pool = base.arcatavShare + base.allocations.filter(a => a.beneficiaryRole === "company").reduce((sum, a) => sum + a.amount, 0);
    const rate = getOrderProfitToInvoiceMultiplier(order);
    const round = (amount: number) => money(amount * rate) / rate;
    const allocations = base.allocations.map(a => ["company", "arcatav"].includes(a.beneficiaryRole) ? { ...a, amount: round(a.amount * factor) } : a);
    investors.forEach(p => allocations.push({ ruleId: `capital-investor:${p.partyId}`, beneficiaryId: p.partyId, beneficiaryName: p.name, beneficiaryRole: "investor", amount: round(pool * p.ratio), visibility: "internal" }));
    const others = allocations.filter(a => a.beneficiaryRole !== "arcatav").reduce((sum, a) => sum + a.amount, 0);
    const arcatavShare = base.totalMargin - base.bankCharge - others;
    result = { ...base, allocations, arcatavShare, arcatavInternalShare: arcatavShare - round(base.arcatavAgentShare * factor), arcatavAgentShare: round(base.arcatavAgentShare * factor), distributableMargin: arcatavShare, waterfallIssuerAmount: base.waterfallIssuerAmount === undefined ? undefined : round(base.waterfallIssuerAmount * factor) };
  }
  const manual = getCaseProfitPlan(order, supplier)?.manualShare;
  if (!result || !manual) return result;
  const issuerId = getIssuerProfitCompany(order, supplier);
  const hasIssuer = issuerId === "bera" || issuerId === "arovin";
  const hasAgent = getCaseProfitPlan(order, supplier)?.route === "agent";
  if ((manual.role === "issuer" && !hasIssuer) || (manual.role === "agent" && !hasAgent) || (manual.role === "arcatav" && !hasIssuer && !hasAgent)) return result;
  const issuer = result.allocations.filter(a => a.beneficiaryRole === "company");
  const amounts = { issuer: issuer.reduce((s, a) => s + a.amount, 0), arcatav: result.arcatavShare, agent: result.agentProfitShare };
  const pool = amounts.issuer + amounts.arcatav + amounts.agent;
  const others = (["issuer", "arcatav", "agent"] as const).filter(role => role !== manual.role);
  const remaining = pool - manual.amount;
  const weights = others.map(role => Math.abs(amounts[role]));
  const weight = weights[0] + weights[1];
  const round = (n: number) => money(n * getOrderProfitToInvoiceMultiplier(order)) / getOrderProfitToInvoiceMultiplier(order);
  amounts[manual.role] = round(manual.amount);
  const eligible = (role: typeof others[number]) => role === "arcatav" || (role === "issuer" ? hasIssuer : hasAgent);
  const first = weight ? remaining * weights[0] / weight : (eligible(others[0]) && (others[0] === "arcatav" || others[1] !== "arcatav" || !eligible(others[1])) ? remaining : 0);
  amounts[others[0]] = round(first);
  amounts[others[1]] = pool - amounts[manual.role] - amounts[others[0]];
  const allocations = result.allocations.filter(a => a.beneficiaryRole !== "company" && a.ruleId !== "agent-profit-beneficiary").map(a => a.beneficiaryRole === "arcatav" ? { ...a, amount: 0 } : a);
  if (issuer.length || amounts.issuer) allocations.push({ ruleId: "issuer-company-manual-balanced", beneficiaryId: issuer[0]?.beneficiaryId || issuerId, beneficiaryName: issuer[0]?.beneficiaryName || (issuerId === "bera" ? "براکم" : "آروین"), beneficiaryRole: "company", amount: amounts.issuer, visibility: "internal" });
  const agent = result.allocations.find(a => a.ruleId === "agent-profit-beneficiary");
  if (agent) allocations.push({ ...agent, amount: amounts.agent });
  return { ...result, allocations, arcatavShare: amounts.arcatav, agentProfitShare: amounts.agent, waterfallIssuerAmount: amounts.issuer,
    arcatavInternalShare: amounts.arcatav - result.arcatavAgentShare, distributableMargin: amounts.arcatav };
}

function calculateBaseProfit(order: Order, supplier?: Supplier, companies: IssuerCompanyShare[] = [], db?: AppDatabase): UnifiedProfitBreakdown | null {
  const legacyAgent = order.customShares?.find((share) => share.id === "agent-profit-beneficiary");
  const sourcePlan = getCaseProfitPlan(order, supplier);
  const plan: CaseProfitPlan | undefined = order.RialSalesEnabled ? {
    route: order.HasSalesAgent ? "agent" : "direct", ...sourcePlan, profitBasis: "actual",
    accountingOverrides: sourcePlan?.accountingOverrides ? { ...sourcePlan.accountingOverrides, sellPricePerMT: undefined, marginPerMT: undefined } : undefined,
  } : sourcePlan;
  if (!plan) return null;

  // PI values are the default. Accounting-only overrides let the final, actual
  // figures be used for profitability without rewriting an issued proforma.
  const actuals = db ? getActualCaseProfit(db, order) : undefined;
  const isActual = plan.profitBasis !== "estimate" && !!actuals && (plan.profitBasis === "actual" || actuals.hasReceiptAndPurchase);
  const isWaterfall = plan.actualDistribution === "net_waterfall";
  const manual = plan.accountingOverrides || {};
  const productInputs = plan.itemProfitInputs || {};
  const useProductInputs = Object.keys(productInputs).length > 0;
  const defaultQuantity = value(plan.calculationQuantityMT ?? getOrderQuantityMT(order));
  const defaultPurchase = value(plan.calculationPurchasePricePerMT ?? (order.CostPrice || order.CFRNet || order.NetFob));
  const defaultSell = value(plan.calculationSellPricePerMT ?? (order.EndCustomerPrice || order.SellPrice));
  const defaultAgent = value(plan.calculationPriceToAgentPerMT ?? (order.PriceToAgent || order.SellPrice));
  const defaultFreight = value(plan.calculationFreight ?? order.Freight);
  const sourceItems = order.items || [];
  const productTotals = sourceItems.reduce((total, item, index) => {
    const key = String(item.OrderDetailID || index);
    const input = productInputs[key] || {};
    const fallbackQuantity = Number(item.Quantity || 0) * (item.QuantityUnit === "KG" ? 0.001 : 1);
    const quantity = value(input.quantityMT ?? fallbackQuantity);
    const purchase = value(input.purchasePricePerMT ?? defaultPurchase);
    const sell = value(input.sellPricePerMT ?? item.UnitPrice ?? defaultSell);
    const agent = value(input.priceToAgentPerMT ?? defaultAgent);
    return { quantity: total.quantity + quantity, purchase: total.purchase + purchase * quantity, sell: total.sell + sell * quantity, agent: total.agent + agent * quantity };
  }, { quantity: 0, purchase: 0, sell: 0, agent: 0 });
  const derivedQuantity = useProductInputs && productTotals.quantity ? productTotals.quantity : defaultQuantity;
  const quantityMT = value(manual.quantityMT ?? derivedQuantity);
  const estimatedPurchasePrice = useProductInputs && productTotals.quantity ? productTotals.purchase / productTotals.quantity : defaultPurchase;
  const estimatedSellPrice = useProductInputs && productTotals.quantity ? productTotals.sell / productTotals.quantity : defaultSell;
  const priceToAgent = value(manual.priceToAgentPerMT ?? (useProductInputs && productTotals.quantity ? productTotals.agent / productTotals.quantity : defaultAgent));
  const purchasePricePerMT = manual.purchasePricePerMT ?? (isActual && quantityMT ? actuals!.purchase / quantityMT : estimatedPurchasePrice);
  const sellPricePerMT = manual.sellPricePerMT ?? (isActual && quantityMT ? actuals!.revenue / quantityMT : estimatedSellPrice);
  // Freight is one case-level cost. Product rows receive a calculated share by
  // quantity in the UI; they must never be able to accidentally add it again.
  const freight = manual.freight ?? (isActual ? actuals!.expenses : defaultFreight);
  const freightPerMT = quantityMT ? freight / quantityMT : 0;
  const purchaseTotal = purchasePricePerMT * quantityMT;
  const transactionTotal = value(plan.transactionSharePerMT) * quantityMT;
  const landedPurchasePricePerMT = manual.landedCostPerMT ?? (purchasePricePerMT + (isActual || !plan.purchaseIncludesFreight ? freightPerMT : 0));
  const landedAgentPricePerMT = priceToAgent + (plan.agentQuoteIncludesFreight === true ? 0 : freightPerMT);
  const totalMargin = manual.marginPerMT !== undefined ? manual.marginPerMT * quantityMT : (sellPricePerMT - landedPurchasePricePerMT) * quantityMT;
  const issuerMargin = plan.route === "agent"
    ? (landedAgentPricePerMT - landedPurchasePricePerMT) * quantityMT
    : totalMargin;
  // Transaction income is kept as an explicit pool so a supplier's owners and an
  // agent can be allocated independently without changing the core formula.
  const agentMargin = plan.route === "agent"
    ? totalMargin - issuerMargin - transactionTotal
    : 0;
  // Bank costs already posted as operating expenses must not be charged twice.
  const bankCharge = manual.bankCharge ?? (isActual ? 0 : purchaseTotal * (value(plan.bankChargePercentOfPurchase) / 100));
  if (isWaterfall) return calculateWaterfall(order, plan, isActual ? actuals : undefined, { quantityMT, purchasePricePerMT, sellPricePerMT, freight, freightPerMT, totalMargin, landedPurchasePricePerMT, landedAgentPricePerMT }, getIssuerProfitCompany(order, supplier), companies, bankCharge);
  const rules = plan.rules || [];
  const agentProfitShare = plan.route === "agent" ? money(agentMargin * (value(plan.agentSharePercent ?? (100 - (order.AgentCompanySharePercent ?? 50))) / 100)) : 0;
  const legacyCommissionShares = (order.customShares || []).filter((item) => isProfitCurrencyShare(order, item));
  const legacyCommissionTotal = legacyCommissionShares.reduce((sum, item) => sum + (getOrderAmountInProfitCurrency(order, value(item.amount), item.currency) ?? 0), 0);
  // Commission rows are evaluated first. Thus company percentages are always
  // applied to the actual residual margin, never to money already promised to
  // a commission party or an agent.
  const preCommissionMargin = (plan.route === "agent" ? issuerMargin + transactionTotal : totalMargin) - bankCharge - legacyCommissionTotal;
  const basisAmount = (basis: ProfitAllocationRule["basis"], distributableBase: number) => {
    switch (basis) {
      case "issuer_margin": return issuerMargin + (plan.route === "agent" ? transactionTotal : 0) - bankCharge;
      case "agent_margin": return agentMargin;
      case "purchase_total": return purchaseTotal;
      case "transaction_total": return transactionTotal;
      default: return distributableBase;
    }
  };
  const amountForRule = (rule: ProfitAllocationRule, distributableBase: number) => {
    const base = basisAmount(rule.basis, distributableBase);
    return evaluateProfitRule(rule, base, quantityMT);
  };
  const commissionRuleAllocations = rules.filter((rule) => rule.beneficiaryRole === "commission_party").map((rule) => ({
    ruleId: rule.id, beneficiaryId: rule.beneficiaryId, beneficiaryName: rule.beneficiaryName,
    beneficiaryRole: rule.beneficiaryRole, amount: money(amountForRule(rule, preCommissionMargin)), visibility: rule.visibility,
  }));
  const commissionTotal = legacyCommissionTotal + commissionRuleAllocations.reduce((sum, item) => sum + item.amount, 0);
  const distributableMargin = totalMargin - bankCharge - commissionTotal - agentProfitShare;
  const internalDistributableMargin = plan.route === "agent" ? issuerMargin + transactionTotal - bankCharge - commissionTotal : distributableMargin;
  const issuerId = getIssuerProfitCompany(order, supplier);
  const issuerCompany = issuerId === "bera" || issuerId === "arovin" ? issuerId : undefined;
  const issuerName = issuerCompany === "bera" ? "براکم" : issuerCompany === "arovin" ? "آروین" : "";
  // The issuing company's share is always calculated last. Costs, commissions
  // and every other beneficiary are deducted first; a fixed issuer rule is a
  // manual amount and replaces the automatic percentage completely.
  const isIssuerRule = (rule: ProfitAllocationRule) => {
    if (!issuerCompany || rule.beneficiaryRole !== "company") return false;
    const name = rule.beneficiaryName.trim().toLocaleLowerCase();
    const id = rule.beneficiaryId || "";
    return id === issuerCompany || id.endsWith(`:${issuerCompany}`) ||
      (issuerCompany === "bera" ? /(bera|berakem|براکم)/i.test(name) : /(arovin|آروین)/i.test(name));
  };
  const priorityRules = rules.filter((rule) => rule.beneficiaryRole !== "commission_party" && rule.beneficiaryRole !== "arcatav" && !isIssuerRule(rule) && !(plan.route === "agent" && rule.beneficiaryRole === "agent" && ((plan.agentId && rule.beneficiaryId === plan.agentId) || (plan.agentName && normalizePartnerName(rule.beneficiaryName) === normalizePartnerName(plan.agentName)))));
  const priorityAllocations = priorityRules.map((rule) => ({
    ruleId: rule.id, beneficiaryId: rule.beneficiaryId, beneficiaryName: rule.beneficiaryName,
    beneficiaryRole: rule.beneficiaryRole, amount: money(amountForRule(rule, internalDistributableMargin)), visibility: rule.visibility,
  }));
  let issuerRemainder = internalDistributableMargin - priorityAllocations.reduce((sum, item) => sum + item.amount, 0);
  const customIssuer = plan.issuerShareOverride;
  const issuerAllocations = (customIssuer ? [] : rules.filter(isIssuerRule)).map((rule) => {
    const amount = rule.method === "percent" ? issuerRemainder * value(rule.value) / 100 : rule.method === "per_mt" ? value(rule.value) * quantityMT : value(rule.value);
    const allocation: UnifiedProfitAllocation = { ruleId: rule.id, beneficiaryId: rule.beneficiaryId, beneficiaryName: rule.beneficiaryName,
      beneficiaryRole: rule.beneficiaryRole, amount: money(amount), visibility: rule.visibility };
    issuerRemainder -= allocation.amount;
    return allocation;
  });
  // An automatic Bera/Arovin split still applies when a case has expense or
  // commission rules. It is replaced only by an explicit issuer rule above.
  if (issuerCompany && issuerAllocations.length === 0) {
    const defaultArcatavPercent = issuerCompany === "bera" ? 60 : 66.6666666667;
    const issuerPercent = customIssuer ? (customIssuer.enabled ? (customIssuer.method === "percent" ? customIssuer.value : 0) : getGeneralIssuerPercent(issuerCompany, companies)) : (issuerCompany === "bera" ? 40 : Math.max(0, 100 - value(order.DirectArcaSharePercent ?? companies.find((company) => company.id === issuerCompany)?.arcaPercent ?? defaultArcatavPercent)));
    if (issuerPercent > 0 || (customIssuer?.enabled && customIssuer.method === "per_mt")) {
      const amount = money(customIssuer?.enabled && customIssuer.method === "per_mt" ? customIssuer.value * quantityMT * (customIssuer.weightUnit === "KG" ? 1000 : 1) : issuerRemainder * issuerPercent / 100);
      issuerAllocations.push({ ruleId: "issuer-company-default", beneficiaryId: issuerCompany, beneficiaryName: issuerName, beneficiaryRole: "company", amount, visibility: "internal" });
    }
  }
  const allocations: UnifiedProfitAllocation[] = [
    ...legacyCommissionShares.map((share) => ({ ruleId: `legacy-share-${share.id}`, beneficiaryId: share.partnerId, beneficiaryName: share.partnerName, beneficiaryRole: "commission_party" as const, amount: money(getOrderAmountInProfitCurrency(order, value(share.amount), share.currency) ?? 0), visibility: "internal" as const })),
    ...commissionRuleAllocations,
    ...priorityAllocations,
    ...issuerAllocations,
    ...rules.filter((rule) => rule.beneficiaryRole === "arcatav").map((rule) => ({ ruleId: rule.id, beneficiaryId: rule.beneficiaryId, beneficiaryName: rule.beneficiaryName, beneficiaryRole: rule.beneficiaryRole, amount: money(amountForRule(rule, internalDistributableMargin)), visibility: rule.visibility })),
  ];
  if (plan.route === "agent") {
    allocations.push({ ruleId: "agent-profit-beneficiary", beneficiaryId: plan.agentId || legacyAgent?.partnerId || "unassigned-sales-agent", beneficiaryName: plan.agentName || legacyAgent?.partnerName || "ایجنت تعیین نشده",
      beneficiaryRole: "agent", amount: agentProfitShare, visibility: "internal" });
  }
  const explicitArcatav = allocations.filter((item) => item.beneficiaryRole === "arcatav").reduce((sum, item) => sum + item.amount, 0);
  // The automatic agent share was already removed when distributableMargin was
  // formed, so including it here would deduct it a second time.
  const manualNonArcatav = allocations
    .filter((item) => item.beneficiaryRole !== "arcatav" && item.beneficiaryRole !== "commission_party" && item.ruleId !== "agent-profit-beneficiary")
    .reduce((sum, item) => sum + item.amount, 0);
  const arcatavAgentShare = plan.route === "agent" ? money(agentMargin - agentProfitShare) : 0;
  const hasExplicitArcatav = rules.some((rule) => rule.beneficiaryRole === "arcatav");
  const arcatavInternalShare = hasExplicitArcatav ? explicitArcatav : internalDistributableMargin - manualNonArcatav;
  const arcatavShare = arcatavInternalShare + arcatavAgentShare;
  return {
    isActual, isWaterfall, actuals: isActual ? actuals : undefined,
    quantityMT, purchasePricePerMT: money(purchasePricePerMT), sellPricePerMT: money(sellPricePerMT),
    freight: money(freight), freightPerMT: money(freightPerMT), totalMargin: isActual ? totalMargin : money(totalMargin),
    issuerMargin: money(issuerMargin), agentMargin: money(agentMargin), transactionTotal: money(transactionTotal),
    bankCharge: money(bankCharge), commissionTotal: money(commissionTotal), agentProfitShare,
    distributableMargin: money(distributableMargin),
    allocations,
    arcatavShare: money(arcatavShare), currencyMultiplier: 1, landedPurchasePricePerMT, landedAgentPricePerMT, arcatavInternalShare: money(arcatavInternalShare), arcatavAgentShare, internalDistributableMargin: money(internalDistributableMargin),
  };
}

/** Display derived shares from current inputs instead of stale saved totals. */
export function projectCaseProfit(order: Order, supplier?: Supplier, companies: IssuerCompanyShare[] = [], db?: AppDatabase): Order {
  const profit = calculateUnifiedProfit(order, supplier, companies, db);
  if (!profit) return order;
  return { ...order,
    ArcaShare: profit.arcatavShare,
    BeraShare: profit.allocations.filter((item) => item.beneficiaryRole === "company").reduce((sum, item) => sum + item.amount, 0),
    Berabank: profit.bankCharge, TotalCommission: profit.commissionTotal, Commission: profit.commissionTotal,
    companyProfitShares: [{ companyName: "آرکاتاو", amount: profit.arcatavShare, source: profit.isWaterfall ? (profit.isActual ? "تسویه سود واقعی پس از سهم شرکت و رابط" : "برآورد سود پس از سهم شرکت و رابط") : "سود داخلی + سود مشترک ایجنت" }, ...profit.allocations.filter((item) => item.beneficiaryRole !== "arcatav").map((item) => ({ companyName: item.beneficiaryName, amount: item.amount, source: item.beneficiaryRole }))],
  };
}

/**
 * Reports must never combine `companyProfitShares` and `customShares` on top
 * of a unified calculation: doing so repeats the same beneficiary. New and
 * migrated reports consume this single list instead.
 */
const getRawCaseShareRecipients = (order: Order, supplier?: Supplier, companies: IssuerCompanyShare[] = [], db?: AppDatabase): CaseShareRecipient[] => {
  const calculation = calculateUnifiedProfit(order, supplier, companies, db);
  if (calculation) {
    // Keep identifiers compatible with existing case-fund postings created
    // before the unified calculation was introduced. A named beneficiary
    // still uses its real partner ID when one is available.
    const savedShares = order.companyProfitShares || [];
    const legacyCompanyId = (name: string) => {
      const index = savedShares.findIndex((item) => item.companyName.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      return index >= 0 ? `company:${order.OrderID}:${index}` : undefined;
    };
    return [
      { id: legacyCompanyId("آرکاتاو") || "arcatav", name: "آرکاتاو", role: "سهم باقیماندهٔ پرونده", amount: calculation.arcatavShare, source: "calculated" as const },
      ...calculation.allocations.filter((item) => item.beneficiaryRole !== "arcatav").map((item) => ({
        id: item.beneficiaryId || legacyCompanyId(item.beneficiaryName || "") || item.ruleId,
        name: item.beneficiaryName || "ذی‌نفع تعریف‌نشده",
        role: item.beneficiaryRole,
        amount: item.amount,
        source: "calculated" as const,
      })),
    ].filter((item) => Math.abs(item.amount) > .005);
  }
  return [
    ...(order.companyProfitShares || []).map((item, index) => ({ id: `company:${order.OrderID}:${index}`, name: item.companyName, role: item.source || "شرکت", amount: Number(item.amount || 0), source: "legacy" as const })),
    ...(order.customShares || []).filter((item) => item.id !== "agent-profit-beneficiary").map((item) => ({ id: item.partnerId || `share:${item.id}`, name: item.partnerName, role: item.role || "ذی‌نفع", amount: getOrderAmountInProfitCurrency(order, Number(item.amount || 0), item.currency) ?? 0, source: "legacy" as const })),
  ].filter((item) => Math.abs(item.amount) > .005);
};

export const getCaseShareRecipients = (order: Order, supplier?: Supplier, companies: IssuerCompanyShare[] = [], db?: AppDatabase): CaseShareRecipient[] => {
  if (order.TradeOwnership === "own_account" && !getOwnAccountRealization(db, order).recognized) return [];
  if (order.TradeOwnership === "own_account") order = { ...order, profitPlan: { route: order.HasSalesAgent ? "agent" : "direct", ...getCaseProfitPlan(order, supplier), profitBasis: "actual", accountingOverrides: undefined } };
  if (order.IsDummy || order.ExcludeFromCalculations) return [];
  const recipients = new Map<string, CaseShareRecipient>();
  getRawCaseShareRecipients(order, supplier, companies, db).forEach((share) => {
    const company = ownedCompanyFor(share.name);
    const petromac = isPetromac(share.name);
    const id = company?.id || (petromac ? "partner:petromac" : share.id);
    const previous = recipients.get(id);
    recipients.set(id, { ...share, id, name: company?.name || (petromac ? "پتروماک (لیدا)" : share.name), amount: (previous?.amount || 0) + share.amount });
  });
  return [...recipients.values()];
};

/** Deliberately omits buy price, supplier margin and Arcatav's internal share. */
export function calculateAgentStatement(order: Order, supplier?: Supplier, db?: AppDatabase) {
  const result = calculateUnifiedProfit(order, supplier, db?.issuerCompanyShares, db);
  const plan = getCaseProfitPlan(order, supplier);
  if (!result || !(plan?.route === "agent" || (!plan && order.HasSalesAgent))) return null;
  const disclosedRules = new Set((plan?.rules || []).filter((rule) => rule.visibility === "agent" && rule.basis === "agent_margin" && rule.beneficiaryRole !== "company" && rule.beneficiaryRole !== "arcatav").map((rule) => rule.id));
  const quoteIncludesFreight = order.profitPlan?.agentQuoteIncludesFreight === true;
  return {
    quantityMT: result.quantityMT,
    sellPricePerMT: result.sellPricePerMT,
    priceToAgentPerMT: value(order.profitPlan?.calculationPriceToAgentPerMT ?? (order.PriceToAgent || order.SellPrice)),
    quoteIncludesFreight,
    freightToAddPerMT: quoteIncludesFreight ? 0 : result.freightPerMT,
    agentMargin: result.agentMargin,
    currency: getOrderProfitCurrency(order),
    allocations: result.allocations.filter((item) => item.ruleId === "agent-profit-beneficiary" || disclosedRules.has(item.ruleId)).map((item) => ({ name: item.beneficiaryName, amount: item.amount })),
  };
}

