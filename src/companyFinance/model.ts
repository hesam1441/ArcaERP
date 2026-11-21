import type {
  CompanyBankAccount,
  CompanyFinanceCosting,
  CompanyFinanceDatabase,
  CompanyFinanceEntry,
  CompanyProfitSummary,
  CompanyId,
  InventoryCostSummary,
  ProcurementCase,
  ProcurementCost,
  ProcurementLine,
} from "./types";

const companyNames: Record<CompanyId, string> = { berakem: "Berakem", arovin: "Arovin" };

export function createEmptyCompanyFinance(companyId: CompanyId): CompanyFinanceDatabase {
  return {
    schemaVersion: 1,
    companyId,
    settings: {
      legalName: companyNames[companyId],
      baseCurrency: "",
      taxRate: 0,
      taxConfigured: false,
      taxMode: "exclusive",
      inventoryMethod: "moving_weighted_average",
      locale: companyId === "berakem" ? "en" : "en",
      fiscalYearStart: "01-01",
    },
    parties: [],
    items: [],
    procurementCases: [],
    localSales: [],
    invoices: [],
    bankAccounts: [],
    entries: [],
    auditEvents: [],
  };
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function costValueBase(cost: ProcurementCost, baseCurrency: string): number | null {
  if (!nonNegative(cost.amount)) return null;
  if (cost.currency.trim().toUpperCase() === baseCurrency.trim().toUpperCase()) return cost.amount;
  if (!positive(cost.exchangeRateToBase)) return null;
  return cost.amount * cost.exchangeRateToBase;
}

function lineWeightKg(line: ProcurementLine, weightPerUnitKg?: number): number | null {
  if (!positive(line.quantity)) return 0;
  if (line.unit === "kg") return line.quantity;
  if (line.unit === "mt") return line.quantity * 1000;
  if (!positive(weightPerUnitKg)) return null;
  return line.quantity * weightPerUnitKg;
}

function allocationWeights(
  cost: ProcurementCost,
  lines: ProcurementLine[],
  itemWeights: Map<string, number>,
  purchaseValues: Map<string, number>,
): Map<string, number> | null {
  if (cost.allocation === "direct") {
    const direct = new Map(Object.entries(cost.lineAllocations || {}).filter(([, value]) => nonNegative(value)));
    if (direct.size !== lines.length || lines.some((line) => !direct.has(line.id))) return null;
    const total = [...direct.values()].reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - cost.amount) > Math.max(0.02, cost.amount * 0.0001)) return null;
    return direct;
  }
  const weights = new Map<string, number>();
  for (const line of lines) {
    if (cost.allocation === "value") {
      const value = purchaseValues.get(line.id);
      if (value === undefined) return null;
      weights.set(line.id, value);
    } else if (cost.allocation === "quantity") {
      if (lines.some((candidate) => candidate.unit !== line.unit)) return null;
      weights.set(line.id, line.quantity);
    } else {
      const weight = lineWeightKg(line, itemWeights.get(line.itemId));
      if (weight === null) return null;
      weights.set(line.id, weight);
    }
  }
  return [...weights.values()].reduce((sum, value) => sum + value, 0) > 0 ? weights : null;
}

export function calculateProcurementCosting(
  procurementCase: ProcurementCase,
  finance: Pick<CompanyFinanceDatabase, "settings" | "items">,
): CompanyFinanceCosting[] {
  const baseCurrency = finance.settings.baseCurrency.trim().toUpperCase();
  const itemWeights = new Map(finance.items.map((item) => [item.id, item.weightPerUnitKg || 0]));
  const purchaseValues = new Map<string, number>();
  const issuesByLine = new Map(procurementCase.lines.map((line) => [line.id, [] as string[]]));
  const purchaseBaseByLine = new Map<string, number>();
  for (const line of procurementCase.lines) {
    if (!positive(line.quantity)) issuesByLine.get(line.id)!.push("Quantity must be greater than zero.");
    if (!nonNegative(line.receivedQuantity) || line.receivedQuantity > line.quantity) issuesByLine.get(line.id)!.push("Received quantity is invalid.");
    if (!baseCurrency) issuesByLine.get(line.id)!.push("Company base currency is not configured.");
    const sameCurrency = line.currency.trim().toUpperCase() === baseCurrency;
    const fx = sameCurrency ? 1 : line.exchangeRateToBase;
    if (!positive(fx)) issuesByLine.get(line.id)!.push("A valid purchase-to-base exchange rate is required.");
    if (positive(fx) && nonNegative(line.unitPrice) && nonNegative(line.quantity)) {
      // Allocation weights use the full ordered value; landed cost includes only
      // the quantity received so partial deliveries are not over-costed.
      purchaseValues.set(line.id, line.unitPrice * line.quantity * fx);
      purchaseBaseByLine.set(line.id, line.unitPrice * line.receivedQuantity * fx);
    }
  }

  const ancillaryByLine = new Map(procurementCase.lines.map((line) => [line.id, 0]));
  for (const cost of procurementCase.costs) {
    const amountBase = costValueBase(cost, baseCurrency);
    const weights = allocationWeights(cost, procurementCase.lines, itemWeights, purchaseValues);
    if (amountBase === null || !weights) {
      for (const line of procurementCase.lines) issuesByLine.get(line.id)!.push(`Cost "${cost.description || cost.category}" is missing a rate or has incomplete allocation.`);
      continue;
    }
    if (cost.allocation === "direct") {
      for (const line of procurementCase.lines) {
        const receivedShare = positive(line.quantity) ? Math.min(1, line.receivedQuantity / line.quantity) : 0;
        const directAmount = Number(weights.get(line.id) || 0) * receivedShare;
        const sameCurrency = cost.currency.trim().toUpperCase() === baseCurrency;
        const fx = sameCurrency ? 1 : cost.exchangeRateToBase;
        if (positive(fx)) ancillaryByLine.set(line.id, ancillaryByLine.get(line.id)! + directAmount * fx);
      }
      continue;
    }
    const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0);
    for (const line of procurementCase.lines) {
      const weight = weights.get(line.id) || 0;
      const receivedShare = positive(line.quantity) ? Math.min(1, line.receivedQuantity / line.quantity) : 0;
      ancillaryByLine.set(line.id, ancillaryByLine.get(line.id)! + amountBase * (weight / totalWeight) * receivedShare);
    }
  }

  return procurementCase.lines.map((line) => {
    const issues = issuesByLine.get(line.id)!;
    if (!positive(line.receivedQuantity)) issues.push("No received quantity is available for unit costing.");
    const purchaseCost = purchaseBaseByLine.get(line.id);
    const allocated = ancillaryByLine.get(line.id);
    const complete = purchaseCost !== undefined && positive(line.receivedQuantity) && issues.length === 0;
    const total = complete ? purchaseCost + allocated : null;
    return {
      caseId: procurementCase.id,
      lineId: line.id,
      purchaseCost: purchaseCost ?? 0,
      allocatedAncillaryCost: complete ? roundMoney(allocated) : null,
      landedCost: total === null ? null : roundMoney(total),
      costPerUnit: total === null ? null : roundMoney(total / line.receivedQuantity),
      currency: baseCurrency,
      complete,
      issues: [...new Set(issues)],
    };
  });
}

export function calculateBankBalance(account: CompanyBankAccount, entries: CompanyFinanceEntry[]): number {
  return entries.reduce((balance, entry) => {
    if (entry.currency.toUpperCase() !== account.currency.toUpperCase()) return balance;
    if (entry.type === "bank_transfer") {
      if (entry.bankAccountId === account.id) return balance - entry.amount;
      if (entry.transferBankAccountId === account.id) return balance + entry.amount;
      return balance;
    }
    if (entry.bankAccountId !== account.id || (entry.paymentMethod !== "bank" && !(entry.paymentMethod === "check" && entry.checkStatus === "cleared"))) return balance;
    if (["customer_receipt", "supplier_refund", "company_income"].includes(entry.type)) return balance + entry.amount;
    if (["supplier_payment", "case_cost", "customer_refund", "company_expense"].includes(entry.type)) return balance - entry.amount;
    return balance;
  }, account.openingBalance);
}

export function calculateWeightedAverageItemCost(finance: CompanyFinanceDatabase, itemId: string): InventoryCostSummary {
  const item = finance.items.find((candidate) => candidate.id === itemId);
  const currency = finance.settings.baseCurrency.trim().toUpperCase();
  if (!item) return { itemId, unit: "unit", receivedQuantity: 0, totalCost: null, averageCostPerUnit: null, currency, complete: false, issues: ["Product is not in this company catalog."] };
  let receivedQuantity = 0;
  let totalCost = 0;
  const issues: string[] = [];
  for (const procurementCase of finance.procurementCases) {
    const cases = calculateProcurementCosting(procurementCase, finance);
    for (const line of procurementCase.lines.filter((candidate) => candidate.itemId === itemId)) {
      if (line.unit !== item.unit) issues.push(`Procurement ${procurementCase.number} uses a different unit.`);
      if (line.receivedQuantity <= 0) continue;
      const costing = cases.find((candidate) => candidate.lineId === line.id);
      if (!costing?.complete || costing.landedCost === null) {
        issues.push(`Procurement ${procurementCase.number} has incomplete landed cost.`);
        continue;
      }
      receivedQuantity += line.receivedQuantity;
      totalCost += costing.landedCost;
    }
  }
  const complete = issues.length === 0 && receivedQuantity > 0 && Boolean(currency);
  return {
    itemId,
    unit: item.unit,
    receivedQuantity,
    totalCost: complete ? roundMoney(totalCost) : null,
    averageCostPerUnit: complete ? roundMoney(totalCost / receivedQuantity) : null,
    currency,
    complete,
    issues: [...new Set(issues)],
  };
}

export function calculateCompanyProfit(finance: CompanyFinanceDatabase): CompanyProfitSummary {
  const currency = finance.settings.baseCurrency.trim().toUpperCase();
  let invoicedRevenue = 0;
  let costOfGoodsSold = 0;
  let taxOnInvoices = 0;
  let otherIncome = 0;
  let operatingExpenses = 0;
  let customerRefunds = 0;
  let uncostedInvoiceLines = 0;
  let missingFxRecords = 0;
  const fxFor = (sourceCurrency: string, rate?: number) => sourceCurrency.toUpperCase() === currency ? 1 : positive(rate) ? rate : null;
  for (const invoice of finance.invoices.filter((item) => item.status !== "void")) {
    const rate = fxFor(invoice.currency, invoice.exchangeRateToBase);
    if (rate === null) { missingFxRecords++; continue; }
    invoicedRevenue += invoice.subtotal * rate;
    taxOnInvoices += invoice.taxTotal * rate;
    for (const line of invoice.linesSnapshot) {
      if (line.costBasisUnitPrice === undefined || !Number.isFinite(line.costBasisUnitPrice)) { uncostedInvoiceLines++; continue; }
      costOfGoodsSold += line.quantity * line.costBasisUnitPrice;
    }
  }
  for (const entry of finance.entries) {
    if (!["company_income", "company_expense", "customer_refund"].includes(entry.type)) continue;
    const rate = fxFor(entry.currency, entry.exchangeRateToBase);
    if (rate === null) { missingFxRecords++; continue; }
    const amount = entry.amount * rate;
    if (entry.type === "company_income") otherIncome += amount;
    else if (entry.type === "company_expense") operatingExpenses += amount;
    else customerRefunds += amount;
  }
  const grossProfit = invoicedRevenue - costOfGoodsSold;
  const netProfit = grossProfit + otherIncome - operatingExpenses - customerRefunds;
  const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  return {
    currency,
    invoicedRevenue: round(invoicedRevenue),
    costOfGoodsSold: round(costOfGoodsSold),
    grossProfit: round(grossProfit),
    otherIncome: round(otherIncome),
    operatingExpenses: round(operatingExpenses),
    customerRefunds: round(customerRefunds),
    netProfit: round(netProfit),
    taxOnInvoices: round(taxOnInvoices),
    uncostedInvoiceLines,
    missingFxRecords,
  };
}

export function validateCompanyFinanceDatabase(value: unknown, companyId: CompanyId): value is CompanyFinanceDatabase {
  if (!value || typeof value !== "object") return false;
  const data = value as CompanyFinanceDatabase;
  if (data.schemaVersion !== 1 || data.companyId !== companyId) return false;
  const arrays: (keyof CompanyFinanceDatabase)[] = ["parties", "items", "procurementCases", "localSales", "invoices", "bankAccounts", "entries", "auditEvents"];
  if (!data.settings || typeof data.settings !== "object" || !arrays.every((key) => Array.isArray(data[key]))) return false;
  const { settings } = data;
  if (typeof settings.legalName !== "string" || typeof settings.baseCurrency !== "string" || settings.baseCurrency.length > 8 || (settings.baseCurrency !== "" && !/^[A-Z0-9]{3,8}$/.test(settings.baseCurrency))) return false;
  if (!Number.isFinite(settings.taxRate) || settings.taxRate < 0 || settings.taxRate > 100) return false;
  if (typeof settings.taxConfigured !== "boolean") return false;
  if (!["inclusive", "exclusive"].includes(settings.taxMode) || settings.inventoryMethod !== "moving_weighted_average") return false;
  if (settings.locale !== "en" && settings.locale !== "tr") return false;
  if (companyId === "arovin" && settings.locale !== "en") return false;
  const uniqueIds = (records: unknown[]) => records.every((record) => Boolean(record && typeof record === "object" && typeof (record as any).id === "string" && (record as any).id.length > 0))
    && new Set(records.map((record) => (record as any).id)).size === records.length;
  if (!arrays.every((key) => uniqueIds(data[key] as unknown[]))) return false;
  if (!data.items.every((item) => typeof item.sku === "string" && item.sku.trim() && typeof item.name === "string" && item.name.trim()
    && ["unit", "kg", "mt"].includes(item.unit) && typeof item.active === "boolean"
    && (item.weightPerUnitKg === undefined || (Number.isFinite(item.weightPerUnitKg) && item.weightPerUnitKg > 0))
    && (item.taxRate === undefined || (Number.isFinite(item.taxRate) && item.taxRate >= 0 && item.taxRate <= 100))
    && (item.defaultMarkupPercent === undefined || (Number.isFinite(item.defaultMarkupPercent) && item.defaultMarkupPercent >= 0)))) return false;
  if (new Set(data.items.map((item) => item.sku.toLowerCase())).size !== data.items.length) return false;
  if (!data.procurementCases.every((record) => record && typeof record.number === "string" && Array.isArray(record.lines) && Array.isArray(record.costs)
    && data.parties.some((party) => party.id === record.supplierId && party.kind === "supplier")
    && uniqueIds(record.lines) && uniqueIds(record.costs)
    && record.lines.every((line) => {
      const item = data.items.find((candidate) => candidate.id === line.itemId);
      return Boolean(item && item.unit === line.unit && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.receivedQuantity) && line.receivedQuantity >= 0 && line.receivedQuantity <= line.quantity && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && typeof line.currency === "string" && line.currency.trim());
    })
    && record.costs.every((cost) => Number.isFinite(cost.amount) && cost.amount >= 0 && (cost.taxAmount === undefined || (Number.isFinite(cost.taxAmount) && cost.taxAmount >= 0)) && ["value", "quantity", "weight", "direct"].includes(cost.allocation) && typeof cost.currency === "string" && cost.currency.trim()))) return false;
  if (new Set(data.procurementCases.map((record) => record.number.toLowerCase())).size !== data.procurementCases.length) return false;
  if (!data.localSales.every((sale) => sale && typeof sale.number === "string" && Array.isArray(sale.lines) && uniqueIds(sale.lines)
    && data.parties.some((party) => party.id === sale.customerId && party.kind === "customer")
    && (sale.currency.toUpperCase() === settings.baseCurrency.toUpperCase() ? sale.exchangeRateToBase === 1 : Number.isFinite(sale.exchangeRateToBase) && Number(sale.exchangeRateToBase) > 0)
    && sale.lines.every((line) => { const item = data.items.find((candidate) => candidate.id === line.itemId); return Boolean(item && item.unit === line.unit && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && Number.isFinite(line.taxRate) && line.taxRate >= 0 && line.taxRate <= 100 && (line.costBasisUnitPrice === undefined || (Number.isFinite(line.costBasisUnitPrice) && line.costBasisUnitPrice >= 0)) && (line.markupPercent === undefined || (Number.isFinite(line.markupPercent) && line.markupPercent >= 0))); }))) return false;
  if (new Set(data.localSales.map((sale) => sale.number.toLowerCase())).size !== data.localSales.length) return false;
  if (!data.invoices.every((invoice) => {
    if (!invoice || typeof invoice.number !== "string" || !invoice.number || !invoice.legalNameSnapshot?.trim() || !invoice.currency?.trim() || !Array.isArray(invoice.linesSnapshot) || !uniqueIds(invoice.linesSnapshot) || !settings.taxConfigured) return false;
    const sale = data.localSales.find((item) => item.id === invoice.localSaleId);
    if (!sale || sale.currency !== invoice.currency || sale.exchangeRateToBase !== invoice.exchangeRateToBase || JSON.stringify(sale.lines) !== JSON.stringify(invoice.linesSnapshot)) return false;
    if (invoice.taxMode !== "exclusive" && invoice.taxMode !== "inclusive") return false;
    const amounts = invoice.linesSnapshot.reduce((total, line) => {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 100) return { ...total, invalid: true };
      const gross = line.quantity * line.unitPrice;
      const rate = line.taxRate / 100;
      if (invoice.taxMode === "inclusive") {
        const tax = rate > 0 ? gross * rate / (1 + rate) : 0;
        return { subtotal: total.subtotal + gross - tax, tax: total.tax + tax, total: total.total + gross, invalid: total.invalid };
      }
      const tax = gross * rate;
      return { subtotal: total.subtotal + gross, tax: total.tax + tax, total: total.total + gross + tax, invalid: total.invalid };
    }, { subtotal: 0, tax: 0, total: 0, invalid: false });
    const round = (amount: number) => Number(amount.toFixed(2));
    return !amounts.invalid && round(amounts.subtotal) === invoice.subtotal && round(amounts.tax) === invoice.taxTotal && round(amounts.total) === invoice.total;
  })) return false;
  if (new Set(data.invoices.map((invoice) => invoice.number)).size !== data.invoices.length || new Set(data.invoices.map((invoice) => invoice.localSaleId)).size !== data.invoices.length) return false;
  if (!data.bankAccounts.every((account) => typeof account.name === "string" && account.name.trim() && typeof account.currency === "string" && account.currency.trim() && Number.isFinite(account.openingBalance) && typeof account.active === "boolean")) return false;
  if (!data.entries.every((entry) => {
    if (!Number.isFinite(entry.amount) || entry.amount <= 0 || typeof entry.description !== "string" || !entry.description.trim() || !entry.currency?.trim()) return false;
    if (!["supplier_payment", "supplier_refund", "case_cost", "customer_receipt", "customer_refund", "company_expense", "company_income", "bank_transfer"].includes(entry.type)) return false;
    if (entry.paymentMethod && !["cash", "bank", "check", "credit"].includes(entry.paymentMethod)) return false;
    if (entry.paymentMethod === "check" && (!entry.checkNumber?.trim() || !entry.checkMaturityDate || !["pending", "cleared", "void"].includes(entry.checkStatus || ""))) return false;
    if (entry.checkStatus === "cleared" && !entry.clearedAt) return false;
    if (entry.bankAccountId) {
      const account = data.bankAccounts.find((item) => item.id === entry.bankAccountId);
      if (!account || account.currency.toUpperCase() !== entry.currency.toUpperCase()) return false;
    }
    if (entry.transferBankAccountId) {
      const destination = data.bankAccounts.find((item) => item.id === entry.transferBankAccountId);
      const source = data.bankAccounts.find((item) => item.id === entry.bankAccountId);
      if (entry.type !== "bank_transfer" || !source || !destination || source.id === destination.id || source.currency.toUpperCase() !== destination.currency.toUpperCase() || source.currency.toUpperCase() !== entry.currency.toUpperCase()) return false;
    }
    if (entry.type === "bank_transfer" && (!entry.bankAccountId || !entry.transferBankAccountId || entry.paymentMethod)) return false;
    if (entry.paymentMethod === "bank" && !entry.bankAccountId) return false;
    if (entry.caseId && (entry.type !== "supplier_payment" || !data.procurementCases.some((item) => item.id === entry.caseId))) return false;
    if (entry.invoiceId) {
      const invoice = data.invoices.find((item) => item.id === entry.invoiceId);
      if (entry.type !== "customer_receipt" || !invoice || invoice.currency.toUpperCase() !== entry.currency.toUpperCase()) return false;
    }
    return true;
  })) return false;
  return true;
}
