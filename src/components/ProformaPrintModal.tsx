import { InlineHelp } from "./InlineHelp";
import { pdfRenderingOptions } from "../utils/pdfRendering";
import { packingTransportLines } from "../utils/shippingReferences";
import { MultiItemCommercialTemplate } from "./MultiItemCommercialTemplate";
import { commercialTemplateOptions } from "../utils/commercialTemplateOptions";
import { applyStandardTemplateLayout } from "../utils/standardTemplateLayout";
import { directPaperPrint } from "../utils/directPaperPrint";
import { PrintProductName } from "./PrintProductName";
import { PROFORMA_TERM_PRESETS } from "../utils/proformaTermPresets";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  X,
  Printer,
  Sliders,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Building2,
  FileText,
  DollarSign,
  ShieldCheck,
  Layers,
  Save,
  Upload,
  ClipboardPaste,
  RefreshCw,
} from "lucide-react";
import { Order, Supplier, Customer, OrderDetail, PrintTemplateConfig, DocumentTemplate, DocumentTemplateField, CommercialDocumentFile, AppDatabase, CustomFont, PartialShipment, PartialShipmentDocumentType } from "../types";
import { formatEnglishNumber, formatNumber } from "../utils/formatters";
import { getOrderQuantityMT } from "../utils/orderAccounting";
import { DocumentTemplatesSettings } from "./DocumentTemplatesSettings";
import { WordDocumentEditor } from "./WordDocumentEditor";
import { CoaDocumentPages } from "./CoaDocumentPages";
import { ReferencePdfPage } from "./ReferencePdfPage";
import { commercialDocumentDateFor, commercialInvoiceNumberFor, commercialIssueDateFor, packingListDateFor, packingListIssueDateFor, packingListNumberFor } from "../utils/commercialDocuments";
import { buildExtractedCoaHtml, CaseCommercialDocumentsPanel } from "./CaseCommercialDocumentsPanel";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ProformaPrintModalProps {
  order: Order;
  settingsMode?: boolean;
  canvasMode?: boolean;
  initialDocType?: "PI" | "COMMERCIAL_INVOICE" | "PACKING_LIST" | "COO" | "COA" | "BL" | "SALES_CONTRACT";
  /** The shipment stage to preview for a split invoice, Packing List or COO. */
  initialPartialShipmentId?: string | null;
  /** Open the selectable document bundle when launched from the case document hub. */
  initialShowDocumentPicker?: boolean;
  supplier?: Supplier;
  customer?: Customer;
  printTemplateConfig?: PrintTemplateConfig;
  onSaveTemplateConfig?: (config: PrintTemplateConfig) => void;
  canPrint?: boolean;
  documentTemplates?: DocumentTemplate[];
  onUpdateOrder?: (order: Order) => void;
  templateEditorDb?: AppDatabase;
  onSaveDocumentTemplate?: (template: DocumentTemplate) => void;
  onDeleteDocumentTemplate?: (id: string) => void;
  onSaveCustomFont?: (font: CustomFont) => void;
  onDeleteCustomFont?: (id: string) => void;
  onApplyAppFont?: (family: string) => void;
  onRefreshApp?: () => void;
  onClose: () => void;
}

const BlFilePages: React.FC<{ file: CommercialDocumentFile; onRemove: () => void }> = ({ file, onRemove }) => {
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    let active = true;
    if (file.mimeType !== "application/pdf") { setPageCount(1); return; }
    fetch(file.data)
      .then((response) => response.arrayBuffer())
      .then((bytes) => getDocument({ ...pdfRenderingOptions, data: new Uint8Array(bytes) }).promise)
      .then((pdf) => { if (active) setPageCount(Math.max(1, pdf.numPages)); })
      .catch(() => { if (active) setPageCount(1); });
    return () => { active = false; };
  }, [file.data, file.mimeType]);

  return <>
    <div className="print:hidden mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><span>{file.name}</span><button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={13}/>حذف فایل</button></div>
    {Array.from({ length: pageCount }, (_, index) => <article key={`${file.id}-${index + 1}`} className="break-after-page min-h-[270mm] border border-slate-200 bg-white p-4">
      {file.mimeType === "application/pdf" ? <ReferencePdfPage data={file.data} pageNumber={index + 1}/>
        : file.mimeType.startsWith("image/") ? <img src={file.data} className="mx-auto max-h-[245mm] w-full object-contain"/>
        : <a href={file.data} className="text-indigo-700 underline">{file.name}</a>}
    </article>)}
  </>;
};

const randomDigits = (length: number) => {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value, index) => String(index === 0 ? (value % 9) + 1 : value % 10)).join("");
};

const cooBarcodeFor = (certificateNumber: string) => `${randomDigits(13)}${certificateNumber}`;

const Interleaved2of5Barcode: React.FC<{ value: string }> = ({ value }) => {
  const patterns = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
  const digits = value.replace(/\D/g, "");
  const encoded = digits.length % 2 === 0 ? digits : `0${digits}`;
  const modules: Array<{ black: boolean; width: number }> = [
    { black: true, width: 1 }, { black: false, width: 1 }, { black: true, width: 1 }, { black: false, width: 1 },
  ];
  for (let index = 0; index < encoded.length; index += 2) {
    const bars = patterns[Number(encoded[index])];
    const spaces = patterns[Number(encoded[index + 1])];
    for (let part = 0; part < 5; part += 1) {
      modules.push({ black: true, width: bars[part] === "w" ? 3 : 1 });
      modules.push({ black: false, width: spaces[part] === "w" ? 3 : 1 });
    }
  }
  modules.push({ black: true, width: 3 }, { black: false, width: 1 }, { black: true, width: 1 });
  const totalWidth = modules.reduce((sum, module) => sum + module.width, 0);
  let offset = 0;
  return <div className="flex h-full w-full flex-col items-center justify-end"><svg viewBox={`0 0 ${totalWidth} 42`} preserveAspectRatio="none" className="h-[70%] w-full" role="img" aria-label={`Barcode ${encoded}`}>{modules.map((module, index) => { const x = offset; offset += module.width; return module.black ? <rect key={index} x={x} y="0" width={module.width} height="42" fill="#000"/> : null; })}</svg><div className="mt-0.5 whitespace-nowrap font-mono text-[10px] font-bold leading-none">({encoded})</div></div>;
};

const DEFAULT_CONFIG: PrintTemplateConfig = {
  templateStyle: "standard_berakem",
  headerColor: "#374151", // Charcoal/Dark Slate matching the PDF sample
  showExchangeRate: "auto", // Auto: only shows when exchange is active
  showCommercialId: true,
  showCountryBeneficiary: true,
  showConsignee: true,
  consigneeText: "The Same As Buyer",
  showTotalCube: true,
  showGrossWeight: true,
  showPartialShipment: true,
  showHsCode: true,
  showPackingColumn: true,
  showFreightRow: true,
  showOtherExpRow: true,
  showBankDetails: true,
  showSignatory: true,
  showStampSignature: true,
  fontSize: "standard", logoSize: 64, signatureSize: 160, stampSize: 140, pageMarginMm: 10,
  customNotes: [
    "*Proforma Invoice is null and void after the validity is over",
    "- All charges Incurred after the arrival of cargo at Destination Customs will be on consignee account.",
    "- Inspection: If any, on buyer's account",
  ],
  customExtraFields: [],
};

export const ProformaPrintModal: React.FC<ProformaPrintModalProps> = ({
  order,
  settingsMode = false,
  canvasMode = false,
  initialDocType = "PI",
  initialPartialShipmentId = null,
  initialShowDocumentPicker = false,
  supplier,
  customer,
  printTemplateConfig,
  onSaveTemplateConfig,
  canPrint = false,
  documentTemplates = [],
  onUpdateOrder,
  templateEditorDb,
  onSaveDocumentTemplate,
  onDeleteDocumentTemplate,
  onSaveCustomFont,
  onDeleteCustomFont,
  onApplyAppFont,
  onRefreshApp,
  onClose,
}) => {
  const [docType, setDocType] = useState<"PI" | "COMMERCIAL_INVOICE" | "PACKING_LIST" | "COO" | "COA" | "BL" | "SALES_CONTRACT">(initialDocType);
  const printedCoaFiles = order.technicalDocumentExtraction?.useForIssuedDocument
    ? (order.coaFiles || []).map((file) => file.id === `extracted-coa-${order.technicalDocumentExtraction!.attachmentId}` ? { ...file, editableHtml: buildExtractedCoaHtml(order.technicalDocumentExtraction!) } : file)
    : (order.coaFiles || []);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(initialShowDocumentPicker);
  const closeDocumentPicker = () => {
    if (initialShowDocumentPicker) onClose();
    else setShowDocumentPicker(false);
  };
  const [selectedBundleDocs, setSelectedBundleDocs] = useState<Record<string, boolean>>({
    COVER: true, PI: true, SALES_CONTRACT: false, COMMERCIAL_INVOICE: true, PACKING_LIST: true, COO: true, COA: true, BL: true,
  });
  const partialShipments = order.partialShipments || [];
  const [activePartialShipmentId, setActivePartialShipmentId] = useState<string | null>(initialPartialShipmentId);
  const cooUploadInputRef = useRef<HTMLInputElement>(null);
  const activePartialShipment = activePartialShipmentId
    ? partialShipments.find((shipment) => shipment.id === activePartialShipmentId) || null
    : null;
  const isSplitDocument = !!activePartialShipment && ["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"].includes(docType);
  const isSplitCommercialInvoice = docType === "COMMERCIAL_INVOICE" && !!activePartialShipment;
  const splitInvoiceNumber = `${commercialInvoiceNumberFor(order)}-${partialShipments.findIndex(shipment => shipment.id === activePartialShipmentId) + 1}`;
  const activeCooId = docType === "COO" && activePartialShipment ? (/^\d{7}$/.test(activePartialShipment.cooId || "") ? activePartialShipment.cooId : "") : order.COOId;
  const activeCooBarcodeNo = docType === "COO" && activePartialShipment ? (/^\d{20}$/.test(activePartialShipment.cooBarcodeNo || "") && activePartialShipment.cooBarcodeNo!.endsWith(activeCooId || "") ? activePartialShipment.cooBarcodeNo : "") : order.COOBarcodeNo;
  const activeCooFiles = activePartialShipment ? activePartialShipment.cooFiles || [] : order.cooFiles || [];
  const [includeCoaHeaderFooter, setIncludeCoaHeaderFooter] = useState(true);
  // The cover is an index for this exact export, so it must reflect the
  // document-picker selection rather than a fixed generic list.
  const bundleCoverDocuments = [
    ["PI", `Proforma Invoice — ${order.ProformaInvoiceID || "PI"}`, true],
    ["SALES_CONTRACT", `Sales Contract — ${order.SalesContractID || `${order.ProformaInvoiceID || "PI"}-SC`}`, true],
    ["COMMERCIAL_INVOICE", `Commercial Invoice — ${order.CommercialInvoiceID || order.InvoiceNo || order.ProformaInvoiceID || "PI"}`, true],
    ["PACKING_LIST", `Packing List${partialShipments.length ? ` (${partialShipments.length} shipment${partialShipments.length === 1 ? "" : "s"})` : ""} — ${order.PackingListID || order.ProformaInvoiceID || "PI"}`, true],
    ["COO", `Certificate of Origin — ${order.COOId || order.ProformaInvoiceID || "PI"}`, true],
    ["COA", `Certificate of Analysis — ${order.COANumber || order.ProformaInvoiceID || "PI"}`, Boolean(order.coaFiles?.length)],
    ["BL", "Bill of Lading (BL)", Boolean(order.blFiles?.length)],
  ].filter(([key, , available]) => Boolean(available && selectedBundleDocs[key as string]));
  const bundleCoverDocumentList = bundleCoverDocuments.map(([, label]) => `<li>${label}</li>`).join("");
  const [printAllProgress, setPrintAllProgress] = useState<string | null>(null);
  const printPdfPageCache = useRef(new Map<string, string[]>());
  const printPdfRenderJobs = useRef(new Map<string, Promise<string[]>>());
  const printBlobUrls = useRef(new Set<string>());
  const printCssCache = useRef<string | null>(null);
  const cooTemplateRef = useRef<HTMLDivElement>(null);
  const [cooUniformFontSize, setCooUniformFontSize] = useState(10);
  const normalizeCooCountry = (value?: string) => {
    const normalized = (value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if (["turkey", "turkiye", "republicofturkiye"].includes(normalized)) return "turkey";
    if (["uae", "unitedarabemirates", "emirates"].includes(normalized)) return "uae";
    if (["korea", "southkorea", "republicofkorea", "korearepublicof"].includes(normalized)) return "korea";
    return normalized;
  };
  const originKey = normalizeCooCountry(order.CountryOfOrigin);
  // COO بر مبنای شرکت صادرکنندهٔ پروفرما انتخاب می‌شود، نه مبدأ کالای همان سفارش.
  // هر صادرکننده قالب و کشور رسمی خودش را دارد.
  const issuerIdentity = `${order.IssuerCompanyId || ""} ${supplier?.SupplierName || ""}`.toLowerCase();
  const issuerCooCountry = issuerIdentity.includes("bera") || issuerIdentity.includes("berakem")
    ? "turkey"
    : issuerIdentity.includes("arovin")
    ? "uae"
    : issuerIdentity.includes("bull") || issuerIdentity.includes("bpi")
    ? "korea"
    : originKey;
  // شناسهٔ عددی تأمین‌کننده برای سازگاری با قالب‌های قدیمی نیز پشتیبانی می‌شود،
  // اما هیچ قالب صادرکنندهٔ دیگری به‌عنوان جایگزین انتخاب نخواهد شد.
  const issuerTemplateKeys = [order.IssuerCompanyId, order.SupplierID ? String(order.SupplierID) : ""].filter(Boolean);
  const issuerCountryById: Record<string, string> = {
    "arca-tav": "Iran",
    bera: "Turkey",
    arovin: "United Arab Emirates",
    bullschem: "South Korea",
  };
  const issuerCountry = issuerCountryById[order.IssuerCompanyId || ""] || supplier?.Country || order.CountryOfBeneficiary;
  const belongsToOrderIssuer = (template: DocumentTemplate) => !template.issuerCompanyId || issuerTemplateKeys.includes(template.issuerCompanyId);
  // Template Configuration state
  const [config, setConfig] = useState<PrintTemplateConfig>(() => {
    return {
      ...DEFAULT_CONFIG,
      ...(printTemplateConfig || {}),
      ...(order.printTermsConfig || {}),
      customNotes: order.printTermsConfig?.customNotes ?? printTemplateConfig?.customNotes ?? DEFAULT_CONFIG.customNotes,
      customExtraFields: printTemplateConfig?.customExtraFields || [],
    };
  });
  const selectedCooTemplate = documentTemplates.find((item) => item.isActive && item.documentType === "COO" && normalizeCooCountry(item.country) === issuerCooCountry && Boolean(item.issuerCompanyId) && belongsToOrderIssuer(item))
    || documentTemplates.find((item) => item.isActive && item.documentType === "COO" && normalizeCooCountry(item.country) === issuerCooCountry && !item.issuerCompanyId);
  const selectedVisualTemplate = docType === "COO" ? selectedCooTemplate : documentTemplates.find((item) => item.isActive && !item.isBuiltIn && item.layoutMode !== "standard" && item.documentType === docType && item.theme === (config.templateStyle || "standard_berakem") && belongsToOrderIssuer(item));
  const standardLayoutTemplate = documentTemplates.find(item => item.isActive && item.layoutMode === "standard" && item.documentType === docType && item.theme === (config.templateStyle || "standard_berakem") && belongsToOrderIssuer(item));
  const standardPaperRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const paper = standardPaperRef.current;
    if (paper && standardLayoutTemplate?.fields?.length) return applyStandardTemplateLayout(paper, standardLayoutTemplate.fields);
  }, [standardLayoutTemplate, docType, order]);
  const [inlineCooEditing, setInlineCooEditing] = useState(false);
  const [inlineCooFields, setInlineCooFields] = useState<DocumentTemplateField[]>([]);
  const [inlineCooSelectedId, setInlineCooSelectedId] = useState<string | null>(null);
  const [inlineCooSelectedIds, setInlineCooSelectedIds] = useState<string[]>([]);
  const [inlineCooDrag, setInlineCooDrag] = useState<{ startX: number; startY: number; positions: Record<string, { x: number; y: number }> } | null>(null);
  useEffect(() => {
    if (!inlineCooEditing) setInlineCooFields(selectedVisualTemplate?.fields || []);
  }, [selectedVisualTemplate?.id, inlineCooEditing]);
  const displayedVisualTemplate = inlineCooEditing && docType === "COO" && selectedVisualTemplate
    ? { ...selectedVisualTemplate, fields: inlineCooFields }
    : selectedVisualTemplate;
  useLayoutEffect(() => {
    if (docType !== "COO" || !displayedVisualTemplate || !cooTemplateRef.current) return;
    const textFields = [...cooTemplateRef.current.querySelectorAll<HTMLElement>("[data-coo-autofit='true']")] as HTMLElement[];
    if (!textFields.length) return;
    let selectedSize = 6;
    for (let candidate = 18; candidate >= 6; candidate -= 0.25) {
      textFields.forEach((element) => { element.style.fontSize = `${candidate}px`; });
      const fits = textFields.every((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const contentRect = range.getBoundingClientRect();
        const availableHeight = element.getBoundingClientRect().height * 0.8;
        return contentRect.height <= availableHeight + 0.5 && element.scrollWidth <= element.clientWidth + 1;
      });
      if (fits) { selectedSize = candidate; break; }
    }
    setCooUniformFontSize(selectedSize);
  }, [docType, displayedVisualTemplate, order, supplier, customer]);
  const inlineCooSelectedField = inlineCooFields.find((field) => field.id === inlineCooSelectedId);
  const updateInlineCooField = (id: string, patch: Partial<DocumentTemplateField>) => setInlineCooFields((fields) => fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  const addInlineCooField = () => {
    const field: DocumentTemplateField = { id: `manual-${Date.now()}`, label: "متن دستی", source: "custom", customValue: "متن جدید", x: 10, y: 10, width: 25, height: 4, fontFamily: "Public Sans", fontSize: 12, bold: false, align: "left", color: "#111827", backgroundColor: "transparent", borderWidth: 0, zIndex: 10 };
    setInlineCooFields((fields) => [...fields, field]);
    setInlineCooSelectedId(field.id);
    setInlineCooSelectedIds([field.id]);
  };
  const saveInlineCooLayout = () => {
    if (!selectedVisualTemplate || !onSaveDocumentTemplate) return;
    onSaveDocumentTemplate({ ...selectedVisualTemplate, fields: inlineCooFields, isActive: true });
    setInlineCooEditing(false);
  };
  const startInlineCooDrag = (event: React.PointerEvent<HTMLDivElement>, field: DocumentTemplateField) => {
    if (!inlineCooEditing) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const selectedIds = additive
      ? (inlineCooSelectedIds.includes(field.id) ? inlineCooSelectedIds.filter((id) => id !== field.id) : [...inlineCooSelectedIds, field.id])
      : (inlineCooSelectedIds.includes(field.id) ? inlineCooSelectedIds : [field.id]);
    const nextIds = selectedIds.length ? selectedIds : [field.id];
    const canvas = event.currentTarget.parentElement;
    if (!canvas) return;
    const positions = Object.fromEntries(inlineCooFields.filter((item) => nextIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    setInlineCooSelectedIds(nextIds);
    setInlineCooSelectedId(field.id);
    setInlineCooDrag({ startX: event.clientX, startY: event.clientY, positions });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveInlineCooSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!inlineCooDrag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - inlineCooDrag.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - inlineCooDrag.startY) / rect.height) * 100;
    setInlineCooFields((fields) => fields.map((field) => {
      const start = inlineCooDrag.positions[field.id];
      return start ? { ...field, x: Math.max(0, Math.min(100 - field.width, start.x + deltaX)), y: Math.max(0, Math.min(100 - (field.height || 5), start.y + deltaY)) } : field;
    }));
  };

  useEffect(() => {
    if (docType !== "COO" || activePartialShipment || issuerCooCountry !== "turkey" || !onUpdateOrder) return;
    const hasValidCertificateNumber = /^\d{7}$/.test(order.COOId || "");
    const certificateNumber = hasValidCertificateNumber ? order.COOId! : randomDigits(7);
    const hasMatchingBarcodeNumber = /^\d{20}$/.test(order.COOBarcodeNo || "") && order.COOBarcodeNo!.endsWith(certificateNumber);
    if (hasValidCertificateNumber && hasMatchingBarcodeNumber) return;
    onUpdateOrder({
      ...order,
      COOId: certificateNumber,
      COOBarcodeNo: hasMatchingBarcodeNumber ? order.COOBarcodeNo : cooBarcodeFor(certificateNumber),
    });
  }, [docType, activePartialShipment, issuerCooCountry, onUpdateOrder, order]);

  // Older split-shipment drafts predate their own COO identity fields. Repair
  // them once, using the exact 7-digit certificate / 20-digit barcode rule
  // used by the original Turkey COO, before any preview or PDF is issued.
  useEffect(() => {
    if (!activePartialShipment || !activePartialShipment.documents.includes("COO") || !onUpdateOrder) return;
    const certificateNumber = /^\d{7}$/.test(activePartialShipment.cooId || "") ? activePartialShipment.cooId! : randomDigits(7);
    const barcode = /^\d{20}$/.test(activePartialShipment.cooBarcodeNo || "") && activePartialShipment.cooBarcodeNo!.endsWith(certificateNumber)
      ? activePartialShipment.cooBarcodeNo
      : cooBarcodeFor(certificateNumber);
    if (activePartialShipment.cooId === certificateNumber && activePartialShipment.cooBarcodeNo === barcode) return;
    onUpdateOrder({
      ...order,
      partialShipments: (order.partialShipments || []).map((shipment) => shipment.id === activePartialShipment.id
        ? { ...shipment, cooId: certificateNumber, cooBarcodeNo: barcode }
        : shipment),
    });
  }, [activePartialShipment, onUpdateOrder, order]);

  useEffect(() => {
    if (docType !== "COO" || activePartialShipment || issuerCooCountry !== "uae" || !onUpdateOrder || /^\d{7}$/.test(order.COOId || "")) return;
    onUpdateOrder({ ...order, COOId: randomDigits(7) });
  }, [docType, activePartialShipment, issuerCooCountry, onUpdateOrder, order]);

  const itemGrossWeightTotal = activePartialShipment && (["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"].includes(docType))
    ? activePartialShipment.items.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0)
    : (order.items || []).length
    ? (order.items || []).reduce((sum, item) => sum + (Number(item.GrossWeight) || 0), 0)
    : Number(String(order.TotalGrossWeight || "").replace(/[^0-9.-]/g, "")) || 0;
  const printedNetWeightTotal = activePartialShipment && (["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"].includes(docType))
    ? Number(activePartialShipment.netWeight ?? itemGrossWeightTotal)
    : Number(order.TotalNetWeight || 0);
  // Commercial documents must always show the current catalogue identity for
  // a product. Transactional quantities, weights and financial figures below
  // deliberately remain on the order, so historical accounting is untouched.
  const masterProductFor = (item: OrderDetail) => {
    const products = templateEditorDb?.products || [];
    const productId = String(item.ProductID ?? "").trim();
    const byId = products.find((product) => String(product.ProductID ?? "").trim() === productId);
    if (byId) return byId;
    const productName = (item.ProductName || "").trim().toLocaleLowerCase();
    return productName
      ? products.find((product) => product.ProductName.trim().toLocaleLowerCase() === productName)
      : undefined;
  };
  const currentProductNameFor = (item: OrderDetail) =>
    masterProductFor(item)?.ProductName?.trim() || item.ProductName || "";
  const currentProductDescriptionFor = (item: OrderDetail) => {
    const product = masterProductFor(item);
    // Order-line values are snapshots/overrides for this case. Keep them
    // authoritative in printed documents without writing back to the catalog.
    const chemicalName = (product ? product.ChemicalName : item.ChemicalName)?.trim();
    const itemGrade = item.ProductDescription?.trim();
    const grade = (itemGrade && itemGrade.toLocaleLowerCase() !== "export grade"
      ? itemGrade
      : product?.ExportGrade)?.trim();
    const printedName = currentProductNameFor(item).trim().toLocaleLowerCase().replace(/\s+/g, " ");
    const details = [chemicalName, grade]
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => {
        const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
        return normalized !== printedName && values.findIndex((candidate) => candidate.trim().toLocaleLowerCase().replace(/\s+/g, " ") === normalized) === index;
      });
    return details.join(" - ");
  };
  const currentHsCodeFor = (item: OrderDetail) =>
    masterProductFor(item)?.HSCODE?.trim() || item.HSCODE || "";
  const currentPackingFor = (item: OrderDetail) =>
    item.NosAndKindOfPackages?.trim() || masterProductFor(item)?.PackingDetail?.trim() || "";

  const resolveTemplateField = (source: string, customValue?: string) => {
    const values: Record<string, string | number | undefined> = {
      documentNumber: docType === "COMMERCIAL_INVOICE" ? isSplitCommercialInvoice ? splitInvoiceNumber : commercialInvoiceNumberFor(order) : docType === "PACKING_LIST" ? activePartialShipment?.packingListId || packingListNumberFor(order) : docType === "COO" ? activeCooId || order.ProformaInvoiceID : order.ProformaInvoiceID,
      cooBarcode: activeCooBarcodeNo,
      documentDate: docType === "COO" ? order.COODate || commercialDocumentDateFor(order) : docType === "COMMERCIAL_INVOICE" ? activePartialShipment?.date || commercialDocumentDateFor(order) : docType === "PACKING_LIST" ? activePartialShipment?.date || packingListDateFor(order) : order.PIDate,
      proformaNumber: order.ProformaInvoiceID, proformaDate: order.PIDate,
      supplierName: supplier?.SupplierName, customerName: customer?.CustomerName, customerAddress: customer?.Address,
      exporterBlock: [supplier?.SupplierName, supplier?.Address, supplier?.Country].filter(Boolean).join("\n"),
      consigneeBlock: [customer?.CustomerName, customer?.Address, customer?.Country].filter(Boolean).join("\n"),
      countryOfOrigin: order.CountryOfOrigin, countryOfDestination: order.CountryOfDestination,
      portOfLoading: order.PortOfLoading, portOfDischarge: order.PortOfDischarge,
      transportMode: order.TransportaionMode, transportMeans: activePartialShipment?.truckNo || order.TranspotationModeMeans,
      freight: isDummyCommercialInvoice || isSplitCommercialInvoice ? printedFreight : order.Freight, deliveryTerms: order.TermsOfDelivery, paymentTerms: order.TermsOfPayment,
      currency: isDummyCommercialInvoice ? outputCurrency : order.TransactionCurrency, grossWeight: isSplitDocument ? printedGrossWeightTotal : itemGrossWeightTotal, netWeight: printedNetWeightTotal,
      etd: order.ETD || order.SailingDate,
      invoiceNumberDate: [isSplitCommercialInvoice ? splitInvoiceNumber : commercialInvoiceNumberFor(order), isSplitCommercialInvoice ? activePartialShipment?.date : commercialDocumentDateFor(order)].filter(Boolean).join(" / "),
      transportDetails: [order.TransportaionMode, order.TranspotationModeMeans, order.PortOfLoading && `FROM: ${order.PortOfLoading}`, order.PortOfDischarge && `TO: ${order.PortOfDischarge}`].filter(Boolean).join("\n"),
      remarks: order.Remarks || order.Note,
      marksNumbers: [activePartialShipment?.containerSealEntries?.map((entry) => `${entry.containerNo}${entry.sealNo ? ` / Seal: ${entry.sealNo}` : ""}`).join(" | ") || order.ContainerNo, (activePartialShipment?.truckNo || order.TruckNo) && `Truck No.: ${activePartialShipment?.truckNo || order.TruckNo}`].filter(Boolean).join(" | ") || order.ShipmentRef,
      goodsDescription: (isSplitDocument ? printedItems.map(row => row.item) : order.items)?.map((item, index) => `${index + 1}. ${currentProductDescriptionFor(item) || currentProductNameFor(item)}${currentHsCodeFor(item) ? `\nHS CODE: ${currentHsCodeFor(item)}` : ""}${currentPackingFor(item) ? `\n${currentPackingFor(item)}` : ""}`).join("\n\n"),
      quantityDetails: (isSplitDocument ? printedItems.map(row => ({...row.item, Quantity: row.quantity})) : order.items)?.map((item) => {
        const quantityKg = item.QuantityUnit === "KG" ? Number(item.Quantity || 0) : Number(item.Quantity || 0) * 1000;
        return `${quantityKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`;
      }).join("\n"),
      weightDetails: `NET: ${formatEnglishNumber(printedNetWeightTotal, 2)} KG\nGROSS: ${formatEnglishNumber(isSplitDocument ? printedGrossWeightTotal : itemGrossWeightTotal, 2)} KG`,
      productName: (isSplitDocument ? printedItems.map(row => row.item) : order.items)?.map(currentProductNameFor).join(", "), quantity: isSplitDocument ? printedItems.reduce((sum, row) => sum + row.quantity, 0) : order.TotalQuantity,
      hsCode: order.items?.map(currentHsCodeFor).filter(Boolean).join(", "), custom: customValue,
    };
    return String(values[source] ?? customValue ?? "");
  };
  const uploadCommercialFiles = (kind: "coaFiles" | "blFiles", files?: FileList | null) => {
    if (!files?.length || !onUpdateOrder) return;
    Promise.all(Array.from(files).map(async (file, index): Promise<CommercialDocumentFile> => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const base = { id: `${kind}-${Date.now()}-${index}`, name: file.name, mimeType: file.type || "application/octet-stream", data: "", pageNumber: (order[kind]?.length || 0) + index + 1, uploadedAt: new Date().toISOString() };
      if (kind === "coaFiles" && extension === "docx") {
        const [result, data] = await Promise.all([mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }), new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); })]);
        return { ...base, data, sourceKind: "word", editableHtml: sanitizeEditableHtml(result.value) };
      }
      if (kind === "coaFiles" && ["xlsx", "xls", "csv"].includes(extension || "")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const html = workbook.SheetNames.map((name) => `<h3>${escapeHtml(name)}</h3>${XLSX.utils.sheet_to_html(workbook.Sheets[name])}`).join("<br/>");
        return { ...base, sourceKind: "excel", editableHtml: sanitizeEditableHtml(html) };
      }
      const data = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
      return { ...base, sourceKind: "upload", data };
    })).then((uploaded) => onUpdateOrder({ ...order, [kind]: [...(order[kind] || []), ...uploaded] }));
  };
  const uploadCooFile = async (file?: File) => {
    if (!file || !onUpdateOrder) return;
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      window.alert("فقط فایل PDF یا تصویر قابل بارگذاری است.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const uploaded: CommercialDocumentFile = {
      id: `coo-${Date.now()}`, name: file.name, mimeType: file.type, data,
      sourceKind: "upload", pageNumber: 1, uploadedAt: new Date().toISOString(),
    };
    if (activePartialShipment) {
      const nextOrder = { ...order, partialShipments: (order.partialShipments || []).map((shipment) => shipment.id === activePartialShipment.id ? { ...shipment, cooFiles: [uploaded] } : shipment) };
      onUpdateOrder(nextOrder);
    } else {
      onUpdateOrder({ ...order, cooFiles: [uploaded] });
    }
  };
  const removeCooFile = () => {
    if (!onUpdateOrder) return;
    if (activePartialShipment) {
      onUpdateOrder({ ...order, partialShipments: (order.partialShipments || []).map((shipment) => shipment.id === activePartialShipment.id ? { ...shipment, cooFiles: [] } : shipment) });
    } else {
      onUpdateOrder({ ...order, cooFiles: [] });
    }
  };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
  const sanitizeEditableHtml = (html: string) => {
    const documentNode = new DOMParser().parseFromString(html, "text/html");
    documentNode.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
    documentNode.querySelectorAll("*").forEach((node) => Array.from(node.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on") || attribute.name.toLowerCase() === "contenteditable") node.removeAttribute(attribute.name);
    }));
    return documentNode.body.innerHTML;
  };
  const addEditableCoaPage = () => {
    if (!onUpdateOrder) return;
    const current = order.coaFiles || [];
    onUpdateOrder({ ...order, coaFiles: [...current, { id: `coa-editor-${Date.now()}`, name: "Editable COA page", mimeType: "text/html", data: "", editableHtml: "<p>متن یا جدول را اینجا Paste کنید…</p>", sourceKind: "pasted", pageNumber: current.length + 1, uploadedAt: new Date().toISOString() }] });
  };
  const updateEditableCoaPage = (id: string, editableHtml: string) => {
    if (!onUpdateOrder) return;
    onUpdateOrder({ ...order, coaFiles: (order.coaFiles || []).map((file) => file.id === id ? { ...file, editableHtml: sanitizeEditableHtml(editableHtml) } : file) });
  };
  const removeCommercialPage = (kind: "coaFiles" | "blFiles", id: string) => {
    if (!onUpdateOrder) return;
    const remaining = (order[kind] || []).filter((file) => file.id !== id).map((file, index) => ({ ...file, pageNumber: index + 1 }));
    onUpdateOrder({ ...order, [kind]: remaining });
  };
  useEffect(() => {
    if (printTemplateConfig) setConfig({...DEFAULT_CONFIG, ...printTemplateConfig, ...(order.printTermsConfig || {}), customNotes: order.printTermsConfig?.customNotes ?? printTemplateConfig.customNotes ?? DEFAULT_CONFIG.customNotes});
  }, [printTemplateConfig]);
  const [termsSaved, setTermsSaved] = useState("");
  const paragraphStyle = (key: string): React.CSSProperties => {
    const style = config.termOverrides?.[key];
    return { fontWeight: (style?.bold ?? config.termsStyle?.bold) ? 700 : 400, fontSize: `${Math.max(6, Math.min(30, style?.fontSizePt ?? config.termsStyle?.fontSizePt ?? 8))}pt`, marginBottom: `${Math.max(0, Math.min(72, style?.spaceAfterPt ?? config.termsStyle?.spaceAfterPt ?? 6))}pt`, textAlign: style?.align ?? config.termsStyle?.align ?? "left", lineHeight: 1.45 };
  };
  const changeTerm = (key: string, patch: NonNullable<PrintTemplateConfig["termOverrides"]>[string]) => setConfig(current => ({ ...current, termOverrides: { ...current.termOverrides, [key]: { ...current.termOverrides?.[key], ...patch } } }));
  const printedClauses = (order.CustomClauses || []).map(clause => ({ ...clause, titleEn: config.termOverrides?.[`clause:${clause.id}`]?.title ?? clause.titleEn ?? clause.title, contentEn: config.termOverrides?.[`clause:${clause.id}`]?.text ?? clause.contentEn ?? clause.content }));
  const remapNoteStyles = (notes: string[]) => {
    const overrides = Object.fromEntries(Object.entries(config.termOverrides || {}).filter(([key]) => !key.startsWith("note:")));
    notes.forEach((note, index) => { const oldIndex = (config.customNotes || []).indexOf(note); const style = config.termOverrides?.[`note:${oldIndex}`]; if (style) overrides[`note:${index}`] = style; });
    return overrides;
  };
  const saveTerms = () => {
    const styles = [config.termsStyle || {}, ...Object.values(config.termOverrides || {})];
    if (styles.some(style => (style.fontSizePt !== undefined && (!Number.isFinite(style.fontSizePt) || style.fontSizePt < 6 || style.fontSizePt > 30)) || (style.spaceAfterPt !== undefined && (!Number.isFinite(style.spaceAfterPt) || style.spaceAfterPt < 0 || style.spaceAfterPt > 72)))) { setTermsSaved("اندازه متن باید بین ۶ تا ۳۰ و فاصله بین صفر تا ۷۲ باشد."); return; }
    if (onUpdateOrder) {
      const latest = templateEditorDb?.orders.find(item => item.OrderID === order.OrderID) || order;
      onUpdateOrder({ ...latest, printTermsConfig: { customNotes: config.customNotes, termsStyle: config.termsStyle, termOverrides: config.termOverrides } });
    } else if (onSaveTemplateConfig) onSaveTemplateConfig(config);
    else return;
    setTermsSaved("متن و قالب شروط ذخیره شد.");
  };
  React.useEffect(() => { setTermsSaved(""); }, [config.customNotes, config.termsStyle, config.termOverrides]);
  const normalizeTerm = (text: string) => text.trim().replace(/^[*•\-\s]+/, "").replace(/\s+/g, " ").toLocaleLowerCase();
  const clauseTexts = new Set(printedClauses.flatMap(clause => [clause.contentEn || clause.content || "", clause.titleEn || clause.title || "", `${clause.titleEn || clause.title || ""}: ${clause.contentEn || clause.content || ""}`]).map(normalizeTerm));
  const seenNotes = new Set<string>();
  const piPrintedNotes = (config.customNotes || []).filter(note => {
    const key = normalizeTerm(note);
    if (!key || seenNotes.has(key) || clauseTexts.has(key)) return false;
    seenNotes.add(key); return true;
  });
  const hasPiTerms = (order.CustomClauses || []).length > 0 || piPrintedNotes.length > 0;
  // Print-only inputs persist separately from commercial and accounting figures.
  type PrintFigures = NonNullable<Order["printFigurePresets"]>[string];
  const printScopeKey = isSplitDocument ? `${docType}:shipment:${activePartialShipment!.id}` : docType;
  const printDraftKey = `${order.OrderID}:${printScopeKey}`;
  const savedPrintFigures = order.printFigurePresets?.[printScopeKey];
  const [printDrafts, setPrintDrafts] = useState<Record<string, PrintFigures>>({});
  const currentPrintFigures = printDrafts[printDraftKey] || savedPrintFigures || { enabled: false, items: {}, freight: null, totalAmountDue: null };
  const manualPrintFigures = currentPrintFigures.enabled;
  const printFigureOverrides = currentPrintFigures.items;
  const manualPrintedFreight = currentPrintFigures.freight;
  const manualTotalAmountDue = currentPrintFigures.totalAmountDue;
  function updatePrintDraft<K extends keyof PrintFigures>(field: K, update: React.SetStateAction<PrintFigures[K]>) {
    setPrintDrafts(all => {
      const previous = all[printDraftKey] || savedPrintFigures || { enabled: false, items: {}, freight: null, totalAmountDue: null };
      const value = typeof update === "function" ? (update as (value: PrintFigures[K]) => PrintFigures[K])(previous[field]) : update;
      return { ...all, [printDraftKey]: { ...previous, [field]: value } };
    });
  }
  const setManualPrintFigures = (value: React.SetStateAction<boolean>) => updatePrintDraft("enabled", value);
  const setPrintFigureOverrides = (value: React.SetStateAction<PrintFigures["items"]>) => updatePrintDraft("items", value);
  const setManualPrintedFreight = (value: React.SetStateAction<number | null>) => updatePrintDraft("freight", value);
  const setManualTotalAmountDue = (value: React.SetStateAction<number | null>) => updatePrintDraft("totalAmountDue", value);
  const [dummyLoadedOrderId, setDummyLoadedOrderId] = useState(order.OrderID);
  const dummyLatest = useRef({ order, onUpdateOrder });
  dummyLatest.current = { order, onUpdateOrder };
  const [dummyInvoiceEnabled, setDummyInvoiceEnabled] = useState(!!order.dummyInvoicePreset?.enabled);
  const [dummyInvoiceCurrency, setDummyInvoiceCurrency] = useState(order.dummyInvoicePreset?.currency || order.InvoiceCurrency || order.TransactionCurrency || order.AgreementCurrency || "USD");
  const [dummyInvoiceRate, setDummyInvoiceRate] = useState(order.dummyInvoicePreset?.rate ?? Number(order.ExchangeRateApplied || order.ExchangeRate || 1));
  const [dummyInvoiceRows, setDummyInvoiceRows] = useState<NonNullable<Order["dummyInvoicePreset"]>["rows"]>(order.dummyInvoicePreset?.rows || {});
  const [dummyInvoiceFreightBase, setDummyInvoiceFreightBase] = useState<number | null>(order.dummyInvoicePreset?.freightBase ?? null);
  const [dummyInvoiceFreightOverride, setDummyInvoiceFreightOverride] = useState<number | null>(order.dummyInvoicePreset?.freightOverride ?? null);
  const [dummyInvoiceTotalOverride, setDummyInvoiceTotalOverride] = useState<number | null>(order.dummyInvoicePreset?.totalOverride ?? null);
  const [salesContractPrintEnabled, setSalesContractPrintEnabled] = useState(false);
  const [salesContractPrintCurrency, setSalesContractPrintCurrency] = useState(order.SalesContractCurrency || order.InvoiceCurrency || order.TransactionCurrency || "USD");
  const [salesContractPrintRate, setSalesContractPrintRate] = useState(1);
  const [salesContractPrintRows, setSalesContractPrintRows] = useState<Record<string, { quantity: number; unitPriceBase: number; grossWeight: number }>>({});
  const [salesContractPrintFreightBase, setSalesContractPrintFreightBase] = useState<number | null>(null);
  const [salesContractPrintFreightOverride, setSalesContractPrintFreightOverride] = useState<number | null>(null);
  const [salesContractPrintTotalOverride, setSalesContractPrintTotalOverride] = useState<number | null>(null);
  const [printSaveMessage, setPrintSaveMessage] = useState("");
  React.useEffect(() => {
    const preset = order.dummyInvoicePreset;
    setDummyLoadedOrderId(order.OrderID);
    setDummyInvoiceEnabled(!!preset?.enabled);
    setDummyInvoiceCurrency(preset?.currency || order.InvoiceCurrency || order.TransactionCurrency || order.AgreementCurrency || "USD");
    setDummyInvoiceRate(preset?.rate ?? Number(order.ExchangeRateApplied || order.ExchangeRate || 1));
    setDummyInvoiceRows(preset?.rows || {});
    setDummyInvoiceFreightBase(preset?.freightBase ?? null);
    setDummyInvoiceFreightOverride(preset?.freightOverride ?? null);
    setDummyInvoiceTotalOverride(preset?.totalOverride ?? null);
  }, [order.OrderID]);
  React.useEffect(() => {
    if (dummyLoadedOrderId !== order.OrderID || !Object.keys(dummyInvoiceRows).length) return;
    const preset: NonNullable<Order["dummyInvoicePreset"]> = {
      enabled: dummyInvoiceEnabled, currency: dummyInvoiceCurrency, rate: dummyInvoiceRate,
      rows: dummyInvoiceRows, freightBase: dummyInvoiceFreightBase,
      freightOverride: dummyInvoiceFreightOverride, totalOverride: dummyInvoiceTotalOverride,
    };
    const latest = dummyLatest.current;
    if (JSON.stringify(latest.order.dummyInvoicePreset) !== JSON.stringify(preset)) {
      latest.onUpdateOrder?.({ ...latest.order, dummyInvoicePreset: preset });
    }
  }, [order.OrderID, dummyLoadedOrderId, dummyInvoiceEnabled, dummyInvoiceCurrency, dummyInvoiceRate, dummyInvoiceRows, dummyInvoiceFreightBase, dummyInvoiceFreightOverride, dummyInvoiceTotalOverride]);
  React.useEffect(() => {
    setSalesContractPrintEnabled(false);
    setSalesContractPrintCurrency(order.SalesContractCurrency || order.InvoiceCurrency || order.TransactionCurrency || "USD");
    setSalesContractPrintRate(1); setSalesContractPrintRows({});
    setSalesContractPrintFreightBase(null); setSalesContractPrintFreightOverride(null); setSalesContractPrintTotalOverride(null);
  }, [order.OrderID, order.SalesContractCurrency, order.InvoiceCurrency, order.TransactionCurrency, order.SalesContractFreight, order.SalesContractItems]);
  React.useEffect(() => { setPrintSaveMessage(""); }, [manualPrintFigures, printFigureOverrides, manualPrintedFreight, manualTotalAmountDue]);
  const savePrintFigures = () => {
    const numbers = [manualPrintedFreight, manualTotalAmountDue, ...Object.values(printFigureOverrides).flatMap(item => Object.values(item))].filter(value => value !== null && value !== undefined);
    if (numbers.some(value => !Number.isFinite(value) || value! < 0)) { setPrintSaveMessage("مقادیر چاپی باید اعداد غیرمنفی باشند."); return; }
    if (!onUpdateOrder) return;
    const latest = templateEditorDb?.orders.find(item => item.OrderID === order.OrderID) || order;
    onUpdateOrder({ ...latest, printFigurePresets: { ...latest.printFigurePresets, [printScopeKey]: { enabled: manualPrintFigures, items: printFigureOverrides, freight: manualPrintedFreight, totalAmountDue: manualTotalAmountDue } } });
    setPrintSaveMessage("اصلاحات چاپی ذخیره شد.");
  };
  // When manual mode is enabled, users expect the PDF to match the preview.
  // They can still opt out in the PDF picker and export original figures.
  const [useCorrectedFiguresForPdf, setUseCorrectedFiguresForPdf] = useState(true);
  const [pdfCaptureMode, setPdfCaptureMode] = useState(false);

  // تنظیمات باید پیش از انتخاب سبک خوانده شوند؛ در غیر این صورت پنجرهٔ چاپ
  // هنگام رندر با خطای ReferenceError متوقف و به صورت صفحهٔ سفید نمایش داده می‌شود.
  const templatePresentations = {
    standard_berakem: { paper: "rounded-sm shadow-md border border-slate-200", header: "flex items-start justify-between pb-4" },
    modern_corporate: { paper: "rounded-none shadow-xl border-x border-b border-slate-300 border-t-8 border-t-indigo-700", header: "flex flex-row-reverse items-start justify-between pb-5 border-b-2 border-indigo-100" },
    minimal_clean: { paper: "rounded-none shadow-none border border-slate-300", header: "flex items-center justify-between pb-6 border-b border-slate-300" },
    teal_multi_item: {paper:"rounded-none shadow-md",header:"flex items-start justify-between"},
    graphite_copper: {paper:"rounded-none shadow-sm border border-slate-200",header:"flex items-start justify-between"},
    executive_blue: { paper: "rounded-sm shadow-lg border border-slate-200 border-l-8 border-l-blue-900", header: "flex items-start justify-between pb-5 border-b-4 border-blue-900" },
  };
  // تنظیمات قدیمی/نامعتبر ذخیره‌شده هم باید به قالب امن کلاسیک برگردند.
  const selectedTemplate = docType === "COO" || !Object.prototype.hasOwnProperty.call(templatePresentations, config.templateStyle || "")
    ? "standard_berakem"
    : config.templateStyle;
  const templatePresentation = templatePresentations[selectedTemplate as keyof typeof templatePresentations];

  // State for adding a new custom extra field
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  // State for adding a new note
  const [newNoteText, setNewNoteText] = useState("");

  const agreementCurrency = order.AgreementCurrency || order.TransactionCurrency || "USD";
  const documentCurrency = order.InvoiceCurrency || order.TransactionCurrency || agreementCurrency;
  const isSalesContract = docType === "SALES_CONTRACT";
  const isDummyCommercialInvoice = docType === "COMMERCIAL_INVOICE" && dummyInvoiceEnabled && !isSplitCommercialInvoice;
  const isDummySalesContract = isSalesContract && salesContractPrintEnabled;
  // A Sales Contract is a customer-information document. Its figures are
  // intentionally isolated from the accounting/proforma currency and rates.
  const salesContractCurrency = order.SalesContractCurrency || documentCurrency;
  const outputCurrency = isDummySalesContract ? salesContractPrintCurrency : isSalesContract ? salesContractCurrency : isDummyCommercialInvoice ? dummyInvoiceCurrency : documentCurrency;
  const conversionRate = isDummySalesContract ? salesContractPrintRate : isSalesContract ? 1 : isDummyCommercialInvoice ? dummyInvoiceRate : agreementCurrency === documentCurrency
    ? 1
    : Number(order.ExchangeRateApplied || order.ExchangeRate || 1);
  const exchangePair = `${agreementCurrency}/${outputCurrency}`;

  // Determine if currency exchange is actively applied to this order.
  // A rate of one never needs a separate exchange section, even if old data
  // contains an exchange type or the template's former setting was "always".
  const isExchangeRateActive = Boolean(
    (!isSalesContract || isDummySalesContract) && conversionRate !== 1 && (
      isDummyCommercialInvoice || isDummySalesContract ||
      order.IsExchangeRateUsed ||
      (order.AgreementCurrency && order.InvoiceCurrency && order.AgreementCurrency !== order.InvoiceCurrency) ||
      Boolean(order.ExchangeRate) ||
      Boolean(order.ExchangeRateApplied) ||
      Boolean(order.TypeOfEXRate)
    )
  );

  // Should exchange rate fields be rendered?
  const shouldRenderExchange =
    (!isSalesContract || isDummySalesContract) && conversionRate !== 1 && (config.showExchangeRate === "always" || (config.showExchangeRate === "auto" && isExchangeRateActive));

  // Fallback items
  const items: OrderDetail[] = order.items && order.items.length > 0 ? order.items : [
    {
      OrderDetailID: 1,
      OrderID: order.OrderID,
      ProductID: 10001,
      ProductName: "PHENOL",
      ProductDescription: "Industrial Grade",
      HSCODE: "2907.11.00",
      Quantity: order.TotalQuantity ? getOrderQuantityMT(order) : 336.0,
      UnitPrice: order.SellPrice || 1691.25,
      NosAndKindOfPackages: "160x210 Kg Drum",
      GrossWeight: order.TotalGrossWeight ? Number(order.TotalGrossWeight) : 368000,
      ExtPrice: (order.TotalQuantity ? getOrderQuantityMT(order) : 336.0) * (order.SellPrice || 1691.25),
    } as OrderDetail,
  ];

  // در نسخهٔ چاپی، ردیف کالا باید قیمت مبدأ (X) و مبلغ بدون حمل را نشان دهد؛
  // حمل فقط یک‌بار در بخش جمع نهایی افزوده می‌شود.
  const totalItemQuantity = items.reduce((sum, item) => sum + (Number(item.Quantity) || 0), 0);
  const printSourceUnitPrice = (item: OrderDetail) => {
    if (item.BaseUnitPrice !== undefined && item.BaseUnitPrice !== null) return Number(item.BaseUnitPrice) || 0;
    const freightPerMT = totalItemQuantity > 0 ? Number(order.Freight || 0) / totalItemQuantity : 0;
    return Number(((Number(item.UnitPrice) || 0) - freightPerMT).toFixed(2));
  };
  const printInvoiceUnitPrice = (item: OrderDetail) => item.UseManualInvoicePrice
    ? Number(item.InvoiceUnitPrice ?? item.UnitEx ?? 0)
    : printSourceUnitPrice(item) * conversionRate;
  const printFigureKey = (item: OrderDetail, index: number) => String(item.OrderDetailID || index);
  const salesContractItemFor = (item: OrderDetail, index: number) =>
    order.SalesContractItems?.find((contractItem) => contractItem.orderDetailId === (item.OrderDetailID || index));
  const usePrintFigureOverrides = manualPrintFigures && (!pdfCaptureMode || useCorrectedFiguresForPdf);
  // A selected physical shipment overrides only the figures printed on its
  // packing list. It never changes the order, invoice or accounting values.
  const shipmentItemFor = (item: OrderDetail, index: number) => activePartialShipment?.items.find(
    (shipmentItem) => shipmentItem.orderDetailId === (item.OrderDetailID || index),
  );
  const printedItems = items.map((item, index) => {
    const override = printFigureOverrides[printFigureKey(item, index)] || {};
    const contractItem = salesContractItemFor(item, index);
    const shipmentItem = isSplitDocument ? shipmentItemFor(item, index) : undefined;
    return {
      item,
      index,
      quantity: isDummySalesContract
        ? salesContractPrintRows[printFigureKey(item, index)]?.quantity ?? Number(contractItem?.quantity ?? item.Quantity ?? 0)
        : isDummyCommercialInvoice
        ? dummyInvoiceRows[printFigureKey(item, index)]?.quantity ?? (Number(item.Quantity) || 0)
        : isSalesContract
        ? Number(contractItem?.quantity ?? item.Quantity ?? 0)
        : isSplitDocument ? usePrintFigureOverrides ? override.quantity ?? Number(shipmentItem?.quantity || 0) : Number(shipmentItem?.quantity || 0)
        : shipmentItem ? Number(shipmentItem.quantity || 0)
        : usePrintFigureOverrides ? override.quantity ?? (Number(item.Quantity) || 0) : (Number(item.Quantity) || 0),
      unitPrice: isDummySalesContract
        ? (salesContractPrintRows[printFigureKey(item, index)]?.unitPriceBase ?? Number(contractItem?.unitPrice ?? printInvoiceUnitPrice(item)) / (Number(order.ExchangeRateApplied || order.ExchangeRate || 1) || 1)) * conversionRate
        : isDummyCommercialInvoice
        ? (dummyInvoiceRows[printFigureKey(item, index)]?.unitPriceBase ?? printInvoiceUnitPrice(item) / (Number(order.ExchangeRateApplied || order.ExchangeRate || 1) || 1)) * conversionRate
        : isSalesContract
        ? Number(contractItem?.unitPrice ?? printInvoiceUnitPrice(item) ?? 0)
        : usePrintFigureOverrides ? override.unitPrice ?? printInvoiceUnitPrice(item) : printInvoiceUnitPrice(item),
      grossWeight: isDummySalesContract
        ? salesContractPrintRows[printFigureKey(item, index)]?.grossWeight ?? Number(item.GrossWeight || ((Number(item.Quantity) || 0) * 1000 * 1.05))
        : isDummyCommercialInvoice
        ? dummyInvoiceRows[printFigureKey(item, index)]?.grossWeight ?? Number(item.GrossWeight || ((Number(item.Quantity) || 0) * 1000 * 1.05))
        : isSplitDocument ? usePrintFigureOverrides ? override.grossWeight ?? Number(shipmentItem?.grossWeight || 0) : Number(shipmentItem?.grossWeight || 0) : shipmentItem ? Number(shipmentItem.grossWeight || 0) : usePrintFigureOverrides ? override.grossWeight ?? Number(item.GrossWeight || ((Number(item.Quantity) || 0) * 1000 * 1.05)) : Number(item.GrossWeight || ((Number(item.Quantity) || 0) * 1000 * 1.05)),
      packages: shipmentItem?.packages,
    };
  }).filter(row => !isSplitDocument || row.quantity > 0);
  const printedShippingOrder: Order = activePartialShipment && (docType === "PACKING_LIST" || isSplitCommercialInvoice)
    ? {
      ...order,
      TruckNo: activePartialShipment.truckNo || order.TruckNo,
      VesselName: activePartialShipment.vesselName || order.VesselName,
      VoyageNumber: activePartialShipment.voyageNumber || order.VoyageNumber,
      ContainerSealEntries: activePartialShipment.containerSealEntries?.length ? activePartialShipment.containerSealEntries : order.ContainerSealEntries,
    }
    : order;
  const subTotal = printedItems.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  // مبلغ توافق‌شده با مشتری، مرجع نهایی سند است. Freight ثبت‌شده در پرونده
  // تغییر نمی‌کند؛ اختلاف لازم برای تطبیق نهایی فقط در Freight چاپی جذب می‌شود.
  const shipmentFreightRatio = isSplitCommercialInvoice ? activePartialShipment!.items.reduce((sum, row) => sum + Number(row.quantity || 0), 0) / (items.reduce((sum, item) => sum + Number(item.Quantity || 0), 0) || 1) : 1;
  const basePrintedFreight = isSalesContract
    ? isDummySalesContract
      ? (salesContractPrintFreightBase ?? Number(order.SalesContractFreight ?? 0)) * conversionRate
      : Number(order.SalesContractFreight ?? 0)
    : isDummyCommercialInvoice
    ? (dummyInvoiceFreightBase ?? ((Number(order.Freight) || 0) / (Number(order.ExchangeRateApplied || order.ExchangeRate || 1) || 1))) * conversionRate
    : (Number(order.Freight) || 0) * conversionRate * shipmentFreightRatio;
  const calculatedTotal = subTotal + basePrintedFreight;
  const hasAgreedCustomerPrice = items.some(
    (item) => item.AgreedCustomerPrice !== undefined && item.AgreedCustomerPrice !== null,
  );
  const agreedCustomerTotal = printedItems.reduce(
    (sum, { item, quantity }) => sum + quantity * (item.UseManualInvoicePrice
      ? Number(item.InvoiceUnitPrice ?? item.UnitEx ?? 0)
      : (Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0) * conversionRate),
    0,
  );
  const totalAmountDue = isSplitCommercialInvoice
    ? usePrintFigureOverrides ? manualTotalAmountDue ?? subTotal + (manualPrintedFreight ?? basePrintedFreight) : hasAgreedCustomerPrice ? agreedCustomerTotal : calculatedTotal
    : isDummySalesContract
    ? salesContractPrintTotalOverride ?? subTotal + (salesContractPrintFreightOverride ?? basePrintedFreight)
    : isDummyCommercialInvoice
    ? dummyInvoiceTotalOverride ?? subTotal + (dummyInvoiceFreightOverride ?? basePrintedFreight)
    : isSalesContract
    ? subTotal + basePrintedFreight
    : usePrintFigureOverrides
    ? manualTotalAmountDue ?? subTotal + (manualPrintedFreight ?? basePrintedFreight)
    : hasAgreedCustomerPrice ? agreedCustomerTotal : calculatedTotal;
  const reconciliationDifference = Number((calculatedTotal - totalAmountDue).toFixed(2));
  const printedFreight = isDummySalesContract
    ? salesContractPrintFreightOverride ?? basePrintedFreight
    : isDummyCommercialInvoice
    ? dummyInvoiceFreightOverride ?? basePrintedFreight
    : isSalesContract
    ? basePrintedFreight
    : usePrintFigureOverrides
    ? manualPrintedFreight ?? basePrintedFreight
    : Number((basePrintedFreight - reconciliationDifference).toFixed(2));
  const enableDummyCommercialInvoice = () => {
    if (Object.keys(dummyInvoiceRows).length) { setDummyInvoiceEnabled(true); return; }
    const startingRate = Number(conversionRate) > 0 ? Number(conversionRate) : 1;
    setDummyInvoiceCurrency(outputCurrency);
    setDummyInvoiceRate(startingRate);
    setDummyInvoiceRows(Object.fromEntries(printedItems.map((row) => [printFigureKey(row.item, row.index), {
      quantity: row.quantity,
      unitPriceBase: row.unitPrice / startingRate,
      grossWeight: row.grossWeight,
    }])));
    setDummyInvoiceFreightBase(printedFreight / startingRate);
    setDummyInvoiceFreightOverride(null);
    setDummyInvoiceTotalOverride(null);
    setDummyInvoiceEnabled(true);
  };
  const enableSalesContractPrintEdits = () => {
    const startingRate = Number(conversionRate) > 0 ? Number(conversionRate) : 1;
    setSalesContractPrintCurrency(outputCurrency);
    setSalesContractPrintRate(startingRate);
    setSalesContractPrintRows(Object.fromEntries(printedItems.map((row) => [printFigureKey(row.item, row.index), {
      quantity: row.quantity, unitPriceBase: row.unitPrice / startingRate, grossWeight: row.grossWeight,
    }])));
    setSalesContractPrintFreightBase(printedFreight / startingRate);
    setSalesContractPrintFreightOverride(null); setSalesContractPrintTotalOverride(null);
    setSalesContractPrintEnabled(true);
  };
  const setSalesContractPrintTotalAndReprice = (requestedTotal: number) => {
    const targetSubTotal = Math.max(0, requestedTotal - printedFreight);
    const quantityTotal = printedItems.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
    if (quantityTotal <= 0) { setSalesContractPrintTotalOverride(requestedTotal); return; }
    const currentSubTotal = printedItems.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
    const ratio = currentSubTotal > 0 ? targetSubTotal / currentSubTotal : null;
    setSalesContractPrintRows(Object.fromEntries(printedItems.map((row) => {
      const key = printFigureKey(row.item, row.index);
      const current = salesContractPrintRows[key] || { quantity: row.quantity, unitPriceBase: row.unitPrice / (conversionRate || 1), grossWeight: row.grossWeight };
      const nextUnitPrice = ratio !== null ? row.unitPrice * ratio : targetSubTotal / quantityTotal;
      return [key, { ...current, unitPriceBase: nextUnitPrice / (conversionRate || 1) }];
    })));
    setSalesContractPrintTotalOverride(requestedTotal);
  };
  const setDummyTotalAndReprice = (requestedTotal: number) => {
    const freight = printedFreight;
    const targetSubTotal = Math.max(0, requestedTotal - freight);
    const quantityTotal = printedItems.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
    if (quantityTotal <= 0) {
      setDummyInvoiceTotalOverride(requestedTotal);
      return;
    }
    const currentSubTotal = printedItems.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
    const ratio = currentSubTotal > 0 ? targetSubTotal / currentSubTotal : null;
    setDummyInvoiceRows(Object.fromEntries(printedItems.map((row) => {
      const key = printFigureKey(row.item, row.index);
      const current = dummyInvoiceRows[key] || { quantity: row.quantity, unitPriceBase: row.unitPrice / (conversionRate || 1), grossWeight: row.grossWeight };
      const nextUnitPrice = ratio !== null
        ? row.unitPrice * ratio
        : targetSubTotal / quantityTotal;
      return [key, { ...current, unitPriceBase: nextUnitPrice / (conversionRate || 1) }];
    })));
    // Keep the exact requested total in the preview; subsequent edits to price,
    // quantity, or freight clear this override and resume live calculation.
    setDummyInvoiceTotalOverride(requestedTotal);
  };
  const applyInverseUnitPrices = (targetSubTotal: number) => {
    const currentSubTotal = printedItems.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
    if (currentSubTotal === 0) return;
    const ratio = targetSubTotal / currentSubTotal;
    setPrintFigureOverrides((current) => Object.fromEntries(printedItems.map((row) => {
      const key = printFigureKey(row.item, row.index);
      return [key, { ...current[key], unitPrice: Number((row.unitPrice * ratio).toFixed(6)) }];
    })));
  };
  const updateSalesContract = (changes: Partial<Order>) => {
    onUpdateOrder?.({ ...order, ...changes });
  };
  const updateSalesContractItem = (item: OrderDetail, index: number, changes: { quantity?: number; unitPrice?: number }) => {
    const orderDetailId = item.OrderDetailID || index;
    const existing = order.SalesContractItems || [];
    const current = existing.find((contractItem) => contractItem.orderDetailId === orderDetailId) || { orderDetailId };
    const next = [...existing.filter((contractItem) => contractItem.orderDetailId !== orderDetailId), { ...current, ...changes }];
    updateSalesContract({ SalesContractItems: next });
  };
  const savePartialShipments = (shipments: PartialShipment[]) => onUpdateOrder?.({ ...order, partialShipments: shipments, PartialShipment: "Allowed" });
  const addPartialShipment = () => {
    const sequence = partialShipments.length + 1;
    const id = crypto.randomUUID();
    const cooId = randomDigits(7);
    savePartialShipments([...partialShipments, {
      id,
      title: `Shipment ${sequence}`,
      date: packingListDateFor(order),
      packingListId: `${packingListNumberFor(order)}-${sequence}`,
      cooId,
      cooBarcodeNo: cooBarcodeFor(cooId),
      netWeight: 0,
      documents: ["PACKING_LIST"],
      items: items.map((item, index) => ({ orderDetailId: item.OrderDetailID || index, quantity: 0, grossWeight: 0, packages: currentPackingFor(item) })),
      containerSealEntries: [],
    }]);
    setActivePartialShipmentId(id);
  };
  const updatePartialShipment = (id: string, changes: Partial<PartialShipment>) =>
    savePartialShipments(partialShipments.map((shipment) => shipment.id === id ? { ...shipment, ...changes } : shipment));
  const removePartialShipment = (id: string) => {
    savePartialShipments(partialShipments.filter((shipment) => shipment.id !== id));
    if (activePartialShipmentId === id) setActivePartialShipmentId(null);
  };
  const fillShipmentWithRemaining = (id: string) => {
    const target = partialShipments.find((shipment) => shipment.id === id);
    if (!target) return;
    const otherShipments = partialShipments.filter((shipment) => shipment.id !== id);
    updatePartialShipment(id, { items: items.map((item, index) => {
      const orderDetailId = item.OrderDetailID || index;
      const allocated = otherShipments.reduce((sum, shipment) => sum + Number(shipment.items.find((entry) => entry.orderDetailId === orderDetailId)?.quantity || 0), 0);
      const allocatedWeight = otherShipments.reduce((sum, shipment) => sum + Number(shipment.items.find((entry) => entry.orderDetailId === orderDetailId)?.grossWeight || 0), 0);
      return {
        orderDetailId,
        quantity: Math.max(0, Number(item.Quantity || 0) - allocated),
        grossWeight: Math.max(0, Number(item.GrossWeight || 0) - allocatedWeight),
        netWeight: Math.max(0, Number(item.GrossWeight || 0) - allocatedWeight),
        packages: target.items.find((entry) => entry.orderDetailId === orderDetailId)?.packages || currentPackingFor(item),
      };
    }) });
  };
  const partialShipmentAllocatedQuantity = items.reduce((sum, item, index) => sum + partialShipments.reduce((shipmentSum, shipment) => shipmentSum + Number(shipment.items.find((entry) => entry.orderDetailId === (item.OrderDetailID || index))?.quantity || 0), 0), 0);
  const partialShipmentAllocatedWeight = items.reduce((sum, item, index) => sum + partialShipments.reduce((shipmentSum, shipment) => shipmentSum + Number(shipment.items.find((entry) => entry.orderDetailId === (item.OrderDetailID || index))?.grossWeight || 0), 0), 0);
  const currencySymbol: Record<string, string> = { USD: "$", EUR: "€", AED: "AED", TRY: "₺", CAD: "C$", CNY: "¥", IRR: "﷼" };
  const documentCurrencySymbol = currencySymbol[outputCurrency] || outputCurrency;
  // Kept aligned with the Access reports: INV-Draft and PL-Draft2.
  const isPackingList = docType === "PACKING_LIST";
  const isCommercialInvoice = docType === "COMMERCIAL_INVOICE";
  const showInvoiceAmounts = !isPackingList;
  const showPackingGrossWeight = isPackingList || config.showGrossWeight;
  const showPackingDetails = isPackingList || config.showPackingColumn;
  const printedGrossWeightTotal = printedItems.reduce((sum, row) => sum + row.grossWeight, 0);
  const printedDocumentNumber = isSalesContract
    ? order.SalesContractID || `${order.ProformaInvoiceID}-SC`
    : docType === "COMMERCIAL_INVOICE"
    ? isSplitCommercialInvoice ? splitInvoiceNumber : commercialInvoiceNumberFor(order)
    : docType === "PACKING_LIST"
    ? activePartialShipment?.packingListId || packingListNumberFor(order)
    : docType === "COO"
    ? activeCooId || order.ProformaInvoiceID
    : order.ProformaInvoiceID;
  const printedDocumentDate = isSalesContract
    ? order.SalesContractDate || order.PIDate
    : docType === "COO"
    ? order.COODate || commercialDocumentDateFor(order)
    : docType === "COMMERCIAL_INVOICE"
    ? activePartialShipment?.date || commercialDocumentDateFor(order)
    : docType === "PACKING_LIST"
    ? activePartialShipment?.date || packingListDateFor(order)
    : order.PIDate;
  const printedIssueDate = docType === "COMMERCIAL_INVOICE"
    ? activePartialShipment?.date || commercialIssueDateFor(order)
    : docType === "PACKING_LIST"
    ? activePartialShipment?.date || packingListIssueDateFor(order)
    : printedDocumentDate;
  // نام فایل PDF در پنجرهٔ چاپ از عنوان صفحه گرفته می‌شود.
  // طبق نام‌گذاری تأییدشده، Commercial Invoice نیز با اختصار PL صادر می‌شود.
  const documentAbbreviation: Record<typeof docType, string> = {
    PI: "PI",
    COMMERCIAL_INVOICE: "PL",
    PACKING_LIST: "PL",
    COO: "COO",
    COA: "COA",
    BL: "BL",
    SALES_CONTRACT: "SC",
  };
  const documentReference = docType === "COA"
    ? order.COANumber || order.ProformaInvoiceID
    : docType === "BL"
    ? order.BLNo || order.ProformaInvoiceID
    : printedDocumentNumber || order.ProformaInvoiceID;
  const printFileName = `${documentAbbreviation[docType]}_${documentReference}`.replace(/[\\/:*?"<>|]/g, "-");
  const bundlePrintFileName = `SDoc-${order.ProformaInvoiceID || "PI"}`.replace(/[\\/:*?"<>|]/g, "-");
  const documentStamp = docType === "COMMERCIAL_INVOICE"
    ? order.CommercialInvoiceStamp
    : docType === "PACKING_LIST"
    ? order.PackingListStamp
    : "";

  // Calculate validity date string (e.g. 180 days after PI Date)
  const calculateValidity = () => {
    try {
      const baseDate = order.PIDate ? new Date(order.PIDate) : new Date();
      const days = order.PI_Valid_Days || 180;
      const valDate = new Date(baseDate);
      valDate.setDate(valDate.getDate() + days);
      return valDate.toISOString().slice(0, 10);
    } catch {
      return "2027-02-10";
    }
  };

  const renderPdfAttachmentForPrint = async (file: CommercialDocumentFile) => {
    const cacheKey = `print-144dpi-v1:${file.id}:${file.data.length}:${file.data.slice(-48)}`;
    const cached = printPdfPageCache.current.get(cacheKey);
    if (cached) return cached;
    const running = printPdfRenderJobs.current.get(cacheKey);
    if (running) return running;
    const job = (async () => {
      const pdfBytes = await fetch(file.data).then((response) => response.arrayBuffer());
      const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(pdfBytes) }).promise;
      const rendered: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        // PDF points are 72dpi, so scale 2 renders attachments at 144dpi: a
        // visibly sharper print result while remaining practical in browsers.
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: context, viewport, background: "#fff" }).promise;
        // toBlob encodes asynchronously. The former toDataURL call blocked the
        // browser main thread and duplicated every image as a huge Base64 string.
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PDF page encoding failed")), "image/jpeg", 0.96));
        const objectUrl = URL.createObjectURL(blob);
        printBlobUrls.current.add(objectUrl);
        rendered.push(objectUrl);
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      await (pdf as any).destroy?.();
      printPdfPageCache.current.set(cacheKey, rendered);
      return rendered;
    })().finally(() => printPdfRenderJobs.current.delete(cacheKey));
    printPdfRenderJobs.current.set(cacheKey, job);
    return job;
  };

  // The COA preview is rendered by PDF.js on a canvas. For a framed COA PDF,
  // send the same rendered page pixels to Chromium instead of rebuilding a
  // look-alike with PDF-lib's limited built-in fonts. This preserves the
  // uploaded document's typography exactly, including Turkish characters.
  const renderPdfAttachmentDataUrls = async (file: CommercialDocumentFile) => {
    const pdfBytes = await fetch(file.data).then((response) => response.arrayBuffer());
    const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(pdfBytes) }).promise;
    const rendered: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.25 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, background: "#fff" }).promise;
      rendered.push(canvas.toDataURL("image/png"));
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    await (pdf as any).destroy?.();
    return rendered;
  };

  useEffect(() => () => {
    printBlobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    printBlobUrls.current.clear();
  }, []);

  const handleOutputDocuments = async (currentDocumentOnly = false, output: "paper" | "pdf" = "pdf") => {
    const exportDocs: Record<string, boolean> = currentDocumentOnly ? { [docType]: true } : selectedBundleDocs;
    const currentDocumentName = { PI: "Proforma Invoice", SALES_CONTRACT: "Sales Contract", COMMERCIAL_INVOICE: "Commercial Invoice", PACKING_LIST: "Packing List", COO: "Certificate of Origin", COA: "Certificate of Analysis", BL: "Bill of Lading" }[docType];
    const exportFileName = currentDocumentOnly ? `${order.ProformaInvoiceID || "PI"}-${currentDocumentName}`.replace(/[\\/:*?"<>|]/g, "-") : bundlePrintFileName;
    if (!canPrint || printAllProgress) return;
    setPrintAllProgress(output === "paper" ? "در حال آماده‌سازی چاپ مستقیم…" : "در حال ساخت PDF نهایی…");
    const originalType = docType;
    const originalPartialShipmentId = activePartialShipmentId;
    const originalCorrectedFigures = useCorrectedFiguresForPdf;
    // The PDF follows the manual-preview figures by default. The optional
    // picker switch lets the user deliberately export the original figures.
    flushSync(() => { setPdfCaptureMode(true); if (currentDocumentOnly) setUseCorrectedFiguresForPdf(true); });
    // Read the exact stylesheet used by the working on-screen preview and send
    // its contents, never a deployment-sensitive <link>, to the PDF service.
    if (!printCssCache.current) {
      const activeCssParts = await Promise.all(Array.from(document.styleSheets).map(async (sheet) => {
        try {
          const rules = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
          if (rules.trim()) return rules;
        } catch { /* Fetch the same-origin stylesheet below. */ }
        if (!sheet.href) return "";
        try {
          const response = await fetch(sheet.href, { cache: "force-cache" });
          if (!response.ok) return "";
          const css = await response.text();
          return response.headers.get("content-type")?.includes("text/css") ? css : "";
        } catch { return ""; }
      }));
      printCssCache.current = activeCssParts.join("\n");
    }
    const activeCss = printCssCache.current;
    if (!activeCss.includes(".grid") || !activeCss.includes(".flex")) {
      setPrintAllProgress(null);
      setPdfCaptureMode(false);
      setUseCorrectedFiguresForPdf(originalCorrectedFigures);
      alert("استایل چاپ بارگذاری نشده است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.");
      return;
    }
    const styles = `<style>${activeCss.replace(/<\/style/gi, "<\\/style")}</style>`;
    // HTML passed to the PDF service is an isolated browser document. Its font
    // requests are cross-origin, so send the COO font with the document itself.
    const embeddedFont = await fetch("/fonts/BebasNeue-Regular.ttf")
      .then(async (response) => {
        if (!response.ok) throw new Error("COO font is unavailable");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        return `data:font/ttf;base64,${btoa(binary)}`;
      })
      .catch(() => "");
    const clonePrintablePageForPdf = (source: HTMLElement) => {
      const clone = source.cloneNode(true) as HTMLElement;
      // COO fields use pixel typography over a percentage-based A4 image.
      // The preview can be wider than an A4 PDF canvas, so preserve the live
      // visual proportion by scaling only the pixel-based overlay typography.
      const liveTemplate = source.querySelector<HTMLElement>(".coo-visual-template");
      const pdfTemplate = clone.querySelector<HTMLElement>(".coo-visual-template");
      if (liveTemplate && pdfTemplate) {
        const liveWidth = liveTemplate.getBoundingClientRect().width;
        const pdfWidthAtCssDpi = (204 / 25.4) * 96;
        const scale = liveWidth > 0 ? pdfWidthAtCssDpi / liveWidth : 1;
        if (scale > 0 && Math.abs(scale - 1) > 0.01) {
          pdfTemplate.querySelectorAll<HTMLElement>("[style]").forEach((field) => {
            if (field.style.fontFamily.includes("Bebas Neue")) field.style.fontFamily = "Arca PDF Bebas";
            const size = Number.parseFloat(field.style.fontSize || "");
            if (Number.isFinite(size)) field.style.fontSize = `${size * scale}px`;
            const top = Number.parseFloat(field.style.paddingTop || "");
            if (Number.isFinite(top)) field.style.paddingTop = `${top * scale}pt`;
            const left = Number.parseFloat(field.style.paddingLeft || "");
            if (Number.isFinite(left)) field.style.paddingLeft = `${left * scale}pt`;
          });
        }
      }
      return clone.outerHTML;
    };
    // The PDF renderer runs in a separate Chromium page. Declare the exact
    // local fonts here as well, rather than relying on a stylesheet's loading
    // order, so a visual COO keeps the same typography as its live preview.
    const pageStyle = `<style>${embeddedFont ? `@font-face{font-family:"Arca PDF Bebas";src:url("${embeddedFont}") format("truetype");font-style:normal;font-weight:400 700}` : ""}@font-face{font-family:"Public Sans";src:url("/fonts/public-sans/PublicSans-Regular.woff2") format("woff2");font-style:normal;font-weight:400;font-display:block}@font-face{font-family:"Public Sans";src:url("/fonts/public-sans/PublicSans-SemiBold.woff2") format("woff2");font-style:normal;font-weight:600;font-display:block}@font-face{font-family:"Public Sans";src:url("/fonts/public-sans/PublicSans-Bold.woff2") format("woff2");font-style:normal;font-weight:700;font-display:block}@font-face{font-family:"Bebas Neue";src:url("/fonts/BebasNeue-Regular.ttf") format("truetype");font-style:normal;font-weight:400;font-display:block}@font-face{font-family:"Bebas Neue";src:url("/fonts/BebasNeue-Regular.ttf") format("truetype");font-style:normal;font-weight:700;font-display:block}@page{size:A4;margin:0}.bundle-document{font-family:"Public Sans",Arial,sans-serif;font-variant-numeric:tabular-nums;position:relative!important;box-sizing:border-box;width:210mm;height:297mm;margin:0;padding:3mm;overflow:hidden;background:#fff;break-after:page!important;page-break-after:always!important}.bundle-document:last-child{break-after:auto!important;page-break-after:auto!important}.bundle-document>div{box-sizing:border-box;width:204mm!important;height:291mm!important;min-height:291mm!important;max-height:291mm!important;margin:0!important;padding:0!important;transform:none!important;border:0!important;outline:0!important;box-shadow:none!important}.bundle-document .printable-document{position:static!important;inset:auto!important;display:block!important;box-sizing:border-box!important;width:204mm!important;height:291mm!important;min-height:291mm!important;max-height:291mm!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important}.bundle-document .printable-document>div{box-sizing:border-box!important;width:204mm!important;max-width:204mm!important;margin:0!important}.coa-bundle-page,.coa-bundle-page *,.coa-document-page,.coa-document-page *{font-family:Arial,sans-serif!important}</style>`;
    const appendGeneratedHtmlPages = () => {
      if (!generatedDocumentPages.length) return;
      segments.push({ kind: "html", styles: `${styles}${pageStyle}`, html: generatedDocumentPages.join("") });
      generatedDocumentPages.length = 0;
    };
    const issuedDocumentsLogo = config.issuedDocumentsLogo || "/arcatav-logo.png";
    const escapeCoaValue = (value: unknown) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
    const framedCoaStyle = `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.coa-source-sheet{box-sizing:border-box;width:210mm;height:297mm;padding:7mm;background:#fff;font-family:"Public Sans",Arial,sans-serif;color:#10213e;break-after:page;page-break-after:always}.coa-source-sheet:last-child{break-after:auto;page-break-after:auto}.coa-source-frame{box-sizing:border-box;width:196mm;height:283mm;display:flex;flex-direction:column}.coa-source-header{box-sizing:border-box;height:22mm;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #0f172a;padding:2mm 3mm 3mm}.coa-source-logo{display:block;height:14mm;max-width:52mm;object-fit:contain;object-position:left top}.coa-source-title{text-align:right;font-size:12px;line-height:1.35}.coa-source-title b{display:block;font-size:16px}.coa-source-content{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}.coa-source-content img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain}.coa-source-footer{box-sizing:border-box;min-height:16mm;margin-top:auto;border-top:1px solid #94a3b8;padding:2mm 3mm;text-align:center;font-size:8px;line-height:1.35}.coa-source-footer b{display:block;font-size:8px}</style>`;
    const framedCoaPage = (image: string, pageNumber: number, pageCount: number) => `<section class="coa-source-sheet"><div class="coa-source-frame"><header class="coa-source-header"><div>${supplier?.LogoT ? `<img class="coa-source-logo" src="${supplier.LogoT}" alt="${escapeCoaValue(supplier.SupplierName)}">` : `<b>${escapeCoaValue(supplier?.SupplierName || order.SupplierName)}</b>`}</div><div class="coa-source-title"><b>CERTIFICATE OF ANALYSIS</b><div>No: ${escapeCoaValue(order.COANumber || order.ProformaInvoiceID)}</div><div>Date: ${escapeCoaValue(order.COADate || order.PIDate)}</div></div></header><main class="coa-source-content"><img src="${image}" alt="COA ${pageNumber}"></main><footer class="coa-source-footer"><b>${escapeCoaValue(supplier?.SupplierName || order.SupplierName)}</b><div>${escapeCoaValue([supplier?.Address, supplier?.Tel && `Tel: ${supplier.Tel}`, supplier?.Email && `Email: ${supplier.Email}`].filter(Boolean).join(" | "))}</div><div>Page ${pageNumber} of ${pageCount}</div></footer></div></section>`;
    const cover = `<section class="bundle-cover" style="box-sizing:border-box;width:210mm;height:297mm;padding:26mm 30mm 20mm;font-family:'Public Sans',Arial,sans-serif;color:#0f172a;background:linear-gradient(145deg,#ffffff 0%,#f8fafc 56%,#eef2ff 100%);page-break-after:always"><div style="width:76mm;height:29mm;display:flex;align-items:center;justify-content:flex-start"><img src="${issuedDocumentsLogo}" alt="ARCATAV" style="display:block;max-width:76mm;max-height:29mm;object-fit:contain;object-position:left center"></div><div style="margin-top:35mm;font-size:27px;font-weight:800;letter-spacing:1px">COMMERCIAL DOCUMENTS</div><div style="width:45mm;height:4px;background:linear-gradient(90deg,#0ea5e9,#ec4899);margin:8mm 0 6mm"></div><p style="color:#475569;font-size:12px">Official document package</p><dl style="display:grid;grid-template-columns:45mm 1fr;gap:5mm 8mm;margin-top:14mm;font-size:13px"><dt style="color:#64748b">Buyer</dt><dd>${customer?.CustomerName || order.CustomerName || "-"}</dd><dt style="color:#64748b">File / PI Reference</dt><dd>${order.ProformaInvoiceID}</dd><dt style="color:#64748b">Supplier / Exporter</dt><dd>${supplier?.SupplierName || order.SupplierName || "-"}</dd><dt style="color:#64748b">Country of Origin</dt><dd>${order.CountryOfOrigin || "-"}</dd><dt style="color:#64748b">Destination</dt><dd>${order.CountryOfDestination || "-"}</dd><dt style="color:#64748b">Date</dt><dd>${order.PIDate || "-"}</dd></dl><div style="margin-top:12mm;padding-top:5mm;border-top:1px solid #cbd5e1"><b style="font-size:12px">Included documents</b><ol style="margin:3mm 0 0;padding-left:5mm;color:#334155;font-size:12px;line-height:1.8">${bundleCoverDocumentList}</ol></div></section>`;
    const segments: Array<Record<string, unknown>> = [];
    const generatedDocumentPages: string[] = [];
    const savedCover = documentTemplates.find(template => template.documentType === "COVER" && template.isActive && !template.isBuiltIn && template.theme === (config.templateStyle || "standard_berakem") && belongsToOrderIssuer(template));
    const coverHtml = savedCover ? `<section class="bundle-cover" style="position:relative;box-sizing:border-box;width:210mm;height:297mm;aspect-ratio:210/297;background:${escapeCoaValue(savedCover.backgroundColor || "#fff")}">${savedCover.imageData ? `<img src="${escapeCoaValue(savedCover.imageData)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill">` : ""}${(savedCover.fields || []).map(field => `<div style="position:absolute;box-sizing:border-box;white-space:pre-wrap;left:${field.x}%;top:${field.y}%;width:${field.width}%;height:${field.height || 5}%;font-family:${escapeCoaValue(field.fontFamily)};font-size:${field.fontSize}px;font-weight:${field.bold ? 700 : 400};text-align:${field.align || "left"};color:${escapeCoaValue(field.color || "#111827")};background:${escapeCoaValue(field.backgroundColor || "transparent")};border:${field.borderWidth || 0}px solid ${escapeCoaValue(field.borderColor || "transparent")};transform:rotate(${field.rotation || 0}deg);z-index:${field.zIndex || 0}">${escapeCoaValue(resolveTemplateField(field.source, field.customValue))}</div>`).join("")}</section>` : cover;
    if (exportDocs.COVER) segments.push({ kind: "html", html: coverHtml, styles: pageStyle });
    try {
      if (exportDocs.BL) {
        for (const file of order.blFiles || []) {
          if (file.mimeType === "application/pdf") segments.push({ kind: "pdf", data: file.data });
          else if (file.mimeType.startsWith("image/")) segments.push({ kind: "html", styles: includeCoaHeaderFooter ? framedCoaStyle : pageStyle, html: includeCoaHeaderFooter ? framedCoaPage(file.data, 1, 1) : `<section class="bundle-document"><img src="${file.data}" style="display:block;width:204mm;height:291mm;object-fit:contain"></section>` });
        }
      }
      for (const type of ["PI", "SALES_CONTRACT", "COMMERCIAL_INVOICE", "PACKING_LIST", "COO"] as Array<typeof docType>) {
        if (!exportDocs[type]) continue;
        const stages = currentDocumentOnly
          ? activePartialShipment ? [activePartialShipment] : []
          : (["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"].includes(type))
          ? partialShipments.filter((shipment) => shipment.documents.includes(type as PartialShipmentDocumentType))
          : [];
        for (const shipment of stages.length ? stages : [null]) {
          // PDF previews use canvas elements, and cloneNode does not copy the
          // rendered canvas pixels. Add uploaded COO pages as actual image
          // pages to the bundle instead of cloning their preview canvas.
          const uploadedCooFiles = type === "COO"
            ? (shipment ? shipment.cooFiles || [] : order.cooFiles || [])
            : [];
          if (uploadedCooFiles.length) {
            setPrintAllProgress(`در حال آماده‌سازی COO${shipment ? ` — ${shipment.title}` : ""}…`);
            for (const file of uploadedCooFiles) {
              if (file.mimeType === "application/pdf") {
                // Preserve the uploaded certificate as a PDF segment. Never
                // route its preview canvas through cloneNode, which drops the
                // actual page pixels and produces a blank sheet.
                appendGeneratedHtmlPages();
                segments.push({ kind: "pdf", data: file.data });
              } else if (file.mimeType.startsWith("image/")) {
                generatedDocumentPages.push(`<section class="bundle-document"><img src="${file.data}" alt="COO" style="display:block;width:200mm;height:287mm;object-fit:contain;margin:auto"></section>`);
              }
            }
            continue;
          }
          setPrintAllProgress(`در حال آماده‌سازی ${documentAbbreviation[type]}${shipment ? ` — ${shipment.title}` : ""}…`);
          flushSync(() => { setDocType(type); setActivePartialShipmentId(shipment?.id || null); });
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const source = document.querySelector(".printable-document");
          if (source) generatedDocumentPages.push(`<section class="bundle-document">${clonePrintablePageForPdf(source as HTMLElement)}</section>`);
        }
      }
      // Render all generated documents in one Chromium pass. Previously each
      // page reloaded the full stylesheet, fonts and images independently.
      appendGeneratedHtmlPages();
      if (exportDocs.COA) {
        for (const file of printedCoaFiles.filter((file) => !file.excludeFromPrint)) {
          if (file.mimeType === "application/pdf") {
            if (!includeCoaHeaderFooter) {
              // Keep the original pages byte-for-byte when framing is off.
              segments.push({ kind: "pdf", data: file.data });
            } else {
              // Render through the same PDF.js canvas used by the preview,
              // then use Chromium for the matching header/footer layout.
              const renderedPages = await renderPdfAttachmentDataUrls(file);
              renderedPages.forEach((image, index) => segments.push({ kind: "html", styles: framedCoaStyle, html: framedCoaPage(image, index + 1, renderedPages.length) }));
            }
          }
          else if (file.mimeType.startsWith("image/")) segments.push({ kind: "html", styles: includeCoaHeaderFooter ? framedCoaStyle : pageStyle, html: includeCoaHeaderFooter ? framedCoaPage(file.data, 1, 1) : `<section class="bundle-document"><img src="${file.data}" style="display:block;width:204mm;height:291mm;object-fit:contain"></section>` });
          else if (file.editableHtml?.trim()) segments.push({
            kind: "html",
            // Edited extraction is self-contained. Do not mix it with the
            // application stylesheet, which can hide this plain HTML page
            // during Chromium's merged-PDF rendering.
            styles: `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.coa-document-page{position:relative;box-sizing:border-box;width:210mm;min-height:297mm;padding:14mm;color:#10213e;background:#fff;font-family:Arial,sans-serif}.coa-issued-header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #10213e;padding-bottom:7mm;margin-bottom:8mm}.coa-issued-logo{max-width:72mm;height:22mm;object-fit:contain;object-position:left top}.coa-issued-title{text-align:right;font-size:12px;line-height:1.6}.coa-issued-title b{display:block;font-size:19px}.coa-document-page table{width:100%;border-collapse:collapse}.coa-document-page th,.coa-document-page td{border:1px solid #64748b;padding:7px;text-align:left}.coa-document-page>div>h1{display:none}.coa-issued-footer{position:absolute;bottom:12mm;left:14mm;right:14mm;border-top:1px solid #94a3b8;padding-top:3mm;text-align:center;font-size:9px;color:#475569}</style>`,
            html: `<section class="coa-document-page">${includeCoaHeaderFooter ? `<header class="coa-issued-header"><div>${supplier?.LogoT ? `<img class="coa-issued-logo" src="${supplier.LogoT}" alt="${supplier.SupplierName || "Supplier"}">` : `<b>${supplier?.SupplierName || order.SupplierName || ""}</b>`}</div><div class="coa-issued-title"><b>CERTIFICATE OF ANALYSIS</b><span>No: ${order.COANumber || order.ProformaInvoiceID}</span><br><span>Date: ${order.COADate || order.PIDate}</span></div></header>` : ""}${file.editableHtml}${includeCoaHeaderFooter ? `<footer class="coa-issued-footer"><b>${supplier?.SupplierName || order.SupplierName || ""}</b><br>${[supplier?.Address, supplier?.Tel && `Tel: ${supplier.Tel}`, supplier?.Email && `Email: ${supplier.Email}`].filter(Boolean).join(" | ")}</footer>` : ""}</section>`,
          });
        }
      }
      flushSync(() => { setDocType(originalType); setActivePartialShipmentId(originalPartialShipmentId); setPdfCaptureMode(false); setUseCorrectedFiguresForPdf(originalCorrectedFigures); });
      if (!segments.length) throw new Error("حداقل یک مدرک را انتخاب کنید.");
      if (output === "paper") {
        const printable: string[] = [];
        const printStyles = new Set<string>();
        for (const [index, segment] of segments.entries()) {
          if (segment.kind === "html") {
            printStyles.add(String(segment.styles || ""));
            printable.push(String(segment.html || ""));
          } else if (segment.kind === "pdf") {
            // Existing BL/COA uploads may already be PDFs. Render their pages
            // locally for paper; never generate a new merged PDF.
            const images = await renderPdfAttachmentForPrint({ id: `direct-${index}`, data: String(segment.data), mimeType: "application/pdf", name: "Attachment" } as CommercialDocumentFile);
            printable.push(...images.map(image => `<section class="bundle-document"><img src="${image}" style="display:block;width:200mm;height:287mm;object-fit:contain"/></section>`));
          }
        }
        setPrintAllProgress("در حال بازکردن پنجرهٔ چاپ…");
        await directPaperPrint({ html: printable.join(""), styles: [...printStyles].join(""), title: exportFileName });
        if (initialShowDocumentPicker) onClose(); else setShowDocumentPicker(false);
        setPrintAllProgress(null);
        return;
      }
      setPrintAllProgress("در حال ادغام صفحات PDF…");
      const selectedPrintFileName = exportFileName;
      const response = await fetch("/api/print/merged-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: selectedPrintFileName, segments }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "PDF generation failed");
      setPrintAllProgress("در حال آماده‌سازی دانلود…");
      const blobUrl = URL.createObjectURL(await response.blob());
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = `${selectedPrintFileName}.pdf`;
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      if (initialShowDocumentPicker) onClose(); else setShowDocumentPicker(false);
      setPrintAllProgress(null);
      // Keep the object URL alive briefly so browsers configured to ask for a
      // download location can finish copying it without another PDF render.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (error) {
      flushSync(() => { setDocType(originalType); setActivePartialShipmentId(originalPartialShipmentId); setPdfCaptureMode(false); setUseCorrectedFiguresForPdf(originalCorrectedFigures); });
      setPrintAllProgress(null);
      alert(error instanceof Error ? error.message : "ساخت PDF نهایی ناموفق بود.");
    }
  };

  const handleSaveDefaultTemplate = () => {
    const invalidText = Object.values(config.textSizes || {}).some(value => value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 4 || value > 30));
    const invalidArtwork = [[config.logoSize, 30, 140], [config.signatureSize, 60, 300], [config.stampSize, 60, 300]].some(([value, min, max]) => value !== undefined && (!Number.isFinite(value) || value < min! || value > max!));
    if (invalidText || invalidArtwork) { alert("اندازه متن باید بین ۴ تا ۳۰، لوگو بین ۳۰ تا ۱۴۰ و مهر و امضا بین ۶۰ تا ۳۰۰ باشد."); return; }
    if (onSaveTemplateConfig) {
      onSaveTemplateConfig(config);
      setSavedSuccessMsg(true);
      setTimeout(() => setSavedSuccessMsg(false), 3000);
    }
  };

  const handleResetToDefault = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const handleAddCustomExtraField = () => {
    if (!newFieldLabel.trim()) return;
    const newField = {
      id: "cf_" + Date.now(),
      label: newFieldLabel.trim(),
      value: newFieldValue.trim(),
    };
    setConfig({
      ...config,
      customExtraFields: [...(config.customExtraFields || []), newField],
    });
    setNewFieldLabel("");
    setNewFieldValue("");
  };

  const handleRemoveCustomExtraField = (index: number) => {
    const updated = [...(config.customExtraFields || [])];
    updated.splice(index, 1);
    setConfig({ ...config, customExtraFields: updated });
  };

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    setConfig({
      ...config,
      customNotes: [...(config.customNotes || []), newNoteText.trim()],
    });
    setNewNoteText("");
  };

  const handleRemoveNote = (idx: number) => {
    const updated = [...(config.customNotes || [])];
    updated.splice(idx, 1);
    setConfig({ ...config, customNotes: updated, termOverrides: remapNoteStyles(updated) });
  };

  // Pre-configured clause presets
  const applyPresetClause = (type: string) => {
    const preset = PROFORMA_TERM_PRESETS.find(item => item.id === type);
    let text: string = preset?.text || "";
    if (!text) switch (type) {
      case "lc":
        text = "- Payment by 100% Irrevocable, Confirmed L/C at sight through prime international bank.";
        break;
      case "customs":
        text = "- All customs duties, taxes, and clearance expenses at the destination port shall be borne entirely by the Buyer.";
        break;
      case "inspection":
        text = "- Quality & Quantity inspection by SGS or mutually agreed international surveyor at loading port at Seller's cost.";
        break;
      case "tolerance":
        text = "- Quantity tolerance of +/- 5% in volume and value is acceptable at Seller's option.";
        break;
      case "validity":
        text = "* Proforma Invoice is null and void after the validity expiration date.";
        break;
    }
    if (text && !config.customNotes?.includes(text)) {
      setConfig({
        ...config,
        customNotes: [...(config.customNotes || []).filter(note => !preset?.aliases.some(alias => alias === note)), text],
        termOverrides: remapNoteStyles([...(config.customNotes || []).filter(note => !preset?.aliases.some(alias => alias === note)), text]),
      });
    }
  };

  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const selectedKey = selectedNote === null ? "" : `note:${selectedNote}`;
  const selectedStyle = config.termOverrides?.[selectedKey] || {};
  const selectPreviewNote = (index: number) => {
    setSelectedNote(index);
    requestAnimationFrame(() => document.querySelector(`[data-print-term="note:${index}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const addPreviewPreset = (id: string) => {
    const preset = PROFORMA_TERM_PRESETS.find(item => item.id === id);
    if (!preset) return;
    const existing = (config.customNotes || []).indexOf(preset.text);
    const notes = [...(config.customNotes || []).filter(note => !preset.aliases.some(alias => alias === note)), preset.text];
    applyPresetClause(id);
    selectPreviewNote(existing >= 0 ? existing : notes.length - 1);
  };
  const advancedSettings = <div className="max-h-[80vh] overflow-y-auto overscroll-contain rounded-xl" dir="rtl">          <div className="bg-slate-950 text-slate-200 rounded-xl border border-slate-700 p-4 space-y-3">
            <div className="flex flex-col gap-3 border-b border-slate-700 pb-3 mb-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-400" />
                  تنظیمات پروفورما
                </span>


              </div>

              <div className="flex flex-wrap items-center gap-2">

                {savedSuccessMsg && (
                  <span className="text-emerald-400 text-xs flex items-center gap-1 font-bold">
                    <Check size={14} /> تنظیمات قالب ذخیره شد
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
                  title="بازنشانی به فرمت پیش‌فرض نمونه"
                >
                  <RotateCcw size={12} /> بازنشانی به نمونه
                </button>
                {onSaveTemplateConfig && (
                  <button
                    type="button"
                    onClick={handleSaveDefaultTemplate}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Save size={13} /> ذخیره به عنوان قالب پیش‌فرض
                  </button>
                )}
              </div>
            </div>

            {/* Tab 1: Smart Fields & Exchange Rate */}
            {onSaveTemplateConfig && (<details className="rounded-xl border border-slate-700 bg-slate-900"><summary className="cursor-pointer p-3 font-bold text-slate-100">فیلدهای اصلی و تسعیر ارز</summary><div className="border-t border-slate-700 p-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Exchange Rate Rule (Crucial User Requirement) */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-indigo-500/30 space-y-2">
                  <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <DollarSign size={14} />
                    <span>فیلدهای تسعیر ارز (Exchange Rate)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    کنترل نمایش ردیف نرخ تسعیر و نوع تسعیر در جدول مشخصات:
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="ex-rate-rule"
                        checked={config.showExchangeRate === "auto"}
                        onChange={() => setConfig({ ...config, showExchangeRate: "auto" })}
                        className="text-indigo-500"
                      />
                      <span>خودکار (فقط در صورت تسعیر ارز)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="ex-rate-rule"
                        checked={config.showExchangeRate === "always"}
                        onChange={() => setConfig({ ...config, showExchangeRate: "always" })}
                        className="text-indigo-500"
                      />
                      <span>همیشه نمایش داده شود</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="ex-rate-rule"
                        checked={config.showExchangeRate === "never"}
                        onChange={() => setConfig({ ...config, showExchangeRate: "never" })}
                        className="text-indigo-500"
                      />
                      <span>همیشه مخفی باشد</span>
                    </label>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-1">
                    وضعیت فعلی سفارش: {isExchangeRateActive ? "🟢 تسعیر ارز دارد" : "⚪ بدون تسعیر"}
                  </div>
                </div>

                {/* Header & Shipment Toggles */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700 space-y-2">
                  <div className="font-bold text-slate-200">فیلدهای مشخصات بازرگانی</div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showCommercialId}
                        onChange={(e) => setConfig({ ...config, showCommercialId: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نمایش Commercial ID</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showCountryBeneficiary}
                        onChange={(e) => setConfig({ ...config, showCountryBeneficiary: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نمایش Country Of Beneficiary</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showTotalCube}
                        onChange={(e) => setConfig({ ...config, showTotalCube: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نمایش Total Cube (CBM)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showGrossWeight}
                        onChange={(e) => setConfig({ ...config, showGrossWeight: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نمایش Gross Weight در سربرگ</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showPartialShipment}
                        onChange={(e) => setConfig({ ...config, showPartialShipment: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نمایش Partial Shipment</span>
                    </label>
                  </div>
                </div>

                {/* Consignee & Details */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700 space-y-2">
                  <div className="font-bold text-slate-200">بخش Consignee (گیرنده کالا)</div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={config.showConsignee}
                      onChange={(e) => setConfig({ ...config, showConsignee: e.target.checked })}
                      className="rounded text-indigo-500"
                    />
                    <span>نمایش کادر Consignee</span>
                  </label>
                  {config.showConsignee && (
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">متن پیش‌فرض Consignee:</label>
                      <input
                        type="text"
                        value={config.consigneeText || ""}
                        onChange={(e) => setConfig({ ...config, consigneeText: e.target.value })}
                        className="w-full p-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-white"
                        placeholder="The Same As Buyer"
                      />
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showHsCode}
                        onChange={(e) => setConfig({ ...config, showHsCode: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>ستون کد تعرفه (HS Code)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showPackingColumn}
                        onChange={(e) => setConfig({ ...config, showPackingColumn: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>ستون نوع و تعداد بسته‌بندی</span>
                    </label>
                  </div>
                </div>

                {/* Footer & Financial Toggles */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-700 space-y-2">
                  <div className="font-bold text-slate-200">فوتر و اطلاعات مالی</div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showBankDetails}
                        onChange={(e) => setConfig({ ...config, showBankDetails: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>اطلاعات بانکی (BANK DETAILS)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showSignatory}
                        onChange={(e) => setConfig({ ...config, showSignatory: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>نام و تاریخ امضاکننده مجاز</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showStampSignature}
                        onChange={(e) => setConfig({ ...config, showStampSignature: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>مهر و امضای رسمی شرکت</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showFreightRow}
                        onChange={(e) => setConfig({ ...config, showFreightRow: e.target.checked })}
                        className="rounded text-indigo-500"
                      />
                      <span>سطر Freight در جمع فاکتور</span>
                    </label>
                  </div>
                </div>
              </div></div></details>)}

            {/* Tab 2: Custom Extra Fields */}
            {onSaveTemplateConfig && (<details className="rounded-xl border border-slate-700 bg-slate-900"><summary className="cursor-pointer p-3 font-bold text-slate-100">فیلدهای دلخواه</summary><div className="border-t border-slate-700 p-3">
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-900/90 rounded-xl border border-slate-700">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[11px] text-slate-400 mb-1">عنوان فیلد (Field Label En):</label>
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="e.g. Vessel Name, Insurance, SGS Inspection, Contract Ref..."
                      className="w-full p-2 rounded bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-[11px] text-slate-400 mb-1">مقدار فیلد (Value):</label>
                    <input
                      type="text"
                      value={newFieldValue}
                      onChange={(e) => setNewFieldValue(e.target.value)}
                      placeholder="e.g. MSC REGINA / Covered by Seller / SGS / CTR-2026..."
                      className="w-full p-2 rounded bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div className="self-end">
                    <button
                      type="button"
                      onClick={handleAddCustomExtraField}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus size={14} />
                      <span>افزودن فیلد</span>
                    </button>
                  </div>
                </div>

                {/* List of custom fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {(!config.customExtraFields || config.customExtraFields.length === 0) ? (
                    <div className="col-span-full p-4 text-center text-slate-500 italic bg-slate-900/50 rounded-lg">
                      هنوز هیچ فیلد اختصاصی اضافه نشده است. می‌توانید فیلدهایی مانند نام کشتی، بیمه‌نامه یا شرکت بازرسی را اضافه کنید.
                    </div>
                  ) : (
                    config.customExtraFields.map((cf, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-900 rounded-lg border border-slate-700 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="text-[11px] font-bold text-indigo-300 block truncate">{cf.label}</span>
                          <span className="text-xs text-white truncate font-medium">{cf.value || "-"}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomExtraField(idx)}
                          className="p-1 text-rose-400 hover:bg-rose-950/50 rounded"
                          title="حذف فیلد"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div></div></details>)}

            {/* Tab 3: Proforma Notes & Clauses */}
            {onSaveTemplateConfig && (<details className="rounded-xl border border-slate-700 bg-slate-900"><summary className="cursor-pointer p-3 font-bold text-slate-100">لوگو، رنگ و ظاهر پروفورما</summary><div className="border-t border-slate-700 p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="sm:col-span-3 rounded-xl border border-sky-700 bg-slate-900 p-3"><b className="block text-slate-100">Shared issued-documents logo</b><p className="mt-1 text-slate-400">Used on every commercial-document package cover. Supplier logos remain unchanged.</p><div className="mt-2 flex flex-wrap items-center gap-3">{config.issuedDocumentsLogo ? <img src={config.issuedDocumentsLogo} alt="Issued documents logo" className="h-12 w-36 rounded border border-slate-600 bg-white object-contain p-1"/> : <div className="grid h-12 w-36 place-items-center rounded border border-dashed border-slate-500 text-[10px] text-slate-400">ARCATAV default logo</div>}<label className="cursor-pointer rounded-lg bg-sky-600 px-3 py-2 font-bold text-white">Replace logo<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setConfig({ ...config, issuedDocumentsLogo: String(reader.result) }); reader.readAsDataURL(file); }}/></label>{config.issuedDocumentsLogo && <button type="button" onClick={() => setConfig({ ...config, issuedDocumentsLogo: undefined })} className="rounded-lg border border-slate-600 px-3 py-2 font-bold text-slate-200">Use ARCATAV default</button>}</div></div>
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 space-y-2">
                  <span className="font-bold text-slate-200 block">رنگ نوارهای تیتر (Header Banners)</span>
                  <div className="flex items-center gap-2">
                    {[
                      { name: "ذغالی نمونه (Charcoal)", color: "#374151" },
                      { name: "سرمه‌ای شیک (Deep Navy)", color: "#1e293b" },
                      { name: "مشکی رسمی (Classic Black)", color: "#111827" },
                      { name: "خاکستری مدرن (Slate)", color: "#475569" },
                    ].map((item) => (
                      <button
                        key={item.color}
                        type="button"
                        onClick={() => setConfig({ ...config, headerColor: item.color })}
                        className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                          config.headerColor === item.color
                            ? "border-indigo-400 scale-110 shadow-md"
                            : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: item.color }}
                        title={item.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 space-y-2">
                  <span className="font-bold text-slate-200 block">اندازه قلم و فشردگی چاپ</span>
                  <div className="flex gap-2">
                    {[
                      { id: "compact", label: "فشرده (Compact)" },
                      { id: "standard", label: "استاندارد نمونه (Standard)" },
                      { id: "large", label: "خوانا و درشت (Spacious)" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setConfig({ ...config, fontSize: f.id as any })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          config.fontSize === f.id
                            ? "bg-indigo-600 text-white font-bold"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div></div></details>)}
          </div></div>;

  const multiItemDesign = ["teal_multi_item", "graphite_copper"].includes(config.templateStyle || "") && ["PI", "COMMERCIAL_INVOICE", "PACKING_LIST"].includes(docType);
  const multiMetadata: Array<[string, React.ReactNode]> = [
    ...(config.showCommercialId ? [["Commercial ID", customer?.CommercialID] as [string, React.ReactNode]] : []),
    ...(config.showCountryBeneficiary ? [["Country of Beneficiary",issuerCountry] as [string, React.ReactNode]] : []),
    ["Country of Destination",order.CountryOfDestination],["Country of Origin",order.CountryOfOrigin],["Terms of Payment",order.TermsOfPayment],
    ...(shouldRenderExchange ? [["Exchange Rate", conversionRate], ["Type of Exchange", exchangePair]] as Array<[string, React.ReactNode]> : []),
    ...(config.showTotalCube ? [["Total Cube",order.TotalCube] as [string, React.ReactNode]]:[]),
    ...(config.showGrossWeight ? [["Gross Weight",`${formatEnglishNumber(isSplitDocument ? printedGrossWeightTotal : itemGrossWeightTotal,2)} KG`] as [string, React.ReactNode]]:[]),
    ["Transaction Currency",order.TransactionCurrency],...(config.showPartialShipment ? [["Partial Shipment",order.PartialShipment] as [string, React.ReactNode]]:[]),
    ["Transportation Mode",order.TransportaionMode],["Port of Loading",order.PortOfLoading],["Port of Discharge",order.PortOfDischarge],["Final Place of Delivery",order.FinalPlaceOfDelivery],["Terms of Delivery",order.TermsOfDelivery],
    ...(isPackingList && (order.VesselName || order.VoyageNumber) ? [["Vessel / Voyage",[order.VesselName,order.VoyageNumber].filter(Boolean).join(" / ")] as [string, React.ReactNode]]:[]),
    ...(config.customExtraFields || []).map(field=>[field.label,field.value] as [string, React.ReactNode]),
  ];
  const multiTerms = hasPiTerms ? <>{printedClauses.map(clause=><div key={clause.id} data-print-term={`clause:${clause.id}`} style={{...paragraphStyle(`clause:${clause.id}`),breakInside:"avoid"}}>{clause.titleEn&&<b>{clause.titleEn}: </b>}{clause.contentEn}</div>)}{piPrintedNotes.map(note=>{const index=(config.customNotes||[]).indexOf(note);return <div key={index} data-print-term={`note:${index}`} style={{...paragraphStyle(`note:${index}`),breakInside:"avoid",whiteSpace:"pre-line"}} contentEditable={settingsMode} suppressContentEditableWarning onFocus={()=>settingsMode&&setSelectedNote(index)} onBlur={event=>{if(!settingsMode)return;const text=event.currentTarget.textContent||"";if(text!==note)setConfig(current=>({...current,customNotes:(current.customNotes||[]).map((value,i)=>i===index?text:value)}));}}>{note}</div>;})}</>:null;
  const documentPreview = (
        <div className={`p-4 sm:p-8 overflow-y-auto bg-slate-100 flex-1 font-sans text-slate-900 printable-document ${displayedVisualTemplate || standardLayoutTemplate || docType === "COO" || docType === "COA" ? "preserve-document-fonts" : ""}`} style={{ padding: `${config.pageMarginMm || 10}mm` }}>
          <div ref={standardPaperRef} data-standard-paper
            className={`bg-white mx-auto max-w-4xl min-h-[277mm] flex flex-col text-left font-sans ${docType === "COO" ? "p-0 sm:p-0" : "p-8 sm:p-10"} ${templatePresentation.paper} ${
              config.fontSize === "compact"
                ? "text-[10px] leading-tight"
                : config.fontSize === "large"
                ? "text-[12px] leading-normal"
                : "text-[11px] leading-snug"
            }`}
            dir="ltr"
          >
            {!canvasMode && standardLayoutTemplate?.fields?.filter(field => !field.source.startsWith("standard:")).map(field => <div key={field.id} style={{position:"absolute",left:`${field.x}%`,top:`${field.y}%`,width:`${field.width}%`,minHeight:`${field.height || 5}%`,fontFamily:field.fontFamily,fontSize:field.fontSize,fontWeight:field.bold?700:400,textAlign:field.align,color:field.color,backgroundColor:field.backgroundColor,border:`${field.borderWidth || 0}px solid ${field.borderColor || "transparent"}`,whiteSpace:"pre-wrap",transform:`rotate(${field.rotation || 0}deg)`,zIndex:field.zIndex}}>{resolveTemplateField(field.source,field.customValue)}</div>)}
            {docType === "COO" && activeCooFiles.length ? <div className="w-full">{activeCooFiles.map((file) => <BlFilePages key={file.id} file={file} onRemove={removeCooFile}/>)}</div> : multiItemDesign && !displayedVisualTemplate ? <MultiItemCommercialTemplate order={order} supplier={supplier} customer={customer} config={config} title={docType === "PI" ? "PROFORMA INVOICE" : isPackingList ? "PACKING LIST" : "COMMERCIAL INVOICE"} number={printedDocumentNumber || order.ProformaInvoiceID} date={printedDocumentDate} validity={calculateValidity()} issueDate={printedIssueDate} packing={isPackingList} copper={config.templateStyle === "graphite_copper"} currency={outputCurrency} stampText={documentStamp} metadata={multiMetadata} rows={printedItems} nameFor={currentProductNameFor} descriptionFor={currentProductDescriptionFor} hsFor={currentHsCodeFor} packingFor={currentPackingFor} subtotal={subTotal} freight={printedFreight} total={totalAmountDue} terms={multiTerms}/> : displayedVisualTemplate ? <div ref={cooTemplateRef} className="coo-visual-template relative aspect-[210/297] w-full bg-white" onPointerMove={moveInlineCooSelection} onPointerUp={() => setInlineCooDrag(null)} style={{ backgroundColor:displayedVisualTemplate.backgroundColor||"#ffffff", backgroundImage: displayedVisualTemplate.imageData ? `url(${displayedVisualTemplate.imageData})` : undefined, backgroundSize: "100% 100%" }}>
              {(displayedVisualTemplate.fields || []).map((field) => {
                const usesTurkeyCooSpacing = issuerCooCountry === "turkey" && !["cooBarcode", "cooGoodsDivider", "cooAuthorityQr", "cooAuthoritySeal", "documentNumber"].includes(field.source);
                const authorityCrop = field.source === "cooAuthorityQr"
                  ? { width: "1159%", left: "-624%", top: "-84%" }
                  : field.source === "cooAuthoritySeal"
                  ? { width: "668%", left: "-445%", top: "-38%" }
                  : null;
                const isCertificateNumberContinuation = issuerCooCountry === "turkey" && field.source === "documentNumber";
                const isAutofitText = !isCertificateNumberContinuation && !["cooBarcode", "cooGoodsDivider", "cooAuthorityQr", "cooAuthoritySeal"].includes(field.source);
                return <div key={field.id} data-coo-autofit={isAutofitText ? "true" : undefined} onPointerDown={(event) => startInlineCooDrag(event, field)} className={`${isCertificateNumberContinuation ? "" : "coo-uniform-field"} absolute overflow-hidden whitespace-pre-wrap ${inlineCooEditing ? "cursor-move outline outline-1 outline-dashed outline-amber-500 hover:outline-2" : ""} ${inlineCooSelectedIds.includes(field.id) ? "ring-2 ring-amber-400" : ""}`} style={{ left:`${field.x}%`, top:`${field.y}%`, width:`${field.width}%`, height:`${field.height||5}%`, boxSizing:"border-box", paddingTop:usesTurkeyCooSpacing ? "5pt" : undefined, paddingLeft:usesTurkeyCooSpacing && field.align !== "center" ? "5pt" : undefined, fontFamily:field.fontFamily, fontSize:`${isAutofitText ? cooUniformFontSize : field.fontSize}px`, lineHeight:1.3, fontWeight:isCertificateNumberContinuation ? (field.bold ? 700 : 400) : 400, textTransform:isCertificateNumberContinuation ? undefined : "uppercase", textAlign:field.align, color:field.color, backgroundColor:field.backgroundColor, borderColor:field.borderColor, borderWidth:field.borderWidth, zIndex:field.zIndex, transform:`rotate(${field.rotation||0}deg)` }}>{authorityCrop ? <img src="/templates/coo/turkey-authority-footer.png" alt={field.source === "cooAuthorityQr" ? "Mersin Chamber verification QR code" : "Mersin Chamber authority seal"} className="absolute max-w-none" style={{ width: authorityCrop.width, maxWidth: "none", left: authorityCrop.left, top: authorityCrop.top }}/> : field.source === "cooBarcode" ? <Interleaved2of5Barcode value={activeCooBarcodeNo || ""}/> : field.source === "cooGoodsDivider" ? <div className="mt-0.5 w-full border-t-[3px] border-dashed border-black"/> : field.source === "exporterBlock" && ["turkey", "uae"].includes(issuerCooCountry) ? <><div className={issuerCooCountry === "turkey" ? "mb-[5px]" : ""}>{supplier?.SupplierName}</div><div>{supplier?.Address}</div></> : field.source === "consigneeBlock" && ["turkey", "uae"].includes(issuerCooCountry) ? <><div>{customer?.CustomerName}</div><div>{customer?.Address}</div></> : field.source === "transportMode" && issuerCooCountry === "uae" ? <>{order.TranspotationModeMeans ? `${order.TranspotationModeMeans}-${order.TransportaionMode || ""}` : order.TransportaionMode || ""}</> : field.source === "goodsDescription" && issuerCooCountry === "turkey" ? <div className="space-y-2">{(order.items || []).map((item, index) => { const name = currentProductNameFor(item).trim(); const description = currentProductDescriptionFor(item).trim(); const text = description && description.toLowerCase() !== name.toLowerCase() ? `${name} (${description})` : name; return <div key={item.OrderDetailID || index}>{text}</div>; })}</div> : field.source === "quantityDetails" && issuerCooCountry === "turkey" ? <div className="space-y-2">{activePartialShipment ? <div>{formatEnglishNumber(printedNetWeightTotal, 2)}<span className="ml-[13.2pt]">KG</span></div> : (order.items || []).map((item, index) => { const quantityKg = item.QuantityUnit === "KG" ? Number(item.Quantity || 0) : Number(item.Quantity || 0) * 1000; return <div key={item.OrderDetailID || index}>{quantityKg.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="ml-[13.2pt]">KG</span></div>; })}</div> : resolveTemplateField(field.source, field.customValue)}</div>;
              })}
            </div> : (docType === "COA" || docType === "BL") ? <div className="space-y-4">
              <div className="print:hidden rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-2 text-center">
                {docType === "COA" && <div className="mb-2 grid grid-cols-2 sm:grid-cols-3 items-end gap-2 text-left"><label className="text-[10px] text-slate-500">COA Number<input value={order.COANumber || ""} onChange={(event)=>onUpdateOrder?.({...order,COANumber:event.target.value})} className="mt-1 w-full rounded border bg-white p-2 text-xs text-slate-800"/></label><label className="text-[10px] text-slate-500">COA Date<input type="date" value={order.COADate || ""} onChange={(event)=>onUpdateOrder?.({...order,COADate:event.target.value})} className="mt-1 w-full rounded border bg-white p-2 text-xs text-slate-800"/></label><label dir="rtl" className="flex cursor-pointer items-center gap-2 rounded border border-indigo-200 bg-white px-2 py-2 text-xs text-slate-800"><input type="checkbox" checked={includeCoaHeaderFooter} onChange={(event) => setIncludeCoaHeaderFooter(event.target.checked)} className="h-4 w-4 accent-indigo-600"/>سربرگ و فوتر COA</label></div>}
                <CaseCommercialDocumentsPanel compact order={order} onChange={(nextOrder) => onUpdateOrder?.(nextOrder)} visibleKinds={[docType === "COA" ? "coaFiles" : "blFiles"]}/>
                {docType === "COA" && <div className="mt-2 text-right"><button type="button" onClick={addEditableCoaPage} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"><ClipboardPaste size={15}/>صفحهٔ قابل ویرایش برای Paste</button></div>}
              </div>
              {docType === "COA" ? <CoaDocumentPages includeHeaderFooter={includeCoaHeaderFooter} pages={printedCoaFiles} supplier={supplier} documentTitle="CERTIFICATE OF ANALYSIS" metadata={<><div>No: {order.COANumber || order.ProformaInvoiceID}</div><div>Date: {order.COADate || order.PIDate}</div></>} emptyMessage="هنوز فایلی برای این پرونده بارگذاری نشده است." onUpdatePage={updateEditableCoaPage} onRemovePage={(id) => removeCommercialPage("coaFiles", id)}/> : (order.blFiles || []).map((file) => <BlFilePages key={file.id} file={file} onRemove={() => removeCommercialPage("blFiles", file.id)}/>)}
              {docType === "BL" && (order.blFiles || []).length === 0 && <div className="grid min-h-[220mm] place-items-center text-sm text-slate-400">هنوز فایلی برای این پرونده بارگذاری نشده است.</div>}
            </div> : <>
            {/* Header / Document Metadata */}
            <div data-standard-block="header" className={`${templatePresentation.header} gap-4`}>
              {/* Left: Supplier Logo & Brand */}
              <div className="flex items-start gap-3">
                {supplier?.LogoT ? (
                  <div className="rounded-md bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden" style={{ width: (config.logoSize || 64) * 2.5, height: config.logoSize || 64 }}>
                    <img
                      src={supplier.LogoT}
                      alt={supplier.SupplierName}
                      className="max-h-full max-w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-8 bg-cyan-600 rounded-xs"></div>
                      <div className="w-3 h-10 bg-cyan-800 rounded-xs"></div>
                      <div className="w-3 h-6 bg-cyan-500 rounded-xs"></div>
                    </div>
                  </div>
                )}

              </div>

              {/* Right: Proforma Invoice No & Dates */}
              <div className="text-right space-y-1 shrink-0 font-sans">
                <div className="text-base sm:text-lg font-bold text-slate-950 tracking-tight">
                  {docType === "PI"
                    ? "Proforma Invoice No."
                    : docType === "SALES_CONTRACT"
                    ? "Sales Contract No."
                    : docType === "COMMERCIAL_INVOICE"
                    ? "Commercial Invoice No."
                    : docType === "PACKING_LIST"
                    ? "Packing List No."
                    : "Certificate of Origin No."}{" "}
                  <span className="font-mono font-normal">{printedDocumentNumber || "BR-260814-01."}</span>
                </div>
                <div className="text-xs text-slate-800 font-medium">
                  Date &nbsp;&nbsp;&nbsp;
                  <span className="font-mono font-normal text-slate-950">
                    {printedDocumentDate || "2026-08-14"}
                  </span>
                </div>
                {docType === "PI" && <div className="text-xs text-slate-800 font-medium">
                  Validity &nbsp;&nbsp;&nbsp;
                  <span className="font-mono font-normal text-slate-950">
                    {calculateValidity()}
                  </span>
                </div>}
              </div>
            </div>

            {/* Top 2-Column Info Grid (Exact match to sample image) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-0 border-t border-slate-300 pt-2">
              {/* Left Column (Seller & Buyer & Consignee) - 5 of 12 cols */}
              <div className="sm:col-span-5 pr-3 space-y-3">
                {/* Seller */}
                <div data-standard-block="seller">
                  <div
                    className="text-white font-bold px-2 py-0.5 text-xs uppercase"
                    style={{ backgroundColor: config.headerColor || "#374151", fontSize: `${config.textSizes?.sectionTitlePt ?? 9}pt` }}
                  >
                    Seller
                  </div>
                  <div className="pt-1.5 space-y-0.5 text-slate-900 font-normal text-[11px] leading-tight">
                    <div className="font-bold text-slate-950 uppercase">
                      {supplier?.SupplierName || "BERAKEM KİMYA TİCARET İTHALAT İHRACAT LİMİTED"}
                    </div>
                    <div className="whitespace-pre-line">{supplier?.Address || "-"}</div>
                    <div className="pt-1 font-mono text-slate-800">
                      {supplier?.Tel || "-"}
                    </div>
                    <div className="font-mono text-slate-800">
                      {supplier?.Email || "-"}
                    </div>
                  </div>
                </div>

                {/* Buyer */}
                <div data-standard-block="buyer">
                  <div
                    className="text-white font-bold px-2 py-0.5 text-xs uppercase"
                    style={{ backgroundColor: config.headerColor || "#374151", fontSize: `${config.textSizes?.sectionTitlePt ?? 9}pt` }}
                  >
                    Buyer
                  </div>
                  <div className="pt-1.5 space-y-0.5 text-slate-900 font-normal text-[11px] leading-tight">
                    <div className="font-bold text-slate-950 uppercase">
                      {customer?.CustomerName || order.CustomerName || "PHENOL RESIN."}
                    </div>
                    <div className="whitespace-pre-line">{customer?.Address || "-"}</div>
                    <div className="pt-1 font-mono text-slate-800">
                      {customer?.Tel || "-"}
                    </div>
                  </div>
                </div>

                {/* Consignee */}
                {config.showConsignee && (
                  <div data-standard-block="consignee">
                    <div className="text-white font-bold px-2 py-0.5 text-xs uppercase" style={{ backgroundColor: config.headerColor || "#374151", fontSize: `${config.textSizes?.sectionTitlePt ?? 9}pt` }}>Consignee</div>
                    <div className="pt-1.5 space-y-0.5 text-slate-900 font-normal text-[11px] leading-tight whitespace-pre-line">
                      {config.consigneeText || "The Same As Buyer"}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column (Commercial Specs & Logistics Grid) - 7 of 12 cols */}
              <div data-standard-block="logistics" className="sm:col-span-7 pl-3 border-l border-slate-300">
                {/* Header Banners: Commercial ID & Country Of Beneficiary */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {config.showCommercialId && (
                    <div>
                      <div
                        className="text-white font-bold px-2 py-0.5 text-center text-xs uppercase"
                        style={{ backgroundColor: config.headerColor || "#374151", fontSize: `${config.textSizes?.sectionTitlePt ?? 9}pt` }}
                      >
                        Commercial ID
                      </div>
                      <div className="text-center font-mono text-[11px] pt-1 text-slate-800 font-normal min-h-[20px]">
                        {customer?.CommercialID || "-"}
                      </div>
                    </div>
                  )}

                  {config.showCountryBeneficiary && (
                    <div>
                      <div
                        className="text-white font-bold px-2 py-0.5 text-center text-xs uppercase"
                        style={{ backgroundColor: config.headerColor || "#374151", fontSize: `${config.textSizes?.sectionTitlePt ?? 9}pt` }}
                      >
                        Country Of Beneficiary
                      </div>
                      <div className="text-center font-normal text-[11px] pt-1 text-slate-900 min-h-[20px]">
                        {issuerCountry || "-"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid Table of Commercial Attributes */}
                <div className="border-t border-slate-200 divide-y divide-slate-200 text-[11px]">
                  {/* Row 1: Destination / Origin / Terms Of Payment */}
                  <div className="grid grid-cols-3 py-1 gap-1 text-center">
                    <div>
                      <div className="font-bold text-slate-950 text-[10px]">Country Of Destination</div>
                        <div className="font-normal text-slate-800 uppercase mt-0.5">
                        {order.CountryOfDestination || "IRAQ"}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-950 text-[10px]">Country Of Origin</div>
                        <div className="font-normal text-slate-800 uppercase mt-0.5">
                        {order.CountryOfOrigin || "South Korea"}
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-950 text-[10px]">Terms Of Payment</div>
                        <div className="font-normal text-slate-800 uppercase mt-0.5">
                        {order.TermsOfPayment || "Cash In Advance"}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Currency Exchange (CRITICAL: Only shown when exchange is active or configured) */}
                  {shouldRenderExchange ? (
                    <div className={`grid ${isPackingList || isCommercialInvoice ? "grid-cols-2" : "grid-cols-3"} py-1 gap-1 text-center bg-amber-50/40`}>
                      <div>
                        <div className="font-bold text-slate-950 text-[10px]">Exchange Rate</div>
                        <div className="font-mono font-normal text-slate-900 mt-0.5">
                          {conversionRate}
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-slate-950 text-[10px]">Type of Exchange</div>
                        <div className="font-mono text-slate-800 mt-0.5">
                          {exchangePair}
                        </div>
                      </div>
                      {!isPackingList && !isCommercialInvoice && <div>
                        <div className="font-bold text-slate-950 text-[10px]">Total Cube</div>
                        <div className="font-normal text-slate-800 mt-0.5">
                          {order.TotalCube || "-"}
                        </div>
                      </div>}
                    </div>
                  ) : (
                    config.showTotalCube && !isPackingList && !isCommercialInvoice && (
                      <div className="grid grid-cols-3 py-1 gap-1 text-center">
                        <div className="col-span-3 text-right pr-4">
                          <span className="font-bold text-slate-950 text-[10px] mr-2">Total Cube:</span>
                          <span className="font-normal text-slate-800">{order.TotalCube || "-"}</span>
                        </div>
                      </div>
                    )
                  )}

                  {/* Row 3: Gross Weight / Transaction Currency / Partial Shipment */}
                  <div className="grid grid-cols-3 py-1 gap-1 text-center">
                    {config.showGrossWeight && (
                      <div>
                        <div className="font-bold text-slate-950 text-[10px]">Gross Weight</div>
                        <div className="font-mono font-normal text-slate-900 mt-0.5">
                          {printedGrossWeightTotal ? `${formatNumber(printedGrossWeightTotal)} KG` : "-"}
                        </div>
                      </div>
                    )}
                    {!isPackingList && <div>
                      <div className="font-bold text-slate-950 text-[10px]">Transaction Currency</div>
                      <div className="font-mono font-normal text-slate-900 mt-0.5">
                        {isDummyCommercialInvoice ? outputCurrency : order.TransactionCurrency || "USD"}
                      </div>
                    </div>}
                    {config.showPartialShipment && (
                      <div>
                        <div className="font-bold text-slate-950 text-[10px]">Partial Shipment</div>
                        <div className="font-normal text-slate-800 mt-0.5">
                          {order.PartialShipment || "Allowed"}
                        </div>
                      </div>
                    )}
                    {isPackingList && config.showTotalCube && (
                      <div>
                        <div className="font-bold text-slate-950 text-[10px]">Total Cube</div>
                        <div className="font-mono font-normal text-slate-900 mt-0.5">
                          {order.TotalCube || "-"}
                        </div>
                      </div>
                    )}
                  </div>

                  {isCommercialInvoice && config.showTotalCube && <div className="py-1 flex justify-between items-center px-1 border-b border-slate-200">
                    <span className="font-bold text-slate-950">Total Cube</span>
                    <span className="text-slate-800 font-normal">{order.TotalCube || "-"} CBM</span>
                  </div>}

                  {/* Row 4: Transportation Mode */}
                  <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Transportation Mode</span>
                    <span className="text-slate-800 font-normal">
                      {order.TransportaionMode || "Vessel-Sea"}
                    </span>
                  </div>

                  {isPackingList && (printedShippingOrder.VesselName || printedShippingOrder.VoyageNumber) && <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Vessel / Voyage No.</span>
                    <span className="text-slate-800 font-normal">{[printedShippingOrder.VesselName, printedShippingOrder.VoyageNumber].filter(Boolean).join(" / ")}</span>
                  </div>}

                  {/* Row 5: Port Of Loading */}
                  <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Port Of Loading</span>
                    <span className="text-slate-800 font-normal">
                      {order.PortOfLoading || "Any Port/Customs in Turkey"}
                    </span>
                  </div>

                  {/* Row 6: Port Of Discharge */}
                  <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Port Of Discharge</span>
                    <span className="text-slate-800 font-normal">
                      {order.PortOfDischarge || "Baqdad-Iraq"}
                    </span>
                  </div>

                  {/* Row 7: Final Place Of delivery */}
                  <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Final Place Of delivery</span>
                    <span className="text-slate-800 font-normal">
                      {order.FinalPlaceOfDelivery || "Mersin/Turkey"}
                    </span>
                  </div>

                  {/* Row 8: Terms Of Delivery */}
                  <div className="py-1 flex justify-between items-center px-1">
                    <span className="font-bold text-slate-950">Terms Of Delivery</span>
                    <span className="text-slate-900 font-normal">
                      {order.TermsOfDelivery || "CIF"}
                    </span>
                  </div>

                  {/* Dynamic Custom Extra Fields in top grid */}
                  {config.customExtraFields?.map((cf, idx) => (
                    <div key={idx} className="py-1 flex justify-between items-center px-1 bg-slate-50/50">
                      <span className="font-bold text-slate-950">{cf.label}</span>
                      <span className="text-slate-900 font-normal">{cf.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Line Items Table (Clean, exact borders like the PDF) */}
            <div data-standard-block="items" className="mt-4">
              <table className="w-full text-left border-collapse border-y-2 border-slate-900 text-[11px]" style={{ fontSize: `${config.textSizes?.tablePt ?? 8.25}pt` }}>
                <thead>
                  <tr className="border-b border-slate-300 font-bold text-slate-950">
                    <th className="py-2 pr-2 text-left">Item Description</th>
                    {config.showHsCode && <th className="py-2 px-2 text-center">Commodity Code</th>}
                    <th className="py-2 px-2 text-center">Quantity (MT)</th>
                    {showInvoiceAmounts && <th className="py-2 px-2 text-center">Unit Price (MT)</th>}
                    {showPackingGrossWeight && <th className="py-2 px-2 text-center">Gross Weight (Kg)</th>}
                    {showPackingDetails && <th className="py-2 px-2 text-center">Nos. &amp; Kind of Packages</th>}
                    {showInvoiceAmounts && <th className="py-2 pl-2 text-right">Amount</th>}
                  </tr>
                </thead>
                <tbody>
                  {printedItems.map(({ item, index: idx, quantity, unitPrice, grossWeight, packages }) => {
                    const grossWt = grossWeight;
                    const sourceUnitPrice = unitPrice;
                    const extAmt = quantity * sourceUnitPrice;

                    return (
                      <React.Fragment key={idx}><tr className={`align-top ${currentProductDescriptionFor(item) ? "[&>td]:pb-0" : ""}`} style={idx > 0 ? { borderTop: "1px solid #e2e8f0" } : undefined}>
                        <td className="py-2 pr-2">
                          <PrintProductName text={currentProductNameFor(item)} namePt={config.textSizes?.productNamePt} detailPt={config.textSizes?.productDetailPt}/>
                        </td>

                        {config.showHsCode && (
                          <td className="py-2 px-2 text-center font-mono text-slate-800">
                            {currentHsCodeFor(item) || "2907.11.00"}
                          </td>
                        )}

                        <td className="py-2 px-2 text-center font-mono font-normal text-slate-900">
                          {formatEnglishNumber(quantity, 2)}
                        </td>

                        {showInvoiceAmounts && <td className="py-2 px-2 text-center font-mono text-slate-900">
                          {formatEnglishNumber(sourceUnitPrice, 2)}
                        </td>}

                        {showPackingGrossWeight && (
                          <td className="py-2 px-2 text-center font-mono text-slate-900">
                            {formatNumber(grossWt)}
                          </td>
                        )}

                        {showPackingDetails && (
                          <td className="py-2 px-2 text-center text-slate-800 text-[10px]">
                            {packages || currentPackingFor(item) || "160x210 Kg Drum"}
                          </td>
                        )}

                        {showInvoiceAmounts && <td className="py-2 pl-2 text-right font-mono font-normal text-slate-950">
                          {formatEnglishNumber(extAmt, 2)}
                        </td>}
                      </tr>{currentProductDescriptionFor(item) && <tr style={{ border: 0 }}><td colSpan={2 + Number(config.showHsCode) + Number(showInvoiceAmounts) * 2 + Number(showPackingGrossWeight) + Number(showPackingDetails)} className="pb-2 text-slate-600"><div style={{ width: 0, minWidth: "100%" }}><div data-print-product-detail data-preferred-size-pt={config.textSizes?.productDetailPt} style={{ whiteSpace: "nowrap", fontSize: "9px", lineHeight: 1 }}>{currentProductDescriptionFor(item)}</div></div></td></tr>}</React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Note & Totals Section */}
            <div className={`mt-3 grid grid-cols-1 gap-4 pt-2 sm:grid-cols-12 ${docType === "PI" && hasPiTerms ? "flex-1 items-stretch" : ""}`}>
              {/* PI clauses form a vertical column alongside the calculation summary. */}
              {docType === "PI" && hasPiTerms && (
                <section data-standard-block="terms" className="min-h-[170px] break-inside-avoid rounded-md border border-slate-300 p-3 text-left sm:col-span-7 sm:h-full">
                  <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-950">TERMS &amp; CONDITIONS</h3>
                  <div className="text-slate-800">
                    {printedClauses.map((clause, index) => (
                      <div key={clause.id} data-print-term={`clause:${clause.id}`} className="break-inside-avoid" style={paragraphStyle(`clause:${clause.id}`)}>
                        {clause.titleEn && <div className="font-bold text-slate-950">{index + 1}. {clause.titleEn}</div>}
                        <div className="whitespace-pre-line">{clause.contentEn}</div>
                      </div>
                    ))}
                    {piPrintedNotes.map((note, index) => <div key={`print-note-${index}`} data-print-term={`note:${(config.customNotes || []).indexOf(note)}`} className={`whitespace-pre-line break-words ${settingsMode ? "cursor-text rounded outline-offset-2 hover:outline hover:outline-1 hover:outline-indigo-300" : ""}`} style={{...paragraphStyle(`note:${(config.customNotes || []).indexOf(note)}`), ...(settingsMode && selectedNote === (config.customNotes || []).indexOf(note) ? {outline: "2px solid #6366f1"} : {})}} dir="auto" contentEditable={settingsMode} suppressContentEditableWarning onFocus={() => settingsMode && setSelectedNote((config.customNotes || []).indexOf(note))} onBlur={event => { if (!settingsMode) return; const text = event.currentTarget.textContent || ""; const idx = (config.customNotes || []).indexOf(note); if (text !== note) setConfig(current => ({...current, customNotes: (current.customNotes || []).map((value, i) => i === idx ? text : value)})); }}>{note}</div>)}
                  </div>
                </section>
              )}

              {/* Packing List shows all container/seal and truck references. */}
              {isPackingList && (
                <div className="border-y border-slate-300 py-3 text-left sm:col-span-7">
                  <div className="font-bold text-slate-950 text-xs">Container No. / Seal No. / Truck No.</div>
                  <div className="mt-1 space-y-1 text-sm text-slate-900">{packingTransportLines(printedShippingOrder).length ? packingTransportLines(printedShippingOrder).map((line, index) => <div key={`${line}-${index}`} className="font-sans text-xs leading-relaxed">{line}</div>) : <div>-</div>}</div>
                </div>
              )}

              {/* Right: Totals Box */}
              {showInvoiceAmounts ? <div data-standard-block="totals" className={`relative self-start rounded-md border border-slate-300 px-3 py-2 text-right font-sans ${docType === "PI" ? hasPiTerms ? "sm:col-span-5" : "sm:col-span-12 sm:ml-auto sm:w-full sm:max-w-[340px]" : docType === "SALES_CONTRACT" ? "sm:col-span-12 sm:ml-auto sm:w-full sm:max-w-[340px]" : docType === "COMMERCIAL_INVOICE" ? "sm:col-span-5 sm:col-start-8" : "sm:col-span-5"}`}>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
                    <span className="font-bold text-slate-950">Total Amount</span>
                    <span className="font-mono font-normal text-slate-900">
                      {formatEnglishNumber(subTotal, 2)}
                    </span>
                  </div>

                  {config.showFreightRow && (
                    <div className="flex justify-between items-center py-0.5 border-b border-slate-100 text-slate-600">
                      <span className="font-bold text-slate-950">Freight</span>
                      <span className="font-mono">
                        {formatEnglishNumber(printedFreight, 2)}
                      </span>
                    </div>
                  )}

                  {/* Total Amount Due */}
                  <div className="flex min-w-0 items-center justify-between gap-5 pt-2 border-t-2 border-slate-900 text-xs sm:text-sm font-black">
                    <span className="shrink-0 text-slate-950">Total Amount Due</span>
                    <span className="shrink-0 whitespace-nowrap font-mono font-normal text-slate-950 border-b-2 border-slate-900 pb-0.5">
                      {formatEnglishNumber(totalAmountDue, 2)}
                      <span className="ml-2">{documentCurrencySymbol}</span>
                    </span>
                  </div>
                  {!!documentStamp && <div className="pointer-events-none absolute right-3 top-[calc(100%+0.25rem)] z-10"><div className="inline-block -rotate-6 rounded border-[3.5px] border-red-600 px-3.5 py-1 text-[1.75rem] leading-none font-black tracking-[0.22em] text-red-600">{documentStamp}</div></div>}
                </div>
              </div> : <div className="relative sm:col-span-5 text-right font-sans text-xs">
                <div className="flex justify-between"><b>Total Net Weight</b><span className="font-mono">{formatEnglishNumber(printedItems.reduce((sum, row) => sum + row.quantity * 1000, 0), 2)} KG</span></div>
                <div className="mt-1 flex justify-between"><b>Total Gross Weight</b><span className="font-mono">{formatEnglishNumber(printedGrossWeightTotal, 2)} KG</span></div>
                {!!documentStamp && <div className="pointer-events-none absolute right-3 top-[calc(100%+0.25rem)] z-10"><div className="inline-block -rotate-6 rounded border-[3.5px] border-red-600 px-3.5 py-1 text-[1.75rem] leading-none font-black tracking-[0.22em] text-red-600">{documentStamp}</div></div>}
              </div>}
            </div>

            {/* Bottom Footer: Bank Details & Signatures (Matching sample) */}
            <div data-standard-block="footer" className="mt-auto shrink-0 grid grid-cols-1 items-end gap-4 pt-4 sm:grid-cols-12">
              {/* Bank Details */}
              {config.showBankDetails && (
                <div className="sm:col-span-5 space-y-1 self-end">
                  <div className="font-bold text-slate-950 text-xs tracking-wider">BANK DETAILS</div>
                  <div className="text-[10px] text-slate-800 space-y-0.5 leading-snug uppercase font-mono">
                    {supplier?.Bank && <div className="font-normal text-slate-950 whitespace-pre-line">{supplier.Bank}</div>}
                    {supplier?.BankBranch && <div>{`BRANCH / BRANCH CODE: ${supplier.BankBranch}`}</div>}
                    {supplier?.BankAddress && <div className="whitespace-pre-line">{supplier.BankAddress}</div>}
                    {supplier?.SwiftCode && <div>{`SWIFT CODE: ${supplier.SwiftCode}`}</div>}
                    {supplier?.AccountNo && (
                      <div>{`ACCOUNT NO: ${supplier.AccountNo}`}</div>
                    )}
                    {supplier?.IBAN && <div className="font-normal text-slate-950">{`IBAN: ${supplier.IBAN}`}</div>}
                    {!supplier?.Bank && !supplier?.BankBranch && !supplier?.BankAddress && !supplier?.SwiftCode && !supplier?.AccountNo && !supplier?.IBAN && (
                      <div className="normal-case text-slate-500">Bank details are not configured for this supplier.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Signatory & Date */}
              {config.showSignatory && (
                <div className="sm:col-span-3 self-end space-y-4 pt-1">
                  <div>
                    <div className="whitespace-nowrap text-xs font-bold text-slate-950">Name of Signatory</div>
                    <div className="mt-1 whitespace-nowrap text-xs font-normal text-slate-800">
                      {order.NameOfSignatory || supplier?.Signatory || "Zeynep Gungor Akgoz"}
                    </div>
                  </div>

                  <div className="text-xs text-slate-950">
                    <div className="font-bold">Date Of Issue:</div>
                    <div className="mt-1 font-mono font-normal text-slate-800">
                      {printedIssueDate || "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Company Stamp & Seal */}
              {config.showStampSignature && (
                <div className="sm:col-span-4 flex self-end items-end justify-center sm:justify-end">
                  <div className="w-full max-w-[360px] p-3 pb-0 flex flex-col items-center justify-end text-center overflow-hidden">
                    <div className="relative flex w-full items-center justify-center" style={{ height: Math.max(80, ((config.artworkSizeOverrides?.stampSize ?? supplier?.PrintStampSize) ?? config.stampSize ?? 140) * 0.7, ((config.artworkSizeOverrides?.signatureSize ?? supplier?.PrintSignatureSize) ?? config.signatureSize ?? 160) * 1.5) }}>
                      {supplier?.StampT?.startsWith("data:image") ? <img src={supplier.StampT} alt="Company stamp" className="object-contain" style={{ maxHeight: ((config.artworkSizeOverrides?.stampSize ?? supplier?.PrintStampSize) ?? config.stampSize ?? 140) * 0.7, maxWidth: ((config.artworkSizeOverrides?.stampSize ?? supplier?.PrintStampSize) ?? config.stampSize ?? 140) * 0.7 }}/> : null}
                      {supplier?.SignT?.startsWith("data:image") ? <img src={supplier.SignT} alt="Authorized signature" className="absolute bottom-0 object-contain" style={{ maxHeight: ((config.artworkSizeOverrides?.signatureSize ?? supplier?.PrintSignatureSize) ?? config.signatureSize ?? 160) * 1.5, maxWidth: ((config.artworkSizeOverrides?.signatureSize ?? supplier?.PrintSignatureSize) ?? config.signatureSize ?? 160) * 3 }}/> : null}
                    </div>
                    <div className="mt-1 whitespace-nowrap pt-1 text-[8px] font-normal text-slate-800">{order.NameOfSignatory || supplier?.Signatory || ""}</div>
                    <div className="text-[7px] text-slate-500">Authorized Signatory</div>
                  </div>
                </div>
              )}
            </div>
            </>}
          </div>
        </div>
  );

  if (canvasMode) return documentPreview;

  if (settingsMode) return <div className="space-y-3" dir="rtl">
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-white p-3 shadow-sm">
      <button type="button" onClick={handleSaveDefaultTemplate} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white"><Save size={16} className="ml-1 inline"/>ذخیره قالب عمومی</button>
      {savedSuccessMsg && <span role="status" className="text-sm text-emerald-700">قالب ذخیره شد</span>}
      <span className="text-xs text-slate-500">برای ویرایش، روی متن شرط در پیش‌نمایش کلیک کنید.</span>
    </div>
    <details open className="rounded-xl border border-indigo-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-indigo-950">انتخاب قالب چاپ</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{commercialTemplateOptions.map(template=><button type="button" key={template.id} aria-pressed={config.templateStyle===template.id} onClick={()=>setConfig(current=>({...current,templateStyle:template.id}))} className={`rounded-lg border p-3 text-right text-xs ${config.templateStyle===template.id?"border-indigo-600 bg-indigo-50 font-bold":"border-slate-200 bg-white"}`}><span className="ml-2 inline-block h-3 w-3 rounded-full" style={{backgroundColor:template.color}}/>{template.title}</button>)}</div><p className="mt-2 text-xs text-slate-500">قالب را انتخاب کنید، پیش‌نمایش را ببینید و «ذخیره قالب عمومی» را بزنید. قالب‌های قبلی و چیدمان‌های ذخیره‌شده حفظ می‌شوند.</p></details>
    <details className="rounded-xl border border-indigo-200 bg-white p-3" open hidden={Boolean(displayedVisualTemplate)}>
      <summary className="cursor-pointer font-bold text-sm text-indigo-900">اندازه‌های قالب</summary>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([{key: "productNamePt", label: "نام کالا", fallback: 8.25}, {key: "productDetailPt", label: "نام شیمیایی و گرید", fallback: 7.8}, {key: "tablePt", label: "متن و اعداد جدول", fallback: 8.25}, {key: "sectionTitlePt", label: "عنوان بخش‌ها", fallback: 9}] as const).map(field => <label key={field.key} className="text-xs text-slate-600">{field.label} (pt)<input aria-label={`اندازه ${field.label}`} type="number" min="4" max="30" step="0.5" value={config.textSizes?.[field.key] ?? field.fallback} onChange={e => { const value = e.target.value; setConfig(current => ({...current, textSizes: {...current.textSizes, [field.key]: value === "" ? undefined : Number(value)}})); }} className="mt-1 w-full rounded border p-2 text-slate-900"/></label>)}
        {([{key: "logoSize", label: "لوگو", fallback: 64, min: 30, max: 140}, {key: "signatureSize", label: "امضا", fallback: 160, min: 60, max: 300}, {key: "stampSize", label: "مهر", fallback: 140, min: 60, max: 300}] as const).map(field => <label key={field.key} className="text-xs text-slate-600">{field.label} (px)<input aria-label={`اندازه ${field.label}`} type="number" min={field.min} max={field.max} value={(field.key === "logoSize" ? config.logoSize : field.key === "stampSize" ? config.artworkSizeOverrides?.stampSize ?? supplier?.PrintStampSize ?? config.stampSize : config.artworkSizeOverrides?.signatureSize ?? supplier?.PrintSignatureSize ?? config.signatureSize) ?? field.fallback} onChange={e => setConfig(current => ({...current, [field.key]: e.target.value === "" ? undefined : Number(e.target.value), artworkSizeOverrides: field.key === "logoSize" ? current.artworkSizeOverrides : {...current.artworkSizeOverrides, [field.key]: e.target.value === "" ? undefined : Number(e.target.value)}}))} className="mt-1 w-full rounded border p-2 text-slate-900"/></label>)}
        <button type="button" onClick={() => setConfig(current => ({...current, textSizes: undefined, logoSize: 64, signatureSize: 160, stampSize: 140, artworkSizeOverrides: undefined}))} className="self-end rounded border p-2 text-xs text-indigo-700">بازگردانی اندازه‌های پیش‌فرض</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">نتیجه در پیش‌نمایش دیده می‌شود. برای نگهداری، «ذخیره قالب عمومی» را بزنید. متن بلند هنگام فیت خودکار کوچک می‌شود؛ توضیح کالا کوچک‌تر از نام اصلی می‌ماند.</p>
    </details>
    <div className="flex flex-wrap gap-2 rounded-xl border bg-slate-50 p-3">
      {PROFORMA_TERM_PRESETS.map(preset => <button type="button" key={preset.id} onClick={() => addPreviewPreset(preset.id)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-800">{config.customNotes?.includes(preset.text) ? "✓ " : "+ "}{preset.label}</button>)}
      <button type="button" onClick={() => { const index = config.customNotes?.length || 0; setConfig(current => ({...current, customNotes: [...(current.customNotes || []), "New condition"]})); selectPreviewNote(index); }} className="rounded-lg bg-indigo-100 px-3 py-2 text-xs text-indigo-900">+ شرط جدید</button>
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-100">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-t-xl border-b bg-white p-3" aria-label="ابزار متن پیش‌نمایش">
        <b className="ml-auto text-sm">پیش‌نمایش زنده</b>
        <fieldset disabled={selectedNote === null} className="flex flex-wrap items-center gap-2 disabled:opacity-40">
          <button type="button" aria-label="پررنگ کردن متن انتخاب‌شده" title="Bold — پررنگ کردن شرط" aria-pressed={Boolean(selectedStyle.bold ?? config.termsStyle?.bold)} onClick={() => changeTerm(selectedKey, {bold: !(selectedStyle.bold ?? config.termsStyle?.bold)})} className={`rounded border px-3 py-1 font-bold ${selectedStyle.bold ?? config.termsStyle?.bold ? "border-indigo-600 bg-indigo-100 text-indigo-900" : "bg-white text-slate-800"}`}>B</button>
          <label className="text-xs">اندازه <input aria-label="اندازه متن انتخاب‌شده" type="number" min="6" max="30" step="0.5" value={selectedStyle.fontSizePt ?? config.termsStyle?.fontSizePt ?? 8} onChange={e => changeTerm(selectedKey, {fontSizePt: Number(e.target.value)})} className="w-16 rounded border p-1"/></label>
          <label className="text-xs">فاصله بعد <input aria-label="فاصله پاراگراف انتخاب‌شده" type="number" min="0" max="72" value={selectedStyle.spaceAfterPt ?? config.termsStyle?.spaceAfterPt ?? 6} onChange={e => changeTerm(selectedKey, {spaceAfterPt: Number(e.target.value)})} className="w-16 rounded border p-1"/></label>
          <select aria-label="تراز متن انتخاب‌شده" value={selectedStyle.align ?? config.termsStyle?.align ?? "left"} onChange={e => changeTerm(selectedKey, {align: e.target.value as "left" | "right" | "center" | "justify"})} className="rounded border p-1 text-xs"><option value="left">چپ‌چین</option><option value="center">وسط‌چین</option><option value="right">راست‌چین</option><option value="justify">دوطرفه (Justify)</option></select>
          <button type="button" aria-label="حذف شرط انتخاب‌شده" onClick={() => { if (selectedNote !== null) handleRemoveNote(selectedNote); setSelectedNote(null); }} className="rounded p-2 text-red-600"><Trash2 size={16}/></button>
        </fieldset>
      </div>
      <div className="max-h-[75vh] overflow-auto p-2 sm:p-5" dir="ltr">{documentPreview}</div>
    </div>
    <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm text-slate-600">تنظیمات بیشتر: فیلدها، لوگو و ظاهر</summary>{advancedSettings}</details>
  </div>;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh]">
        {printAllProgress && <div role="status" className="print:hidden bg-blue-50 p-2 text-center text-xs text-blue-900">{printAllProgress}</div>}
        {/* Top Control Bar (Hidden during print) */}
        <div className="p-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <FileText size={18} />
            </div>
            <div>
              <div className="font-bold text-xs flex items-center gap-2">
                <span>مدارک پرونده</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                  {order.ProformaInvoiceID}
                </span>
              </div>
              <InlineHelp><div className="text-[10px] text-slate-400">
                قالب رسمی بین‌المللی بازرگانی، منطبق بر استانداردهای تجارت خارجی
              </div></InlineHelp>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button type="button" onClick={onRefreshApp} className="flex items-center gap-1.5 rounded-xl border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-slate-600" title="رفرش اپ و بازگشت به همین پرونده"><RefreshCw size={14}/><span>رفرش</span></button>
            <button
              onClick={onClose}
              aria-label="بستن پیش‌نمایش اسناد"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* A single workspace keeps document selection, issuing data, preview and printing together. */}
        <section className="print:hidden border-b border-slate-200 bg-slate-50 px-4 py-3" dir="rtl" aria-label="پیش‌نمایش سند">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">پیش‌نمایش سند</h2>
              <p className="mt-0.5 text-[11px] text-slate-600">اطلاعات صدور از فرم یکپارچهٔ تب «مدارک» خوانده می‌شود. اینجا فقط نسخهٔ نهایی را بررسی و چاپ کنید.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {docType === "COO" && onUpdateOrder && <>
                <input ref={cooUploadInputRef} type="file" accept="application/pdf,image/*,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void uploadCooFile(file); event.target.value = ""; }}/>
                <button type="button" onClick={() => cooUploadInputRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-400"><Upload size={14}/><span>{activeCooFiles.length ? "جایگزینی فایل COO" : "آپلود مدرک COO"}</span></button>
                {activeCooFiles.length > 0 && <button type="button" onClick={removeCooFile} className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"><Trash2 size={14}/><span>بازگشت به نسخهٔ سیستمی</span></button>}
              </>}
              {docType === "COO" && selectedVisualTemplate && onSaveDocumentTemplate && <button type="button" onClick={() => { setInlineCooFields(selectedVisualTemplate.fields || []); setInlineCooSelectedId(null); setInlineCooSelectedIds([]); setInlineCooEditing((active) => !active); }} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm ${inlineCooEditing ? "border-amber-300 bg-amber-400 text-slate-950" : "border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400"}`}><Sliders size={14}/><span>{inlineCooEditing ? "پایان ویرایش فرم" : "ویرایش فرم COO"}</span></button>}
              <button type="button" onClick={() => handleOutputDocuments(true, "paper")} disabled={!canPrint || Boolean(printAllProgress)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" title="چاپ مستقیم مدرک روی کاغذ، بدون ساخت فایل PDF"><Printer size={15}/><span>چاپ مستقیم</span></button>
              <button type="button" onClick={() => handleOutputDocuments(true, "pdf")} disabled={!canPrint || Boolean(printAllProgress)} className="rounded-xl border px-3 py-1.5 text-xs font-bold text-slate-600">خروجی PDF</button>
              <button type="button" onClick={() => setShowDocumentPicker(true)} disabled={!canPrint || Boolean(printAllProgress)} title={canPrint ? "انتخاب و چاپ مجموعه مدارک" : "اجازه چاپ این نقش توسط مدیر ارشد فعال نشده است"} className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-sm ${canPrint ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-500 cursor-not-allowed opacity-70"}`}><Printer size={15}/><span>{canPrint ? "چاپ مجموعه" : "چاپ غیرفعال"}</span></button>
            </div>
          </div>
          {false && <div className="mt-3 flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 pb-2 text-xs">
            {([
              ["PI", "پروفورما (PI)"], ["SALES_CONTRACT", "Sales Contract"], ["COMMERCIAL_INVOICE", "Commercial Invoice"], ["PACKING_LIST", "Packing List"], ["COO", "COO"], ["COA", "COA"], ["BL", "BL"],
            ] as const).map(([type, label]) => <button key={type} type="button" onClick={() => setDocType(type)} aria-pressed={docType === type} className={`shrink-0 rounded-lg px-3 py-2 font-bold transition-colors ${docType === type ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{label}</button>)}
          </div>}
        </section>

        {false && (docType === "COMMERCIAL_INVOICE" || docType === "PACKING_LIST") && <div className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs" dir="rtl">
          <div><b className="text-amber-950">نوع مهر مدرک</b><p className="mt-0.5 text-[10px] text-amber-800">مهر انتخاب‌شده در همین سند چاپی اعمال می‌شود.</p></div>
          <div className="flex gap-1.5" dir="ltr">
            {(["ORIGINAL", "DRAFT", ""] as const).map((stamp) => {
              const current = docType === "COMMERCIAL_INVOICE" ? order.CommercialInvoiceStamp || "" : order.PackingListStamp || "";
              const setStamp = () => onUpdateOrder?.(docType === "COMMERCIAL_INVOICE" ? { ...order, CommercialInvoiceStamp: stamp } : { ...order, PackingListStamp: stamp });
              const title = stamp || "NO STAMP";
              return <button key={title} type="button" onClick={setStamp} className={`rounded border px-3 py-1.5 text-[11px] font-bold ${current === stamp ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-white text-red-700 hover:bg-red-50"}`}>{title}</button>;
            })}
          </div>
        </div>}
        {false && docType === "PACKING_LIST" && <section className="print:hidden border-b border-violet-200 bg-violet-50 px-4 py-3" dir="rtl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><b className="text-sm text-violet-950">حمل مرحله‌ای و مدارک تفکیک‌شده</b><p className="mt-1 max-w-3xl text-[11px] text-violet-800">فقط برای مدارک حمل است و هیچ اثری بر مبلغ اینویس، سود یا حسابداری پرونده ندارد. برای هر مرحله وزن، مقدار، شماره پکینگ‌لیست و مشخصات کامیون/کانتینر را تعیین کنید؛ مجموع مراحل باید با مقدار و وزن کل پرونده برابر باشد.</p></div>
            <button type="button" onClick={addPartialShipment} disabled={!onUpdateOrder} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} className="ml-1 inline"/>افزودن مرحله حمل</button>
          </div>
          {partialShipments.length > 0 && <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setActivePartialShipmentId(null)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${activePartialShipmentId === null ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-800"}`}>پکینگ‌لیست اصلی</button>
              {partialShipments.map((shipment, index) => <button key={shipment.id} type="button" onClick={() => setActivePartialShipmentId(shipment.id)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${activePartialShipmentId === shipment.id ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-800"}`}>{shipment.title || `Shipment ${index + 1}`}</button>)}
            </div>
            <div className="mt-3 grid gap-2 rounded-xl border border-violet-200 bg-white p-3 text-xs sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-2"><b>جمع مقدار تخصیص‌یافته:</b> <span dir="ltr" className={Math.abs(partialShipmentAllocatedQuantity - totalItemQuantity) < 0.0001 ? "font-mono text-emerald-700" : "font-mono text-rose-700"}>{formatEnglishNumber(partialShipmentAllocatedQuantity, 2)} / {formatEnglishNumber(totalItemQuantity, 2)} MT</span></div>
              <div className="rounded-lg bg-slate-50 p-2"><b>جمع وزن تخصیص‌یافته:</b> <span dir="ltr" className={Math.abs(partialShipmentAllocatedWeight - itemGrossWeightTotal) < 0.01 ? "font-mono text-emerald-700" : "font-mono text-rose-700"}>{formatNumber(partialShipmentAllocatedWeight)} / {formatNumber(itemGrossWeightTotal)} KG</span></div>
            </div>
            {activePartialShipment && <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><b className="text-xs text-violet-950">تنظیمات {activePartialShipment.title}</b><div className="flex gap-2"><button type="button" onClick={() => fillShipmentWithRemaining(activePartialShipment.id)} className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-800">پر کردن باقیمانده</button><button type="button" onClick={() => removePartialShipment(activePartialShipment.id)} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700"><Trash2 size={12} className="ml-1 inline"/>حذف مرحله</button></div></div>
              <div className="grid gap-2 sm:grid-cols-5"><label>عنوان مرحله<input value={activePartialShipment.title} onChange={(event) => updatePartialShipment(activePartialShipment.id, { title: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-slate-900"/></label><label>شماره Packing List<input value={activePartialShipment.packingListId || ""} onChange={(event) => updatePartialShipment(activePartialShipment.id, { packingListId: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 font-mono text-slate-900"/></label><label>تاریخ حمل<input type="date" value={activePartialShipment.date || ""} onChange={(event) => updatePartialShipment(activePartialShipment.id, { date: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-slate-900"/></label><label>شماره کامیون<input value={activePartialShipment.truckNo || ""} onChange={(event) => updatePartialShipment(activePartialShipment.id, { truckNo: event.target.value })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 text-slate-900"/></label><label>وزن خالص (KG)<input type="number" min="0" step="any" value={activePartialShipment.netWeight ?? ""} onChange={(event) => updatePartialShipment(activePartialShipment.id, { netWeight: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-violet-200 px-2 py-1.5 font-mono text-slate-900"/></label></div>
              <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50/40 p-2"><div className="mb-1 flex items-center justify-between"><b className="text-[11px] text-violet-950">کانتینر و Seal این مرحله</b><button type="button" onClick={() => updatePartialShipment(activePartialShipment.id, { containerSealEntries: [...(activePartialShipment.containerSealEntries || []), { containerNo: "", sealNo: "" }] })} className="text-[11px] font-bold text-violet-700"><Plus size={12} className="ml-1 inline"/>افزودن کانتینر</button></div>{(activePartialShipment.containerSealEntries || []).length ? <div className="space-y-1">{(activePartialShipment.containerSealEntries || []).map((entry, entryIndex) => <div key={entryIndex} className="grid gap-1 sm:grid-cols-[1fr_1fr_auto]"><input value={entry.containerNo} placeholder="Container No." onChange={(event) => { const entries = [...(activePartialShipment.containerSealEntries || [])]; entries[entryIndex] = { ...entry, containerNo: event.target.value }; updatePartialShipment(activePartialShipment.id, { containerSealEntries: entries }); }} className="rounded border border-violet-200 px-2 py-1"/><input value={entry.sealNo} placeholder="Seal No." onChange={(event) => { const entries = [...(activePartialShipment.containerSealEntries || [])]; entries[entryIndex] = { ...entry, sealNo: event.target.value }; updatePartialShipment(activePartialShipment.id, { containerSealEntries: entries }); }} className="rounded border border-violet-200 px-2 py-1"/><button type="button" onClick={() => updatePartialShipment(activePartialShipment.id, { containerSealEntries: (activePartialShipment.containerSealEntries || []).filter((_, index) => index !== entryIndex) })} className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700"><Trash2 size={12}/></button></div>)}</div> : <span className="text-[11px] text-slate-500">برای حمل زمینی فقط شماره کامیون کافی است.</span>}</div>
              <div className="mt-2 flex flex-wrap gap-3"><span className="font-bold text-slate-700">مدارک تفکیک‌شونده:</span>{(["PACKING_LIST", "COO", "COMMERCIAL_INVOICE"] as PartialShipmentDocumentType[]).map((documentType) => <label key={documentType} className="flex items-center gap-1"><input type="checkbox" checked={activePartialShipment.documents.includes(documentType)} onChange={(event) => updatePartialShipment(activePartialShipment.id, event.target.checked ? { documents: [...new Set([...activePartialShipment.documents, documentType])], ...(documentType === "COO" ? { cooId: activePartialShipment.cooId || randomDigits(7), cooBarcodeNo: activePartialShipment.cooBarcodeNo || cooBarcodeFor(activePartialShipment.cooId || randomDigits(7)) } : {}) } : { documents: activePartialShipment.documents.filter((entry) => entry !== documentType) })}/> {documentType === "PACKING_LIST" ? "Packing List" : documentType === "COO" ? "COO" : "Commercial Invoice"}</label>)}</div>
              <div className="mt-3 overflow-x-auto"><table className="min-w-[680px] w-full border-collapse text-xs"><thead><tr className="border-b border-violet-200 text-slate-600"><th className="p-1 text-right">کالا</th><th className="p-1 text-center">مقدار (MT)</th><th className="p-1 text-center">وزن ناخالص (KG)</th><th className="p-1 text-right">بسته‌بندی</th></tr></thead><tbody>{items.map((item, index) => { const orderDetailId = item.OrderDetailID || index; const entry = activePartialShipment.items.find((value) => value.orderDetailId === orderDetailId) || { orderDetailId, quantity: 0, grossWeight: 0, packages: currentPackingFor(item) }; const updateEntry = (changes: Partial<typeof entry>) => updatePartialShipment(activePartialShipment.id, { items: [...activePartialShipment.items.filter((value) => value.orderDetailId !== orderDetailId), { ...entry, ...changes }] }); return <tr key={orderDetailId} className="border-b border-slate-100"><td className="p-1.5 text-slate-800">{currentProductNameFor(item) || `Item ${index + 1}`}</td><td className="p-1"><input type="number" min="0" step="any" value={entry.quantity} onChange={(event) => updateEntry({ quantity: Number(event.target.value) || 0 })} className="w-full rounded border border-slate-200 px-2 py-1 text-center font-mono"/></td><td className="p-1"><input type="number" min="0" step="any" value={entry.grossWeight} onChange={(event) => updateEntry({ grossWeight: Number(event.target.value) || 0 })} className="w-full rounded border border-slate-200 px-2 py-1 text-center font-mono"/></td><td className="p-1"><input value={entry.packages || ""} onChange={(event) => updateEntry({ packages: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1"/></td></tr>; })}</tbody></table></div>
            </div>}
          </>}
        </section>}
        {docType === "SALES_CONTRACT" && <section className="print:hidden border-b border-sky-200 bg-sky-50 px-4 py-2" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><b className="text-xs text-sky-950">اصلاح ارقام چاپ Sales Contract</b><span className="mr-2 text-[10px] text-sky-800">فقط نسخه چاپی؛ بدون تغییر در اطلاعات و حسابداری پرونده</span></div><button type="button" onClick={() => salesContractPrintEnabled ? setSalesContractPrintEnabled(false) : enableSalesContractPrintEdits()} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${salesContractPrintEnabled ? "border-sky-600 bg-sky-600 text-white" : "border-sky-300 bg-white text-sky-900 hover:bg-sky-100"}`}>{salesContractPrintEnabled ? "خاموش‌کردن اصلاح چاپ" : "فعال‌کردن اصلاح چاپ"}</button></div>
          {salesContractPrintEnabled && <div className="mt-2 rounded-lg border border-sky-200 bg-white p-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr]"><label className="text-[10px] text-slate-600">ارز چاپ<select value={salesContractPrintCurrency} onChange={(event) => { setSalesContractPrintTotalOverride(null); setSalesContractPrintCurrency(event.target.value); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs">{Array.from(new Set([salesContractPrintCurrency, "USD", "EUR", "AED", "TRY", "CAD", "CNY", "IRR"])).map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="text-[10px] text-slate-600">نرخ تبدیل ({salesContractCurrency} به {salesContractPrintCurrency})<input type="number" min="0.0000001" step="any" value={salesContractPrintRate} onChange={(event) => { setSalesContractPrintTotalOverride(null); setSalesContractPrintRate(Math.max(0.0000001, Number(event.target.value) || 0.0000001)); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs" /></label></div>
            <div className="mt-2 space-y-1">{printedItems.map((row) => { const key = printFigureKey(row.item, row.index); const values = salesContractPrintRows[key] || { quantity: row.quantity, unitPriceBase: row.unitPrice / (conversionRate || 1), grossWeight: row.grossWeight }; return <div key={key} className="grid items-center gap-1.5 rounded bg-slate-50 px-2 py-1 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem]"><span className="truncate text-[11px] font-semibold text-slate-700">{currentProductNameFor(row.item) || `Item ${row.index + 1}`}</span><label className="text-[9px] text-slate-500">تعداد<input type="number" min="0" step="any" value={values.quantity} onChange={(event) => { setSalesContractPrintTotalOverride(null); setSalesContractPrintRows((current) => ({ ...current, [key]: { ...values, quantity: Number(event.target.value) || 0 } })); }} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs" /></label><label className="text-[9px] text-slate-500">قیمت واحد ({salesContractPrintCurrency})<input type="number" min="0" step="any" value={values.unitPriceBase * conversionRate} onChange={(event) => { setSalesContractPrintTotalOverride(null); setSalesContractPrintRows((current) => ({ ...current, [key]: { ...values, unitPriceBase: (Number(event.target.value) || 0) / (conversionRate || 1) } })); }} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs" /></label><label className="text-[9px] text-slate-500">وزن ناخالص (KG)<input type="number" min="0" step="any" value={values.grossWeight} onChange={(event) => setSalesContractPrintRows((current) => ({ ...current, [key]: { ...values, grossWeight: Number(event.target.value) || 0 } }))} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs" /></label></div>; })}</div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2"><label className="text-[9px] text-slate-500">Freight ({salesContractPrintCurrency})<input type="number" min="0" step="any" value={printedFreight} onChange={(event) => { setSalesContractPrintTotalOverride(null); setSalesContractPrintFreightOverride(Number(event.target.value) || 0); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs" /></label><label className="text-[9px] text-slate-500">مبلغ نهایی ({salesContractPrintCurrency})<input type="number" min="0" step="any" value={totalAmountDue} onChange={(event) => setSalesContractPrintTotalAndReprice(Number(event.target.value) || 0)} className="mt-0.5 w-full rounded border border-sky-300 px-2 py-1 text-xs font-bold" /></label></div>
          </div>}
        </section>}

        {docType === "COMMERCIAL_INVOICE" && !isSplitCommercialInvoice && <section className={`print:hidden border-b px-4 py-2 ${dummyInvoiceEnabled ? "border-amber-400 bg-amber-100" : "border-slate-200 bg-slate-50"}`} dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><b className="text-xs text-amber-950">{dummyInvoiceEnabled ? "DUMMY — اطلاعات غیرواقعی Commercial Invoice" : "اصلاح ارقام چاپ Commercial Invoice"}</b><span className="mr-2 text-[10px] text-amber-800">فقط نسخهٔ چاپی؛ بدون تغییر در حسابداری و سود</span></div>
            <button type="button" onClick={() => dummyInvoiceEnabled ? setDummyInvoiceEnabled(false) : enableDummyCommercialInvoice()} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${dummyInvoiceEnabled ? "border-amber-500 bg-amber-500 text-white" : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100"}`}>{dummyInvoiceEnabled ? "خاموش‌کردن Dummy" : "فعال‌کردن Dummy"}</button>
          </div>
          {dummyInvoiceEnabled && <div className="mt-2 rounded-lg border border-amber-200 bg-white p-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto]">
              <label className="text-[10px] text-slate-600">ارز فاکتور چاپ<select value={dummyInvoiceCurrency} onChange={(event) => { setDummyInvoiceTotalOverride(null); setDummyInvoiceCurrency(event.target.value); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900">{Array.from(new Set([dummyInvoiceCurrency, "USD", "EUR", "AED", "TRY", "CAD", "CNY", "IRR"])).map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="text-[10px] text-slate-600">نرخ ({agreementCurrency} به {dummyInvoiceCurrency})<input type="number" min="0.0000001" step="any" value={dummyInvoiceRate} onChange={(event) => { setDummyInvoiceTotalOverride(null); setDummyInvoiceRate(Math.max(0.0000001, Number(event.target.value) || 0.0000001)); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs text-slate-900" /></label>
            </div>
            <div className="mt-2 space-y-1">{printedItems.map((row) => { const key = printFigureKey(row.item, row.index); const values = dummyInvoiceRows[key] || { quantity: row.quantity, unitPriceBase: row.unitPrice / (conversionRate || 1), grossWeight: row.grossWeight }; return <div key={key} className="grid items-center gap-1.5 rounded bg-slate-50 px-2 py-1 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem]"><span className="truncate text-[11px] font-semibold text-slate-700" title={currentProductNameFor(row.item)}>{currentProductNameFor(row.item) || `Item ${row.index + 1}`}</span><label className="text-[9px] text-slate-500">تعداد<input type="number" min="0" step="any" value={values.quantity} onChange={(event) => { setDummyInvoiceTotalOverride(null); setDummyInvoiceRows((current) => ({ ...current, [key]: { ...values, quantity: Number(event.target.value) || 0 } })); }} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-900" /></label><label className="text-[9px] text-slate-500">قیمت واحد ({dummyInvoiceCurrency})<input type="number" min="0" step="any" value={values.unitPriceBase * conversionRate} onChange={(event) => { setDummyInvoiceTotalOverride(null); setDummyInvoiceRows((current) => ({ ...current, [key]: { ...values, unitPriceBase: (Number(event.target.value) || 0) / (conversionRate || 1) } })); }} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-900" /></label><label className="text-[9px] text-slate-500">وزن ناخالص (KG)<input type="number" min="0" step="any" value={values.grossWeight} onChange={(event) => setDummyInvoiceRows((current) => ({ ...current, [key]: { ...values, grossWeight: Number(event.target.value) || 0 } }))} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-900" /></label></div>; })}</div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2"><label className="text-[9px] text-slate-500">Freight ({dummyInvoiceCurrency})<input type="number" min="0" step="any" value={printedFreight} onChange={(event) => { setDummyInvoiceTotalOverride(null); setDummyInvoiceFreightOverride(Number(event.target.value) || 0); }} className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900" /></label><label className="text-[9px] text-slate-500">مبلغ نهایی ({dummyInvoiceCurrency})<input type="number" min="0" step="any" value={totalAmountDue} onChange={(event) => setDummyTotalAndReprice(Number(event.target.value) || 0)} className="mt-0.5 w-full rounded border border-amber-300 px-2 py-1 text-xs font-bold text-slate-900" /></label></div>
          </div>}
        </section>}

        {(docType === "PI" || docType === "PACKING_LIST" || isSplitDocument) && <div data-print-corrections className="print:hidden border-b border-indigo-200 bg-indigo-50 px-4 py-2.5" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><b className="text-xs text-indigo-950">اصلاح اختیاری ارقام چاپی</b><InlineHelp><p className="mt-0.5 text-[10px] text-indigo-700">در حالت عادی، ارقام محاسبه‌شدهٔ پرونده چاپ می‌شوند. اصلاح دستی برای نسخهٔ چاپی این سند ذخیره می‌شود و محاسبات مالی پرونده را تغییر نمی‌دهد.</p></InlineHelp></div>
            <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setManualPrintFigures((active) => { const next = !active; if (next) setUseCorrectedFiguresForPdf(true); return next; })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${manualPrintFigures ? "border-amber-400 bg-amber-400 text-slate-950" : "border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"}`}>{manualPrintFigures ? "اصلاح دستی فعال است" : "فعال‌کردن اصلاح دستی"}</button>
<button type="button" onClick={savePrintFigures} disabled={!onUpdateOrder} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">ذخیره اصلاحات چاپی</button>
            </div>
          </div>
          {printSaveMessage && <span role="status" className="text-xs text-indigo-800">{printSaveMessage}</span>}
          {manualPrintFigures && <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between"><b className="text-xs text-slate-800">ارقام این نسخهٔ چاپی</b><button type="button" onClick={() => { setPrintFigureOverrides({}); setManualPrintedFreight(null); setManualTotalAmountDue(null); }} className="text-[10px] font-bold text-rose-600 hover:underline">بازگردانی ارقام محاسبه‌شده</button></div>
            <div className="space-y-2">{items.map((item, index) => { const key = printFigureKey(item, index); const override = printFigureOverrides[key] || {}; const stageItem = isSplitDocument ? shipmentItemFor(item, index) : undefined; if (isSplitDocument && !stageItem) return null; const productName = currentProductNameFor(item); return <div key={key} className="grid gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]"><span className="self-center truncate text-xs font-semibold text-slate-700" title={productName}>{productName || `Item ${index + 1}`}</span><label className="text-[10px] text-slate-500">Quantity<input type="number" step="any" value={override.quantity ?? (isSplitDocument ? Number(stageItem?.quantity || 0) : Number(item.Quantity || 0))} onChange={(event) => setPrintFigureOverrides((current) => ({ ...current, [key]: { ...current[key], quantity: Number(event.target.value) || 0 } }))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900" /></label><label hidden={docType === "COO" || docType === "PACKING_LIST"} className="text-[10px] text-slate-500">Unit price<input type="number" step="any" value={override.unitPrice ?? printInvoiceUnitPrice(item)} onChange={(event) => setPrintFigureOverrides((current) => ({ ...current, [key]: { ...current[key], unitPrice: Number(event.target.value) || 0 } }))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900" /></label><label className="text-[10px] text-slate-500">Gross weight<input type="number" step="any" value={override.grossWeight ?? (isSplitDocument ? Number(stageItem?.grossWeight || 0) : Number(item.GrossWeight || ((Number(item.Quantity) || 0) * 1000 * 1.05)))} onChange={(event) => setPrintFigureOverrides((current) => ({ ...current, [key]: { ...current[key], grossWeight: Number(event.target.value) || 0 } }))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900" /></label></div>; })}</div>
            {docType !== "PACKING_LIST" && docType !== "COO" && <div className="mt-2 grid max-w-sm gap-2 sm:grid-cols-2"><label className="text-[10px] text-slate-500">Freight<input type="number" step="any" value={printedFreight} onChange={(event) => { const next = Number(event.target.value) || 0; setManualPrintedFreight(next); if (manualTotalAmountDue !== null) applyInverseUnitPrices(manualTotalAmountDue - next); }} className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900" /></label><label className="text-[10px] text-slate-500">Total Amount Due<input type="number" step="any" value={totalAmountDue} onChange={(event) => { const next = Number(event.target.value) || 0; const freight = manualPrintedFreight ?? basePrintedFreight; setManualTotalAmountDue(next); applyInverseUnitPrices(next - freight); }} className="mt-1 w-full rounded border border-indigo-300 px-2 py-1 text-xs font-bold text-slate-900" /></label></div>}
          </div>}
        </div>}

        {/* Live Template Customizer Drawer (Top/Side Collapsible Panel) */}

        {inlineCooEditing && selectedVisualTemplate && <div className="print:hidden border-b border-amber-200 bg-amber-50 p-3 text-xs text-slate-800"><div className="flex flex-wrap items-center gap-2"><b className="text-amber-950">ویرایش مستقیم COO:</b><InlineHelp><span className="text-slate-600">برای انتخاب چندتایی Ctrl/Cmd یا Shift را نگه دارید؛ سپس یکی از فیلدهای انتخاب‌شده را بکشید.</span></InlineHelp><button type="button" onClick={addInlineCooField} className="rounded-lg bg-amber-500 px-2.5 py-1.5 font-bold text-slate-950">+ متن / فیلد جدید</button><button type="button" onClick={saveInlineCooLayout} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white">ذخیرهٔ چیدمان</button><button type="button" onClick={() => { setInlineCooFields(selectedVisualTemplate.fields || []); setInlineCooSelectedId(null); setInlineCooSelectedIds([]); setInlineCooEditing(false); }} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold">لغو</button></div>{inlineCooSelectedField && <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-amber-200 bg-white p-2 sm:grid-cols-6"><label>متن<input value={inlineCooSelectedField.source === "custom" ? inlineCooSelectedField.customValue || "" : inlineCooSelectedField.label} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, inlineCooSelectedField.source === "custom" ? { customValue: event.target.value } : { label: event.target.value })} className="mt-1 w-full rounded border p-1"/></label><label>فونت<select value={inlineCooSelectedField.fontFamily} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { fontFamily: event.target.value })} className="mt-1 w-full rounded border p-1"><option>Public Sans</option><option>Arial</option><option>Bebas Neue</option><option>Times New Roman</option><option>Arial Narrow</option><option>Tahoma</option></select></label><label>اندازه<input type="number" min="6" max="72" value={inlineCooSelectedField.fontSize} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { fontSize: Number(event.target.value) })} className="mt-1 w-full rounded border p-1"/></label><label>X<input type="number" step="0.1" value={inlineCooSelectedField.x} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { x: Number(event.target.value) })} className="mt-1 w-full rounded border p-1"/></label><label>Y<input type="number" step="0.1" value={inlineCooSelectedField.y} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { y: Number(event.target.value) })} className="mt-1 w-full rounded border p-1"/></label><label>عرض<input type="number" step="0.1" value={inlineCooSelectedField.width} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { width: Number(event.target.value) })} className="mt-1 w-full rounded border p-1"/></label><label className="flex items-end gap-1"><input type="checkbox" checked={inlineCooSelectedField.bold} onChange={(event) => updateInlineCooField(inlineCooSelectedField.id, { bold: event.target.checked })}/> ضخیم</label><button type="button" onClick={() => { setInlineCooFields((fields) => fields.filter((field) => !inlineCooSelectedIds.includes(field.id))); setInlineCooSelectedId(null); setInlineCooSelectedIds([]); }} className="self-end rounded bg-rose-100 px-2 py-1.5 font-bold text-rose-700">حذف انتخاب‌شده‌ها</button></div>}</div>}

        {false && docType === "COO" && <section className="print:hidden border-b border-indigo-200 bg-indigo-50 p-3 text-xs text-slate-800"><div className="mb-2 font-bold text-indigo-950">اطلاعات صدور Certificate of Origin (COO)</div><div className="grid gap-2 sm:grid-cols-2"><label className="font-medium">شمارهٔ COO<input value={order.COOId || ""} placeholder={order.ProformaInvoiceID || "COO number"} onChange={(event) => onUpdateOrder?.({ ...order, COOId: event.target.value })} className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 font-mono text-sm text-slate-900" /></label><label className="font-medium">تاریخ COO<input type="date" value={order.COODate || commercialDocumentDateFor(order)} onChange={(event) => onUpdateOrder?.({ ...order, COODate: event.target.value })} className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 font-mono text-sm text-slate-900" /></label></div><p className="mt-2 text-[11px] text-indigo-700">این مقادیر فقط برای COO هستند و مستقیماً در پیش‌نمایش و PDF همین مدرک استفاده می‌شوند.</p></section>}

        {/* Printable Document Paper Area (A4 layout in English matching the exact sample PDF) */}
        {documentPreview}
      </div>
      {showLayoutEditor && templateEditorDb && onSaveDocumentTemplate && onDeleteDocumentTemplate && onSaveCustomFont && onDeleteCustomFont && onApplyAppFont && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/75 p-2 sm:p-5 print:hidden" dir="rtl">
          <div className="mx-auto w-full max-w-[1500px] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div><b className="text-sm text-slate-900">ویرایش چیدمان قالب</b><p className="mt-0.5 text-[11px] text-slate-500">فقط محل، اندازه و ظاهر فیلدهای سند تغییر می‌کند؛ اطلاعات پرونده ثابت می‌ماند.</p></div>
              <button type="button" onClick={() => setShowLayoutEditor(false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"><X size={14} className="ml-1 inline"/>بازگشت به سند</button>
            </div>
            <DocumentTemplatesSettings db={templateEditorDb} onSave={onSaveDocumentTemplate} onDelete={onDeleteDocumentTemplate} onSaveFont={onSaveCustomFont} onDeleteFont={onDeleteCustomFont} onApplyAppFont={onApplyAppFont}/>
          </div>
        </div>
      )}
      {showDocumentPicker && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 print:hidden" dir="rtl">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div><h3 className="font-bold text-slate-900">انتخاب مدارک چاپ</h3><p className="mt-1 text-xs text-slate-500">مدارک انتخاب‌شده مستقیماً چاپ می‌شوند؛ خروجی PDF دکمهٔ جداگانه دارد.</p></div>
              <button type="button" onClick={closeDocumentPicker} className="rounded-lg bg-slate-100 p-2 text-slate-600"><X size={16}/></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["COVER", "Cover Letter", true],
                ["PI", "Proforma Invoice (PI)", true],
                ["SALES_CONTRACT", "Sales Contract", true],
                ["COMMERCIAL_INVOICE", "Commercial Invoice", true],
                ["PACKING_LIST", "Packing List", true],
                ["COO", "Certificate of Origin (COO)", true],
                ["COA", "Certificate of Analysis (COA)", Boolean(order.coaFiles?.length)],
                ["BL", "Bill of Lading (BL)", Boolean(order.blFiles?.length)],
              ].map(([key, label, available]) => <label key={String(key)} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${available ? "cursor-pointer border-slate-200 bg-white hover:border-indigo-300" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"}`}>
                <input type="checkbox" disabled={!available} checked={Boolean(available && selectedBundleDocs[String(key)])} onChange={(event) => setSelectedBundleDocs((current) => ({ ...current, [String(key)]: event.target.checked }))} className="h-4 w-4 accent-indigo-600"/>
                <span className="font-medium">{String(label)}</span>
                {!available && <span className="mr-auto text-[10px]">فایلی ثبت نشده</span>}
              </label>)}
            </div>
            {manualPrintFigures && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><input type="checkbox" checked={useCorrectedFiguresForPdf} onChange={(event) => setUseCorrectedFiguresForPdf(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600"/><span><b className="block">چاپ با ارقام اصلاح‌شدهٔ این پیش‌نمایش</b><span className="mt-1 block text-[10px] text-amber-800">به‌صورت پیش‌فرض، چاپ با پیش‌نمایش یکسان است. با برداشتن تیک، ارقام اصلی و محاسبه‌شدهٔ پرونده استفاده می‌شوند.</span></span></label>}
            {selectedBundleDocs.COA && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-slate-800"><input type="checkbox" checked={includeCoaHeaderFooter} onChange={(event) => setIncludeCoaHeaderFooter(event.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-600"/><span><b className="block">سربرگ و فوتر برای COA آپلودشده</b><span className="mt-1 block text-[10px] text-slate-600">با تیک: COA با لوگو، شماره، تاریخ و فوتر برنامه صادر می‌شود. بدون تیک: صفحات PDF دقیقاً با ظاهر اصلی فایل آپلودشده چاپ می‌شوند.</span></span></label>}
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left font-mono text-xs text-slate-600" dir="ltr">SDoc-{order.ProformaInvoiceID}.pdf</div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => handleOutputDocuments(false, "paper")} disabled={Boolean(printAllProgress) || !Object.values(selectedBundleDocs).some(Boolean)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Printer size={16}/>{printAllProgress || "چاپ مستقیم روی کاغذ"}</button>
              <button type="button" onClick={() => handleOutputDocuments(false, "pdf")} disabled={Boolean(printAllProgress) || !Object.values(selectedBundleDocs).some(Boolean)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Layers size={16}/>{printAllProgress || "دانلود PDF"}</button>
              <button type="button" onClick={closeDocumentPicker} disabled={Boolean(printAllProgress)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
