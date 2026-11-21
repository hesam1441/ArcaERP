import { InlineHelp } from "./InlineHelp";
import { BidiText } from "./BidiText";
import { CompactCaseActions } from "./CompactCaseActions";
import { CaseWorkflowNavigation } from "./CaseWorkflowNavigation";
import { GuidedEntryTable } from "./GuidedEntryTable";
import { ProgressiveFields } from "./ProgressiveFields";
import { ShippingReferencesEditor } from "./ShippingReferencesEditor";
import { financialGroupForOrder } from "../utils/financialGroups";
import { RialSalesPanel } from "./RialSalesPanel";
import { nextProformaNumber } from "../utils/proformaNumber";
import { getCaseFinancials } from "../utils/caseFinancials";
import { PROFORMA_TERM_PRESETS } from "../utils/proformaTermPresets";
import { ownedCompanies } from "../utils/partnerIdentity";
import { validatePaymentFunding } from "../utils/paymentFunding";
import { usePartyDirectory } from "./PartyDirectory";
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  FileSpreadsheet,
  Plus,
  Printer,
  Edit,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  CheckCircle,
  Clock,
  Ship,
  Sparkles,
  Calculator,
  Save,
  X,
  UserPlus,
  Building2,
  ArrowRightLeft,
  DollarSign,
  Coins,
  ShieldCheck,
  Tag,
  Users,
  Image,
  Percent,
  FlaskConical,
  RefreshCw,
} from "lucide-react";
import { Order, OrderDetail, Customer, Supplier, Product, AppDatabase, Language, ProformaClause, OrderCustomShare, CashPartner, PrintTemplateConfig, IssuerCompanyShare, OrderTransaction, DocumentTemplate, CustomFont, TaskItem, CalendarEvent, PartialShipment, PartialShipmentDocumentType } from "../types";
import { formatCurrency, formatNumber, calculateOrderMetrics } from "../utils/formatters";
import { ProformaPrintModal } from "./ProformaPrintModal";
import { DynamicFieldDropdown } from "./DynamicFieldDropdown";
import { exportToCSV } from "../services/storageService";
import { getTranslation } from "../i18n/translations";
import { calculateProfitBreakdown, calculateReverseUnitPrice } from "../utils/profitCalculations";
import { getCaseProfitPlan, calculateUnifiedProfit, isProfitCurrencyShare } from "../utils/caseProfitEngine";
import { withDummyProformaSuffix, supplierProformaPrefix } from "../utils/proformaNumber";
import { AttachmentManager } from "./AttachmentManager";
import { OrderPaymentLedger } from "./OrderPaymentLedger";
import { getOrderAgreementTotal, getOrderCommercialTotal, getOrderItemQuantityMT, getOrderQuantityMT } from "../utils/orderAccounting";
import { getCustomerList } from "../utils/partnerLists";
import { commercialInvoiceNumberFor, commercialDocumentDateFor, packingListDateFor, packingListNumberFor } from "../utils/commercialDocuments";
import { getOwnAccountRealization } from "../utils/orderAccounting";
import { AccountingWorkbenchPreview } from "./AccountingWorkbenchPreview";
import { UnifiedProfitPanel } from "./UnifiedProfitPanel";
import { OrderListTools, useOrderListFilters } from "./OrderListTools";
import { PurchaseCasePanel } from "./PurchaseCasePanel";

interface ProformaOrdersViewProps {
  overlayOnly?: boolean;
  guided?: boolean;
  db: AppDatabase;
  language: Language;
  onSaveOrder: (order: Order) => void;
  onDeleteOrder: (orderId: number) => void;
  onSaveCustomer?: (customer: Customer) => void;
  onSaveSupplier?: (supplier: Supplier) => void;
  onSaveCashPartner?: (partner: CashPartner) => void;
  onAddNewFieldOption?: (fieldKey: string, newOption: string) => void;
  onSavePrintTemplateConfig?: (config: PrintTemplateConfig) => void;
  onSaveIssuerCompanyShares?: (shares: IssuerCompanyShare[]) => void;
  onSaveTransaction?: (transaction: OrderTransaction) => void;
  onSaveTransactions?: (transactions: OrderTransaction[]) => void;
  onDeleteTransaction?: (transactionId: number) => void;
  onSaveDocumentTemplate?: (template: DocumentTemplate) => void;
  onDeleteDocumentTemplate?: (id: string) => void;
  onSaveCustomFont?: (font: CustomFont) => void;
  onDeleteCustomFont?: (id: string) => void;
  onApplyAppFont?: (family: string) => void;
  onSaveTask?: (task: TaskItem) => void;
  onSaveCalendarEvent?: (event: CalendarEvent) => void;
  canPrintDocuments?: boolean;
  currentUserId?: string;
  selectedOrderId?: number | null;
  onCloseEditor?: () => void;
  onRefreshApp?: () => void;
  createNewSignal?: number;
  initialSubTab?: "general" | "items" | "currency_conversion" | "clauses" | "shares" | "payments" | "purchase" | "shipping" | "documents";
}

type SearchablePickerOption = { id: number; label: string; detail?: string };
type IssuedDocumentType = "PI" | "SALES_CONTRACT" | "COMMERCIAL_INVOICE" | "PACKING_LIST" | "COO" | "COA" | "BL";

const salesContractDiffersFromCase = (order: Order) => {
  const actualCurrency = order.InvoiceCurrency || order.TransactionCurrency || order.AgreementCurrency || "USD";
  const contractCurrency = order.SalesContractCurrency || actualCurrency;
  const defaultContractId = `${order.ProformaInvoiceID || "PI"}-SC`;
  if ((order.SalesContractID || defaultContractId) !== defaultContractId) return true;
  if ((order.SalesContractDate || order.PIDate || "") !== (order.PIDate || "")) return true;
  if (contractCurrency !== actualCurrency) return true;
  if (Number(order.SalesContractFreight ?? 0) !== Number(order.Freight ?? 0)) return true;
  const totalQuantity = (order.items || []).reduce((sum, item) => sum + (Number(item.Quantity) || 0), 0);
  return (order.items || []).some((item, index) => {
    const id = item.OrderDetailID || index;
    const contractItem = order.SalesContractItems?.find((entry) => entry.orderDetailId === id);
    const actualUnitPrice = item.UseManualInvoicePrice
      ? Number(item.InvoiceUnitPrice ?? item.UnitEx ?? 0)
      : item.BaseUnitPrice !== undefined && item.BaseUnitPrice !== null
        ? Number(item.BaseUnitPrice) || 0
        : Number(((Number(item.UnitPrice) || 0) - (totalQuantity > 0 ? Number(order.Freight || 0) / totalQuantity : 0)).toFixed(2));
    const contractQuantity = Number(contractItem?.quantity ?? item.Quantity ?? 0);
    const contractUnitPrice = Number(contractItem?.unitPrice ?? actualUnitPrice);
    return Math.abs(contractQuantity - (Number(item.Quantity) || 0)) > 0.000001 || Math.abs(contractUnitPrice - actualUnitPrice) > 0.005;
  });
};

const SearchablePicker: React.FC<{
  value: string;
  options: SearchablePickerOption[];
  placeholder: string;
  ariaLabel: string;
  className?: string;
  onSelect: (option: SearchablePickerOption) => void;
}> = ({ value, options, placeholder, ariaLabel, className = "", onSelect }) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => setQuery(value), [value]);

  const normalizedQuery = searching ? query.trim().toLocaleLowerCase() : "";
  const matches = options.filter((option) => `${option.label} ${option.detail || ""}`.toLocaleLowerCase().includes(normalizedQuery));

  return <div className="relative">
    <input
      value={query}
      onChange={(event) => { setQuery(event.target.value); setSearching(true); setOpen(true); }}
      onFocus={(event) => { setQuery(value); setSearching(false); setOpen(true); event.target.select(); }}
      onBlur={() => window.setTimeout(() => { setOpen(false); setSearching(false); }, 120)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearching(false); setOpen((current) => !current); }} aria-label={`${ariaLabel} - نمایش فهرست`} className="absolute inset-y-0 left-0 flex w-9 items-center justify-center text-slate-500 hover:text-slate-800"><ChevronDown size={16}/></button>
    {open && <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
      {matches.length ? matches.map((option) => <button key={option.id} type="button" onMouseDown={(event) => { event.preventDefault(); onSelect(option); setOpen(false); }} className="block w-full px-3 py-2 text-right text-xs hover:bg-blue-50"><span className="block font-bold text-slate-800">{option.label}</span>{option.detail && <span className="block truncate text-[10px] text-slate-500">{option.detail}</span>}</button>) : <div className="px-3 py-2 text-xs text-slate-400">موردی پیدا نشد.</div>}
    </div>}
  </div>;
};

export const ProformaOrdersView: React.FC<ProformaOrdersViewProps> = ({
  overlayOnly = false,
  guided: initialGuided = false,
  db,
  language,
  onSaveOrder,
  onDeleteOrder,
  onSaveCustomer,
  onSaveSupplier,
  onSaveCashPartner,
  onAddNewFieldOption,
  onSavePrintTemplateConfig,
  onSaveIssuerCompanyShares,
  onSaveTransaction,
  onSaveTransactions,
  onDeleteTransaction,
  onSaveDocumentTemplate,
  onDeleteDocumentTemplate,
  onSaveCustomFont,
  onDeleteCustomFont,
  onApplyAppFont,
  onSaveTask,
  onSaveCalendarEvent,
  canPrintDocuments = false,
  currentUserId,
  selectedOrderId,
  onCloseEditor,
  onRefreshApp,
  createNewSignal = 0,
  initialSubTab = "general",
}) => {
  const directory = usePartyDirectory();
  const issuerCompanies = [
    { id: "arca-tav", name: "Arcatav", code: "ARC" },
    { id: "bera", name: "Berakem", code: "BR" },
    { id: "arovin", name: "Arovin", code: "AR" },
    { id: "bullschem", name: "Bullschem", code: "BPI" },
    { id: "chemx", name: "Chemx", code: "CM" },
    { id: "elemensis", name: "Elemensis", code: "EL" },
  ];
  const issuerCode = (issuerId?: string, supplierId?: number) => supplierProformaPrefix(db.suppliers.find((supplier) => Number(supplier.SupplierID) === Number(supplierId))) || issuerCompanies.find((company) => company.id === issuerId)?.code || "ARC";
  const issuerIdFromSupplier = (supplierId?: number, fallback = "") => {
    const supplier = db.suppliers.find((item) => Number(item.SupplierID) === Number(supplierId));
    const prefix = supplierProformaPrefix(supplier);
    const byPrefix: Record<string, string> = { ARC: "arca-tav", BR: "bera", AR: "arovin", BPI: "bullschem", CM: "chemx", EL: "elemensis" };
    if (prefix && byPrefix[prefix]) return byPrefix[prefix];
    const name = supplier?.SupplierName?.toLowerCase() || "";
    return issuerCompanies.find((company) => name.includes(company.name.toLowerCase()))?.id || fallback;
  };
  const issuerCountryFromSupplier = (supplier?: Supplier) => {
    const issuerId = issuerIdFromSupplier(supplier?.SupplierID);
    const issuerCountries: Record<string, string> = {
      "arca-tav": "Iran",
      bera: "Turkey",
      arovin: "United Arab Emirates",
      bullschem: "South Korea",
    };
    return issuerCountries[issuerId] || supplier?.Country || "";
  };
  const generateProformaNumber = (issuerId: string | undefined, date: string, isDummy: boolean, orders: Order[], supplierId?: number) => {
    const code = issuerCode(issuerId, supplierId);
    return nextProformaNumber(code, date || new Date().toISOString().slice(0, 10), isDummy, orders);
  };
  const t = (key: any) => getTranslation(language, key);
  const l = (fa: string, en: string) => (language === "fa" ? fa : en);
  // هر بندر فهرست مستقل خود را دارد تا گزینه‌های POL و POD با هم قاطی نشوند.
  const loadingPortOptions = Array.from(new Set([
    ...(db.fieldOptions?.PortOfLoading || []),
    ...db.orders.map((order) => order.PortOfLoading).filter(Boolean) as string[],
  ]));
  const portOptions = Array.from(new Set([...(db.fieldOptions?.Ports || []), ...(db.fieldOptions?.PortOfDischarge || []), ...db.orders.flatMap((order) => [order.PortOfDischarge, order.FinalPlaceOfDelivery]).filter(Boolean) as string[]]));

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [economicOwnerFilter, setEconomicOwnerFilter] = useState("ALL");
  const [documentsDeliveryFilter, setDocumentsDeliveryFilter] = useState<"ALL" | "DELIVERED" | "PENDING">("ALL");
  const [dateDescending, setDateDescending] = useState(true);
  const orderListFilters = useOrderListFilters(db.orders);
  const [activeTabSub, setActiveTabSub] = useState<
    "general" | "items" | "currency_conversion" | "clauses" | "shares" | "payments" | "purchase" | "shipping" | "documents"
  >("general");
  const [isCommercialIssueCollapsed, setIsCommercialIssueCollapsed] = useState(true);
  const [guided,setGuided]=useState(()=>{try{const saved=sessionStorage.getItem('arca.case.simple');return initialGuided || saved==='true';}catch{return initialGuided;}});
  const [childEntryDirty,setChildEntryDirty]=useState(false);
  const changeCaseMode=()=>{if(childEntryDirty)return;setGuided(value=>{try{sessionStorage.setItem('arca.case.simple',String(!value));}catch{}return !value;});};
  const [editorNavLayout, setEditorNavLayout] = useState<"side" | "top">(() => {
    try { return window.localStorage.getItem("arca_order_editor_nav_layout_v1") === "top" ? "top" : "side"; } catch { return "side"; }
  });
  useEffect(() => { try { window.localStorage.setItem("arca_order_editor_nav_layout_v1", editorNavLayout); } catch { /* local preference is optional */ } }, [editorNavLayout]);
  const [isCaseNoteCollapsed, setIsCaseNoteCollapsed] = useState(false);
  const [caseNoteHeight, setCaseNoteHeight] = useState(112);

  // Selected Order for Editor modal
  const [ownershipError, setOwnershipError] = useState("");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const commercialInvoiceNumber = editingOrder ? commercialInvoiceNumberFor(editingOrder) : "";
  const commercialDocumentDate = editingOrder ? commercialDocumentDateFor(editingOrder) : "";
  const packingListDate = editingOrder ? packingListDateFor(editingOrder) : "";
  const packingListNumber = editingOrder ? packingListNumberFor(editingOrder) : "";
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState<Order | null>(null);
  const [printModalDocType, setPrintModalDocType] = useState<IssuedDocumentType>("PI");
  const [printModalShipmentId, setPrintModalShipmentId] = useState<string | null>(null);
  const [printModalShowDocumentPicker, setPrintModalShowDocumentPicker] = useState(false);
  const randomDigits = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
  const patchPartialShipment = (shipmentId: string, patch: Partial<PartialShipment>) => {
    if (!editingOrder) return;
    setEditingOrder({ ...editingOrder, partialShipments: (editingOrder.partialShipments || []).map((shipment) => shipment.id === shipmentId ? { ...shipment, ...patch } : shipment) });
  };
  const addPartialShipment = () => {
    if (!editingOrder) return;
    const cooId = randomDigits(7);
    const stage: PartialShipment = {
      id: `shipment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `مرحله ${(editingOrder.partialShipments?.length || 0) + 1}`,
      date: editingOrder.PackingListDate || editingOrder.CommercialInvoiceDate || editingOrder.PIDate,
      packingListId: `${editingOrder.PackingListID || editingOrder.ProformaInvoiceID || "PI"}-${(editingOrder.partialShipments?.length || 0) + 1}`,
      cooId,
      cooBarcodeNo: `${randomDigits(13)}${cooId}`,
      documents: ["PACKING_LIST"],
      items: (editingOrder.items || []).map((item, index) => ({ orderDetailId: item.OrderDetailID || index, quantity: 0, grossWeight: 0, packages: "" })),
      containerSealEntries: [],
    };
    setEditingOrder({ ...editingOrder, partialShipments: [...(editingOrder.partialShipments || []), stage] });
  };
  const openDocumentPreview = (type: IssuedDocumentType, shipmentId: string | null = null, openBundlePicker = false) => {
    if (!editingOrder) return;
    setPrintModalDocType(type);
    setPrintModalShipmentId(shipmentId);
    setPrintModalShowDocumentPicker(openBundlePicker);
    setShowPrintModal(JSON.parse(JSON.stringify(editingOrder)));
  };
  const [cloneDraft, setCloneDraft] = useState<{ source: Order; number: string; date: string } | null>(null);
  const ordersTableScrollRef = useRef<HTMLDivElement>(null);
  const ordersTableTopScrollRef = useRef<HTMLDivElement>(null);
  const [ordersTableScrollWidth, setOrdersTableScrollWidth] = useState(0);
  const syncingOrdersTableScroll = useRef(false);
  const handledCreateSignal = useRef(0);
  const customerOptions = [...getCustomerList(db.customers, db.suppliers)]
    .sort((a, b) => a.CustomerName.localeCompare(b.CustomerName, "fa", { sensitivity: "base" }));
  const supplierOptions = [...db.suppliers]
    .sort((a, b) => a.SupplierName.localeCompare(b.SupplierName, "fa", { sensitivity: "base" }));

  const recalculateFreightAllocation = (order: Order, items: OrderDetail[], freight = Number(order.Freight) || 0) => {
    const totalWeight = items.reduce((sum, item) => sum + getOrderItemQuantityMT(order, item), 0);
    return items.map((item) => {
      const quantity = Number(item.Quantity) || 0;
      const quantityMT = getOrderItemQuantityMT(order, item);
      // برای داده‌های قدیمی UnitPrice همان قیمت توافقی بوده است؛ پس با حفظ سازگاری
      // از آن به‌عنوان ورودی استفاده می‌کنیم. برای اقلام جدید، قیمت توافقی صریحاً ذخیره می‌شود.
      const agreedCustomerPrice = Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0;
      const baseUnitPrice = totalWeight > 0 ? Number((agreedCustomerPrice - freight / totalWeight).toFixed(2)) : agreedCustomerPrice;
      const freightAllocation = totalWeight > 0 ? freight * quantityMT / totalWeight : 0;
      const unitPrice = agreedCustomerPrice;
      const rate = Number(order.ExchangeRateApplied || order.ExchangeRate) || 1;
      const invoiceUnitPrice = item.UseManualInvoicePrice ? Number(item.InvoiceUnitPrice || 0) : unitPrice * rate;
      return { ...item, AgreedCustomerPrice: agreedCustomerPrice, BaseUnitPrice: baseUnitPrice, FreightAllocation: freightAllocation, UnitPrice: unitPrice, ExtPrice: quantity * unitPrice, UnitEx: invoiceUnitPrice, InvoiceUnitPrice: invoiceUnitPrice, ExtEx: quantity * invoiceUnitPrice };
    });
  };

  // Quick Customer Create/Edit Modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerFormData, setCustomerFormData] = useState<Customer>({
    CustomerID: Date.now(),
    CustomerName: "",
    Address: "",
    Tel: "",
    CommercialID: "",
  });

  // Quick Supplier Create/Edit Modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierFormData, setSupplierFormData] = useState<Supplier>({
    SupplierID: Date.now(),
    SupplierName: "",
    Address: "",
    Tel: "",
    Email: "",
    Bank: "",
    Signatory: "",
  });

  // Dynamic Clause Create State
  const [newClauseCategory, setNewClauseCategory] = useState<"terms" | "payment" | "delivery" | "bank" | "packing" | "remarks" | "custom">("payment");
  const [newClauseTitle, setNewClauseTitle] = useState("");
  const [newClauseContent, setNewClauseContent] = useState("");

  // Custom Partner Share State
  const [partnerShareModalOpen, setPartnerShareModalOpen] = useState(false);
  const [editingPartnerShareId, setEditingPartnerShareId] = useState<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerShareForm, setPartnerShareForm] = useState<{
    partnerId: string;
    partnerName: string;
    role: string;
    amount: number;
    currency: string;
    notes: string;
    saveToGlobalDirectory: boolean;
  }>({
    partnerId: "",
    partnerName: "",
    role: "شریک تجاری / بازاریاب",
    amount: 0,
    currency: "USD",
    notes: "",
    saveToGlobalDirectory: true,
  });

  const openedSelectionRef = useRef<{ orderId: number; subTab: typeof initialSubTab } | null>(null);
  // Database saves regenerate orders too; only navigation may initialize the editor.
  useEffect(() => {
    if (!selectedOrderId) { openedSelectionRef.current = null; return; }
    if (openedSelectionRef.current?.orderId === selectedOrderId && openedSelectionRef.current.subTab === initialSubTab) return;
    const found = db.orders.find((o) => o.OrderID === selectedOrderId);
    if (!found) return;
    openedSelectionRef.current = { orderId: selectedOrderId, subTab: initialSubTab };
    setEditingOrder(JSON.parse(JSON.stringify(found)));
    setActiveTabSub(initialSubTab);
  }, [selectedOrderId, db.orders, initialSubTab]);

  // فرم جدید باید پیش از نمایش فهرست باز شود؛ useLayoutEffect مانع چشمک‌زدن فهرست می‌شود.
  useLayoutEffect(() => {
    if (createNewSignal && createNewSignal !== handledCreateSignal.current) {
      handledCreateSignal.current = createNewSignal;
      handleCreateNew();
    }
  }, [createNewSignal]);

  const handleCreateNew = () => {
    const newId = Math.max(...db.orders.map((o) => o.OrderID), 500) + 1;
    const newOrder: Order = {
      OrderID: newId,
      createdByUserId: currentUserId,
      createdByName: db.users.find((user) => user.id === currentUserId)?.name,
      ProformaInvoiceID: "",
      RelatedPI: "",
      SupplierID: 0,
      CustomerID: 0,
      SupplierName: "",
      CustomerName: "",
      PIDate: new Date().toISOString().slice(0, 10),
      TransportaionMode: "",
      CountryOfOrigin: "",
      CountryOfDestination: "",
      PortOfLoading: "",
      PortOfDischarge: "",
      TermsOfDelivery: "",
      FinalPlaceOfDelivery: "",
      TermsOfPayment: "",
      TransactionCurrency: "USD",
      AgreementCurrency: "USD",
      InvoiceCurrency: "USD",
      ExchangeRateApplied: 1.0,
      IsExchangeRateUsed: false,
      ExchangeRate: 1.0,
      TypeOfEXRate: "",
      TotalGrossWeight: "",
      TotalNetWeight: 0,
      TotalCube: "",
      Freight: 0,
      Discount: 0,
      Note: "",
      CountryOfBeneficiary: "",
      TranspotationModeMeans: "",
      PartialShipment: "",
      NameOfSignatory: "",

      TargetPrice: 0,
      FreightFcl: 0,
      QtyFcl: 0,
      NumberFcl: 0,
      TotalQuantity: 0,

      ArcaShare: 0, BeraShare: 0, Hesam: 0, Reza: 0, Jalali: 0, Lida: 0,
      Hamid: 0, Moradi: 0, Mahsa: 0, Arash: 0, Arovin: 0, Khusru: 0,
      Berabank: 0, Extra: 0, Commission: 0, TotalCommission: 0,

      BuyerPaid: false,
      ThirdPartyPaid: false,
      // A new case must never inherit shipment-specific source documents or drafts.
      coaFiles: [],
      blFiles: [],
      attachments: [],
      technicalDocumentExtraction: undefined,
      DocumentsDelivered: false,
      CommissionPaid: false,
      ActiveOrder: true,
      TargetOrder: false,
      Target: false,
      IsDummy: false,
      ExcludeFromCalculations: false,
      IssuerCompanyId: "",
      BankSharePercent: 0,
      HasSalesAgent: true,
      PriceToAgent: 0,
      EndCustomerPrice: 0,
      DirectArcaSharePercent: 66.6666666667,
      AgentCompanySharePercent: 50,

      NetFob: 0, CFRNet: 0, SellPrice: 0, Margin: 0, MarginM: 0, CostPrice: 0,
      PackWeight: 0, PI_Valid_Days: 0, SC_Valid_Days: 0,
      ScCurrency: "USD",
      DocumentType: "Proforma Invoice",
      OrderStatus: "",
      CustomClauses: [],
      items: [],
    };

    setEditingOrder(newOrder);
    setIsCreatingNew(true);
  };

  const beginDuplicate = (order: Order) => {
    const date = new Date().toISOString().slice(0, 10);
    setCloneDraft({
      source: order,
      date,
      number: generateProformaNumber(order.IssuerCompanyId, date, Boolean(order.IsDummy || order.ExcludeFromCalculations), db.orders, order.SupplierID),
    });
  };

  const handleDuplicate = () => {
    if (!cloneDraft) return;
    const order = cloneDraft.source;
    const nextPINo = cloneDraft.number.trim();
    const newDate = cloneDraft.date;
    if (!nextPINo || !newDate) return alert("شماره و تاریخ پروفورمای جدید را وارد کنید.");
    if (db.orders.some((item) => item.ProformaInvoiceID.trim().toLocaleLowerCase() === nextPINo.toLocaleLowerCase())) return alert("این شمارهٔ پروفورما قبلاً ثبت شده است. شمارهٔ دیگری وارد کنید.");
    const newId = Math.max(...db.orders.map((o) => o.OrderID), 500) + 1;

    const duplicated: Order = {
      ...JSON.parse(JSON.stringify(order)),
      OrderID: newId,
      IssuerCompanyId: issuerIdFromSupplier(order.SupplierID, order.IssuerCompanyId || ""),
      ProformaInvoiceID: nextPINo,
      PIDate: newDate,
      ActiveOrder: true,
      BuyerPaid: false,
      CommissionPaid: false,
      ThirdPartyPaid: false,
      items: (order.items || []).map((it, idx) => ({
        ...it,
        OrderDetailID: Date.now() + idx,
        OrderID: newId,
      })),
    };

    setCloneDraft(null);
    setEditingOrder(duplicated);
    setIsCreatingNew(true);
    setActiveTabSub("general");
  };

  const handleToggleDummy = (order: Order) => {
    const nextVal = !order.IsDummy;
    onSaveOrder({
      ...order,
      IsDummy: nextVal,
      ExcludeFromCalculations: nextVal,
      ProformaInvoiceID: withDummyProformaSuffix(order.ProformaInvoiceID, nextVal),
    });
  };

  const filteredOrders = useMemo(() => orderListFilters.filteredOrders.filter((order) => {
    if (economicOwnerFilter === "OWN" && order.TradeOwnership !== "own_account") return false;
    if (economicOwnerFilter === "CUSTOMER" && order.TradeOwnership === "own_account") return false;
    if (economicOwnerFilter === "PENDING" && !getOwnAccountRealization(db, order).awaitingRealization) return false;
    if (economicOwnerFilter === "REALIZED" && (order.TradeOwnership !== "own_account" || !getOwnAccountRealization(db, order).recognized)) return false;
    if (documentsDeliveryFilter === "DELIVERED" && !order.DocumentsDelivered) return false;
    if (documentsDeliveryFilter === "PENDING" && order.DocumentsDelivered) return false;
    if (statusFilter === "ACTIVE") return order.ActiveOrder && !order.IsDummy;
    if (statusFilter === "CLOSED") return !order.ActiveOrder;
    if (statusFilter === "UNPAID") return order.TradeOwnership !== "own_account" && !order.BuyerPaid && !order.IsDummy;
    if (statusFilter === "REAL") return !order.IsDummy && !order.ExcludeFromCalculations;
    if (statusFilter === "DUMMY") return order.IsDummy || order.ExcludeFromCalculations;
    return true;
  }).sort((a, b) => dateDescending ? (b.PIDate || "").localeCompare(a.PIDate || "") : (a.PIDate || "").localeCompare(b.PIDate || "")), [orderListFilters.filteredOrders, economicOwnerFilter, documentsDeliveryFilter, statusFilter, dateDescending, db]);

  // The order editor updates its local draft on every keystroke.  Calculating a
  // full case ledger for every visible order at that point made typing wait for
  // hundreds of unrelated calculations.  Keep these list-only values cached
  // until the actual order list/database changes.
  const orderListRows = useMemo(() => filteredOrders.map((order) => {
    const profitSummary = calculateProfitBreakdown(
      order,
      db.issuerCompanyShares,
      db.suppliers.find((supplier) => supplier.SupplierID === order.SupplierID),
      db,
    );
    const totalMargin = getCaseFinancials(db, order).usdProfit.totalCaseProfit;
    return {
      order,
      profitSummary,
      totalMargin,
      marginPerMT: profitSummary.quantityMT ? totalMargin / profitSummary.quantityMT : 0,
      itemsCount: order.items?.length || 1,
      firstItem: order.items?.[0],
    };
  }), [filteredOrders, db]);

  useLayoutEffect(() => {
    const tableScroller = ordersTableScrollRef.current;
    if (!tableScroller) return;
    const updateWidth = () => setOrdersTableScrollWidth(tableScroller.scrollWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(tableScroller);
    window.addEventListener("resize", updateWidth);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateWidth); };
  }, [filteredOrders.length]);

  const syncOrdersTableScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncingOrdersTableScroll.current) return;
    syncingOrdersTableScroll.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncingOrdersTableScroll.current = false; });
  };

  const handleExportCSV = () => {
    const rows = filteredOrders.map((o) => ({
      "شماره سفارش": o.OrderID,
      "شماره پروفرما": o.ProformaInvoiceID,
      "نوع": o.IsDummy ? "صوری (Dummy)" : "واقعی",
      "تاریخ": o.PIDate,
      "مشتری": o.CustomerName,
      "تأمین‌کننده": o.SupplierName,
      "تناژ (MT)": getOrderQuantityMT(o),
      "ارز توافق": o.AgreementCurrency || o.TransactionCurrency,
      "ارز صدور": o.InvoiceCurrency || o.TransactionCurrency,
      "نرخ تسعیر": o.ExchangeRateApplied || 1,
      "قیمت فروش": o.SellPrice,
      "مارجین": o.Margin,
      // سود فقط پس از تعریف «محاسبه سود پرونده» قابل گزارش است؛ فرمول قدیمی
      // نباید برای پرونده‌های فاقد profitPlan عدد جایگزین بسازد.
      "سود کل": (() => {
        const result = getCaseFinancials(db, o);
        return result.nativeStatus === "ready" ? result.profit.totalCaseProfit : result.statusLabel;
      })(),
      "پورسانت کل": o.TotalCommission,
      "وضعیت سفارش": o.OrderStatus,
      "فعال": o.ActiveOrder ? "بله" : "خیر",
      "تسویه خریدار": o.BuyerPaid ? "بله" : "خیر",
      "تحویل مدارک": o.DocumentsDelivered ? "تحویل شده" : "تحویل نشده",
    }));
    exportToCSV("Arca_Proforma_Orders.csv", rows);
  };

  // Recalculate metrics in editor
  const handleItemChange = (idx: number, field: keyof OrderDetail, val: any) => {
    if (!editingOrder) return;
    const updatedItems = [...(editingOrder.items || [])];
    updatedItems[idx] = {
      ...updatedItems[idx],
      [field]: val,
    };

    // قیمت واردشده توسط کاربر، قیمت پایه است و سهم حمل به‌صورت خودکار به آن افزوده می‌شود.
    if (field === "UnitPrice") updatedItems[idx].BaseUnitPrice = Number(val) || 0;

    if (field === "ProductID") {
      const prod = db.products.find((p) => p.ProductID === Number(val));
      if (prod) {
        updatedItems[idx].ProductName = prod.ProductName;
        updatedItems[idx].ChemicalName = prod.ChemicalName;
        updatedItems[idx].HSCODE = prod.HSCODE;
        updatedItems[idx].ProductDescription = prod.ExportGrade || updatedItems[idx].ProductDescription || "Export Grade";
        updatedItems[idx].NosAndKindOfPackages = prod.PackingDetail;
      }
    }

    const freightAwareItems = recalculateFreightAllocation(editingOrder, updatedItems);

    const totalQty = freightAwareItems.reduce((s, it) => s + getOrderItemQuantityMT(editingOrder, it), 0);

    const calculated = calculateOrderMetrics({
      ...editingOrder,
      TotalQuantity: totalQty,
      items: freightAwareItems,
    }, db);

    setEditingOrder({
      ...editingOrder,
      TotalQuantity: totalQty,
      items: freightAwareItems,
      CFRNet: calculated.cfrNet2,
      Margin: calculated.margin3,
    });
  };

  const handleAddItem = () => {
    if (!editingOrder) return;
    const defaultProd = db.products[0];
    const existingQuantity = (editingOrder.items || []).reduce((sum, item) => sum + getOrderItemQuantityMT(editingOrder, item), 0);
    const newQuantity = 0;
    const totalQuantityAfterAdd = existingQuantity + newQuantity;
    const agreedPrice = Number(editingOrder.EndCustomerPrice || editingOrder.TargetPrice || editingOrder.SellPrice) || 0;
    const sourceUnitPrice = agreedPrice > 0 ? calculateReverseUnitPrice(agreedPrice, Number(editingOrder.Freight) || 0, totalQuantityAfterAdd) : 0;
    const newItem: OrderDetail = {
      OrderDetailID: Date.now(),
      OrderID: editingOrder.OrderID,
      ProductID: defaultProd?.ProductID || 10001,
      ProductName: defaultProd?.ProductName || "کالای جدید",
      ChemicalName: defaultProd?.ChemicalName || "",
      HSCODE: defaultProd?.HSCODE || "",
      Quantity: newQuantity,
      QuantityUnit: "MT",
      // قیمتِ ذخیره‌شده برای ورود قلم، X است؛ نه قیمت توافقی مشتری.
      UnitPrice: sourceUnitPrice,
      BaseUnitPrice: sourceUnitPrice,
      AgreedCustomerPrice: agreedPrice,
      ProductDescription: "Export Grade",
      NosAndKindOfPackages: defaultProd?.PackingDetail || "Standard Packing",
      GrossWeight: 10200,
      ExtPrice: newQuantity * sourceUnitPrice,
      UnitEx: sourceUnitPrice,
      ExtEx: newQuantity * sourceUnitPrice,
      InvoiceUnitPrice: sourceUnitPrice,
      UseManualInvoicePrice: false,
    };
    const updatedItems = [...(editingOrder.items || []), newItem];
    const totalQty = updatedItems.reduce((s, it) => s + getOrderItemQuantityMT(editingOrder, it), 0);

    setEditingOrder({
      ...editingOrder,
      TotalQuantity: totalQty,
      items: recalculateFreightAllocation(editingOrder, updatedItems),
    });
  };

  const handleRemoveItem = (idx: number) => {
    if (!editingOrder) return;
    const updatedItems = (editingOrder.items || []).filter((_, i) => i !== idx);
    const totalQty = updatedItems.reduce((s, it) => s + getOrderItemQuantityMT(editingOrder, it), 0);
    setEditingOrder({
      ...editingOrder,
      TotalQuantity: totalQty,
      items: recalculateFreightAllocation(editingOrder, updatedItems),
    });
  };

  // Currency Exchange Rate Handler
  const handleCurrencyChange = (agreementCurr: string, invoiceCurr: string, rate: number) => {
    if (!editingOrder) return;
    const isDiff = agreementCurr !== invoiceCurr;
    const finalRate = isDiff ? rate : 1.0;

    const baseSellPrice = Number(editingOrder.SellPrice) || 0;
    const convertedPrice = isDiff ? baseSellPrice * finalRate : baseSellPrice;
    const totalBase = getOrderAgreementTotal(editingOrder);
    const totalConverted = getOrderCommercialTotal({ ...editingOrder, AgreementCurrency: agreementCurr, InvoiceCurrency: invoiceCurr, ExchangeRateApplied: finalRate, IsExchangeRateUsed: isDiff });

    setEditingOrder({
      ...editingOrder,
      AgreementCurrency: agreementCurr,
      InvoiceCurrency: invoiceCurr,
      TransactionCurrency: invoiceCurr,
      ExchangeRateApplied: finalRate,
      IsExchangeRateUsed: isDiff,
      AgreementSellPrice: baseSellPrice,
      ConvertedSellPrice: convertedPrice,
      AgreementTotalAmount: totalBase,
      ConvertedTotalAmount: totalConverted,
      items: (editingOrder.items || []).map((item) => {
        const quantity = Number(item.Quantity) || 0;
        const agreedCustomerPrice = Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0;
        const baseUnitPrice = Number(item.BaseUnitPrice ?? item.UnitPrice) || 0;
        const invoiceUnitPrice = item.UseManualInvoicePrice ? Number(item.InvoiceUnitPrice || 0) : agreedCustomerPrice * finalRate;
        // قیمت توافقی همیشه در ارز توافق نگهداری می‌شود؛ تسعیر فقط مبلغ قابل چاپ PI را می‌سازد.
        return { ...item, AgreedCustomerPrice: agreedCustomerPrice, BaseUnitPrice: baseUnitPrice, UnitPrice: agreedCustomerPrice, UnitEx: invoiceUnitPrice, InvoiceUnitPrice: invoiceUnitPrice, ExtPrice: quantity * agreedCustomerPrice, ExtEx: quantity * invoiceUnitPrice };
      }),
    });
  };

  // Quick Customer Handlers
  const handleOpenNewCustomer = () => {
    setCustomerFormData({
      CustomerID: Math.max(...db.customers.map((c) => c.CustomerID), 100) + 1,
      CustomerName: "",
      Address: "",
      Tel: "",
      CommercialID: "",
    });
    setCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = () => {
    if (!editingOrder) return;
    const cust = db.customers.find((c) => c.CustomerID === Number(editingOrder.CustomerID));
    if (cust) {
      setCustomerFormData({ ...cust });
      setCustomerModalOpen(true);
    }
  };

  const handleSaveCustomerModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerFormData.CustomerName.trim()) return;
    if (onSaveCustomer) {
      onSaveCustomer(customerFormData);
    }
    if (editingOrder) {
      setEditingOrder({
        ...editingOrder,
        CustomerID: customerFormData.CustomerID,
        CustomerName: customerFormData.CustomerName,
      });
    }
    setCustomerModalOpen(false);
  };

  // Quick Supplier Handlers
  const handleOpenNewSupplier = () => {
    setSupplierFormData({
      SupplierID: Math.max(...db.suppliers.map((s) => s.SupplierID), 0) + 1,
      SupplierName: "",
      Address: "",
      Tel: "",
      Email: "",
      Bank: "",
      Signatory: "",
    });
    setSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = () => {
    if (!editingOrder) return;
    const supp = db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID));
    if (supp) {
      setSupplierFormData({ ...supp });
      setSupplierModalOpen(true);
    }
  };

  const handleSaveSupplierModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.SupplierName.trim()) return;
    if (onSaveSupplier) {
      onSaveSupplier(supplierFormData);
    }
    if (editingOrder) {
      setEditingOrder({
        ...editingOrder,
        SupplierID: supplierFormData.SupplierID,
        SupplierName: supplierFormData.SupplierName,
        NameOfSignatory: supplierFormData.Signatory || editingOrder.NameOfSignatory,
      });
    }
    setSupplierModalOpen(false);
  };

  // Clause Handlers
  const handleAddCustomClause = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || !newClauseTitle.trim() || !newClauseContent.trim()) return;

    const newClause: ProformaClause = {
      id: "cl_" + Date.now(),
      category: newClauseCategory,
      title: newClauseTitle,
      content: newClauseContent,
      contentEn: newClauseContent,
    };

    const currentClauses = editingOrder.CustomClauses || [];
    setEditingOrder({
      ...editingOrder,
      CustomClauses: [...currentClauses, newClause],
    });

    setNewClauseTitle("");
    setNewClauseContent("");
  };

  const handleRemoveClause = (clauseId: string) => {
    if (!editingOrder) return;
    const updated = (editingOrder.CustomClauses || []).filter((c) => c.id !== clauseId);
    setEditingOrder({
      ...editingOrder,
      CustomClauses: updated,
    });
  };

  // Custom Partner Share Handlers
  const handleOpenAddPartnerShare = () => {
    setPartnerShareForm({
      partnerId: "",
      partnerName: "",
      role: "همکار تجاری / معرف",
      amount: 0,
      currency: editingOrder?.InvoiceCurrency || "USD",
      notes: "",
      // Every new beneficiary must have a directory identity so reports can
      // collect that person's shares across different cases reliably.
      saveToGlobalDirectory: true,
    });
    setPartnerShareModalOpen(true);
    setEditingPartnerShareId(null);
    setPartnerSearch("");
  };

  const handleOpenEditPartnerShare = (share: OrderCustomShare) => {
    setPartnerShareForm({ partnerId: share.partnerId || "", partnerName: share.partnerName, role: share.role || "", amount: share.amount, currency: share.currency || "USD", notes: share.notes || "", saveToGlobalDirectory: true });
    setEditingPartnerShareId(share.id);
    setPartnerSearch(share.partnerName);
    setPartnerShareModalOpen(true);
  };

  const handleSavePartnerShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || !partnerShareForm.partnerId || !partnerShareForm.partnerName.trim() || partnerShareForm.amount <= 0) return;

    const directoryPartner = (db.cashPartners || []).find(
      (partner) => partner.name.trim().toLowerCase() === partnerShareForm.partnerName.trim().toLowerCase()
    );
    const resolvedPartnerId = partnerShareForm.partnerId || directoryPartner?.id || ("cp_" + Date.now());

    const newShare: OrderCustomShare = {
      id: editingPartnerShareId || ("share_" + Date.now()),
      partnerId: resolvedPartnerId,
      partnerName: partnerShareForm.partnerName.trim(),
      role: partnerShareForm.role.trim() || "شریک تجاری",
      amount: Number(partnerShareForm.amount),
      currency: partnerShareForm.currency || "USD",
      notes: partnerShareForm.notes.trim(),
    };

    const currentShares = editingOrder.customShares || [];
    const isEditingExistingShare = !!editingPartnerShareId && currentShares.some((share) => share.id === editingPartnerShareId);
    const updatedShares = isEditingExistingShare ? currentShares.map((share) => share.id === editingPartnerShareId ? newShare : share) : [...currentShares, newShare];

    const customSum = updatedShares.filter((share) => isProfitCurrencyShare({ ...editingOrder, customShares: updatedShares }, share)).reduce((s, c) => s + (c.amount || 0), 0);
    const newTotalCommission = customSum;

    const nextOrder: Order = {
      ...editingOrder,
      customShares: updatedShares,
      TotalCommission: newTotalCommission,
      Commission: newTotalCommission,
    };
    setEditingOrder(nextOrder);

    // A newly typed beneficiary is added to the shared directory immediately.
    // This gives later cases the same partnerId and prevents report totals from
    // splitting because of repeated manual name entry.
    if (onSaveCashPartner) {
      if (!directoryPartner) {
        onSaveCashPartner({
          id: resolvedPartnerId,
          name: partnerShareForm.partnerName.trim(),
          role: partnerShareForm.role.trim() || "شریک تجاری",
          defaultCurrency: partnerShareForm.currency || "USD",
        });
      }
    }

    // A saved beneficiary is financial data; persist it immediately instead of
    // relying on a later save of the rest of the editor.
    onSaveOrder(nextOrder);

    setPartnerShareModalOpen(false);
  };

  const handleRemovePartnerShare = (shareId: string) => {
    if (!editingOrder) return;
    const updatedShares = (editingOrder.customShares || []).filter((s) => s.id !== shareId);
    
    const customSum = updatedShares.filter((share) => isProfitCurrencyShare({ ...editingOrder, customShares: updatedShares }, share)).reduce((s, c) => s + (c.amount || 0), 0);
    const newTotalCommission = customSum;

    setEditingOrder({
      ...editingOrder,
      customShares: updatedShares,
      TotalCommission: newTotalCommission,
      Commission: newTotalCommission,
    });
  };

  const handleSaveEditor = () => {
    if (!editingOrder) return;

    const cust = db.customers.find((c) => c.CustomerID === Number(editingOrder.CustomerID));
    const supp = db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID));

    const draft: Order = {
      ...editingOrder,
      profitPlan: getCaseProfitPlan(editingOrder, supp) ? { ...getCaseProfitPlan(editingOrder, supp)!, calculationVersion: 2 } : undefined,
      // Agent allocation is derived by the unified profit engine. Remove the
      // obsolete mirrored custom-share record on every save so old cases are
      // repaired as well and cannot be counted twice in reports.
      customShares: (editingOrder.customShares || []).filter((share) => share.id !== "agent-profit-beneficiary"),
      IssuerCompanyId: issuerIdFromSupplier(editingOrder.SupplierID, editingOrder.IssuerCompanyId || ""),
      CustomerName: cust?.CustomerName || editingOrder.CustomerName,
      SupplierName: supp?.SupplierName || editingOrder.SupplierName,
    };
    const unifiedProfit = calculateUnifiedProfit(draft, supp, db.issuerCompanyShares, db);
    const automaticCompanyShares = unifiedProfit ? [
      { companyName: "آرکاتاو", source: "مانده محاسبه جامع پرونده", amount: unifiedProfit.arcatavShare },
      ...unifiedProfit.allocations.filter((item) => item.beneficiaryRole !== "arcatav").map((item) => ({ companyName: item.beneficiaryName || "ذی‌نفع", source: `قاعده ${item.beneficiaryRole}`, amount: item.amount })),
    ] : undefined;
    const finalOrder: Order = {
      ...draft,
      // Only the unified case-profit plan may update derived profit fields.
      // Keeping existing legacy values intact is safer than silently calculating
      // a second, incompatible result while a user edits commercial PI data.
      ...(unifiedProfit ? {
        Margin: unifiedProfit.quantityMT ? unifiedProfit.totalMargin / unifiedProfit.quantityMT : 0,
        ArcaShare: unifiedProfit.arcatavShare,
        BeraShare: unifiedProfit.allocations.filter((item) => item.beneficiaryRole === "company").reduce((sum, item) => sum + item.amount, 0),
        Berabank: unifiedProfit.bankCharge,
        TotalCommission: unifiedProfit.commissionTotal,
        Commission: unifiedProfit.commissionTotal,
        companyProfitShares: automaticCompanyShares,
      } : {}),
    };

    finalOrder.AgreementTotalAmount = getOrderAgreementTotal(finalOrder);
    finalOrder.ConvertedTotalAmount = getOrderCommercialTotal(finalOrder);
    const validationError = validatePaymentFunding({ ...db, orders: [...db.orders.filter((item) => item.OrderID !== finalOrder.OrderID), finalOrder] }, db);
    if (validationError) { setOwnershipError(validationError); setActiveTabSub("general"); return; }
    setOwnershipError("");
    onSaveOrder(finalOrder);
    // ثبت اولیه نباید مسیر تکمیل سایر تب‌ها را قطع کند.
    setEditingOrder(finalOrder);
    setIsCreatingNew(false);
  };

  // Amount previews must match the commercial lines exactly.  TotalQuantity is
  // kept in different units in older records, so it is not a reliable basis
  // for a currency total.
  const agreementAmountPreview = editingOrder ? getOrderAgreementTotal(editingOrder) : 0;
  const invoiceAmountPreview = editingOrder ? getOrderCommercialTotal(editingOrder) : 0;
  const editorSectionLinks = [
    ["general", "مشخصات پرونده"],
    ["items", `اقلام کالا (${editingOrder?.items?.length || 0})`],
    ["currency_conversion", "ارز و تسعیر"],
    ["clauses", "شرایط و بندها"],
    ["payments", "حسابداری جامع پرونده"],
    ["purchase", "پروفورمای خرید و دفتر آن"],
    ["shipping", "لجستیک"],
    ["documents", `مدارک (${editingOrder?.attachments?.length || 0})`],
  ] as const;
  const renderEditorSectionNav = (horizontal = false) => <nav className={horizontal ? "flex flex-wrap gap-1 border-b border-slate-200 bg-white p-2" : "space-y-1"}>
    {editorSectionLinks.map(([tab, label], index) => <button key={tab} type="button" onClick={() => setActiveTabSub(tab)} className={`${horizontal ? "w-auto border-b-2" : "w-full border-r-2"} rounded-md px-3 py-2 text-right text-xs font-bold transition-all ${(activeTabSub === tab || (tab === "payments" && activeTabSub === "shares")) ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-transparent text-slate-500 hover:bg-white hover:text-slate-900"}`}>{guided ? `${index + 1}. ${label}` : label}</button>)}
  </nav>;

  return (
    <div data-guided-case={guided || undefined} id="proforma-orders-view-root" className="w-full min-w-0 space-y-5">
      {/* The list contains hundreds of interactive rows.  It is not useful
          behind the full-screen editor and rendering it for every keystroke
          noticeably delayed controlled inputs. */}
      {!editingOrder && !overlayOnly && <>
      {/* Top Header & Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="text-blue-600" size={16} />
              <span>{t("nav_proforma")} (OrderQ / PI)</span>
            </h2>
          </div>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            {t("nav_proforma_sub")} - پشتیبانی از نرخ تسعیر، تعریف سریع مشتری و بندهای داینامیک
          </p></InlineHelp>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="orders-export-csv-btn"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-all"
          >
            <Download size={14} />
            <span>{t("export_excel")}</span>
          </button>

          <button
            id="orders-new-btn"
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all active:scale-98"
          >
            <Plus size={15} />
            <span>{t("new_proforma")}</span>
          </button>
        </div>
      </div>

      <OrderListTools {...orderListFilters} title="جست‌وجو و فیلتر سفارش‌ها" exportName="ARCA_Proforma_Orders" compact visibleOrders={filteredOrders} onResetExtra={() => { setStatusFilter("ALL"); setEconomicOwnerFilter("ALL"); setDocumentsDeliveryFilter("ALL"); setDateDescending(true); }} toolbarControls={<>
        <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 border border-slate-200 text-[10px] font-medium">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              statusFilter === "ALL" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t("all")} ({db.orders.length})
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              statusFilter === "ACTIVE" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t("active")} ({db.orders.filter((o) => o.ActiveOrder).length})
          </button>
          <button
            onClick={() => setStatusFilter("UNPAID")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              statusFilter === "UNPAID" ? "bg-white text-amber-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            تسویه نشده ({db.orders.filter((o) => !o.BuyerPaid).length})
          </button>
          <button
            onClick={() => setStatusFilter("CLOSED")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              statusFilter === "CLOSED" ? "bg-white text-slate-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            مختومه ({db.orders.filter((o) => !o.ActiveOrder).length})
          </button>
        </div>
        <select aria-label="فیلتر وضعیت تحویل مدارک" value={documentsDeliveryFilter} onChange={(event) => setDocumentsDeliveryFilter(event.target.value as "ALL" | "DELIVERED" | "PENDING")} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600"><option value="ALL">همه مدارک</option><option value="DELIVERED">مدارک تحویل شده</option><option value="PENDING">مدارک تحویل نشده</option></select>
        <button onClick={() => setDateDescending(!dateDescending)} className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600">تاریخ: {dateDescending ? "جدیدترین" : "قدیمی‌ترین"}</button>
      </>} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2" dir="rtl">
        <label htmlFor="order-ownership-filter" className="text-xs font-bold text-violet-900">فیلتر نوع مالکیت پرونده</label>
        <select id="order-ownership-filter" aria-label="فیلتر نوع مالکیت پرونده" value={economicOwnerFilter} onChange={e => setEconomicOwnerFilter(e.target.value)} className="min-w-48 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-slate-800"><option value="ALL">همه نوع‌های مالکیت</option><option value="OWN">◆ به حساب خودم</option><option value="CUSTOMER">متعلق به مشتری</option><option value="PENDING">ملکی؛ در انتظار تحقق</option><option value="REALIZED">ملکی؛ محقق‌شده</option></select>
      </div>

      {/* Orders Table */}
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="max-h-[calc(100vh-18rem)] w-full overflow-y-auto overscroll-contain" aria-label="فهرست پروفورماها؛ با اسکرول افقی و عمودی">
          <div ref={ordersTableTopScrollRef} onScroll={(event) => syncOrdersTableScroll(event.currentTarget, ordersTableScrollRef.current)} className="sticky top-0 z-40 h-5 overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-slate-100" title="اسکرول افقی فهرست">
            <div className="h-px" style={{ width: `${Math.max(ordersTableScrollWidth, 1)}px` }}/>
          </div>
          <div ref={ordersTableScrollRef} onScroll={(event) => syncOrdersTableScroll(event.currentTarget, ordersTableTopScrollRef.current)} className="w-full overflow-x-auto">
          <table className="min-w-[1480px] w-full text-right text-xs">
            <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 font-bold text-slate-600 shadow-sm">
              <tr>
                  <th className="sticky right-0 z-30 w-[160px] min-w-[160px] bg-slate-50 px-3 py-2.5 shadow-[-2px_0_4px_-3px_rgba(15,23,42,0.45)]">شناسه / شماره PI</th>
                <th className="py-2.5 px-3">{t("pi_date")}</th>
                <th className="py-2.5 px-3">{t("customer_buyer")}</th>
                <th className="py-2.5 px-3">{t("supplier_seller")}</th>
                <th className="py-2.5 px-3">کالا و تناژ</th>
                <th className="py-2.5 px-3">{t("delivery_terms")}</th>
                <th className="py-2.5 px-3">{t("sell_price")}</th>
                <th className="py-2.5 px-3">{t("total_margin")}</th>
                <th className="py-2.5 px-3">{t("status")}</th>
                <th className="sticky left-0 z-30 w-[280px] bg-slate-50 px-3 py-2.5 text-center shadow-[2px_0_4px_-3px_rgba(15,23,42,0.45)]">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderListRows.map(({ order, profitSummary, totalMargin, marginPerMT, itemsCount, firstItem }) => {

                return (
                  <tr
                    key={order.OrderID}
                    onClick={() => setEditingOrder(JSON.parse(JSON.stringify(order)))}
                    className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                  >
                    <td className="sticky right-0 z-10 w-[160px] min-w-[160px] bg-white px-3 py-2.5 shadow-[-2px_0_4px_-3px_rgba(15,23,42,0.45)] group-hover:bg-blue-50/60">
                      <div className="font-bold text-blue-700 font-mono text-xs underline decoration-blue-200 group-hover:text-blue-800">
                        {order.ProformaInvoiceID}
                        {order.TradeOwnership === "own_account" && <span title="پرونده با مالکیت خودم" className="mt-1 block rounded bg-violet-50 px-2 py-1 font-sans text-[10px] font-bold text-violet-700">◆ مالکیت خودم: {db.cashPartners.find(p => p.id === order.EconomicOwnerPartyId)?.name || "شرکت خودم"} · {getOwnAccountRealization(db, order).recognized ? "نتیجه محقق‌شده" : "در انتظار تحقق"}</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {order.OrderID}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-slate-800 text-[11px]">{order.PIDate}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 max-w-[140px] truncate">{order.CustomerName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{order.FinalPlaceOfDelivery}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-700 max-w-[130px] truncate font-medium">{order.SupplierName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{order.PortOfLoading}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 max-w-[150px] truncate">
                        {firstItem?.ProductName || "کالای بازرگانی"}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 font-bold">
                        {formatNumber(getOrderQuantityMT(order))} MT
                        {itemsCount > 1 && ` (+${itemsCount - 1})`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px] font-mono">
                        {order.TermsOfDelivery || "CFR"}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">{order.TransportaionMode}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      <div>
                        {order.SellPrice} {order.InvoiceCurrency || order.TransactionCurrency}
                      </div>
                      {order.IsExchangeRateUsed && (
                        <div className="text-[9px] text-indigo-600 font-normal">
                          (نرخ: {order.ExchangeRateApplied} | پایه: {order.AgreementCurrency})
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                      <div title={`${formatNumber(profitSummary.quantityMT)} MT × ${formatCurrency(marginPerMT, "$")}/MT`}>+{formatCurrency(totalMargin, "$")}</div>
                      <div className="text-[10px] text-emerald-600 font-normal">
                        ({formatCurrency(marginPerMT, "$")}/MT)
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.BuyerPaid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {order.BuyerPaid ? "تسویه کامل" : "در انتظار واریز"}
                        </span>
                        <label
                          className={`flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${order.DocumentsDelivered ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"}`}
                          title="تغییر وضعیت تحویل مدارک"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={!!order.DocumentsDelivered}
                            onChange={(event) => onSaveOrder({ ...order, DocumentsDelivered: event.target.checked })}
                            className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
                            aria-label={`مدارک ${order.ProformaInvoiceID} تحویل شده است`}
                          />
                          <span>{order.DocumentsDelivered ? "مدارک تحویل شده" : "تحویل مدارک"}</span>
                        </label>
                      </div>
                    </td>
                    <td className="sticky left-0 z-10 w-[280px] bg-white px-3 py-2.5 shadow-[2px_0_4px_-3px_rgba(15,23,42,0.35)] group-hover:bg-blue-50/60" onClick={(e) => e.stopPropagation()}>
                      <div className="flex min-w-[250px] items-center justify-center gap-1 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSaveOrder({ ...order, ActiveOrder: !order.ActiveOrder, LifecycleStatus: order.ActiveOrder ? "completed" : "active", OrderStatus: order.ActiveOrder ? "مختومه (Completed)" : "فعال (Active)" }); }}
                          className={`rounded-md px-2 py-1.5 text-[10px] font-bold shadow-2xs transition-colors ${order.ActiveOrder ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white"}`}
                          title={order.ActiveOrder ? "غیرفعال‌کردن پروفرما" : "فعال‌کردن پروفرما"}
                        >{order.ActiveOrder ? "فعال" : "غیرفعال"}</button>
                      {financialGroupForOrder(db,order.OrderID) && <span className="mt-1 block rounded bg-violet-50 px-2 py-1 text-[10px] text-violet-800">گروه مالی: {financialGroupForOrder(db,order.OrderID)!.name}</span>}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingOrder(JSON.parse(JSON.stringify(order)));
                          }}
                          className="p-1.5 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white transition-colors shadow-2xs"
                          title={t("edit")}
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`پروفورما «${order.ProformaInvoiceID}» حذف شود؟ این عمل قابل بازگشت نیست.`)) {
                              onDeleteOrder(order.OrderID);
                            }
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-50 px-2 py-1.5 text-[10px] font-bold text-rose-700 shadow-2xs transition-colors hover:bg-rose-600 hover:text-white"
                          title="حذف پروفورما"
                        >
                          <Trash2 size={13} />حذف
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPrintModal(order);
                          }}
                          className="p-1.5 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white transition-colors shadow-2xs"
                          title={t("print")}
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            beginDuplicate(order);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-600 shadow-2xs transition-colors hover:bg-slate-700 hover:text-white"
                          title="کپی کامل با شماره و تاریخ جدید"
                        >
                          <Copy size={13} />کپی
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      </>}

      {cloneDraft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setCloneDraft(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-slate-900"><Copy size={18} className="text-indigo-600"/>کپی کامل پروفورما</h3>
                <p className="mt-1 text-xs text-slate-500">مبدأ: <span className="font-mono font-bold text-slate-700">{cloneDraft.source.ProformaInvoiceID}</span></p>
              </div>
              <button type="button" onClick={() => setCloneDraft(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">شمارهٔ پروفورمای جدید
                <input autoFocus value={cloneDraft.number} onChange={(event) => setCloneDraft({ ...cloneDraft, number: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-sm font-bold text-blue-700 outline-none focus:border-blue-500"/>
              </label>
              <label className="text-xs font-bold text-slate-700">تاریخ جدید
                <input type="date" value={cloneDraft.date} onChange={(event) => {
                  const date = event.target.value;
                  const generated = generateProformaNumber(cloneDraft.source.IssuerCompanyId, date, Boolean(cloneDraft.source.IsDummy || cloneDraft.source.ExcludeFromCalculations), db.orders, cloneDraft.source.SupplierID);
                  setCloneDraft({ ...cloneDraft, date, number: generated });
                }} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-sm outline-none focus:border-blue-500"/>
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-6 text-indigo-900">اطلاعات تجاری، اقلام، شروط، سهم‌ها و تنظیمات سند کپی می‌شوند. مدارک بارگذاری‌شدهٔ پرونده (COA، BL و فایل‌های پیوست) منتقل نمی‌شوند. وضعیت پرداخت نسخهٔ جدید به حالت پرداخت‌نشده برمی‌گردد و سند اصلی بدون تغییر باقی می‌ماند.</div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCloneDraft(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">انصراف</button>
              <button type="button" onClick={handleDuplicate} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Copy size={14}/>ساخت نسخه و بازکردن برای ویرایش</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor & Calculation Drawer Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div data-case-editor-header className={`p-3.5 bg-slate-900 text-white flex items-center justify-between ${guided?"flex-wrap gap-3":""}`}>
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="text-blue-400" size={18} />
                <div>
                  <h3 className="font-bold text-xs">
                    {isCreatingNew ? t("new_proforma") : `${t("edit_proforma")}: ${editingOrder.ProformaInvoiceID}`}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Order ID: {editingOrder.OrderID} | Date: {editingOrder.PIDate}
                  </p>
                </div>
              </div>

              <CompactCaseActions guided={guided}>
                <button type="button" disabled={childEntryDirty} data-toggle-case-design onClick={changeCaseMode} className="rounded-md border border-indigo-400 bg-indigo-700 px-3 py-1.5 text-xs font-bold disabled:opacity-40">{guided?'بازگشت به طراحی فعلی':'طراحی ساده پرونده (آزمایشی)'}</button>
                <button type="button" disabled={childEntryDirty} onClick={onRefreshApp} className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600" title="رفرش اپ و بازگشت به همین پرونده"><RefreshCw size={14}/><span className="hidden sm:inline">رفرش</span></button>
                <button
                  type="button"
                  disabled={guided && childEntryDirty}
                  onClick={() => { const next = { ...editingOrder, ActiveOrder: !editingOrder.ActiveOrder, LifecycleStatus: editingOrder.ActiveOrder ? "completed" as const : "active" as const, OrderStatus: editingOrder.ActiveOrder ? "مختومه (Completed)" : "فعال (Active)" }; setEditingOrder(next); onSaveOrder(next); }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${editingOrder.ActiveOrder ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-600 text-white hover:bg-slate-500"}`}
                  title={editingOrder.ActiveOrder ? "غیرفعال‌کردن پروفرما" : "فعال‌کردن پروفرما"}
                >
                  <CheckCircle size={14} />
                  <span>{editingOrder.ActiveOrder ? "فعال" : "غیرفعال"}</span>
                </button>
                <button
                  disabled={guided && childEntryDirty}
                  onClick={() => openDocumentPreview("PI")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                  aria-label="چاپ مدارک" title="چاپ مدارک"
                >
                  <Printer size={14} />
                  <span>چاپ مدارک</span>
                </button>
                <button
                  type="button"
                  disabled={guided && childEntryDirty}
                  onClick={handleSaveEditor}
                  aria-label="ذخیره اطلاعات"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs"
                >
                  <Save size={14} />
                  <span>{t("save")}</span>
                </button>
                <button
                  aria-label="بستن پرونده و بازگشت"
                  onClick={() => {
                    if (guided && childEntryDirty && !window.confirm("ورودی ذخیره‌نشده در بخش جاری وجود دارد. بستن و صرف‌نظر از آن؟")) return;
                    setChildEntryDirty(false);
                    setEditingOrder(null);
                    setIsCreatingNew(false);
                    onCloseEditor?.();
                  }}
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </CompactCaseActions>
            </div>

            <div className="flex min-h-0 flex-1 bg-slate-50">
              {!guided && <aside className="flex w-52 shrink-0 flex-col border-l border-slate-200 bg-slate-50 p-2 text-xs">
                <div className="mb-2 flex items-center justify-between gap-1 px-1 text-[10px] font-bold text-slate-500"><span>{editorNavLayout === "side" ? "مشخصات پرونده" : "یادداشت پرونده"}</span><button type="button" onClick={() => setEditorNavLayout((layout) => layout === "side" ? "top" : "side")} className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[9px] text-indigo-700" title="تغییر چیدمان منوی بخش‌های پرونده">چیدمان: {editorNavLayout === "side" ? "کناری" : "بالا"}</button></div>
                {editorNavLayout === "side" && renderEditorSectionNav()}
                <section className="mt-auto rounded-lg border border-amber-200 bg-amber-50 p-2.5 shadow-sm">
                  <div className="mb-1.5 flex items-center justify-between gap-1 font-black text-amber-900"><span>Note پرونده</span><button type="button" onClick={() => setIsCaseNoteCollapsed((value) => !value)} className="rounded px-1.5 py-0.5 text-[9px] font-bold text-amber-700 hover:bg-amber-100">{isCaseNoteCollapsed ? "نمایش" : "پنهان"}</button></div>
                  {!isCaseNoteCollapsed && <><textarea value={editingOrder.Note || ""} onChange={(event) => setEditingOrder({ ...editingOrder, Note: event.target.value })} placeholder="یادداشت پرونده…" style={{ height: caseNoteHeight }} className="w-full resize-y rounded-md border border-amber-200 bg-white p-2 text-xs leading-5 text-slate-800 outline-none focus:border-amber-500"/><label className="mt-1 block text-[9px] font-medium text-amber-700">اندازه یادداشت<input type="range" min="72" max="300" step="4" value={caseNoteHeight} onChange={(event) => setCaseNoteHeight(Number(event.target.value))} className="mt-1 w-full accent-amber-600"/></label></>}
                </section>
              </aside>}

              <div className="flex min-w-0 flex-1 flex-col">
              {guided ? <CaseWorkflowNavigation value={activeTabSub} disabled={childEntryDirty} onChange={value=>setActiveTabSub(value as typeof activeTabSub)}/> : editorNavLayout === "top" && renderEditorSectionNav(true)}

              {/* Modal Body */}
              <div data-case-editor-body className="flex-1 overflow-y-auto space-y-5 p-5 text-xs">
              {guided && <details data-case-shared-note className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs"><summary className="cursor-pointer font-bold text-amber-900">یادداشت مشترک پرونده</summary><textarea aria-label="یادداشت طراحی ساده پرونده" rows={3} value={editingOrder.Note||''} onChange={e=>setEditingOrder({...editingOrder,Note:e.target.value})} className="mt-2 w-full rounded-lg border border-amber-200 bg-white p-2"/></details>}
              {(activeTabSub === "payments" || activeTabSub === "shares") && (isCreatingNew ? <section className="grid min-h-64 place-items-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><div><h4 className="font-bold text-amber-950">ابتدا پروفورما را ذخیره کنید</h4><p className="mt-2 max-w-md text-[11px] leading-6 text-amber-800">دریافت و پرداخت فقط پس از ثبت اولیهٔ پرونده فعال می‌شود تا هر سند مالی با شمارهٔ پروفورمای صحیح ثبت شود.</p></div></section> : (editingOrder.TradeOwnership !== db.orders.find((item) => item.OrderID === editingOrder.OrderID)?.TradeOwnership || editingOrder.EconomicOwnerPartyId !== db.orders.find((item) => item.OrderID === editingOrder.OrderID)?.EconomicOwnerPartyId) ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm"><h4 className="font-bold">مالکیت اقتصادی هنوز ذخیره نشده است</h4><p className="my-3">برای نمایش منبع پرداخت و حساب درست، ابتدا تغییر مالکیت را ذخیره کنید.</p><button type="button" onClick={handleSaveEditor} className="rounded bg-indigo-600 px-4 py-2 font-bold text-white">ذخیره مالکیت و ادامه دریافت و پرداخت</button></section> : onSaveTransaction && <AccountingWorkbenchPreview onRequestSimpleCase={()=>setGuided(true)} onDirty={guided ? setChildEntryDirty : undefined} initialSimple={guided} key={`case-accounting-${editingOrder.OrderID}`} db={{ ...db, orders: db.orders.map(item => item.OrderID === editingOrder.OrderID ? editingOrder : item) }} language={language} fixedOrderId={editingOrder.OrderID} onUpdateOrder={updated => { setEditingOrder(updated); onSaveOrder(updated); }} onSaveParty={onSaveCashPartner} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction || (() => {})} onOpenCase={(_, section) => setActiveTabSub(section)}/>)}
              {activeTabSub === "purchase" && <PurchaseCasePanel guided={guided} onDirty={guided ? setChildEntryDirty : undefined} order={editingOrder} currentUser={db.currentUser} language={language} onChange={setEditingOrder} onSaveTask={onSaveTask} onSaveCalendarEvent={onSaveCalendarEvent}/>} 
              {activeTabSub === "documents" && (
                <div className="space-y-3">
                  <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><div className="font-bold text-emerald-950">مرکز مدیریت و صدور مدارک پرونده</div><InlineHelp><p className="mt-0.5 max-w-2xl text-[10px] leading-5 text-emerald-800">اطلاعات هر سند را در فرم‌های همین تب تکمیل کنید؛ سپس از کارت همان سند وارد پیش‌نمایش شوید و فقط پس از بررسی، چاپ کنید.</p></InlineHelp></div>
                      <button type="button" onClick={() => openDocumentPreview("PI", null, true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"><Printer size={15}/>چاپ مجموعه مدارک</button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {([
                        ["PI", "پروفورما (PI)", "شماره، تاریخ و ارقام چاپی"],
                        ["SALES_CONTRACT", "Sales Contract", "ارز و مبلغ توافقی مشتری"],
                        ["COMMERCIAL_INVOICE", "Commercial Invoice", "شماره، تاریخ و مهر"],
                        ["PACKING_LIST", "Packing List", "مراحل حمل و وزن‌ها"],
                        ["COO", "Certificate of Origin", "شماره، مرجع و مشخصات صدور"],
                        ["COA", "Certificate of Analysis", "فایل و پیش‌نمایش گواهی"],
                        ["BL", "Bill of Lading", "فایل و پیش‌نمایش بارنامه"],
                      ] as [IssuedDocumentType, string, string][]).map(([type, title, description]) => { const dummy = type === "COMMERCIAL_INVOICE" && !!editingOrder.dummyInvoicePreset?.enabled; const differs = dummy || (type === "SALES_CONTRACT" && salesContractDiffersFromCase(editingOrder)); return <button key={type} type="button" onClick={() => openDocumentPreview(type)} className={`rounded-lg border p-2.5 text-right shadow-sm transition-colors ${differs ? "border-amber-400 bg-amber-50 hover:border-amber-500 hover:bg-amber-100" : "border-emerald-200 bg-white hover:border-emerald-500 hover:bg-emerald-100"}`}><span className="block text-xs font-bold text-slate-900">{title}</span><span className="mt-1 block text-[10px] text-slate-600">{description}</span>{differs && <span className="mt-1 block text-[9px] font-bold text-amber-700">{dummy ? "DUMMY — اطلاعات غیرواقعی" : "مقادیر چاپی با پرونده تفاوت دارد"}</span>}<span className={`mt-2 inline-flex items-center gap-1 text-[10px] font-bold ${differs ? "text-amber-700" : "text-emerald-700"}`}><FileSpreadsheet size={12}/>پیش‌نمایش و چاپ</span></button>; })}
                    </div>
                  </section>
                  <section className={`rounded-xl border p-3 ${editingOrder.DocumentsDelivered ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><div className="font-bold text-slate-900">وضعیت تحویل مدارک</div><InlineHelp><p className="mt-0.5 text-[10px] text-slate-600">پس از تحویل کامل مدارک به خریدار یا نماینده، این گزینه را فعال کنید.</p></InlineHelp></div>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/80 bg-white px-3 py-2 font-bold shadow-sm">
                        <input type="checkbox" checked={!!editingOrder.DocumentsDelivered} onChange={(event) => setEditingOrder({ ...editingOrder, DocumentsDelivered: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
                        <span>{editingOrder.DocumentsDelivered ? "مدارک تحویل شده" : "مدارک هنوز تحویل نشده"}</span>
                      </label>
                    </div>
                  </section>
                  <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" aria-expanded={!isCommercialIssueCollapsed} onClick={() => setIsCommercialIssueCollapsed((collapsed) => !collapsed)} className="flex items-center gap-2 text-right font-bold text-indigo-950">
                        <ChevronDown size={14} className={`transition-transform ${isCommercialIssueCollapsed ? "-rotate-90" : ""}`}/>
                        <span>اطلاعات صدور اسناد تجاری</span>
                      </button>
                      <p className="text-[10px] text-indigo-700">{isCommercialIssueCollapsed ? "برای مشاهده و ویرایش، باز کنید." : "شماره، تاریخ و موارد خاص را کنترل کنید."}</p>
                    </div>
                    {!isCommercialIssueCollapsed && <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-white p-2">
                        <div className="font-bold text-slate-800">Proforma Invoice (PI)</div>
                        <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-[10px] text-slate-600">شماره PI<input value={editingOrder.ProformaInvoiceID || ""} onChange={(e) => setEditingOrder({ ...editingOrder, ProformaInvoiceID: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label><label className="min-w-0 text-[10px] text-slate-600">تاریخ صدور<input type="date" value={editingOrder.PIDate || ""} onChange={(e) => setEditingOrder({ ...editingOrder, PIDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label></div>
                        <InlineHelp><p className="text-[10px] text-indigo-700">برای اصلاح ارقام چاپی و مشاهده نسخه نهایی، کارت پروفورما را باز کنید.</p></InlineHelp>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-sky-100 bg-white p-2">
                        <div className="font-bold text-slate-800">Sales Contract</div>
                        <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-[10px] text-slate-600">شماره قرارداد<input value={editingOrder.SalesContractID || `${editingOrder.ProformaInvoiceID || "PI"}-SC`} onChange={(e) => setEditingOrder({ ...editingOrder, SalesContractID: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label><label className="min-w-0 text-[10px] text-slate-600">تاریخ قرارداد<input type="date" value={editingOrder.SalesContractDate || editingOrder.PIDate || ""} onChange={(e) => setEditingOrder({ ...editingOrder, SalesContractDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label></div>
                        <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-[10px] text-slate-600">ارز قرارداد<select value={editingOrder.SalesContractCurrency || "USD"} onChange={(e) => setEditingOrder({ ...editingOrder, SalesContractCurrency: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs">{["USD", "EUR", "AED", "TRY", "CAD", "CNY", "IRR"].map(currency => <option key={currency}>{currency}</option>)}</select></label><label className="min-w-0 text-[10px] text-slate-600">Freight<input type="number" step="any" value={editingOrder.SalesContractFreight ?? 0} onChange={(e) => setEditingOrder({ ...editingOrder, SalesContractFreight: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label></div>
                        <InlineHelp><p className="text-[10px] text-sky-700">مقدار و قیمت اقلام توافقی در پیش‌نمایش قرارداد قابل ویرایش است و محاسبات مالی پرونده را تغییر نمی‌دهد.</p></InlineHelp>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-white p-2">
                        <div className="font-bold text-slate-800">Commercial Invoice</div>
                        <div className="grid grid-cols-2 gap-2"><input value={commercialInvoiceNumber} placeholder="شمارهٔ Commercial Invoice" onChange={(e) => setEditingOrder({ ...editingOrder, CommercialInvoiceID: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" />
                        <label className="min-w-0 text-[10px] text-slate-600">تاریخ Invoice<input type="date" value={commercialDocumentDate} onChange={(e) => setEditingOrder({ ...editingOrder, CommercialInvoiceDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label></div>
                        <label className="block text-[10px] text-slate-600">Date of Issue (اختیاری)<input type="date" value={editingOrder.CommercialInvoiceIssueDate || ""} onChange={(e) => setEditingOrder({ ...editingOrder, CommercialInvoiceIssueDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label>
                        <InlineHelp><p className="text-[10px] text-indigo-700">پیش‌فرض تاریخ Invoice، تاریخ PI است. اگر Date of Issue خالی باشد، همان تاریخ Invoice در پایین سند چاپ می‌شود.</p></InlineHelp>
                        <div className="flex gap-1"><button type="button" onClick={() => setEditingOrder({ ...editingOrder, CommercialInvoiceStamp: "ORIGINAL" })} className={`rounded px-2 py-1 text-[10px] font-bold ${editingOrder.CommercialInvoiceStamp === "ORIGINAL" ? "bg-red-600 text-white" : "border border-red-200 text-red-700"}`}>ORIGINAL</button><button type="button" onClick={() => setEditingOrder({ ...editingOrder, CommercialInvoiceStamp: "DRAFT" })} className={`rounded px-2 py-1 text-[10px] font-bold ${editingOrder.CommercialInvoiceStamp === "DRAFT" ? "bg-red-600 text-white" : "border border-red-200 text-red-700"}`}>DRAFT</button><button type="button" onClick={() => setEditingOrder({ ...editingOrder, CommercialInvoiceStamp: "" })} className="px-1 text-[10px] text-slate-500">بدون مهر</button></div>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-white p-2">
                        <div className="font-bold text-slate-800">Packing List</div>
                        <div className="grid grid-cols-2 gap-2"><input value={packingListNumber} placeholder="شمارهٔ Packing List" onChange={(e) => setEditingOrder({ ...editingOrder, PackingListID: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" />
                        <label className="min-w-0 text-[10px] text-slate-600">تاریخ Packing<input type="date" value={packingListDate} onChange={(e) => setEditingOrder({ ...editingOrder, PackingListDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label></div>
                        <label className="block text-[10px] text-slate-600">Date of Issue (اختیاری)<input type="date" value={editingOrder.PackingListIssueDate || ""} onChange={(e) => setEditingOrder({ ...editingOrder, PackingListIssueDate: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /></label>
                        <InlineHelp><p className="text-[10px] text-indigo-700">به‌صورت پیش‌فرض تاریخ Packing همان Invoice است. برای تاریخ مستقل، تاریخ Packing یا Date of Issue را وارد کنید؛ با خالی‌کردن فیلد، دوباره از تاریخ Invoice استفاده می‌شود.</p></InlineHelp>
                        <div className="flex gap-1"><button type="button" onClick={() => setEditingOrder({ ...editingOrder, PackingListStamp: "ORIGINAL" })} className={`rounded px-2 py-1 text-[10px] font-bold ${editingOrder.PackingListStamp === "ORIGINAL" ? "bg-red-600 text-white" : "border border-red-200 text-red-700"}`}>ORIGINAL</button><button type="button" onClick={() => setEditingOrder({ ...editingOrder, PackingListStamp: "DRAFT" })} className={`rounded px-2 py-1 text-[10px] font-bold ${editingOrder.PackingListStamp === "DRAFT" ? "bg-red-600 text-white" : "border border-red-200 text-red-700"}`}>DRAFT</button><button type="button" onClick={() => setEditingOrder({ ...editingOrder, PackingListStamp: "" })} className="px-1 text-[10px] text-slate-500">بدون مهر</button></div>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-white p-2 md:col-span-2">
                        <div className="font-bold text-slate-800">Certificate of Origin (COO)</div>
                        <div className="grid grid-cols-2 gap-2"><input value={editingOrder.COOId || ""} placeholder={editingOrder.ProformaInvoiceID || "COO number"} onChange={(e) => setEditingOrder({ ...editingOrder, COOId: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs" /><input type="date" value={commercialDocumentDate} readOnly aria-label="Commercial Invoice date" className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-500" /></div>
                        <div className="grid grid-cols-3 gap-2"><input value={editingOrder.COOPlaceOfIssue || editingOrder.LoadingPort || ""} placeholder="Place of issue" onChange={(e) => setEditingOrder({ ...editingOrder, COOPlaceOfIssue: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs" /><input value={editingOrder.COOReferenceNo || ""} placeholder="Reference No." onChange={(e) => setEditingOrder({ ...editingOrder, COOReferenceNo: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs" /><input value={editingOrder.COOReferenceCode || ""} placeholder="Reference Code" onChange={(e) => setEditingOrder({ ...editingOrder, COOReferenceCode: e.target.value })} className="min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs" /></div>
                        <div className="flex gap-4"><label className="flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" checked={!!editingOrder.COORetrospective} onChange={(e) => setEditingOrder({ ...editingOrder, COORetrospective: e.target.checked })} />Issued retrospectively</label><label className="flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" checked={!!editingOrder.COOIssuedUponRequest} onChange={(e) => setEditingOrder({ ...editingOrder, COOIssuedUponRequest: e.target.checked })} />Issued upon request</label></div>
                      </div>
                    </div>}
                  </section>
                  <section className="rounded-xl border border-violet-200 bg-violet-50 p-3" dir="rtl">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-violet-950">حمل تفکیکی و مدارک مرحله‌ای</div><InlineHelp><p className="mt-0.5 max-w-3xl text-[10px] leading-5 text-violet-800">فقط در این فرم اطلاعات مراحل حمل را وارد کنید. هر مرحله می‌تواند Commercial Invoice، Packing List و COO مستقل داشته باشد؛ مبلغ، سود و حسابداری پرونده تغییر نمی‌کند. جمع مقدار و وزن مراحل باید با اقلام پرونده برابر باشد.</p></InlineHelp></div><button type="button" onClick={addPartialShipment} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700"><Plus size={14} className="ml-1 inline"/>افزودن مرحله حمل</button></div>
                    {(editingOrder.partialShipments || []).length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-violet-200 bg-white/70 p-3 text-center text-[11px] text-slate-500">حمل یک‌مرحله‌ای است. فقط در صورت نیاز به صدور مدارک حمل جداگانه، مرحله اضافه کنید.</div> : <div className="mt-3 space-y-3">{(editingOrder.partialShipments || []).map((shipment, shipmentIndex) => {
                      const stageQuantity = shipment.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                      const stageGrossWeight = shipment.items.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0);
                      const updateItem = (itemIndex: number, changes: Partial<PartialShipment["items"][number]>) => patchPartialShipment(shipment.id, { items: shipment.items.map((entry, index) => index === itemIndex ? { ...entry, ...changes } : entry) });
                      return <div key={shipment.id} className="rounded-xl border border-violet-200 bg-white p-3 shadow-sm"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><b className="text-xs text-violet-950">مرحله {shipmentIndex + 1}: {shipment.title || "بدون عنوان"}</b><div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="rounded bg-violet-50 px-2 py-1 font-mono text-violet-900">{formatNumber(stageQuantity)} MT</span><span className="rounded bg-violet-50 px-2 py-1 font-mono text-violet-900">{formatNumber(stageGrossWeight)} KG</span>{shipment.documents.includes("PACKING_LIST") && <button type="button" onClick={() => openDocumentPreview("PACKING_LIST", shipment.id)} className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-700"><FileSpreadsheet size={12} className="ml-1 inline"/>پیش‌نمایش Packing</button>}{shipment.documents.includes("COMMERCIAL_INVOICE") && <button type="button" onClick={() => openDocumentPreview("COMMERCIAL_INVOICE", shipment.id)} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700"><FileSpreadsheet size={12} className="ml-1 inline"/>پیش‌نمایش Commercial Invoice</button>}{shipment.documents.includes("COO") && <button type="button" onClick={() => openDocumentPreview("COO", shipment.id)} className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 font-bold text-indigo-700"><FileSpreadsheet size={12} className="ml-1 inline"/>پیش‌نمایش COO</button>}<button type="button" onClick={() => setEditingOrder({ ...editingOrder, partialShipments: (editingOrder.partialShipments || []).filter((entry) => entry.id !== shipment.id) })} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 font-bold text-rose-700"><Trash2 size={12} className="ml-1 inline"/>حذف</button></div></div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><label className="text-[10px] text-slate-600">عنوان مرحله<input value={shipment.title || ""} onChange={(event) => patchPartialShipment(shipment.id, { title: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-600">شماره Packing List<input value={shipment.packingListId || ""} onChange={(event) => patchPartialShipment(shipment.id, { packingListId: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 font-mono text-xs"/></label><label className="text-[10px] text-slate-600">تاریخ حمل<input type="date" value={shipment.date || ""} onChange={(event) => patchPartialShipment(shipment.id, { date: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-600">شماره کامیون / وسیله حمل<input value={shipment.truckNo || ""} onChange={(event) => patchPartialShipment(shipment.id, { truckNo: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-slate-600">وزن خالص (KG)<input type="number" min="0" step="any" value={shipment.netWeight ?? ""} onChange={(event) => patchPartialShipment(shipment.id, { netWeight: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 font-mono text-xs"/></label></div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-violet-50 p-2 text-[11px]"><b>مدارک تفکیک‌شونده:</b>{(["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"] as PartialShipmentDocumentType[]).map((type) => <label key={type} className="flex items-center gap-1.5"><input type="checkbox" checked={shipment.documents.includes(type)} onChange={(event) => { const documents = event.target.checked ? [...new Set([...shipment.documents, type])] : shipment.documents.filter((entry) => entry !== type); const cooId = shipment.cooId || randomDigits(7); patchPartialShipment(shipment.id, { documents, ...(type === "COO" && event.target.checked ? { cooId, cooBarcodeNo: shipment.cooBarcodeNo || `${randomDigits(13)}${cooId}` } : {}) }); }}/>{type === "PACKING_LIST" ? "Packing List" : type === "COO" ? "COO" : "Commercial Invoice"}</label>)}{shipment.documents.includes("COO") && <span className="mr-auto font-mono text-violet-800">COO: {shipment.cooId}</span>}</div>
                        <div className="mt-2 overflow-x-auto"><table className="min-w-[640px] w-full text-xs"><thead><tr className="border-b border-violet-100 text-slate-600"><th className="p-1.5 text-right">کالا</th><th className="p-1.5">مقدار (MT)</th><th className="p-1.5">وزن ناخالص (KG)</th><th className="p-1.5 text-right">بسته‌بندی</th></tr></thead><tbody>{shipment.items.map((entry, itemIndex) => { const sourceItem = (editingOrder.items || []).find((item, index) => (item.OrderDetailID || index) === entry.orderDetailId); return <tr key={`${shipment.id}-${entry.orderDetailId}`} className="border-b border-slate-100"><td className="p-1.5 text-slate-800">{sourceItem?.ProductName || sourceItem?.ProductDescription || `کالای ${itemIndex + 1}`}</td><td className="p-1"><input type="number" min="0" step="any" value={entry.quantity} onChange={(event) => updateItem(itemIndex, { quantity: Number(event.target.value) || 0 })} className="w-full rounded border border-slate-200 px-2 py-1 text-center font-mono"/></td><td className="p-1"><input type="number" min="0" step="any" value={entry.grossWeight} onChange={(event) => updateItem(itemIndex, { grossWeight: Number(event.target.value) || 0 })} className="w-full rounded border border-slate-200 px-2 py-1 text-center font-mono"/></td><td className="p-1"><input value={entry.packages || ""} onChange={(event) => updateItem(itemIndex, { packages: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1"/></td></tr>; })}</tbody></table></div>
                      </div>;
                    })}</div>}
                  </section>
                  <section className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 font-bold text-slate-800">سایر مدارک مرتبط پرونده</div><AttachmentManager attachments={editingOrder.attachments} onChange={(attachments) => setEditingOrder({ ...editingOrder, attachments })}/></section>
                </div>
              )}
              {/* Tab 1: General Info */}
              {activeTabSub === "general" && (
                <div className="space-y-4">
                  {guided && <InlineHelp><div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 leading-6 text-indigo-900">اطلاعات طرفین و شرایط اصلی را تکمیل کنید؛ سپس از «اقلام کالا» مقدار و قیمت را وارد کنید. دکمه ذخیره اطلاعات، تغییرات پرونده را ثبت می‌کند.</div></InlineHelp>}
                  {!guided && <RialSalesPanel guided={guided} key={`rial-general-${editingOrder.OrderID}`} order={editingOrder} db={db} disabled={isCreatingNew || JSON.stringify(editingOrder)!==JSON.stringify(db.orders.find(order=>order.OrderID===editingOrder.OrderID))} onSave={updated=>{setEditingOrder(updated);onSaveOrder(updated);}}/>}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t("proforma_no")}</label>
                      <input
                        type="text"
                        value={editingOrder.ProformaInvoiceID}
                        onChange={(e) => setEditingOrder({ ...editingOrder, ProformaInvoiceID: e.target.value })}
                        className="w-full p-2 rounded-md bg-slate-50 border border-slate-200 font-mono font-bold text-blue-700"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t("pi_date")}</label>
                      <input
                        type="date"
                        value={editingOrder.PIDate}
                        onChange={(e) => setEditingOrder({ ...editingOrder, PIDate: e.target.value })}
                        className="w-full p-2 rounded-md bg-slate-50 border border-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 w-fit p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingOrder.IsDummy || editingOrder.ExcludeFromCalculations)}
                      onChange={(e) => {
                        const isDummy = e.target.checked;
                        setEditingOrder({
                          ...editingOrder,
                          IsDummy: isDummy,
                          ExcludeFromCalculations: isDummy,
                          ProformaInvoiceID: withDummyProformaSuffix(editingOrder.ProformaInvoiceID, isDummy),
                        });
                      }}
                      className="accent-amber-600"
                    />
                    <span className="font-bold">{guided?"پروفورمای غیرواقعی؛ خارج از محاسبات مالی":"Dummy proforma — exclude from all financial calculations"}</span>
                  </label>
                  <InlineHelp><p className="-mt-2 text-[11px] text-slate-500">{l("فرمت خودکار: کد شرکت-تاریخ میلادی-شماره ترتیب؛ شماره PI قابل ویرایش دستی است.", "Automatic format: company code-Gregorian date-daily sequence; the PI number remains manually editable.")}</p></InlineHelp>

                  {/* Customer & Supplier Selection with In-line Quick Add & Edit */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    {/* Customer Box */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-800 flex items-center gap-1.5">
                          <UserPlus size={14} className="text-blue-600" />
                          <span>{t("customer_buyer")} *</span>
                        </label>
                        <div className="flex items-center gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={handleOpenNewCustomer}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                          >
                            {t("quick_add_customer")}
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenEditCustomer}
                            className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium"
                          >
                            {t("quick_edit_customer")}
                          </button>
                        </div>
                      </div>

                      <SearchablePicker
                        value={editingOrder.CustomerName || ""}
                        options={customerOptions.map((customer) => ({ id: customer.CustomerID, label: customer.CustomerName, detail: [customer.City, customer.CommercialID].filter(Boolean).join(" · ") }))}
                        placeholder="نام خریدار را تایپ یا انتخاب کنید…"
                        ariaLabel="انتخاب مشتری"
                        className="w-full rounded-md border border-blue-200 bg-white p-2.5 pl-9 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                        onSelect={(customer) => setEditingOrder({ ...editingOrder, CustomerID: customer.id, CustomerName: customer.label })}
                      />

                      <div className="text-[11px] text-slate-500 truncate">
                        نام ثبت شده: {editingOrder.CustomerName}
                      </div>
                    </div>

                    <section className="rounded-xl border border-violet-200 bg-violet-50 p-3.5 space-y-2">
                      {ownershipError && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{ownershipError}</p>}
                      <label className="block font-bold">مالکیت اقتصادی پرونده<select value={editingOrder.TradeOwnership || "customer"} onChange={(e) => setEditingOrder({ ...editingOrder, TradeOwnership: e.target.value as "customer" | "own_account" })} className="mt-2 w-full rounded border p-2"><option value="customer">فروش به مشتری واقعی</option><option value="own_account">به حساب خودم؛ خریدار سند با مالک متفاوت است</option></select></label>
                      {editingOrder.TradeOwnership === "own_account" && <><InlineHelp><p className="text-xs leading-6">نام خریدار روی اسناد حفظ می‌شود؛ طلب از او ایجاد نمی‌شود. تأمین وجه و بازپرداخت در حساب مالک و شرکت قرض‌دهنده ثبت می‌شود.</p></InlineHelp><label className="block text-xs font-bold">مالک اقتصادی<select aria-label="انتخاب شرکت مالک اقتصادی" value={editingOrder.EconomicOwnerPartyId || ""} onChange={(event) => setEditingOrder({ ...editingOrder, EconomicOwnerPartyId: event.target.value })} className="mt-2 w-full rounded border bg-white p-2"><option value="">انتخاب شرکت متعلق به خودم</option>{ownedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name} / {company.nameEn}</option>)}</select></label></>}
                    </section>
                    {/* Supplier Box with Logo Preview */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Building2 size={14} className="text-purple-600" />
                          <span>{t("supplier_seller")} (شرکت صادرکننده) *</span>
                        </label>
                        <div className="flex items-center gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={handleOpenNewSupplier}
                            className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium"
                          >
                            {t("quick_add_supplier")}
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenEditSupplier}
                            className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium"
                          >
                            {t("quick_edit_supplier")}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {(() => {
                          const currentSupplier = db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID));
                          return currentSupplier?.LogoT ? (
                            <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                              <img
                                src={currentSupplier.LogoT}
                                alt={currentSupplier.SupplierName}
                                className="max-h-full max-w-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-purple-100 text-purple-700 font-black text-sm flex items-center justify-center shrink-0">
                              {(editingOrder.SupplierName || "SP").slice(0, 2).toUpperCase()}
                            </div>
                          );
                        })()}

                        <SearchablePicker
                          value={editingOrder.SupplierName || ""}
                          options={supplierOptions.map((supplier) => ({ id: supplier.SupplierID, label: supplier.SupplierName, detail: supplier.Signatory || supplier.Country || "" }))}
                          placeholder="نام فروشنده را تایپ یا انتخاب کنید…"
                          ariaLabel="انتخاب تأمین‌کننده"
                          className="w-full rounded-md border border-purple-200 bg-white p-2.5 pl-9 text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                          onSelect={(supplier) => {
                            const s = supplierOptions.find((item) => item.SupplierID === supplier.id);
                            if (!s) return;
                            const sid = s.SupplierID;
                            setEditingOrder({
                              ...editingOrder,
                              SupplierID: sid,
                              SupplierName: s.SupplierName,
                              NameOfSignatory: s.Signatory || editingOrder.NameOfSignatory,
                              CountryOfBeneficiary: issuerCountryFromSupplier(s) || editingOrder.CountryOfBeneficiary,
                              IssuerCompanyId: issuerIdFromSupplier(sid, editingOrder.IssuerCompanyId || ""),
                              ProformaInvoiceID: !isCreatingNew && editingOrder.ProformaInvoiceID.trim()
                                ? editingOrder.ProformaInvoiceID
                                : issuerIdFromSupplier(sid, editingOrder.IssuerCompanyId || "")
                                  ? generateProformaNumber(issuerIdFromSupplier(sid, editingOrder.IssuerCompanyId || ""), editingOrder.PIDate, Boolean(editingOrder.IsDummy || editingOrder.ExcludeFromCalculations), db.orders.filter((o) => o.OrderID !== editingOrder.OrderID), sid)
                                  : editingOrder.ProformaInvoiceID,
                            });
                          }}
                        />
                      </div>

                      <div className="text-[11px] text-slate-500 truncate flex items-center justify-between">
                        <span>تأمین‌کننده: {db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID))?.SupplierName || editingOrder.SupplierName || "—"}</span>
                        {(db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID))?.Signatory || editingOrder.NameOfSignatory) && (
                          <span className="font-mono text-slate-600">امضا: {db.suppliers.find((s) => s.SupplierID === Number(editingOrder.SupplierID))?.Signatory || editingOrder.NameOfSignatory}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Commercial Terms & Dynamic Dropdowns */}
                  <ProgressiveFields guided={guided} core={[0,1,2,5]} extraTitle="بنادر، کشورها، اعتبار و مشخصات تکمیلی حمل">
                    <DynamicFieldDropdown
                      fieldKey="TermsOfDelivery"
                      label={t("delivery_terms")}
                      value={editingOrder.TermsOfDelivery || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, TermsOfDelivery: val })}
                      options={db.fieldOptions?.TermsOfDelivery || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("TermsOfDelivery", opt)}
                      placeholder="انتخاب یا افزودن شرط تحویل"
                    />

                    <DynamicFieldDropdown
                      fieldKey="TermsOfPayment"
                      label={t("payment_terms")}
                      value={editingOrder.TermsOfPayment || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, TermsOfPayment: val })}
                      options={db.fieldOptions?.TermsOfPayment || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("TermsOfPayment", opt)}
                      placeholder="انتخاب یا افزودن شرایط پرداخت"
                    />

                    <DynamicFieldDropdown
                      fieldKey="TransportMode"
                      label="روش حمل (Transport Mode)"
                      value={editingOrder.TransportaionMode || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, TransportaionMode: val })}
                      options={db.fieldOptions?.TransportMode || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("TransportMode", opt)}
                      placeholder="انتخاب یا افزودن روش حمل"
                    />

                    <DynamicFieldDropdown
                      fieldKey="PortOfLoading"
                      label={t("port_loading")}
                      value={editingOrder.PortOfLoading || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, PortOfLoading: val })}
                      options={loadingPortOptions}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("PortOfLoading", opt)}
                      placeholder="انتخاب یا افزودن بندر بارگیری"
                    />

                    <DynamicFieldDropdown
                      fieldKey="Ports"
                      label={t("port_discharge")}
                      value={editingOrder.PortOfDischarge || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, PortOfDischarge: val })}
                      options={portOptions}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Ports", opt)}
                      placeholder="انتخاب یا افزودن بندر تخلیه"
                    />

                    <DynamicFieldDropdown
                      fieldKey="Ports"
                      label="محل نهایی تحویل (Final Place)"
                      value={editingOrder.FinalPlaceOfDelivery || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, FinalPlaceOfDelivery: val })}
                      options={portOptions}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Ports", opt)}
                      placeholder="انتخاب یا افزودن محل نهایی تحویل"
                    />

                    <DynamicFieldDropdown
                      fieldKey="Countries"
                      label="کشور مبدا (Country of Origin)"
                      value={editingOrder.CountryOfOrigin || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, CountryOfOrigin: val })}
                      options={db.fieldOptions?.Countries || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Countries", opt)}
                      placeholder="انتخاب یا افزودن کشور مبدأ"
                    />

                    <DynamicFieldDropdown
                      fieldKey="Countries"
                      label="کشور مقصد (Destination)"
                      value={editingOrder.CountryOfDestination || ""}
                      onChange={(val) => setEditingOrder({ ...editingOrder, CountryOfDestination: val })}
                      options={db.fieldOptions?.Countries || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Countries", opt)}
                      placeholder="انتخاب یا افزودن کشور مقصد"
                    />

                    <DynamicFieldDropdown
                      fieldKey="Countries"
                      label="کشور ذی‌نفع (Country of Beneficiary)"
                      value={editingOrder.CountryOfBeneficiary || issuerCountryFromSupplier(db.suppliers.find((supplier) => supplier.SupplierID === Number(editingOrder.SupplierID)))}
                      onChange={(val) => setEditingOrder({ ...editingOrder, CountryOfBeneficiary: val })}
                      options={db.fieldOptions?.Countries || []}
                      onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Countries", opt)}
                      placeholder="خودکار از شرکت صادرکننده"
                    />

                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">{t("validity_days")}</label>
                      <input
                        type="number"
                        value={editingOrder.PI_Valid_Days || ""}
                        onChange={(e) => setEditingOrder({ ...editingOrder, PI_Valid_Days: Number(e.target.value) || 0 })}
                        className="w-full p-2 rounded-md bg-slate-50 border border-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">وزن ناخالص کل (KG)</label>
                      <input type="number" min="0" value={editingOrder.TotalGrossWeight || ""} onChange={(e) => setEditingOrder({ ...editingOrder, TotalGrossWeight: e.target.value })} className="w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono" placeholder="مثال: 368000" />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">حجم کل (CBM)</label>
                      <input value={editingOrder.TotalCube || ""} onChange={(e) => setEditingOrder({ ...editingOrder, TotalCube: e.target.value })} className="w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono" placeholder="مثال: 400 CBM" />
                    </div>
                  </ProgressiveFields>

                </div>
              )}

              {/* Tab 2: Line Items */}
              {activeTabSub === "items" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-amber-900">هزینه حمل کل پروفرما ({editingOrder.AgreementCurrency || "USD"})</label>
                        <input type="number" min="0" step="0.01" value={editingOrder.Freight || 0} onChange={(e) => {
                          const freight = Number(e.target.value) || 0;
                          const items = recalculateFreightAllocation(editingOrder, editingOrder.items || [], freight);
                          setEditingOrder({ ...editingOrder, Freight: freight, FreightFcl: freight, items });
                        }} className="w-full rounded-md border border-amber-300 bg-white p-2 font-mono text-sm font-bold text-amber-950" />
                      </div>
                      <InlineHelp><div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
                        سهم هر کالا بر اساس وزن آن محاسبه و به قیمت واحد همان کالا افزوده می‌شود.
                      </div></InlineHelp>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs">{t("order_items")}</h4>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold text-xs flex items-center gap-1"
                    >
                      <Plus size={13} />
                      <span>{t("add_item")}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <GuidedEntryTable guided={guided} className="min-w-[1080px] w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="w-[300px] min-w-[300px] p-2">{l("کالای انتخابی", "Selected product")}</th>
                          <th className="p-2">{l("کد تعرفه", "HS Code")} (HS)</th>
                          <th className="p-2">وزن ناخالص (KG)</th>
                          <th className="p-2">نوع بسته‌بندی</th>
                          <th className="p-2">{l("مقدار و واحد", "Quantity & unit")}</th>
                          <th className="p-2">قیمت توافقی مشتری</th>
                          <th className="p-2">
                            <div className="flex items-center gap-1 justify-center">
                              <span>{l("قیمت واحد مبدا", "Source unit price")}</span>
                              <select
                                value={editingOrder.AgreementCurrency || "USD"}
                                onChange={(e) => handleCurrencyChange(e.target.value, editingOrder.InvoiceCurrency || "USD", editingOrder.ExchangeRateApplied || 1)}
                                className="bg-white border border-slate-200 rounded px-1 py-0.5 font-mono text-[10px]"
                                title={l("ارز قیمت مبدا", "Source price currency")}
                              >
                                {['USD', 'EUR', 'AED', 'CAD', 'CNY', 'TRY'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                              </select>
                            </div>
                          </th>
                          <th className="p-2">{l("مبلغ کل با حمل", "Total incl. freight")} ({editingOrder.AgreementCurrency || "USD"})</th>
                          <th className="p-2 text-center">{l("حذف", "Delete")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editingOrder.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td className="w-[300px] min-w-[300px] p-2">
                              <SearchablePicker
                                value={item.ProductName || ""}
                                options={[...db.products].sort((a, b) => a.ProductName.localeCompare(b.ProductName, "fa", { sensitivity: "base" })).map((product) => ({ id: product.ProductID, label: product.ProductName, detail: [product.ChemicalName, product.HSCODE].filter(Boolean).join(" · ") }))}
                                placeholder="نام کالا را تایپ یا انتخاب کنید…"
                                ariaLabel="انتخاب کالا"
                                className="w-full rounded-md border border-blue-200 bg-blue-50 p-2 pl-9 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                                onSelect={(product) => handleItemChange(idx, "ProductID", product.id)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.HSCODE || ""}
                                onChange={(e) => handleItemChange(idx, "HSCODE", e.target.value)}
                                readOnly={Boolean(db.products.find((product) => product.ProductID === item.ProductID)?.HSCODE)}
                                title={db.products.find((product) => product.ProductID === item.ProductID)?.HSCODE ? l("تعرفه به‌صورت خودکار از کاتالوگ کالا ثبت شده است", "HS code is automatically sourced from the product catalog") : l("برای این کالا تعرفه تعریف نشده است؛ ابتدا آن را در کاتالوگ کالا وارد کنید", "This product has no configured HS code; define it in the product catalog first")}
                                className={`w-24 p-1.5 border rounded text-xs font-mono ${db.products.find((product) => product.ProductID === item.ProductID)?.HSCODE ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-white border-amber-300"}`}
                              />
                            </td>
                            <td className="p-2"><input type="number" min="0" value={item.GrossWeight || ""} onChange={(e) => handleItemChange(idx, "GrossWeight", Number(e.target.value) || 0)} className="w-28 rounded border border-slate-200 bg-slate-50 p-1.5 font-mono text-xs" placeholder="مثال: 10200" /></td>
                            <td className="p-2"><input value={item.NosAndKindOfPackages || ""} onChange={(e) => handleItemChange(idx, "NosAndKindOfPackages", e.target.value)} className="w-44 rounded border border-slate-200 bg-slate-50 p-1.5 text-xs" placeholder="مثال: 160x210 Kg Drum" /></td>
                            <td className="p-2"><div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={item.Quantity}
                                onChange={(e) => handleItemChange(idx, "Quantity", Number(e.target.value))}
                                className="w-28 p-1.5 bg-white border border-slate-200 rounded text-xs font-mono font-bold"
                              />
                              <select value={item.QuantityUnit || "MT"} onChange={(e) => handleItemChange(idx, "QuantityUnit", e.target.value)} className="rounded border border-slate-200 bg-white p-1.5 text-xs font-bold"><option value="MT">MT</option><option value="KG">KG</option></select>
                            </div></td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.01"
                                value={item.AgreedCustomerPrice ?? item.UnitPrice}
                                onChange={(e) => handleItemChange(idx, "AgreedCustomerPrice" as keyof OrderDetail, Number(e.target.value))}
                                className="w-24 p-1.5 bg-amber-50 border border-amber-300 rounded text-xs font-mono font-bold text-amber-800"
                                title="قیمت توافقی مشتری؛ قیمت مبدأ از روی آن و حمل کل محاسبه می‌شود"
                              />
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={item.BaseUnitPrice ?? item.UnitPrice}
                                  readOnly
                                  className="w-24 p-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono font-bold text-blue-700"
                                  title="قیمت واحد مبدأ (X)، محاسبه‌شده از قیمت توافقی و سهم حمل"
                                />
                                <div className="text-[10px] text-amber-700">سهم حمل: {formatNumber((Number(item.FreightAllocation) || 0) / (Number(item.Quantity) || 1))} ← قیمت نهایی مشتری: {formatNumber(item.AgreedCustomerPrice ?? item.UnitPrice)}</div>
                              </div>
                            </td>
                            <td className="p-2 font-mono font-bold text-slate-900">
                              {formatNumber(item.ExtPrice || item.Quantity * item.UnitPrice)}{" "}
                              {editingOrder.AgreementCurrency || "USD"}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                        {(() => {
                          // ExtPrice is the agreed line price and already includes the
                          // freight allocated to that line. Older imported rows may not
                          // have BaseUnitPrice, so calculate from the line totals first.
                          const totalWithFreight = (editingOrder.items || []).reduce((sum, item) => sum + (Number(item.ExtPrice) || (Number(item.Quantity) || 0) * Number(item.AgreedCustomerPrice ?? item.UnitPrice ?? 0)), 0);
                          const totalWithoutFreight = Math.max(0, totalWithFreight - (Number(editingOrder.Freight) || 0));
                          return <><tr><td colSpan={7} className="p-3 text-left">مبلغ کل اقلام بدون هزینه حمل</td><td className="p-3 font-mono text-slate-800">{formatNumber(totalWithoutFreight)} {editingOrder.AgreementCurrency || "USD"}</td><td /></tr><tr><td colSpan={7} className="p-3 text-left">مبلغ کل اقلام با احتساب هزینه حمل</td><td className="p-3 font-mono text-blue-800">{formatNumber(totalWithFreight)} {editingOrder.AgreementCurrency || "USD"}</td><td /></tr></>;
                        })()}
                      </tfoot>
                    </GuidedEntryTable>
                  </div>
                </div>
              )}

              {/* Tab 3: Currency & Exchange Rate Conversion */}
              {activeTabSub === "currency_conversion" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                      <ArrowRightLeft size={16} className="text-indigo-600" />
                      <span>{t("exchange_rate")} و تسعیر توافق به صدور پروفرما</span>
                    </div>
                    <InlineHelp><p className="text-xs text-indigo-700 leading-relaxed">
                      معمولاً توافق با خریدار بر اساس دلار ($) یا یورو (€) صورت می‌گیرد، ولی ممکن است پیش‌فاکتور بر اساس درهم (AED)، لیر (TRY) یا ارز دیگری صادر گردد. در این صورت نرخ تسعیر لحاظ گردیده و مبالغ تبدیل می‌شوند.
                    </p></InlineHelp>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">{t("agreement_currency")}</label>
                        <select
                          value={editingOrder.AgreementCurrency || "USD"}
                          onChange={(e) =>
                            handleCurrencyChange(
                              e.target.value,
                              editingOrder.InvoiceCurrency || "USD",
                              editingOrder.ExchangeRateApplied || 1.0
                            )
                          }
                          className="w-full p-2 bg-white border border-indigo-200 rounded-md font-bold text-slate-800"
                        >
                          <option value="USD">USD ($ دلار آمریکا)</option>
                          <option value="EUR">EUR (€ یورو)</option>
                          <option value="AED">AED (درهم امارات)</option>
                          <option value="CAD">CAD ($ دلار کانادا)</option>
                          <option value="CNY">CNY (یوان چین)</option>
                          <option value="TRY">TRY (لیر ترکیه)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">{t("invoice_currency")}</label>
                        <select
                          value={editingOrder.InvoiceCurrency || "USD"}
                          onChange={(e) =>
                            handleCurrencyChange(
                              editingOrder.AgreementCurrency || "USD",
                              e.target.value,
                              editingOrder.ExchangeRateApplied || 1.0
                            )
                          }
                          className="w-full p-2 bg-white border border-indigo-200 rounded-md font-bold text-indigo-700"
                        >
                          <option value="USD">USD ($ دلار آمریکا)</option>
                          <option value="EUR">EUR (€ یورو)</option>
                          <option value="AED">AED (درهم امارات)</option>
                          <option value="CAD">CAD ($ دلار کانادا)</option>
                          <option value="CNY">CNY (یوان چین)</option>
                          <option value="TRY">TRY (لیر ترکیه)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">
                          {t("exchange_rate")} (نرخ تبدیل)
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          value={editingOrder.ExchangeRateApplied || 1.0}
                          onChange={(e) =>
                            handleCurrencyChange(
                              editingOrder.AgreementCurrency || "USD",
                              editingOrder.InvoiceCurrency || "USD",
                              Number(e.target.value)
                            )
                          }
                          className="w-full p-2 bg-white border border-indigo-200 rounded-md font-mono font-bold text-indigo-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Conversion Live Metric Preview Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <span className="text-[11px] text-slate-500 font-medium">مبلغ بر مبنای ارز توافقی:</span>
                      <div dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "start" }} className="text-lg font-black font-mono text-slate-900">
                        {formatCurrency(
                          agreementAmountPreview,
                          editingOrder.AgreementCurrency || "USD"
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        نرخ واحد توافقی: <BidiText direction="ltr">{`${editingOrder.SellPrice} ${editingOrder.AgreementCurrency || "USD"} / MT`}</BidiText>
                      </div>
                    </div>

                    <div className="bg-indigo-50/50 border border-indigo-300 rounded-xl p-4 space-y-2">
                      <span className="text-[11px] text-indigo-700 font-bold">مبلغ تبدیل شده روی پیش‌فاکتور:</span>
                      <div dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "start" }} className="text-lg font-black font-mono text-indigo-900">
                        {formatCurrency(
                          invoiceAmountPreview,
                          editingOrder.InvoiceCurrency || "USD"
                        )}
                      </div>
                      <div className="text-[11px] text-indigo-800 font-mono">
                        نرخ واحد در پروفرما:{" "}
                        <BidiText direction="ltr">{`${((editingOrder.SellPrice || 0) * (editingOrder.ExchangeRateApplied || 1)).toFixed(2)} ${editingOrder.InvoiceCurrency || "USD"} / MT`}</BidiText>
                      </div>
                    </div>
                  </div>

                  <div className="border border-amber-200 bg-amber-50/70 rounded-xl p-4 space-y-3">
                    <div>
                      <h4 className="font-bold text-amber-950 text-xs">{l("اصلاح دستی قیمت نهایی PI", "Manual PI price correction")}</h4>
                      <InlineHelp><p className="text-[11px] text-amber-800 mt-1">{l("مقادیر به‌طور خودکار از نرخ تسعیر پر می‌شوند. فقط برای گرد کردن یا توافق خاص، قیمت ردیف موردنظر را اصلاح کنید.", "Values are calculated from the exchange rate. Adjust a line only for rounding or a specific agreement.")}</p></InlineHelp>
                    </div>
                    <div className="space-y-2">
                      {(editingOrder.items || []).map((item, idx) => {
                        const autoPrice = (Number(item.UnitPrice) || 0) * (editingOrder.ExchangeRateApplied || 1);
                        const currentPrice = item.InvoiceUnitPrice ?? item.UnitEx ?? autoPrice;
                        return <div key={item.OrderDetailID || idx} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                          <BidiText className="truncate font-medium text-slate-800">{item.ProductName || `Item ${idx + 1}`}</BidiText>
                          <input type="number" step="0.0001" value={currentPrice} onChange={(e) => {
                            const invoiceUnitPrice = Number(e.target.value);
                            const quantity = Number(item.Quantity) || 0;
                            const updatedItems = [...(editingOrder.items || [])];
                            updatedItems[idx] = { ...item, InvoiceUnitPrice: invoiceUnitPrice, UnitEx: invoiceUnitPrice, ExtEx: quantity * invoiceUnitPrice, UseManualInvoicePrice: true };
                            setEditingOrder({ ...editingOrder, items: updatedItems });
                          }} className={`w-28 p-1.5 border rounded font-mono ${item.UseManualInvoicePrice ? "bg-white border-amber-400 text-amber-900" : "bg-slate-100 border-slate-200 text-slate-600"}`} />
                          <button type="button" onClick={() => handleItemChange(idx, "UseManualInvoicePrice", false)} className="px-2 py-1 rounded border border-amber-300 text-amber-900">{l("خودکار", "Auto")}</button>
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Custom Clauses */}
              {activeTabSub === "clauses" && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Plus size={14} className="text-purple-600" />
                      <span>{t("add_clause")}</span>
                    </h4>

                    <div className="flex flex-wrap gap-2">{PROFORMA_TERM_PRESETS.map(preset => <button key={preset.id} type="button" title={preset.text} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800" onClick={() => { const clauses = editingOrder.CustomClauses || []; if (clauses.some(clause => clause.id === `preset:${preset.id}` || (clause.contentEn || clause.content) === preset.content)) return; setEditingOrder({ ...editingOrder, CustomClauses: [...clauses, { id: `preset:${preset.id}`, category: preset.category, title: preset.label, titleEn: preset.title, content: preset.content, contentEn: preset.content }] }); }}>+ {preset.label}</button>)}</div>
                    <form onSubmit={handleAddCustomClause} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1">{t("clause_category")}</label>
                        <select
                          value={newClauseCategory}
                          onChange={(e) => setNewClauseCategory(e.target.value as any)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        >
                          <option value="payment">شرایط پرداخت (Payment)</option>
                          <option value="delivery">شرایط تحویل (Delivery)</option>
                          <option value="packing">بسته‌بندی و علامت‌گذاری</option>
                          <option value="bank">مشخصات بانکی و سوئیفت</option>
                          <option value="remarks">توضیحات و بازرسی (Remarks)</option>
                          <option value="custom">بند دلخواه / سفارشی</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-slate-600 font-semibold mb-1">{t("clause_title")}</label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: شرط بازرسی SGS در بندر مبدا..."
                          value={newClauseTitle}
                          onChange={(e) => setNewClauseTitle(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-slate-600 font-semibold mb-1">{t("clause_content")}</label>
                        <textarea
                          rows={2}
                          required
                          placeholder="متن کامل بند و تعهدات طرفین..."
                          value={newClauseContent}
                          onChange={(e) => setNewClauseContent(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        />
                      </div>

                      <div className="sm:col-span-4 flex justify-end">
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-bold text-xs shadow-2xs"
                        >
                          {t("add_clause")}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* List of active clauses */}
                  <div className="space-y-2.5">
                    <h5 className="font-bold text-slate-700 text-xs">بندهای ثبت شده برای این پیش‌فاکتور:</h5>
                    {(!editingOrder.CustomClauses || editingOrder.CustomClauses.length === 0) ? (
                      <p className="text-slate-400 text-xs italic">هیچ بند اختصاصی افزوده نشده است.</p>
                    ) : (
                      editingOrder.CustomClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{clause.title}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-mono">
                                {clause.category}
                              </span>
                            </div>
                            <p className="text-slate-600 leading-relaxed">{clause.content}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveClause(clause.id)}
                            className="text-slate-400 hover:text-rose-600 shrink-0 p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {/* Tab 5: Shares & Custom Partner Distribution */}
              {false && (
                <div className="space-y-5">
                  <UnifiedProfitPanel
                    db={db}
                    order={editingOrder}
                    supplier={db.suppliers.find((supplier) => supplier.SupplierID === editingOrder.SupplierID)}
                    issuerCompanyShares={db.issuerCompanyShares}
                    cashPartners={db.cashPartners || []}
                    onSaveCashPartner={onSaveCashPartner}
                    onChange={setEditingOrder}
                  />
                  {/* This legacy model uses a different formula. Keep it hidden
                      while the unified calculation is the single source of truth. */}
                  {false && <>
                  {(() => {
                    const defaults = [
                      { id: "arca-tav", name: "Arca Tav", arcaPercent: 100 },
                      { id: "bera", name: "Berakem", arcaPercent: 60 },
                      { id: "arovin", name: "Arovin", arcaPercent: 66.6666666667 },
                    ];
                    const configured = db.issuerCompanyShares || [];
                    const companies = defaults.map((company) => configured.find((item) => item.id === company.id) || company)
                      .concat(configured.filter((item) => !defaults.some((company) => company.id === item.id)));
                    const derivedIssuerId = issuerIdFromSupplier(editingOrder.SupplierID, editingOrder.IssuerCompanyId || "arca-tav");
                    const profit = calculateProfitBreakdown({ ...editingOrder, IssuerCompanyId: derivedIssuerId }, companies);
                    return <>
                      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex items-center justify-between gap-3"><div><h4 className="font-bold text-emerald-950">{l("خلاصه یکپارچه سود و کسورات", "Unified profit & deductions summary")}</h4><InlineHelp><p className="mt-0.5 text-[10px] text-emerald-800">همه ارقام این خلاصه از فرم «محاسبه سود پرونده» خوانده می‌شوند؛ برای تغییر مقدار یا حمل، فقط همان فرم را ویرایش کنید.</p></InlineHelp></div>
                        <button
                          type="button"
                          onClick={() => setEditingOrder({
                            ...editingOrder,
                            CostPrice: 1500,
                            PriceToAgent: 1670,
                            Freight: 4000,
                            TotalQuantity: 21.6,
                            EndCustomerPrice: 2130,
                            SellPrice: 2130,
                            DirectArcaSharePercent: 66.6666666667,
                            AgentCompanySharePercent: 50,
                            HasSalesAgent: true,
                            Discount: 0,
                            customShares: [],
                            Hesam: 0, Reza: 0, Jalali: 0, Lida: 0, Hamid: 0, Moradi: 0,
                            Mahsa: 0, Arash: 0, Khusru: 0, Nazanin: 0, Extra: 0,
                          })}
                          className="hidden shrink-0 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-800"
                        >
                          نمونه
                        </button>
                        </div>
                        <div className="hidden grid-cols-1 gap-2 xl:grid-cols-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">قیمت خرید واقعی ($/MT)</span><input type="number" value={editingOrder.CostPrice || 0} onChange={(e) => setEditingOrder({ ...editingOrder, CostPrice: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">فروش به آروین / براکم ($/MT)</span><input type="number" value={editingOrder.PriceToAgent || 0} onChange={(e) => setEditingOrder({ ...editingOrder, PriceToAgent: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">سهم آرکاتاو از سود صادرکننده (%)</span><input type="number" min="0" max="100" value={editingOrder.DirectArcaSharePercent ?? 66.6666666667} onChange={(e) => setEditingOrder({ ...editingOrder, DirectArcaSharePercent: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">فروش ایجنت به مشتری ($/MT)</span><input type="number" value={editingOrder.EndCustomerPrice || editingOrder.SellPrice || 0} onChange={(e) => setEditingOrder({ ...editingOrder, EndCustomerPrice: Number(e.target.value), SellPrice: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">سهم آرکاتاو از سود ایجنت (%)</span><input type="number" min="0" max="100" value={editingOrder.AgentCompanySharePercent ?? 50} onChange={(e) => setEditingOrder({ ...editingOrder, AgentCompanySharePercent: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="w-44 shrink-0">{l("سهم بانک", "Bank share")} (%)</span><input type="number" min="0" max="100" value={editingOrder.BankSharePercent || 0} onChange={(e) => setEditingOrder({ ...editingOrder, BankSharePercent: Number(e.target.value) })} className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono" /></label>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono md:grid-cols-4"><div className="rounded bg-white/80 px-2 py-1.5">سود صادرکننده: <b>{formatCurrency(profit.directProfit, "$")}/MT</b></div><div className="rounded bg-white/80 px-2 py-1.5">حمل مؤثر: <b>{formatCurrency(profit.freightPerMT, "$")}/MT</b></div><div className="rounded bg-white/80 px-2 py-1.5">سود ایجنت: <b>{formatCurrency(profit.indirectProfit, "$")}/MT</b></div><div className="rounded bg-emerald-100 px-2 py-1.5 font-bold text-emerald-900">سهم آرکاتاو: {formatCurrency(profit.arcaShare, "$")}</div></div>
                      </div>
                    </>;
                  })()}
                  {/* پرونده: خروجی روشن و قابل ذخیرهٔ مدل سود */}
                  {(() => {
                    const profit = calculateProfitBreakdown(editingOrder, db.issuerCompanyShares, db.suppliers.find((supplier) => supplier.SupplierID === editingOrder.SupplierID), db);
                    const assignedAgent = (editingOrder.customShares || []).find((share) => share.id === "agent-profit-beneficiary");
                    return <div className="p-4 bg-white border border-emerald-200 rounded-xl space-y-3">
                      <div><h4 className="font-bold text-emerald-950">توزیع سود شرکت‌ها در این پرونده</h4><InlineHelp><p className="text-[11px] text-slate-500 mt-1">این سه مبلغ مستقیماً از فرمول بالا محاسبه می‌شوند و با «ذخیره اطلاعات» در پرونده ثبت خواهند شد.</p></InlineHelp></div>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg"><table className="w-full text-right text-xs"><thead className="bg-emerald-50 text-emerald-950"><tr><th className="p-3">ذی‌نفع</th><th className="p-3">منشأ سود</th><th className="p-3">مبلغ سهم ($)</th></tr></thead><tbody className="divide-y divide-slate-100"><tr><td className="p-3 font-bold">آرکاتاو</td><td className="p-3">سهم آرکاتاو از سود آروین/براکم و ایجنت فروش</td><td className="p-3 font-mono font-bold text-emerald-700">{formatCurrency(profit.arcaShare, "$")}</td></tr><tr><td className="p-3 font-bold">آروین / براکم</td><td className="p-3">ماندهٔ سود فروش به ایجنت</td><td className="p-3 font-mono font-bold">{formatCurrency(profit.sellerCompanyProfit, "$")}</td></tr><tr><td className="p-3 font-bold">{assignedAgent?.partnerName || "ایجنت فروش"}</td><td className="p-3">ماندهٔ سود فروش به مشتری{assignedAgent ? ` — سهم ثبت‌شده برای ${assignedAgent.partnerName}` : ""}</td><td className="p-3 font-mono font-bold">{formatCurrency(profit.agentCompanyProfit, "$")}</td></tr></tbody><tfoot className="bg-slate-50 font-bold"><tr><td className="p-3" colSpan={2}>کل سود این پرونده</td><td className="p-3 font-mono">{formatCurrency(profit.totalCaseProfit, "$")}</td></tr></tfoot></table></div>
                    </div>;
                  })()}

                  </>}
                  {/* Section 1: Standard Partners Shares */}
                  <div className="hidden p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <Coins size={14} className="text-amber-600" />
                        <span>{l("اقلام ثابت تسهیم سود", "Fixed profit-sharing items")}</span>
                      </h4>
                      <span className="text-[10px] text-slate-400">{l("مبالغ به دلار ($) محاسبه می‌شود", "Amounts are calculated in USD ($)")}</span>
                    </div>

                    {(() => {
                      const companies = db.issuerCompanyShares?.length ? db.issuerCompanyShares : [{ id: "arca-tav", name: "Arca Tav", arcaPercent: 100 }];
                      const derivedIssuerId = issuerIdFromSupplier(editingOrder.SupplierID, editingOrder.IssuerCompanyId || "arca-tav");
                      const profit = calculateProfitBreakdown({ ...editingOrder, IssuerCompanyId: derivedIssuerId }, companies);
                      const issuerCompany = companies.find((company) => company.id === derivedIssuerId) || companies[0];
                      return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div><label className="block text-slate-600 font-semibold mb-1 text-[11px]">{l("سهم آرکاتاو (محاسبه‌شده)", "Arca Tav share (calculated)")}</label><div className="w-full p-2 rounded-md bg-indigo-50 border border-indigo-200 font-mono text-xs font-bold text-indigo-900">{formatCurrency(profit.arcaShare, "$")}</div></div>
                        <div><label className="block text-slate-600 font-semibold mb-1 text-[11px]">{l("سهم فروشنده / شرکت صادرکننده (محاسبه‌شده)", "Seller / issuer share (calculated)")}</label><div className="w-full p-2 rounded-md bg-indigo-50 border border-indigo-200 font-mono text-xs font-bold text-indigo-900">{issuerCompany.name}: {formatCurrency(profit.issuerCompanyShare, "$")}</div></div>
                        <div><label className="block text-slate-600 font-semibold mb-1 text-[11px]">{l("سهم بانک (محاسبه‌شده)", "Bank share (calculated)")}</label><div className="w-full p-2 rounded-md bg-amber-50 border border-amber-200 font-mono text-xs font-bold text-amber-900">{formatCurrency(profit.bankShare, "$")}</div></div>
                        <div><label className="block text-slate-600 font-semibold mb-1 text-[11px]">{l("پرداخت غیررسمی / مازاد پرداخت", "Over payment / unofficial")}</label><input type="number" value={editingOrder.OverPayment || 0} onChange={(e) => setEditingOrder({ ...editingOrder, OverPayment: Number(e.target.value) })} className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs" /></div>
                        <div><label className="block text-slate-600 font-semibold mb-1 text-[11px]">{l("مبلغ برگشتی به مشتری", "Customer refund")}</label><input type="number" value={editingOrder.CustomerRefund || 0} onChange={(e) => setEditingOrder({ ...editingOrder, CustomerRefund: Number(e.target.value) })} className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs" /></div>
                      </div>;
                    })()}

                    <div className="hidden">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم آرکا (Arca)</label>
                        <input
                          type="number"
                          value={editingOrder.ArcaShare || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, ArcaShare: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم برا (Bera)</label>
                        <input
                          type="number"
                          value={editingOrder.BeraShare || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, BeraShare: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم حسام</label>
                        <input
                          type="number"
                          value={editingOrder.Hesam || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Hesam: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم رضا</label>
                        <input
                          type="number"
                          value={editingOrder.Reza || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Reza: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم جلالی</label>
                        <input
                          type="number"
                          value={editingOrder.Jalali || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Jalali: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم لیدا</label>
                        <input
                          type="number"
                          value={editingOrder.Lida || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Lida: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم حمید</label>
                        <input
                          type="number"
                          value={editingOrder.Hamid || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Hamid: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم مرادی</label>
                        <input
                          type="number"
                          value={editingOrder.Moradi || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Moradi: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم مهسا</label>
                        <input
                          type="number"
                          value={editingOrder.Mahsa || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Mahsa: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم آرش</label>
                        <input
                          type="number"
                          value={editingOrder.Arash || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Arash: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم آروین</label>
                        <input
                          type="number"
                          value={editingOrder.Arovin || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Arovin: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">سهم خسرو</label>
                        <input
                          type="number"
                          value={editingOrder.Khusru || 0}
                          onChange={(e) => setEditingOrder({ ...editingOrder, Khusru: Number(e.target.value) })}
                          className="w-full p-2 rounded-md bg-white border border-slate-200 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Legacy beneficiary editor: its data is now shown by the unified
                      allocation table above, so a second standalone card is hidden. */}
                  {false && <>
                  <div className="p-4 bg-white border border-indigo-200 rounded-xl space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                          <Users size={14} className="text-indigo-600" />
                          <span>{l("سهم افراد و ذی‌نفعان پرونده از سهم آرکاتاو", "Individual allocations from Arcatav's share")}</span>
                        </h4>
                        <InlineHelp><p className="text-[11px] text-slate-500 mt-0.5">
                          {l("مبلغ هر فرد از سهم آرکاتاو کسر می‌شود. این مبالغ همراه پرونده ذخیره شده و بعداً در گزارش سهم هر شخص قابل جمع است.", "Each amount is deducted from Arcatav's share and saved with this case for later aggregation.")}
                        </p></InlineHelp>
                      </div>

                      <button
                        type="button"
                        onClick={handleOpenAddPartnerShare}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <Plus size={13} />
                        <span>{l("افزودن ذی‌نفع", "Add beneficiary")}</span>
                      </button>
                    </div>

                    {(() => {
                      const profit = calculateUnifiedProfit(editingOrder, db.suppliers.find((supplier) => supplier.SupplierID === editingOrder.SupplierID), db.issuerCompanyShares, db);
                      const eligibleShares = (editingOrder.customShares || []).filter((share) => isProfitCurrencyShare(editingOrder, share));
                      const peopleTotal = eligibleShares.reduce((sum, share) => sum + Number(share.amount || 0), 0);
                      // arcatavShare in the unified engine is already after valid
                      // commissions; subtracting peopleTotal again would double-count it.
                      const remainingArca = profit?.arcatavShare || 0;
                      return <div className="flex flex-wrap gap-4 text-xs font-bold"><span>جمع سهم افراد با ارز محاسبه: {formatCurrency(peopleTotal, "$")}</span><span className={remainingArca >= 0 ? "text-emerald-700" : "text-rose-700"}>ماندهٔ سهم آرکاتاو: {formatCurrency(remainingArca, "$")}</span></div>;
                    })()}

                    {/* Table of custom shares */}
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5">{l("نام ذی‌نفع", "Beneficiary")}</th>
                            <th className="p-2.5">{l("نقش", "Role")}</th>
                            <th className="p-2.5">{l("مبلغ سهم", "Share amount")}</th>
                            <th className="p-2.5">{l("یادداشت", "Notes")}</th>
                            <th className="p-2.5 text-center">{l("عملیات", "Actions")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(!editingOrder.customShares || editingOrder.customShares.length === 0) ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                                {l("هنوز ذی‌نفع اختصاصی ثبت نشده است. از دکمه بالا استفاده کنید.", "No custom beneficiary has been added. Use the button above.")}
                              </td>
                            </tr>
                          ) : (
                            editingOrder.customShares.map((share) => (
                              <tr key={share.id} className="hover:bg-indigo-50/30">
                                <td className="p-2.5 font-bold text-slate-900">{share.partnerName}</td>
                                <td className="p-2.5 text-slate-600 font-medium">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                                    {share.role || l("همکار تجاری", "Trade partner")}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono font-bold text-emerald-700">
                                  {formatCurrency(share.amount, share.currency === "USD" ? "$" : share.currency)}
                                </td>
                                <td className="p-2.5 text-slate-500 text-[11px] max-w-xs truncate">
                                  {share.notes || "-"}
                                </td>
                                <td className="p-2.5 text-center">
                                  <button type="button" onClick={() => handleOpenEditPartnerShare(share)} className="p-1 rounded text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" title="ویرایش سهم"><Edit size={13} /></button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePartnerShare(share.id)}
                                    className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                    title="حذف سهم"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </>}
                </div>
              )}

              {/* Tab 7: Shipping & Logistics Details */}
              {activeTabSub === "shipping" && (
                <ProgressiveFields guided={guided} core={[0,4,5,6]} extraTitle="کشتی، شماره سفر و شرکت حمل">
                  <div className={guided?"sm:col-span-2":"md:col-span-3"}><ShippingReferencesEditor order={editingOrder} onChange={setEditingOrder}/></div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">نام کشتی (Vessel Name)</label>
                    <input value={editingOrder.VesselName || ""} onChange={(e) => setEditingOrder({ ...editingOrder, VesselName: e.target.value })} className="w-full rounded-md border border-slate-200 bg-slate-50 p-2" placeholder="e.g. MSC AURORA"/>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">شماره سفر (Voyage No.)</label>
                    <input value={editingOrder.VoyageNumber || ""} onChange={(e) => setEditingOrder({ ...editingOrder, VoyageNumber: e.target.value })} className="w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono" placeholder="e.g. 026W"/>
                  </div>

                  <DynamicFieldDropdown
                    fieldKey="Carrier"
                    label="خط کشتیرانی / Carrier"
                    value={editingOrder.Carrier || ""}
                    onChange={(val) => setEditingOrder({ ...editingOrder, Carrier: val })}
                    options={db.fieldOptions?.Carrier || []}
                    onAddNewOption={(opt) => onAddNewFieldOption && onAddNewFieldOption("Carrier", opt)}
                    placeholder="e.g. IRISL / CMA CGM / MSC"
                  />

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">تاریخ بارگیری (ETD)</label>
                    <input
                      type="date"
                      value={editingOrder.ETD || ""}
                      onChange={(e) => setEditingOrder({ ...editingOrder, ETD: e.target.value })}
                      className="w-full p-2 rounded-md bg-slate-50 border border-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">تاریخ رسیدن به مقصد (ETA)</label>
                    <input
                      type="date"
                      value={editingOrder.ETA || ""}
                      onChange={(e) => setEditingOrder({ ...editingOrder, ETA: e.target.value })}
                      className="w-full p-2 rounded-md bg-slate-50 border border-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">{t("order_status")}</label>
                    <input
                      type="text"
                      value={editingOrder.OrderStatus || ""}
                      onChange={(e) => setEditingOrder({ ...editingOrder, OrderStatus: e.target.value })}
                      className="w-full p-2 rounded-md bg-slate-50 border border-slate-200"
                    />
                  </div>
                </ProgressiveFields>
              )}
            </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Customer Modal */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-3.5 bg-blue-900 text-white flex items-center justify-between">
              <h3 className="text-xs font-bold">{t("quick_add_customer")}</h3>
              <button onClick={() => setCustomerModalOpen(false)} className="text-blue-200 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomerModal} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">نام شرکت / خریدار *</label>
                <input
                  type="text"
                  required
                  value={customerFormData.CustomerName}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, CustomerName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">آدرس و محل تحویل</label>
                <input
                  type="text"
                  value={customerFormData.Address || ""}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, Address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">تلفن تماس</label>
                  <input
                    type="text"
                    value={customerFormData.Tel || ""}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, Tel: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">شناسه ملی / کد اقتصادی</label>
                  <input
                    type="text"
                    value={customerFormData.CommercialID || ""}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, CommercialID: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded text-slate-600"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                >
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Supplier Modal */}
      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-3.5 bg-purple-900 text-white flex items-center justify-between">
              <h3 className="text-xs font-bold">{t("quick_add_supplier")}</h3>
              <button onClick={() => setSupplierModalOpen(false)} className="text-purple-200 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplierModal} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">نام تأمین‌کننده خارجی *</label>
                <input
                  type="text"
                  required
                  value={supplierFormData.SupplierName}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, SupplierName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">آدرس کمپانی</label>
                <input
                  type="text"
                  value={supplierFormData.Address || ""}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, Address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">نشانی لوگو (URL)</label>
                <input
                  type="url"
                  value={supplierFormData.LogoT || ""}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, LogoT: e.target.value })}
                  placeholder="https://…/logo.png"
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">مشخصات حساب بانکی و سوئیفت</label>
                <input
                  type="text"
                  value={supplierFormData.Bank || ""}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, Bank: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSupplierModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded text-slate-600"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold"
                >
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Partner Share Modal */}
      {partnerShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="p-3.5 bg-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} />
                <h3 className="text-xs font-bold">{editingPartnerShareId ? "ویرایش سهم شخص در پرونده" : "انتخاب یا افزودن شخص برای تسهیم سود"}</h3>
              </div>
              <button
                onClick={() => setPartnerShareModalOpen(false)}
                className="text-indigo-200 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePartnerShare} className="p-4 space-y-3.5 text-xs">
              {/* Option 1: Pick from existing cash partners */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">جستجو در اشخاص و همکاران</label>
                <input value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} placeholder="نام فرد یا نقش را جستجو کنید…" className="w-full mb-2 bg-white border border-indigo-200 rounded p-2 text-xs" />
                <label className="block font-medium text-slate-700 mb-1">انتخاب از اشخاص و شرکای موجود در سیستم</label>
                <select
                  value={partnerShareForm.partnerId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const found = (db.cashPartners || []).find((p) => p.id === selId);
                    const systemUser = (db.users || []).find((user) => `user_${user.id}` === selId);
                    if (found || systemUser) {
                      const selected = found || { id: `user_${systemUser!.id}`, name: systemUser!.name, role: systemUser!.role };
                      setPartnerShareForm({
                        ...partnerShareForm,
                        partnerId: selected.id,
                        partnerName: selected.name,
                        role: selected.role || "همکار تجاری",
                      });
                    } else {
                      setPartnerShareForm({
                        ...partnerShareForm,
                        partnerId: "",
                      });
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-medium"
                >
                  <option value="">-- انتخاب شخص / شرکت --</option>
                  {(db.cashPartners || []).filter((cp) => `${cp.name} ${cp.role || ""}`.toLowerCase().includes(partnerSearch.toLowerCase())).map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.role || "شریک"})
                    </option>
                  ))}

                </select>
              </div>

              <button type="button" onClick={() => directory.open(p => setPartnerShareForm(current => ({ ...current, partnerId: p.id, partnerName: p.name, role: p.role || "" })))} className="rounded bg-indigo-50 p-2 font-bold text-indigo-700">تعریف / ویرایش در فهرست یکپارچه اشخاص و شرکت‌ها</button>
              {/* Name Input / Override */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">نام کامل شخص یا شرکت دریافت‌کننده سهم *</label>
                <input
                  type="text"
                  required
                  value={partnerShareForm.partnerName}
                  readOnly
                  placeholder="مثال: آقای کریمی / شرکت حمل نقل پارس..."
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">سمت / نقش در این معامله</label>
                  <input
                    type="text"
                    value={partnerShareForm.role}
                    onChange={(e) => setPartnerShareForm({ ...partnerShareForm, role: e.target.value })}
                    placeholder="مثال: کارگزار، بازاریاب، معرف خریدار"
                    className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">مبلغ سهم از سود ($) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={partnerShareForm.amount || ""}
                    onChange={(e) => setPartnerShareForm({ ...partnerShareForm, amount: Number(e.target.value) })}
                    placeholder="مثال: 500"
                    className="w-full bg-emerald-50 border border-emerald-300 rounded p-2 text-xs font-mono font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">توضیحات و توافقات پرداخت</label>
                <input
                  type="text"
                  value={partnerShareForm.notes}
                  onChange={(e) => setPartnerShareForm({ ...partnerShareForm, notes: e.target.value })}
                  placeholder="مثال: پرداخت پس از وصول نهایی وجه از خریدار..."
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                />
              </div>

              <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100">
                <InlineHelp><p className="text-[11px] text-indigo-900 font-medium">
                  تعریف و ویرایش مشخصات از فهرست یکپارچه انجام می‌شود؛ این فرم فقط سهم شخص در پرونده را ثبت می‌کند.
                </p></InlineHelp>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPartnerShareModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded text-slate-600 font-medium"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold shadow-2xs"
                >
                  {editingPartnerShareId ? "ذخیرهٔ تغییرات سهم" : "ثبت سهم در پیش‌فاکتور"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Print Modal */}
      {showPrintModal && (
        <ProformaPrintModal
          order={showPrintModal}
          initialDocType={printModalDocType}
          initialPartialShipmentId={printModalShipmentId}
          initialShowDocumentPicker={printModalShowDocumentPicker}
          supplier={db.suppliers.find((s) => s.SupplierID === showPrintModal.SupplierID)}
          customer={db.customers.find((c) => c.CustomerID === showPrintModal.CustomerID)}
          printTemplateConfig={db.printTemplateConfig}
          onSaveTemplateConfig={(cfg) => onSavePrintTemplateConfig && onSavePrintTemplateConfig(cfg)}
          canPrint={canPrintDocuments}
          documentTemplates={db.documentTemplates || []}
          templateEditorDb={db}
          onSaveDocumentTemplate={onSaveDocumentTemplate}
          onDeleteDocumentTemplate={onDeleteDocumentTemplate}
          onSaveCustomFont={onSaveCustomFont}
          onDeleteCustomFont={onDeleteCustomFont}
          onApplyAppFont={onApplyAppFont}
          onUpdateOrder={(updatedOrder) => {
            // Keep the case editor in sync with the document modal. Without
            // this, saving the open case afterwards could overwrite the
            // independently saved Sales Contract values with its stale copy.
            onSaveOrder(updatedOrder);
            setEditingOrder(updatedOrder);
            setShowPrintModal(updatedOrder);
          }}
          onRefreshApp={onRefreshApp}
          onClose={() => setShowPrintModal(null)}
        />
      )}
    </div>
  );
};
