export type CompanyId = "berakem" | "arovin";
export type CompanyLanguage = "en" | "tr";
export type QuantityUnit = "unit" | "kg" | "mt";
export type CompanyFinanceEntryType =
  | "supplier_payment"
  | "supplier_refund"
  | "case_cost"
  | "customer_receipt"
  | "customer_refund"
  | "company_expense"
  | "company_income"
  | "bank_transfer";

export interface CompanyFinanceSettings {
  legalName: string;
  baseCurrency: string;
  taxRate: number;
  taxConfigured: boolean;
  taxMode: "exclusive" | "inclusive";
  inventoryMethod: "moving_weighted_average";
  locale: CompanyLanguage;
  fiscalYearStart: string;
}

export interface CompanyFinanceParty {
  id: string;
  kind: "supplier" | "customer";
  name: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface CompanyFinanceItem {
  id: string;
  sku: string;
  name: string;
  nameTr?: string;
  unit: QuantityUnit;
  weightPerUnitKg?: number;
  taxRate?: number;
  defaultMarkupPercent?: number;
  active: boolean;
  createdAt: string;
}

export interface ProcurementLine {
  id: string;
  itemId: string;
  description: string;
  quantity: number;
  unit: QuantityUnit;
  unitPrice: number;
  currency: string;
  exchangeRateToBase?: number;
  receivedQuantity: number;
}

export interface ProcurementCost {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  exchangeRateToBase?: number;
  allocation: "value" | "quantity" | "weight" | "direct";
  lineAllocations?: Record<string, number>;
  taxAmount?: number;
  attachmentIds?: string[];
}

export interface ProcurementCase {
  id: string;
  number: string;
  supplierId: string;
  supplierReference?: string;
  currency: string;
  date: string;
  status: "draft" | "open" | "partially_received" | "received" | "closed";
  lines: ProcurementLine[];
  costs: ProcurementCost[];
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface LocalSaleLine {
  id: string;
  itemId: string;
  description: string;
  quantity: number;
  unit: QuantityUnit;
  unitPrice: number;
  taxRate: number;
  pricingMode?: "suggested" | "manual";
  costBasisUnitPrice?: number;
  markupPercent?: number;
}

export interface LocalSale {
  id: string;
  number: string;
  customerId: string;
  date: string;
  currency: string;
  exchangeRateToBase?: number;
  status: "draft" | "quoted" | "confirmed" | "delivered" | "closed";
  lines: LocalSaleLine[];
  paymentTerms?: string;
  creditMarkupPercent?: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface CompanyInvoice {
  id: string;
  number: string;
  localSaleId: string;
  issuedAt: string;
  dueAt?: string;
  status: "draft" | "issued" | "partially_paid" | "paid" | "void";
  legalNameSnapshot: string;
  customerSnapshot: string;
  currency: string;
  exchangeRateToBase?: number;
  taxMode: "exclusive" | "inclusive";
  linesSnapshot: LocalSaleLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  templateId?: string;
  createdAt: string;
  createdBy: string;
}

export interface CompanyBankAccount {
  id: string;
  name: string;
  bankName?: string;
  accountReference?: string;
  currency: string;
  openingBalance: number;
  active: boolean;
  createdAt: string;
}

export interface CompanyFinanceEntry {
  id: string;
  date: string;
  type: CompanyFinanceEntryType;
  amount: number;
  currency: string;
  description: string;
  reference?: string;
  partyId?: string;
  caseId?: string;
  saleId?: string;
  invoiceId?: string;
  bankAccountId?: string;
  transferBankAccountId?: string;
  paymentMethod?: "cash" | "bank" | "check" | "credit";
  checkNumber?: string;
  checkMaturityDate?: string;
  checkStatus?: "pending" | "cleared" | "void";
  clearedAt?: string;
  exchangeRateToBase?: number;
  createdAt: string;
  createdBy: string;
  reversesEntryId?: string;
}

export interface CompanyFinanceAuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: "created" | "updated" | "posted" | "reversed";
  actorId: string;
  actorName: string;
  at: string;
  reason?: string;
}

export interface CompanyFinanceDatabase {
  schemaVersion: 1;
  companyId: CompanyId;
  settings: CompanyFinanceSettings;
  parties: CompanyFinanceParty[];
  items: CompanyFinanceItem[];
  procurementCases: ProcurementCase[];
  localSales: LocalSale[];
  invoices: CompanyInvoice[];
  bankAccounts: CompanyBankAccount[];
  entries: CompanyFinanceEntry[];
  auditEvents: CompanyFinanceAuditEvent[];
}

export interface CompanyFinanceCosting {
  caseId: string;
  lineId: string;
  purchaseCost: number;
  allocatedAncillaryCost: number | null;
  landedCost: number | null;
  costPerUnit: number | null;
  currency: string;
  complete: boolean;
  issues: string[];
}

export interface InventoryCostSummary {
  itemId: string;
  unit: QuantityUnit;
  receivedQuantity: number;
  totalCost: number | null;
  averageCostPerUnit: number | null;
  currency: string;
  complete: boolean;
  issues: string[];
}

export interface CompanyProfitSummary {
  currency: string;
  invoicedRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  otherIncome: number;
  operatingExpenses: number;
  customerRefunds: number;
  netProfit: number;
  taxOnInvoices: number;
  uncostedInvoiceLines: number;
  missingFxRecords: number;
}
