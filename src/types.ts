export type Language = "fa" | "en";

export type UserRole =
  | "superadmin" // مدیر ارشد - دسترسی کامل
  | "sales_manager" // مدیر بازرگانی - سفارشات، مشتریان، انبار، تقویم و تسک‌ها
  | "accountant" // حسابدار ارشد - حسابداری، صندوق، سود، کمیسیون، تسویه‌ها
  | "logistics" // کارشناس لجستیک - پیگیری بارنامه‌ها، کانتینرها و تقویم
  | "sales_rep" // کارشناس فروش - صدور پروفرما، استعلام قیمت، تسک‌ها
  | "partner_office" // دفتر خارجی - فقط پرونده‌های اختصاص‌یافته
  | "sales_agent" // ایجنت فروش - فقط پرونده و صورت‌حساب قابل ارائه
  | "company_finance"; // دفتر مالی مستقل شرکت زیرمجموعه

export interface AppUser {
  id: string;
  username: string;
  name: string;
  nameEn: string;
  email: string;
  role: UserRole;
  avatar?: string;
  active: boolean;
  phone?: string;
  createdAt?: string;
  passwordHash?: string;
  passwordResetRequested?: boolean;
  permissions?: ActiveTab[];
  dashboardWidgets?: string[];
  dashboardHiddenWidgets?: string[];
  dashboardShortcuts?: ActiveTab[];
  assignedSupplierIds?: number[];
  accessibleOrderIds?: number[];
  preferredPortalLanguage?: "en" | "tr";
  /** Tenant assigned to a company-finance login. Ignored for every other role. */
  companyId?: "berakem" | "arovin";
  /** Canonical agent name selected from existing proformas. */
  agentName?: string;
}

export interface PurchaseLedgerEntry {
  id: string;
  type: "supplier_payment" | "supplier_receipt" | "case_expense" | "refund";
  date: string;
  amount: number;
  currency: string;
  description: string;
  reference?: string;
  attachments?: FileAttachment[];
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
}

export interface CaseMessage {
  id: string;
  orderId: number;
  authorUserId?: string;
  authorName: string;
  body: string;
  createdAt: string;
  attachments?: FileAttachment[];
}

export interface PurchaseProforma {
  id: string;
  number: string;
  date: string;
  supplierId?: number;
  supplierName?: string;
  currency: string;
  totalAmount: number;
  unitPrice?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  etd?: string;
  eta?: string;
  status?: "draft" | "confirmed" | "partially_paid" | "paid" | "closed";
  notes?: string;
  files?: FileAttachment[];
  ledger?: PurchaseLedgerEntry[];
}

/** Safe, agent-facing accounting view. It never includes purchase cost or internal margins. */
export interface AgentStatementView {
  quoteIncludesFreight?: boolean;
  freightToAddPerMT?: number;
  quantityMT: number;
  sellPricePerMT: number;
  priceToAgentPerMT: number;
  agentMargin: number;
  currency: string;
  allocations: { name: string; amount: number }[];
}

/** A user-defined financial view made from one or more commercial cases. */
export interface AccountingList {
  id: string;
  name: string;
  description?: string;
  orderIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  priority: "high" | "medium" | "low";
  category: "sales" | "accounting" | "logistics" | "procurement" | "general";
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
  assignedToUserId?: string;
  assignedToName?: string;
  relatedOrderId?: number;
  relatedProformaId?: string;
  relatedCustomerId?: number;
  relatedCustomerName?: string;
  resultNote?: string; // نتیجه کار یا یادداشت پایانی تسک
  notes?: string; // یادداشت‌ها و پیوست‌ها
  createdAt: string;
  completedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  titleEn?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  type: "etd" | "eta" | "pi_validity" | "payment_due" | "meeting" | "custom" | "task";
  priority?: "high" | "medium" | "low";
  relatedOrderId?: number;
  proformaInvoiceId?: string;
  customerName?: string;
  description?: string;
  completed?: boolean;
}

export interface CashPartner {
  category?: "customer" | "agent" | "commission_recipient" | "investor" | "owned_company" | "supplier";
  mergedPartyIds?: string[];
  mergedPartyRecords?: Omit<CashPartner, "mergedPartyRecords">[];
  isFundingSource?: boolean;
  fundingCompany?: "Arcatav" | "Berakem" | "Arovin";
  isCustomer?: boolean;
  isSupplier?: boolean;
  entityType?: "person" | "company";
  aliases?: string[];
  id: string;
  name: string;
  nameEn?: string;
  role?: string;
  color?: string;
  isDefault?: boolean;
  defaultCurrency?: string;
  balances?: {
    USD?: number;
    EUR?: number;
    AED?: number;
    CAD?: number;
    TL?: number;
    GBP?: number;
    CNY?: number;
  };
}

export interface OrderCustomShare {
  id: string;
  partnerId?: string;
  partnerName: string;
  role?: string;
  amount: number;
  currency?: string;
  notes?: string;
}

/** سهم محاسبه‌شدهٔ شرکت‌ها در هر پرونده؛ هنگام ذخیرهٔ PI ثبت می‌شود. */
export interface CompanyProfitShare {
  companyName: string;
  source: string;
  amount: number;
}

/** Explicit confirmation of historical settlement; not a new cash movement. */
export interface ProfitSettlementConfirmation {
  id:string; listId:string; listName:string; date:string; confirmedAt:string; note:string;
  currency:string; profitAmount:number; receiptConfirmed:boolean;
  shares:{partyId:string;partyName:string;additionalPaid:number;advanceApplied:number;entitlement:number}[];
}

export interface CommissionSettlement {
  id: string;
  /** advance is paid from Arcatav cash before the commission is earned. */
  type: "received" | "paid" | "advance" | "advance_repayment" | "advance_offset";
  partyId?: string;
  partyName: string;
  amount: number;
  currency: string;
  date: string;
  note?: string;
  createdAt: string;
}

/** A reusable, supplier-neutral rule for allocating a case margin. */
export type ProfitRuleBasis =
  | "distributable_margin"
  | "issuer_margin"
  | "agent_margin"
  | "purchase_total"
  | "transaction_total";

export interface ProfitAllocationRule {
  id: string;
  beneficiaryId?: string;
  beneficiaryName: string;
  beneficiaryRole: "company" | "commission_party" | "investor" | "bank" | "agent" | "arcatav";
  basis: ProfitRuleBasis;
  method: "percent" | "per_mt" | "fixed";
  value: number;
  /** Agent-facing reports only expose rules explicitly marked for the agent. */
  visibility: "internal" | "agent";
}

export interface SupplierProfitProfile {
  id: string;
  enabled: boolean;
  route: "direct" | "agent";
  agentSharePercent?: number;
  bankChargePercentOfPurchase?: number;
  bankChargeName?: string;
  transactionSharePerMT?: number;
  rules: ProfitAllocationRule[];
}

/** The applied copy of the supplier profile on a PI, kept for auditability. */
export interface CaseProfitPlan {
  /** Per-product profitability inputs. Commercial documents stay unchanged; the
   * common route, agent and allocation rules are still applied once to the
   * summed case profit. */
  itemProfitInputs?: Record<string, Partial<Record<"quantityMT" | "purchasePricePerMT" | "sellPricePerMT" | "priceToAgentPerMT" | "freight", number>>>;
  capitalPartners?: { partyId: string; sharePercent: number }[];
  manualShare?: { role: "issuer" | "arcatav" | "agent"; amount: number };
  /** Explicit workbench inputs, including zero; absent keys inherit the current source. */
  accountingOverrides?: Partial<Record<"quantityMT" | "purchasePricePerMT" | "sellPricePerMT" | "priceToAgentPerMT" | "freight" | "landedCostPerMT" | "marginPerMT" | "bankCharge", number>>;
  profitBasis?: "auto" | "estimate" | "actual";
  /** Distribution method applies to estimates and actuals alike. Kept under its original key for compatibility. */
  actualDistribution?: "two_pools" | "net_waterfall";
  issuerSharePercent?: number;
  issuerShareOverride?: { enabled: boolean; method: "percent" | "per_mt"; value: number; weightUnit?: "MT" | "KG" };
  profitToUSDExchangeRate?: number;
  /** Invoice-currency units per one profit-currency unit; does not alter issued documents. */
  settlementExchangeRate?: number;
  commissionOrder?: "before_issuer" | "after_issuer";
  purchaseIncludesFreight?: boolean;
  agentQuoteIncludesFreight?: boolean;
  profileId?: string;
  route: "direct" | "agent";
  agentId?: string;
  agentName?: string;
  agentVisibleSellPrice?: number;
  agentSharePercent?: number;
  rules?: ProfitAllocationRule[];
  bankChargePercentOfPurchase?: number;
  bankChargeName?: string;
  transactionSharePerMT?: number;
  /**
   * Accounting-only overrides. Empty values deliberately inherit the PI values;
   * these figures must never change the commercial document that was issued.
   */
  calculationQuantityMT?: number;
  calculationPurchasePricePerMT?: number;
  calculationSellPricePerMT?: number;
  calculationPriceToAgentPerMT?: number;
  calculationFreight?: number;
  calculationVersion?: number;
}

export interface IssuerCompanyShare {
  id: string;
  name: string;
  arcaPercent: number;
}

export interface PrintParagraphStyle {
  bold?: boolean;
  fontSizePt?: number;
  spaceAfterPt?: number;
  align?: "left" | "right" | "center" | "justify";
}

export interface PrintTemplateConfig {
  textSizes?: { productNamePt?: number; productDetailPt?: number; tablePt?: number; sectionTitlePt?: number };
  artworkSizeOverrides?: { stampSize?: number; signatureSize?: number };
  termsStyle?: PrintParagraphStyle;
  termOverrides?: Record<string, PrintParagraphStyle & { text?: string; title?: string }>;
  templateStyle?: "standard_berakem" | "modern_corporate" | "minimal_clean" | "executive_blue" | "teal_multi_item" | "graphite_copper";
  headerColor?: string;
  showExchangeRate?: "auto" | "always" | "never";
  showCommercialId?: boolean;
  showCountryBeneficiary?: boolean;
  showConsignee?: boolean;
  consigneeText?: string;
  showTotalCube?: boolean;
  showGrossWeight?: boolean;
  showPartialShipment?: boolean;
  showHsCode?: boolean;
  showPackingColumn?: boolean;
  showFreightRow?: boolean;
  showOtherExpRow?: boolean;
  showDiscountRow?: boolean;
  showBankDetails?: boolean;
  showSignatory?: boolean;
  showStampSignature?: boolean;
  fontSize?: "compact" | "standard" | "large";
  logoSize?: number;
  signatureSize?: number;
  stampSize?: number;
  pageMarginMm?: number;
  /** Shared ARCATAV mark used on issued commercial-document package covers. */
  issuedDocumentsLogo?: string;
  customNotes?: string[];
  customExtraFields?: { id?: string; label: string; value: string }[];
}

export interface DocumentTemplate {
  layoutMode?: "standard" | "free";
  id: string;
  name: string;
  documentType: "PI" | "SALES_CONTRACT" | "COMMERCIAL_INVOICE" | "PACKING_LIST" | "COO" | "COA" | "BL" | "COVER";
  theme?: "standard_berakem" | "modern_corporate" | "minimal_clean" | "executive_blue" | "teal_multi_item" | "graphite_copper";
  /** SupplierID of the seller that issues the linked proforma. */
  issuerCompanyId: string;
  country: string;
  imageData?: string;
  backgroundColor?: string;
  /** Default typography for values placed on this document template. */
  fontFamily?: string;
  fontSize?: number;
  fields?: DocumentTemplateField[];
  isBuiltIn?: boolean;
  isActive?: boolean;
  createdAt: string;
}

export interface DocumentTemplateField {
  id: string;
  label: string;
  source: string;
  customValue?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  zIndex?: number;
  rotation?: number;
}

export interface CommercialDocumentFile {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  /** HTML converted from a pasted page, DOCX or spreadsheet and editable in the print workspace. */
  editableHtml?: string;
  sourceKind?: "upload" | "pasted" | "word" | "excel";
  pageNumber: number;
  uploadedAt: string;
  /** Retained as source evidence but intentionally omitted from issued output. */
  excludeFromPrint?: boolean;
}

/** A named, supplier-specific Technical Data Sheet stored on a product. */
export interface ProductTdsDocument {
  id: string;
  name: string;
  supplierId?: number;
  contentAlignment?: "left" | "center" | "right";
  pages: CommercialDocumentFile[];
  /** Optional draft created on demand from an uploaded source; it never replaces the source file. */
  extraction?: TechnicalDocumentExtraction;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFont {
  id: string;
  name: string;
  family: string;
  mimeType: string;
  data: string;
  createdAt: string;
}

export interface ProformaClause {
  id: string;
  category: "terms" | "payment" | "delivery" | "bank" | "packing" | "remarks" | "custom";
  title: string;
  titleEn?: string;
  content: string;
  contentEn?: string;
}

export type ActiveTab =
  | "dashboard"
  | "proforma"
  | "accounting"
  | "optimized_workspace_preview"
  | "accounting_reference_preview"
  | "business_accounting_preview"
  | "cash"
  | "calendar"
  | "tasks"
  | "customers"
  | "suppliers"
  | "products"
  | "pricing"
  | "operations"
  | "customer_accounts"
  | "correspondence"
  | "settings"
  | "logistics"
  | "users"
  | "localsales"
  | "backup"
  | "access_import"
  | "access_entry_preview"
  | "profit_calculator_preview"
  | "analytics"
  | "reports"
  | "outlook_center"
  | "cheque_issuer"
  | "partner_portal"
  | "company_finance";

/** A standalone cheque-printing record. It is intentionally excluded from all accounting calculations. */
export interface PrintedCheque {
  id: string;
  chequeNumber: string;
  issueDate: string;
  payee: string;
  amount: number;
  currency: "CAD";
  amountWords?: string;
  memo?: string;
  status: "draft" | "printed" | "void";
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

export type ChequePrintField = "date" | "payee" | "amount" | "amountWords" | "memo";
export interface ChequePrintFieldStyle {
  left: number;
  top: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
}
export interface ChequePrintSettings {
  version?: number;
  template: "bmo_canada_158x68";
  fields: Record<ChequePrintField, ChequePrintFieldStyle>;
}
export interface ChequePrintFormat {
  id: string;
  name: string;
  settings: ChequePrintSettings;
  createdAt: string;
}

export interface Customer {
  CustomerID: number;
  CustomerName: string;
  Address?: string;
  Tel?: string;
  CommercialID?: string;
  City?: string;
  Country?: string;
  Email?: string;
  Activity?: string;
  createdAt?: string;
}

export interface OrderCustomShare {
  id: string;
  partnerId?: string;
  partnerName: string;
  amount: number;
  percentage?: number;
  role?: string;
  currency?: string;
  paid?: boolean;
}

export interface Supplier {
  SupplierID: number;
  SupplierName: string;
  Address: string;
  Tel: string;
  Email: string;
  LogoT?: string;
  SignT?: string;
  StampT?: string;
  Bank: string;
  BankBranch?: string;
  BankAddress?: string;
  SwiftCode?: string;
  AccountNo?: string;
  IBAN?: string;
  Signatory: string;
  TaxT?: string;
  Country?: string;
  ProformaPrefix?: string;
  PrintCompanyFontFamily?: string;
  PrintCompanyFontSize?: number;
  /** Per-supplier dimensions for the signature and stamp on printed commercial documents. */
  PrintSignatureSize?: number;
  PrintStampSize?: number;
  /** Default profit model, applicable regardless of the supplier's company name. */
  profitProfile?: SupplierProfitProfile;
}

export interface Product {
  ProductID: number;
  ProductName: string;
  ChemicalName?: string;
  HSCODE?: string;
  PackingDetail?: string;
  Application?: string;
  Standard?: string;
  ExportGrade?: string;
  Density?: string;
  StorageTemp?: string;
  SafetyNotes?: string;
  DefaultUnitPrice?: number;
  attachments?: FileAttachment[];
  coaFiles?: CommercialDocumentFile[];
  blFiles?: CommercialDocumentFile[];
  COANumber?: string;
  COADate?: string;
  tdsDocuments?: ProductTdsDocument[];
  msdsDocuments?: ProductTdsDocument[];
}

export interface FileAttachment {
  id: string;
  name: string;
  category: "technical" | "financial" | "other";
  mimeType: string;
  data: string;
  uploadedAt: string;
  /** Explicitly approved for the agent portal. Issued document filename patterns are also supported for legacy files. */
  agentVisible?: boolean;
}

/** Draft-only extraction from a TDS/COA source. Values must be reviewed before use in issued documents. */
export interface TechnicalDocumentExtraction {
  attachmentId: string;
  attachmentName: string;
  documentKind: "COA" | "TDS" | "OTHER";
  productName?: string;
  batchNumber?: string;
  documentNumber?: string;
  productDate?: string;
  expiryDate?: string;
  specifications: Array<{ property: string; specification: string; result?: string; status: "needs_review" | "ready" }>;
  /** Headings detected from the uploaded source; no placeholder columns are added. */
  columnHeaders?: { property: string; specification: string; result?: string };
  sourceText: string;
  extractedAt: string;
  status: "draft" | "approved";
  /** Explicit user decision: the edited draft, rather than its source PDF, is used for the issued COA. */
  useForIssuedDocument?: boolean;
}

export interface TDSDetail {
  TDSDetailID: number;
  TDSID: number;
  Description: string;
  TDSValue: string;
  Unit: string;
  TestStandard?: string;
}

export interface TDS {
  TDSID: number;
  ProductID: number;
  ProductName?: string;
  LotNo: string;
  TDS_Date: string;
  Producer: string;
  Flash_Point?: string;
  Flash_Point_Unit?: string;
  Viscosity?: string;
  Viscosity_unit?: string;
  Melting_point?: string;
  Melting_point_unit?: string;
  Density?: string;
  Density_unit?: string;
  Volatile?: string;
  Volatile_unit?: string;
  Color?: string;
  Physical_form?: string;
  Packing?: string;
  Flash_Point_Test?: string;
  Viscosity_unit_Test?: string;
  Melting_point_Test?: string;
  Density_Test?: string;
  Volatile_Test?: string;
  details?: TDSDetail[];
}

export interface OrderDetail {
  OrderDetailID: number;
  OrderID: number;
  ProductID: number;
  ProductName?: string;
  ChemicalName?: string;
  HSCODE?: string;
  Quantity: number;
  /** MT is the default. KG keeps the entered value in kilograms and is normalized only for weight-based calculations. */
  QuantityUnit?: "MT" | "KG";
  UnitPrice: number;
  /** قیمت توافقی با مشتری برای همین قلم؛ ورودی محاسبهٔ خودکار قیمت مبدأ. */
  AgreedCustomerPrice?: number;
  /** قیمت واحد پیش از تخصیص هزینه حمل؛ برای محاسبه مجدد هزینه حمل مشترک نگهداری می‌شود. */
  BaseUnitPrice?: number;
  /** سهم هزینه حمل این قلم از هزینه حمل کل پروفرما. */
  FreightAllocation?: number;
  ProductDescription?: string;
  NosAndKindOfPackages?: string;
  GrossWeight?: number;
  // Computed
  ExtPrice?: number;
  UnitEx?: number;
  ExtEx?: number;
  InvoiceUnitPrice?: number;
  UseManualInvoicePrice?: boolean;
}

/** Customer-facing values for a Sales Contract; never used by accounting. */
export interface SalesContractItem {
  orderDetailId: number;
  quantity?: number;
  unitPrice?: number;
}

export interface ContainerSealEntry {
  containerNo: string;
  sealNo: string;
}

/** A non-financial shipment stage used to issue separate shipping documents. */
export type PartialShipmentDocumentType = "PACKING_LIST" | "COO" | "COMMERCIAL_INVOICE";

export interface PartialShipmentItem {
  /** Matches OrderDetailID (or the row index for legacy rows without an ID). */
  orderDetailId: number;
  quantity: number;
  grossWeight: number;
  /** Net weight printed for this physical shipment item, in KG. */
  netWeight?: number;
  /** Optional package wording specific to this truck/container stage. */
  packages?: string;
}

/**
 * A physical shipment stage. It deliberately never participates in financial
 * calculations; it is only the source of separately issued shipping papers.
 */
export interface PartialShipment {
  id: string;
  title: string;
  date?: string;
  packingListId?: string;
  /** Independent certificate number/barcode for a split COO. */
  cooId?: string;
  cooBarcodeNo?: string;
  /** Optional uploaded replacement for the system-generated split COO. */
  cooFiles?: CommercialDocumentFile[];
  /** Total net shipment weight, used identically by Packing List and COO. */
  netWeight?: number;
  truckNo?: string;
  vesselName?: string;
  voyageNumber?: string;
  containerSealEntries?: ContainerSealEntry[];
  documents: PartialShipmentDocumentType[];
  items: PartialShipmentItem[];
}

export interface RialSale {
  id: string;
  date: string;
  amount: number;
  unit: "IRR" | "TOMAN";
  /** Units of the selected money unit per one USD, fixed for this sale. */
  ratePerUSD: number;
  note?: string;
}

export interface Order {
  /** Read-only consolidated projection. Never stored as a standalone proforma. */
  ConsolidatedGroupId?: string;
  ConsolidatedMemberOffsets?: CommissionSettlement[];
  ConsolidatedSalesUSD?: number;
  ConsolidatedHasSales?: boolean;
  ConsolidatedMissingFX?: boolean;
  RialSalesEnabled?: boolean;
  rialSales?: RialSale[];
  /** Printed buyer and economic owner are separate identities. */
  TradeOwnership?: "customer" | "own_account";
  EconomicOwnerPartyId?: string;
  OrderID: number;
  ProformaInvoiceID: string;
  RelatedPI?: string;
  SupplierID: number;
  CustomerID: number;
  SupplierName?: string;
  CustomerName?: string;
  PIDate: string;
  TransportaionMode: string; // Sea, Air, Road, Rail
  CountryOfOrigin: string;
  CountryOfDestination: string;
  PortOfDischarge: string;
  PortOfLoading: string;
  TermsOfDelivery: string; // FOB, CFR, CIF, CPT, EXW, FCA
  FinalPlaceOfDelivery: string;
  TermsOfPayment: string; // 100% TT, LC at sight, etc.
  TransactionCurrency: string; // USD, EUR, AED, CAD, CNY, TRY
  ExchangeRate: number;
  TypeOfEXRate?: string;
  TotalGrossWeight: string;
  TotalNetWeight?: number;
  TotalCube: string; // CBM
  Freight: number;
  Discount: number;
  Note: string;
  CountryOfBeneficiary: string;
  TranspotationModeMeans?: string;
  PartialShipment: string; // Allowed / Not Allowed
  NameOfSignatory?: string;
  CommercialInvoiceID?: string;
  CommercialInvoiceDate?: string;
  /** Optional override for the date printed as "Date Of Issue" on the Commercial Invoice. */
  CommercialInvoiceIssueDate?: string;
  CommercialInvoiceStamp?: "ORIGINAL" | "DRAFT" | "";
  PackingListID?: string;
  PackingListDate?: string;
  /** Optional override for the date printed as "Date Of Issue" on the Packing List. */
  PackingListIssueDate?: string;
  PackingListStamp?: "ORIGINAL" | "DRAFT" | "";
  /** Physical shipment stages for split packing/COO documents; never financial. */
  partialShipments?: PartialShipment[];
  /** Optional customer-facing Sales Contract values, isolated from the PI. */
  SalesContractID?: string;
  SalesContractDate?: string;
  SalesContractCurrency?: string;
  SalesContractFreight?: number;
  SalesContractItems?: SalesContractItem[];
  COOId?: string;
  /** Stable numeric value encoded and printed above the Turkey COO certificate. */
  COOBarcodeNo?: string;
  COODate?: string;
  COOReferenceNo?: string;
  COOReferenceCode?: string;
  COOPlaceOfIssue?: string;
  COORetrospective?: boolean;
  COOIssuedUponRequest?: boolean;
  /** Optional uploaded replacement for the system-generated COO. */
  cooFiles?: CommercialDocumentFile[];

  // Calculation parameters
  TargetPrice?: number;
  FreightFcl?: number;
  QtyFcl?: number;
  NumberFcl?: number;
  TotalQuantity: number; // in KG or MT

  // Shares and Commissions
  ArcaShare: number;
  BeraShare: number;
  Hesam: number;
  Reza: number;
  Jalali: number;
  Lida: number;
  Hamid: number;
  Moradi: number;
  Mahsa: number;
  Arash: number;
  Arovin: number;
  Khusru: number;
  Nazanin?: number;
  Berabank: number;
  Extra: number;
  Commission: number;
  TotalCommission: number;

  // Status flags
  BuyerPaid: boolean;
  ThirdPartyPaid: boolean;
  CommissionPaid: boolean;
  /** Whether the physical/commercial document package has been delivered. */
  DocumentsDelivered?: boolean;
  ActiveOrder: boolean;
  LifecycleStatus?: "active" | "on_hold" | "completed" | "cancelled";
  TargetOrder?: boolean;
  Target?: boolean;
  IsDummy?: boolean; // پروفرمای صوری / آزمایشی (Dummy)
  ExcludeFromCalculations?: boolean; // مستثنی از محاسبات مالی و آماری

  // Profit model: all monetary values are per MT unless noted otherwise.
  IssuerCompanyId?: string;
  BankSharePercent?: number;
  OverPayment?: number;
  CustomerRefund?: number;
  HasSalesAgent?: boolean;
  PriceToAgent?: number;
  EndCustomerPrice?: number;
  /** سهم آرکاتاو از سود فروش به آروین/براکم؛ در نمونه برابر دو سوم است. */
  DirectArcaSharePercent?: number;
  AgentCompanySharePercent?: number;
  companyProfitShares?: CompanyProfitShare[];
  /** Supplier-neutral accounting plan applied to this case. */
  OwnAccountSaleSettled?: boolean;
  profitPlan?: CaseProfitPlan;
  dummyInvoicePreset?: {
    enabled: boolean;
    currency: string;
    rate: number;
    rows: Record<string, { quantity: number; unitPriceBase: number; grossWeight: number }>;
    freightBase: number | null;
    freightOverride: number | null;
    totalOverride: number | null;
  };
  printFigurePresets?: Record<string, {
    enabled: boolean;
    items: Record<string, { quantity?: number; unitPrice?: number; grossWeight?: number }>;
    freight: number | null;
    totalAmountDue: number | null;
  }>;
  printTermsConfig?: Pick<PrintTemplateConfig, "customNotes" | "termsStyle" | "termOverrides">;

  // Financial & Shipping Calculations
  NetFob: number;
  CFRNet: number;
  SellPrice: number;
  Margin: number;
  MarginM?: number;
  CostPrice?: number;
  PackWeight?: number;
  PI_Valid_Days: number;
  SC_Valid_Days: number;
  ScCurrency?: string;
  ScNote?: string;
  DocumentType?: string;
  Remarks?: string;

  // Commercial Shipping Details
  InvoiceNo?: string;
  InvoiceDate?: string;
  SailingDate?: string;
  LoadingPort?: string;
  Carrier?: string;
  ContainerNo?: string;
  TruckNo?: string;
  ContainerSealEntries?: ContainerSealEntry[];
  VesselName?: string;
  VoyageNumber?: string;
  OrderStatus?: string;
  ShipmentRef?: string;
  BLNo?: string;
  ETD?: string;
  ETA?: string;
  Followup?: string;

  // Multi-Currency & Conversion fields
  AgreementCurrency?: string; // ارز توافق با خریدار (مثلاً USD یا EUR)
  InvoiceCurrency?: string; // ارز صدور پیش‌فاکتور (مثلاً AED, EUR, USD, TRY)
  ExchangeRateApplied?: number; // نرخ تسعیر توافق به فاکتور
  IsExchangeRateUsed?: boolean;
  AgreementSellPrice?: number;
  ConvertedSellPrice?: number;
  AgreementTotalAmount?: number;
  ConvertedTotalAmount?: number;

  // Dynamic Clauses & Terms
  CustomClauses?: ProformaClause[];
  ProformaTerms?: string[];
  PaymentTermsList?: string[];
  DeliveryTermsList?: string[];

  // Dynamic Partner Shares
  customShares?: OrderCustomShare[];
  commissionSettlements?: CommissionSettlement[];
  profitSettlementConfirmations?: ProfitSettlementConfirmation[];

  // Commission letter
  TransferedAmount?: number;
  TransferExrate?: number;
  ManualCLA?: number;
  CommissionLetterAmount?: number;

  // Items
  items?: OrderDetail[];
  attachments?: FileAttachment[];
  technicalDocumentExtraction?: TechnicalDocumentExtraction;
  purchaseProforma?: PurchaseProforma;
  caseMessages?: CaseMessage[];
  agentStatement?: AgentStatementView;
}

export interface CompanyLedgerEntry {
  id: string;
  company: "Arcatav" | "Berakem" | "Arovin" | "Exchange";
  type: "receipt" | "payment" | "expense" | "deposit" | "withdrawal" | "intercompany_receivable" | "intercompany_payable" | "intercompany_receivable_settlement" | "intercompany_payable_settlement";
  amount: number;
  currency: "USD" | "EUR" | "AED" | "TRY" | "CAD" | "GBP";
  date: string;
  description: string;
  reference?: string;
  orderId?: number;
  /** طرف مقابل و شناسهٔ مشترک چهار سند انتقال بین‌شرکتی. */
  counterpartyCompany?: "Arcatav" | "Berakem" | "Arovin";
  transferId?: string;
}

export interface CashEntry {
  CashID: number;
  CashDate: string;
  Note: string;
  // Accounts
  HesamEUR: number;
  RezaEUR: number;
  HesamUSD: number;
  RezaUSD: number;
  HesamTL: number;
  RezaTL: number;
  HesamAED: number;
  RezaAED: number;
  HesamCAD: number;
  RezaCAD: number;

  // Debts
  HesamDebtEUR: number;
  RezaDebtEUR: number;
  HesamDebtUSD: number;
  RezaDebtUSD: number;
  HesamDebtTL: number;
  RezaDebtTL: number;
  HesamDebtAED: number;
  RezaDebtAED: number;
  HesamDebtCAD: number;
  RezaDebtCAD: number;

  ThirdPartyDebtEUR: number;
  ThirdPartyDebtUSD: number;
  ThirdPartyDebtTL: number;
  ThirdPartyDebtAED: number;
  ThirdPartyDebtCAD: number;

  // Company / Office / Entities
  OfficeEUR: number;
  OfficeUSD: number;
  ArovinAED: number;
  BerakemEUR: number;
  BerakemUSD: number;
  VanpexCAD: number;
  TaleUSD: number;
  TaleEUR: number;
  TaleCAD: number;
  TaleTR: number;
  TaleAED: number;
  /** New multi-currency matrix. Legacy fields remain supported for imported CashF records. */
  accounts?: Record<string, number>;
}

export interface PriceEntry {
  PriceID: number;
  Product: string;
  Supplier: string;
  Manufacturer: string;
  PriceDate: string;
  PriceFOB: number;
  PriceUnit: string;
  Freight: number;
  CFR_CPT_NET: number;
  DeliveryTerm: string;
  Shipment_in: string;
  Customer: string;
  Offer: number;
  Note: string;
}

export interface Inquiry {
  InquiryID: number;
  InquiryNo?: string;
  InquiryDate?: string;
  InqDate?: string;
  CustomerName?: string;
  Customer?: string;
  ProductName?: string;
  Product?: string;
  QuantityMT?: number;
  Quantity?: string;
  DeliveryTerm?: string;
  Supplier?: string;
  Validity?: string;
  TargetPrice?: number;
  Offer?: number;
  Currency?: string;
  Status?: string;
  Note?: string;
}

export interface CostDetail {
  CID: number;
  OrderID: number;
  CSubject: string;
  CDate: string;
  CAmount: number;
}

export interface GeneralCost {
  GID: number;
  GDescription: string;
  GDate: string;
  GAmount: number;
  GCurrency: string;
  GReceiver: string;
  GFromAccount: string;
  GToAccount: string;
  GBank: string;
  Greference: string;
  GType: string;
}

export interface SaleDetail {
  SID: number;
  OrderID: number;
  Sbuyer: string;
  SQty: number;
  SPrice: number;
  STax: number;
  SRef: string;
  SBank: string;
  SNote: string;
  SAgent: string;
  SAgentShareUnit: number;
  SPDate: string;
  SPaymentStat: boolean;
  SReceivedAmount: number;
}

export interface OrderTransaction {
  TransactionID: number;
  /** One accounting event can create several postings; this is their shared audit key. */
  JournalID?: string;
  OrderID: number;
  Amount: number;
  Exchange_Rate: number;
  PaytDate: string;
  Slip?: string;
  Note: string;
  TransactionType?: "commission_advance" | "commission_advance_repayment" | "commission_receipt" | "capital_repayment" | "own_sale_receipt" | "own_sale_refund" | "company_loan_receipt" | "funding_repayment" | "customer_receipt" | "credit_allocation" | "temporary_credit_allocation" | "temporary_credit_repayment" | "customer_refund" | "order_expense" | "supplier_payment" | "supplier_refund" | "partner_settlement" | "arca_loan_repayment" | "stakeholder_fund_contribution" | "case_fund_transfer" | "stakeholder_case_loan" | "stakeholder_case_loan_repayment";
  /** Currency actually received or paid (for example USD, EUR or AED). */
  PaymentCurrency?: string;
  /** Currency of the related proforma. */
  ProformaCurrency?: string;
  /** Amount after conversion to the related proforma currency. */
  ConvertedAmount?: number;
  /** Origin order when customer credit is allocated to another proforma. */
  SourceOrderID?: number;
  /** Amount consumed from the source order's credit, in source proforma currency. */
  SourceAmount?: number;
  /** Original temporary allocation being repaid, including partial repayments. */
  LinkedTransactionID?: number;
  /** Receipt images/PDFs stored with the transaction in the server database. */
  receiptAttachments?: FileAttachment[];
  CompanyAccount?: string;
  Counterparty?: string;
  /** Stable beneficiary identity for a contribution made to a case fund. */
  PartnerId?: string;
  /** Case-fund transfer this stakeholder loan belongs to, for audit and repayment matching. */
  FundTransferID?: number;
  /** Human-readable ledger description, independent from the counterparty and notes. */
  Description?: string;
  /** Source that funded an outgoing entry, such as buyer funds or Arcatav. */
  FundingSource?: "buyer_funds" | "arcatav" | "other";
  /** Master party funding this payment; distinct from its recipient. */
  FundingPartyId?: string;
  FundingPartyName?: string;
  /** Repayment of the funding claim linked by LinkedTransactionID. */
  IsFundingRepayment?: boolean;
  /** Read-only posting derived from a legacy purchase ledger until it is migrated. */
  IsDerivedLegacyPosting?: boolean;
}

export interface FinancialGroupPosting {
  id: string; date: string;
  type: "supplier_payment" | "supplier_refund" | "order_expense" | "customer_receipt" | "customer_refund" | "own_sale_receipt" | "own_sale_refund";
  amount: number; currency: string;
  /** Units of posting currency per one USD. */
  ratePerUSD: number;
  note: string;
}
export interface FinancialGroup {
  customShares?: OrderCustomShare[];
  id: string; name: string; orderIds: number[]; referenceOrderId: number;
  postings: FinancialGroupPosting[];
  RialSalesEnabled?: boolean; rialSales?: RialSale[];
  profitPlan?: CaseProfitPlan;
  OwnAccountSaleSettled?: boolean;
  commissionSettlements?: CommissionSettlement[];
  profitSettlementConfirmations?: ProfitSettlementConfirmation[];
}
export interface AppDatabase {
  /** Standalone BMO cheque tool records; never posted to ledgers or balances. */
  printedCheques?: PrintedCheque[];
  chequePrintSettings?: ChequePrintSettings;
  chequePrintFormats?: ChequePrintFormat[];
  financialGroups?: FinancialGroup[];
  customers: Customer[];
  suppliers: Supplier[];
  products: Product[];
  orders: Order[];
  orderDetails?: OrderDetail[];
  cashEntries: CashEntry[];
  priceList?: PriceEntry[];
  inquiries: Inquiry[];
  issuerCompanyShares?: IssuerCompanyShare[];
  costDetails?: CostDetail[];
  generalCosts?: GeneralCost[];
  saleDetails?: SaleDetail[];
  orderTransactions?: OrderTransaction[];
  commissionRequestSettings?: CommissionRequestSettings;
  commissionRequestLetters?: CommissionRequestLetter[];
  tdsList?: TDS[];
  users: AppUser[];
  tasks: TaskItem[];
  calendarEvents: CalendarEvent[];
  cashPartners: CashPartner[];
  /** Directory records hidden by the user. Source documents stay intact for audit. */
  hiddenPartyIds?: string[];
  customClauses?: ProformaClause[];
  fieldOptions?: Record<string, string[]>;
  currentUser?: AppUser;
  language?: Language;
  printTemplateConfig?: PrintTemplateConfig;
  documentTemplates?: DocumentTemplate[];
  customFonts?: CustomFont[];
  companyLedgerEntries?: CompanyLedgerEntry[];
  accountingLists?: AccountingList[];
  rolePermissions?: Partial<Record<UserRole, ActiveTab[]>>;
  roleDocumentPrintPermissions?: Partial<Record<UserRole, boolean>>;
  settings?: {
    companyName?: string;
    companyAddress?: string;
    companyTel?: string;
    companyEmail?: string;
    defaultCurrency?: string;
    autoBackupMinutes?: number;
    lastBackupDate?: string;
    theme?: "indigo" | "emerald" | "midnight" | "gold" | "rose" | "glass";
    fontFamily?: string;
  };
  systemSettings?: {
    companyName?: string;
    companyAddress?: string;
    companyTel?: string;
    companyEmail?: string;
    defaultCurrency?: string;
  };
  lastBackupDate?: string;
}

export interface CommissionPayeeProfile {
  id: "hesam" | "reza";
  displayName: string;
  letterheadTitle: string;
  letterheadSubtitle?: string;
  logoData?: string;
  signatureData?: string;
  recipientName?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  routingNumber?: string;
  iban?: string;
  swiftCode?: string;
  bankAddress?: string;
}

export interface CommissionRequestSettings {
  profiles: CommissionPayeeProfile[];
}

export interface CommissionRequestLetter {
  id: string;
  requestNumber: string;
  requestDate: string;
  payeeId: "hesam" | "reza";
  supplierId: number;
  orderIds: number[];
  totalCommission: number;
  currency: string;
  note?: string;
  status: "draft" | "sent" | "paid" | "cancelled";
  createdAt: string;
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  label: string;
  sizeBytes?: number;
  sizeKB?: number;
  type: "auto" | "manual";
  ordersCount?: number;
  customersCount?: number;
  data: AppDatabase;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: {
    type: string;
    payload: any;
  };
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  action?: {
    actionType: string;
    payload: any;
  };
}
