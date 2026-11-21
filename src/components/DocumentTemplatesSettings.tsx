import { InlineHelp } from "./InlineHelp";
import { commercialTemplateOptions } from "../utils/commercialTemplateOptions";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppDatabase, CustomFont, DocumentTemplate, DocumentTemplateField, PrintTemplateConfig, Order } from "../types";
import { AlignCenter, AlignEndVertical, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, AlignStartVertical, AlignVerticalJustifyCenter, Bold, ChevronLeft, ChevronRight, Eye, FileText, ImagePlus, Layers, ListPlus, Lock, Maximize2, Minimize2, Minus, MousePointer2, Move, Palette, Plus, Save, Square, TextCursorInput, Trash2, Type, Upload, X } from "lucide-react";

const LiveDocument = React.lazy(() => import("./ProformaPrintModal").then(module => ({default: module.ProformaPrintModal})));
const ProformaSettings = React.lazy(() => import("./ProformaSettings").then(module => ({default: module.ProformaSettings})));

type DocType = DocumentTemplate["documentType"];
const docTypes: { id: DocType; label: string }[] = [
  { id: "PI", label: "Proforma Invoice" }, { id: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { id: "PACKING_LIST", label: "Packing List" }, { id: "COO", label: "Certificate of Origin" },
  { id: "COA", label: "Certificate of Analysis" }, { id: "BL", label: "Bill of Lading" }, { id: "COVER", label: "Cover Letter" },
];
const themes = commercialTemplateOptions.map(template => template.id);
const fieldLibrary = [
  ["exporterBlock", "Exporter (full block)"], ["consigneeBlock", "Consignee (full block)"], ["invoiceNumberDate", "Invoice No. / Date"],
  ["transportDetails", "Transport Details"], ["etd", "Estimated Departure"], ["goodsDescription", "Goods Description"],
  ["quantityDetails", "Quantity & Unit"], ["weightDetails", "Net / Gross Weight"], ["marksNumbers", "Marks & Numbers"], ["remarks", "Remarks"],
  ["proformaNumber", "Proforma Invoice No."], ["proformaDate", "Proforma Invoice Date"], ["documentNumber", "Document No."], ["documentDate", "Document Date"], ["supplierName", "Exporter / Seller"],
  ["customerName", "Buyer"], ["customerAddress", "Buyer Address"], ["countryOfOrigin", "Country of Origin"],
  ["countryOfDestination", "Country of Destination"], ["portOfLoading", "Port of Loading"],
  ["portOfDischarge", "Port of Discharge"], ["transportMode", "Transport Method"], ["transportMeans", "Transport Means"],
  ["freight", "Freight"], ["deliveryTerms", "Terms of Delivery"], ["paymentTerms", "Terms of Payment"],
  ["currency", "Transaction Currency"], ["productName", "Product"], ["quantity", "Quantity"], ["grossWeight", "Gross Weight"], ["hsCode", "HS Code"],
];
const newField = (source: string, label: string, index: number): DocumentTemplateField => ({ id: `field-${Date.now()}-${index}`, label, source, x: 8, y: 8 + index * 6, width: 28, height: 5, fontFamily: "Public Sans", fontSize: 11, bold: false, align: "left" });
const systemTemplate = (documentType: DocType, theme: typeof themes[number]): DocumentTemplate => {
  const title = documentType === "PI" ? "PROFORMA INVOICE" : documentType === "COMMERCIAL_INVOICE" ? "COMMERCIAL INVOICE" : documentType === "PACKING_LIST" ? "PACKING LIST" : documentType === "COVER" ? "COVER LETTER" : documentType;
  const fields = [
    { ...newField("custom", title, 0), id: `system-${documentType}-title`, customValue: title, x: 8, y: 6, width: 84, height: 6, fontSize: 18, bold: true, align: "center" as const },
    { ...newField("supplierName", "Exporter / Seller", 1), id: `system-${documentType}-supplier`, x: 8, y: 18, width: 39, height: 8 },
    { ...newField("customerName", "Buyer", 2), id: `system-${documentType}-customer`, x: 53, y: 18, width: 39, height: 8 },
    { ...newField("documentNumber", "Document No.", 3), id: `system-${documentType}-number`, x: 8, y: 30, width: 39, height: 4 },
    { ...newField("documentDate", "Document Date", 4), id: `system-${documentType}-date`, x: 53, y: 30, width: 39, height: 4 },
    { ...newField(documentType === "COVER" ? "custom" : "goodsDescription", documentType === "COVER" ? "متن نامه را اینجا بنویسید" : "Goods Description", 5), id: `system-${documentType}-body`, customValue: documentType === "COVER" ? "متن نامه را اینجا بنویسید" : undefined, x: 8, y: 42, width: 84, height: 30, fontSize: 11 },
  ];
  return { id: `builtin-system-${documentType}-${theme}`, name: `طرح پایه قابل ویرایش · ${title}`, documentType, theme, country: "", issuerCompanyId: "", fields, isBuiltIn: true, isActive: true, createdAt: "2026-01-01T00:00:00.000Z" };
};
const RibbonButton: React.FC<{ label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; onClick?: () => void; active?: boolean }> = ({ label, icon: Icon, onClick, active }) => <button type="button" onClick={onClick} title={label} className={`group flex min-w-13 flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[9px] transition-colors ${active ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-indigo-700"}`}><Icon size={22} strokeWidth={1.6}/><span className="max-w-16 truncate">{label}</span></button>;

export const DocumentTemplatesSettings: React.FC<{ db: AppDatabase; onSave: (template: DocumentTemplate) => void; onDelete: (id: string) => void; onSaveFont: (font: CustomFont) => void; onDeleteFont: (id: string) => void; onApplyAppFont: (family: string) => void; onSavePrintTemplateConfig?: (config: PrintTemplateConfig) => void; onSaveOrder?: (order: Order) => void }> = ({ db, onSave, onDelete, onSaveFont, onDeleteFont, onApplyAppFont, onSavePrintTemplateConfig, onSaveOrder }) => {
  const [editorMode, setEditorMode] = useState<"standard" | "designer">(onSavePrintTemplateConfig ? "standard" : "designer");
  const [documentType, setDocumentType] = useState<DocType>("PI");
  const [theme, setTheme] = useState<typeof themes[number]>(db.printTemplateConfig?.templateStyle || "standard_berakem");
  useEffect(() => { if (editorMode === "standard" && db.printTemplateConfig?.templateStyle) setTheme(db.printTemplateConfig.templateStyle); }, [db.printTemplateConfig?.templateStyle]);
  const [country, setCountry] = useState("");
  const [issuerCompanyId, setIssuerCompanyId] = useState("");
  const [name, setName] = useState("");
  const [imageData, setImageData] = useState<string | undefined>();
  const [previewOrderId, setPreviewOrderId] = useState<number | undefined>(db.orders[0]?.OrderID);
  const [layoutKind, setLayoutKind] = useState<"standard" | "free">("standard");
  const [canvasScale, setCanvasScale] = useState(650 / 794);
  const [fields, setFields] = useState<DocumentTemplateField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState<{ id: string; mode: "move" | "resize"; offsetX: number; offsetY: number; startX?: number; startY?: number; startWidth?: number; startHeight?: number } | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [canvasBackground, setCanvasBackground] = useState("#ffffff");
  const [ribbonTab, setRibbonTab] = useState<"design" | "arrange" | "format">("design");
  const [propertyTab, setPropertyTab] = useState<"format" | "data" | "other">("format");
  const [toolbarOrientation, setToolbarOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [fullscreen, setFullscreen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  useEffect(() => { document.body.style.overflow = fullscreen ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [fullscreen]);
  const [preview, setPreview] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const skipAutoLoad = useRef(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = fields.find((field) => field.id === selectedFieldId);
  const matchingTemplates = useMemo(() => (db.documentTemplates || []).filter((item) => item.documentType === documentType), [db.documentTemplates, documentType]);
  const fontOptions = ["Public Sans", "Arial", "Bebas Neue", "Arial Narrow", "Times New Roman", "Calibri", "Tahoma", ...(db.customFonts || []).map((font) => font.family)];
  const uploadFont = (file?: File) => {
    if (!file) return; const name = file.name.replace(/\.(ttf|otf|woff2?|eot)$/i, "").trim(); const family = name.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, "") || `ARCAFont${Date.now()}`;
    const reader = new FileReader(); reader.onload = () => onSaveFont({ id: `font-${Date.now()}`, name, family, mimeType: file.type || "font/ttf", data: String(reader.result), createdAt: new Date().toISOString() }); reader.readAsDataURL(file);
  };

  const loadTemplate = (stored: DocumentTemplate) => {
    const template = stored.isBuiltIn && !stored.fields?.length && !stored.imageData ? {...stored, fields: systemTemplate(stored.documentType, (stored.theme || theme) as typeof themes[number]).fields} : stored;
    skipAutoLoad.current = template.documentType !== documentType || template.theme !== theme;
    setSaveMessage("");
    setEditingId(template.id); setDocumentType(template.documentType); setTheme(themes.includes(template.theme as typeof themes[number]) ? template.theme as typeof themes[number] : "standard_berakem");
    setCountry(template.country || ""); setIssuerCompanyId(template.issuerCompanyId || ""); setName(template.name);
    setImageData(template.imageData); setCanvasBackground(template.backgroundColor || "#ffffff"); setLayoutKind((template.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(template.documentType)) || template.layoutMode === "standard" ? "standard" : "free"); setFields(template.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(template.documentType) ? [] : template.fields || []); setSelectedFieldId(null); setSelectedFieldIds([]); setIsActive(!!template.isActive);
  };
  useEffect(() => {
    if (skipAutoLoad.current) { skipAutoLoad.current = false; return; }
    const stored = matchingTemplates.find(item => item.isActive && (!item.theme || item.theme === theme) && !item.issuerCompanyId);
    const current = stored && (stored.fields?.length || stored.imageData) ? stored : {...systemTemplate(documentType, theme), country: stored?.country || "", issuerCompanyId: stored?.issuerCompanyId || ""};
    setEditingId(current.id); setName(current.name); setImageData(current.imageData); setCountry(current.country || ""); setIssuerCompanyId(current.issuerCompanyId || ""); setCanvasBackground(current.backgroundColor || "#ffffff"); setLayoutKind((current.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(current.documentType)) || current.layoutMode === "standard" ? "standard" : "free"); setFields(current.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(current.documentType) ? [] : current.fields || []); setSelectedFieldId(null); setSelectedFieldIds([]); setIsActive(true); setSaveMessage("");
  }, [documentType, theme]);
  const upload = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setImageData(String(reader.result)); reader.readAsDataURL(file); };
  const addField = (source: string, label: string, customValue?: string) => setFields((current) => [...current, { ...newField(source, label, current.length), customValue, ...(label === "Line" ? {height: 0.3, borderColor: "#334155", borderWidth: 1} : label === "Rectangle" ? {height: 10, borderColor: "#334155", borderWidth: 1} : {}) }]);
  const addBlankField = () => {
    const created = { ...newField("custom", "New Field", fields.length), id: `field-${Date.now()}`, x: 10, y: 10, width: 28, height: 5 };
    setFields((current) => [...current, created]); setSelectedFieldIds([created.id]); setSelectedFieldId(created.id);
  };
  const updateField = (patch: Partial<DocumentTemplateField>) => setFields((current) => current.map((field) => field.id === selectedFieldId ? { ...field, ...patch } : field));
  const updateSelectedFields = (patch: Partial<DocumentTemplateField>) => setFields((current) => current.map((field) => selectedFieldIds.includes(field.id) ? { ...field, ...patch } : field));
  const moveField = (event: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    if (selectionBox && !dragging) { setSelectionBox({ ...selectionBox, x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }); return; }
    if (!dragging) return;
    if (dragging.mode === "resize") {
      const width = Math.max(8, Math.min(95, (dragging.startWidth || 20) + ((event.clientX - (dragging.startX || 0)) / rect.width) * 100));
      const height = Math.max(2.5, Math.min(40, (dragging.startHeight || 5) + ((event.clientY - (dragging.startY || 0)) / rect.height) * 100));
      setFields((current) => current.map((field) => field.id === dragging.id ? { ...field, width, height } : field));
    } else {
      const x = Math.max(0, Math.min(96, ((event.clientX - rect.left - dragging.offsetX) / rect.width) * 100));
      const y = Math.max(0, Math.min(97, ((event.clientY - rect.top - dragging.offsetY) / rect.height) * 100));
      setFields((current) => current.map((field) => field.id === dragging.id ? { ...field, x: Math.min(x, 100-field.width), y: Math.min(y, 100-(field.height||5)) } : field));
    }
  };
  const finishPointerAction = () => {
    if (selectionBox) {
      const left = Math.min(selectionBox.startX, selectionBox.x); const right = Math.max(selectionBox.startX, selectionBox.x);
      const top = Math.min(selectionBox.startY, selectionBox.y); const bottom = Math.max(selectionBox.startY, selectionBox.y);
      const ids = fields.filter((field) => field.x < right && field.x + field.width > left && field.y < bottom && field.y + (field.height || 5) > top).map((field) => field.id);
      setSelectedFieldIds(ids); setSelectedFieldId(ids[0] || null); setSelectionBox(null);
    }
    setDragging(null);
  };
  const duplicateSelected = () => {
    const copies = fields.filter((field) => selectedFieldIds.includes(field.id)).map((field, index) => ({ ...field, id: `field-${Date.now()}-${index}`, x: Math.min(95, field.x + 2), y: Math.min(95, field.y + 2) }));
    setFields((current) => [...current, ...copies]); setSelectedFieldIds(copies.map((field) => field.id)); setSelectedFieldId(copies[0]?.id || null);
  };
  const deleteSelected = () => { setFields((current) => current.filter((field) => !selectedFieldIds.includes(field.id))); setSelectedFieldIds([]); setSelectedFieldId(null); };
  const changeLayer = (direction: "front" | "back") => {
    const zValues = fields.map((field) => field.zIndex || 0); const value = direction === "front" ? Math.max(0, ...zValues) + 1 : Math.min(0, ...zValues) - 1; updateSelectedFields({ zIndex: value });
  };
  const sizeOrDistribute = (action: "sameWidth" | "sameHeight" | "distributeH" | "distributeV") => {
    const chosen = fields.filter((field) => selectedFieldIds.includes(field.id)).sort((a,b)=>action==="distributeV"?a.y-b.y:a.x-b.x); if (chosen.length < 2) return;
    if (action === "sameWidth") return updateSelectedFields({ width: chosen[0].width });
    if (action === "sameHeight") return updateSelectedFields({ height: chosen[0].height || 5 });
    if (chosen.length < 3) return;
    if (action === "distributeH") { const start=chosen[0].x,end=chosen[chosen.length-1].x,step=(end-start)/(chosen.length-1); setFields(fields.map(field=>{const index=chosen.findIndex(item=>item.id===field.id);return index<0?field:{...field,x:start+step*index};})); }
    else { const start=chosen[0].y,end=chosen[chosen.length-1].y,step=(end-start)/(chosen.length-1); setFields(fields.map(field=>{const index=chosen.findIndex(item=>item.id===field.id);return index<0?field:{...field,y:start+step*index};})); }
  };
  const alignSelected = (mode: "left" | "right" | "top" | "bottom" | "centerX" | "centerY") => {
    const chosen = fields.filter((field) => selectedFieldIds.includes(field.id)); if (chosen.length < 2) return;
    const left = Math.min(...chosen.map((field) => field.x)); const right = Math.max(...chosen.map((field) => field.x + field.width));
    const top = Math.min(...chosen.map((field) => field.y)); const bottom = Math.max(...chosen.map((field) => field.y + (field.height || 5)));
    const centerX = chosen.reduce((sum, field) => sum + field.x + field.width / 2, 0) / chosen.length;
    const centerY = chosen.reduce((sum, field) => sum + field.y + (field.height || 5) / 2, 0) / chosen.length;
    setFields(fields.map((field) => !selectedFieldIds.includes(field.id) ? field : mode === "left" ? { ...field, x: left } : mode === "right" ? { ...field, x: right - field.width } : mode === "top" ? { ...field, y: top } : mode === "bottom" ? { ...field, y: bottom - (field.height || 5) } : mode === "centerX" ? { ...field, x: centerX - field.width / 2 } : { ...field, y: centerY - (field.height || 5) / 2 }));
  };
  const save = () => {
    if (!name.trim()) return alert("نام قالب را وارد کنید.");
    if (documentType === "COO" && !country.trim()) return alert("برای قالب COO کشور مبدأ را وارد کنید.");
    const editingTemplate = matchingTemplates.find((item) => item.id === editingId);
    const id = editingTemplate && !editingTemplate.isBuiltIn ? editingTemplate.id : `doc-${Date.now()}`;
    onSave({ id, name: name.trim(), documentType, theme, issuerCompanyId, country, imageData, backgroundColor: canvasBackground, fields, layoutMode: layoutKind, fontFamily: editingTemplate?.fontFamily || "Public Sans", fontSize: editingTemplate?.fontSize || 11, isBuiltIn: false, isActive, createdAt: editingTemplate?.createdAt || new Date().toISOString() });
    setEditingId(id); setSaveMessage(isActive ? "قالب ذخیره و برای چاپ این نوع سند فعال شد." : "قالب ذخیره شد؛ برای استفاده در چاپ آن را فعال کنید.");
  };

  const activateDefault = () => {
    const template = {...systemTemplate(documentType, theme), country, issuerCompanyId, fields: []};
    onSave(template);
    loadTemplate(template);
    setSaveMessage("قالب استاندارد سیستم برای چاپ فعال شد. برای ساخت چیدمان اختصاصی، فیلدهای صفحه را ویرایش و ذخیره کنید.");
  };
  const copyTemplate = (stored: DocumentTemplate) => {
    const template = stored.isBuiltIn && !stored.fields?.length && !stored.imageData ? {...stored, fields: systemTemplate(stored.documentType, (stored.theme || theme) as typeof themes[number]).fields} : stored;
    skipAutoLoad.current = template.documentType !== documentType || template.theme !== theme;
    setEditingId(undefined); setDocumentType(template.documentType); setTheme(template.theme || "standard_berakem");
    setCountry(template.country || ""); setIssuerCompanyId(template.issuerCompanyId || ""); setName(`${template.name} · Copy`);
    setImageData(template.imageData); setCanvasBackground(template.backgroundColor || "#ffffff");
    setLayoutKind((template.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(template.documentType)) || template.layoutMode === "standard" ? "standard" : "free"); setFields((template.isBuiltIn && ["PI","COMMERCIAL_INVOICE","PACKING_LIST","SALES_CONTRACT"].includes(template.documentType) ? [] : template.fields || []).map((item, index) => ({ ...item, id: `field-copy-${Date.now()}-${index}` })));
    setSelectedFieldId(null); setSelectedFieldIds([]); setIsActive(false);
  };
  const switchDocumentType = (nextType: DocType) => {
    if (nextType === documentType) return;
    setDocumentType(nextType); setEditingId(undefined); setName(""); setCountry(""); setIssuerCompanyId("");
    setImageData(undefined); setCanvasBackground("#ffffff"); setFields([]); setSelectedFieldId(null); setSelectedFieldIds([]); setIsActive(false);
  };

  const sampleOrder = db.orders.find(order => order.OrderID === previewOrderId && (!issuerCompanyId || order.IssuerCompanyId === issuerCompanyId || String(order.SupplierID) === issuerCompanyId)) || db.orders.find(order => !issuerCompanyId || order.IssuerCompanyId === issuerCompanyId || String(order.SupplierID) === issuerCompanyId) || db.orders[0];
  const sampleSupplier = db.suppliers.find(item => item.SupplierID === sampleOrder?.SupplierID);
  const sampleCustomer = db.customers.find(item => item.CustomerID === sampleOrder?.CustomerID);
  const sampleValues: Record<string, unknown> = {
    supplierName: sampleSupplier?.SupplierName || sampleOrder?.SupplierName, customerName: sampleCustomer?.CustomerName || sampleOrder?.CustomerName,
    exporterBlock: [sampleSupplier?.SupplierName, sampleSupplier?.Address].filter(Boolean).join("\n"), consigneeBlock: [sampleCustomer?.CustomerName, sampleCustomer?.Address].filter(Boolean).join("\n"),
    documentNumber: sampleOrder?.ProformaInvoiceID, proformaNumber: sampleOrder?.ProformaInvoiceID, documentDate: sampleOrder?.PIDate, proformaDate: sampleOrder?.PIDate,
    customerAddress: sampleCustomer?.Address, productName: sampleOrder?.items?.map(item => item.ProductName).join("\n"), goodsDescription: sampleOrder?.items?.map(item => item.ProductName).join("\n"), quantity: sampleOrder?.TotalQuantity,
    quantityDetails: sampleOrder?.items?.map(item => `${item.Quantity} ${item.QuantityUnit || "MT"}`).join("\n"), countryOfOrigin: sampleOrder?.CountryOfOrigin, countryOfDestination: sampleOrder?.CountryOfDestination,
    portOfLoading: sampleOrder?.PortOfLoading, portOfDischarge: sampleOrder?.PortOfDischarge, deliveryTerms: sampleOrder?.TermsOfDelivery, paymentTerms: sampleOrder?.TermsOfPayment, currency: sampleOrder?.TransactionCurrency, freight: sampleOrder?.Freight,
  };
  const usesLiveStandard = layoutKind === "standard" && ["PI", "COMMERCIAL_INVOICE", "PACKING_LIST", "SALES_CONTRACT"].includes(documentType);
  const standardDraft: DocumentTemplate = {id: "layout-draft", name, documentType, theme, issuerCompanyId, country, fields, layoutMode: "standard", isActive: true, createdAt: ""};
  const blockNames: Record<string,string> = {header:"لوگو و عنوان سند", seller:"فروشنده", buyer:"خریدار", consignee:"گیرنده کالا", logistics:"مشخصات حمل و معامله", items:"جدول کالاها", terms:"شروط و توضیحات", totals:"جمع مبالغ", footer:"بانک، مهر و امضا"};
  useEffect(() => {
    if (!usesLiveStandard || editorMode !== "designer") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    const measure = () => {
      if (!active || !canvas.clientWidth) return;
      setCanvasScale(canvas.clientWidth / 794);
      const paper = canvas.querySelector("[data-standard-paper]") as HTMLElement | null;
      if (!paper) return;
      const rect = paper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setFields(current => current.length ? current : Array.from(paper.querySelectorAll<HTMLElement>("[data-standard-block]")).map((block,index) => {
        const box = block.getBoundingClientRect();
        return {...newField(`standard:${block.dataset.standardBlock}`, blockNames[block.dataset.standardBlock || ""] || "بخش سند",index), align: undefined, id:`standard-${block.dataset.standardBlock}`, x:100*(box.left-rect.left)/rect.width, y:100*(box.top-rect.top)/rect.height, width:100*box.width/rect.width, height:100*box.height/rect.height, fontSize:parseFloat(getComputedStyle(block).fontSize)||11};
      }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    const mutation = new MutationObserver(measure);
    mutation.observe(canvas,{childList:true,subtree:true});
    void document.fonts.ready.then(measure);
    measure();
    return () => {active=false;observer.disconnect();mutation.disconnect();};
  }, [usesLiveStandard, editorMode, documentType, theme]);
  const newBlankTemplate = () => {setLayoutKind("free");setEditingId(undefined);setName("قالب جدید");setFields([]);setImageData(undefined);setSelectedFieldId(null);setSelectedFieldIds([]);setIsActive(false);};
  const editRealStandard = () => {setLayoutKind("standard");setEditingId(undefined);setName("ویرایش قالب استاندارد");setFields([]);setImageData(undefined);setSelectedFieldId(null);setSelectedFieldIds([]);setIsActive(true);};
  const canvas = <div ref={canvasRef} onPointerDown={(event)=>{const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;const x=((event.clientX-rect.left)/rect.width)*100;const y=((event.clientY-rect.top)/rect.height)*100;setSelectionBox({startX:x,startY:y,x,y});setSelectedFieldIds([]);setSelectedFieldId(null);}} onPointerMove={moveField} onPointerUp={finishPointerAction} onPointerLeave={finishPointerAction} className="relative mx-auto aspect-[210/297] w-full touch-none overflow-hidden border border-slate-300 bg-white shadow-lg" style={{ maxWidth: fullscreen ? 760 : 650, backgroundColor: canvasBackground, backgroundImage: imageData ? `url(${imageData})` : undefined, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
    {usesLiveStandard && sampleOrder && <div className="layout-live-preview pointer-events-none absolute left-0 top-0" style={{width:794,height:1123,transform:`scale(${canvasScale})`,transformOrigin:"top left"}}>
      <style>{`.layout-live-preview .printable-document{padding:0!important;overflow:visible!important;background:white!important}.layout-live-preview [data-standard-paper]{width:794px!important;max-width:none!important;min-height:1123px!important;box-sizing:border-box}`}</style>
      <React.Suspense fallback={<span>در حال نمایش سند واقعی…</span>}><LiveDocument key={`${documentType}-${theme}`} canvasMode initialDocType={documentType as "PI"} order={sampleOrder} supplier={sampleSupplier} customer={sampleCustomer} templateEditorDb={db} printTemplateConfig={{...db.printTemplateConfig,templateStyle:theme}} documentTemplates={fields.length ? [standardDraft] : []} onClose={()=>{}}/></React.Suspense>
    </div>}
    {!usesLiveStandard && !imageData && !fields.length && <div className="absolute inset-0 grid place-items-center text-xs text-slate-300">A4 TEMPLATE CANVAS</div>}
    {selectedFieldIds.length > 1 && <div onPointerDown={(event)=>event.stopPropagation()} className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"><button onClick={()=>alignSelected("left")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">چپ</button><button onClick={()=>alignSelected("right")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">راست</button><button onClick={()=>alignSelected("top")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">بالا</button><button onClick={()=>alignSelected("bottom")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">پایین</button><button onClick={()=>alignSelected("centerX")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">مرکز ↔</button><button onClick={()=>alignSelected("centerY")} className="rounded px-2 py-1 text-[9px] hover:bg-indigo-50">مرکز ↕</button></div>}
    {selectionBox&&<div className="pointer-events-none absolute z-50 border border-indigo-600 bg-indigo-400/15" style={{left:`${Math.min(selectionBox.startX,selectionBox.x)}%`,top:`${Math.min(selectionBox.startY,selectionBox.y)}%`,width:`${Math.abs(selectionBox.x-selectionBox.startX)}%`,height:`${Math.abs(selectionBox.y-selectionBox.startY)}%`}}/>}
    {fields.map((field) => <button data-template-field={field.id} title={field.label} key={field.id} onPointerDown={(event)=>{event.stopPropagation();const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();const additive=multiSelectMode||event.ctrlKey||event.metaKey||event.shiftKey;setDragging({id:field.id,mode:"move",offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top});setSelectedFieldIds(current=>{const next=additive?(current.includes(field.id)?current.filter(id=>id!==field.id):[...current,field.id]):[field.id];setSelectedFieldId(next.includes(field.id)?field.id:(next[0]||null));return next;});}} className={`absolute cursor-move select-none border border-dashed px-1 py-0.5 text-left ${selectedFieldIds.includes(field.id)?"border-indigo-600 ring-1 ring-indigo-300":"border-slate-400"}`} style={{ left:`${field.x}%`, top:`${field.y}%`, width:`${field.width}%`, height:`${field.height || 5}%`, fontFamily:field.fontFamily, fontSize:`${field.fontSize}px`, fontWeight:field.bold?700:400, textAlign:field.align, color:field.color||"#111827", backgroundColor: usesLiveStandard ? "transparent" : field.backgroundColor||"rgba(255,255,255,.5)", borderColor:field.borderColor, borderWidth:field.borderWidth, zIndex:field.zIndex, transform:`rotate(${field.rotation||0}deg)` }}>{usesLiveStandard && field.source.startsWith("standard:") ? <span className="sr-only">{field.label}</span> : field.source === "custom" ? <textarea value={field.customValue || ""} onFocus={()=>{setSelectedFieldId(field.id);setSelectedFieldIds([field.id]);}} onPointerDown={(event)=>event.stopPropagation()} onChange={(event)=>setFields(current=>current.map(item=>item.id===field.id?{...item,customValue:event.target.value}:item))} className="h-full w-full resize-none bg-transparent outline-none" /> : String(sampleValues[field.source] || field.label)}{selectedFieldIds.includes(field.id)&&<span onPointerDown={(event)=>{event.stopPropagation();setSelectedFieldId(field.id);setDragging({id:field.id,mode:"resize",offsetX:0,offsetY:0,startX:event.clientX,startY:event.clientY,startWidth:field.width,startHeight:field.height||5});}} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-indigo-600 shadow"/>}</button>)}
  </div>;

  return <section className={`${fullscreen ? "fixed inset-0 z-[70] h-screen overflow-y-auto rounded-none" : "rounded-2xl"} overflow-hidden border border-slate-200 bg-white`}>
    {onSavePrintTemplateConfig && <>
      <header className="border-b bg-white p-4" dir="rtl"><h2 className="font-bold text-indigo-950">قالب و چاپ اسناد</h2><div className="mt-3 flex flex-wrap gap-2">{([['standard','قالب استاندارد و پیش‌نمایش'],['designer','طراحی چیدمان اختصاصی']] as const).map(([mode,label]) => <button type="button" key={mode} aria-pressed={editorMode === mode} onClick={() => {setEditorMode(mode);setFullscreen(false);}} className={`rounded-lg px-4 py-2 text-xs font-bold ${editorMode === mode ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div></header>
      <div hidden={editorMode !== "standard"}>
        {db.documentTemplates?.some(template => template.documentType === "PI" && template.isActive && !template.isBuiltIn && template.theme === (db.printTemplateConfig?.templateStyle || "standard_berakem")) && <div className="m-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900" dir="rtl">چیدمان اختصاصی برای پروفورما فعال است. برای تغییر اجزای آن «طراحی چیدمان اختصاصی» را باز کنید.<button type="button" onClick={()=>onSave({...systemTemplate("PI", db.printTemplateConfig?.templateStyle || "standard_berakem"), fields: []})} className="mr-3 rounded border bg-white px-3 py-2">استفاده از قالب استاندارد</button></div>}
        <React.Suspense fallback={<div className="p-5 text-sm">در حال نمایش قالب…</div>}><ProformaSettings db={db} onSaveTemplate={onSavePrintTemplateConfig} onSaveOrder={onSaveOrder || (()=>{})}/></React.Suspense>
      </div>
    </>}
    <div hidden={editorMode !== "designer"}>
    <div className={`flex items-center justify-between border-b border-slate-200 ${fullscreen ? "px-4 py-2" : "p-5"}`}><div><h2 className="flex items-center gap-2 text-sm font-bold"><FileText size={18} className="text-indigo-600"/>طراحی قالب مدارک تجاری</h2>{!fullscreen&&<InlineHelp><p className="mt-1 text-xs text-slate-500">برای هر سند و Theme قالب مستقل بسازید. قالب COO بر اساس Country of Origin پرونده به‌صورت خودکار انتخاب می‌شود.</p></InlineHelp>}</div><button onClick={()=>setFullscreen(current=>!current)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{fullscreen?"خروج از تمام‌صفحه":"طراحی تمام‌صفحه"}</span></button></div>
    <div className="flex flex-wrap gap-2 border-b bg-white p-3" dir="rtl"><button type="button" onClick={editRealStandard} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white">ویرایش خودِ قالب استاندارد</button><button type="button" onClick={newBlankTemplate} className="rounded-lg border px-4 py-2 text-xs">قالب جدید از صفحه خالی</button><label className="self-center text-xs text-slate-600">پروندهٔ پیش‌نمایش <select aria-label="پرونده پیش‌نمایش قالب" value={sampleOrder?.OrderID || ""} onChange={e=>setPreviewOrderId(Number(e.target.value))} className="mr-2 rounded border p-1">{db.orders.filter(order=>!issuerCompanyId || order.IssuerCompanyId===issuerCompanyId || String(order.SupplierID)===issuerCompanyId).map(order=><option key={order.OrderID} value={order.OrderID}>{order.ProformaInvoiceID}</option>)}</select></label><span className="self-center text-xs text-slate-500">{usesLiveStandard ? "سند واقعی؛ روی بخش موردنظر کلیک کنید" : "چیدمان آزاد"}</span></div>
    <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 pt-2">{docTypes.map((item)=><button key={item.id} onClick={()=>switchDocumentType(item.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs ${documentType===item.id?"border-indigo-600 font-bold text-indigo-700":"border-transparent text-slate-500"}`}>{item.label}</button>)}</div>
    {saveMessage && <div role="status" className="border-b border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saveMessage}</div>}
    <div className="border-b bg-indigo-50 p-3 text-xs text-indigo-900">برای تنظیم محل و اندازه، روی یک بخش از صفحه کلیک کنید. داده‌های نمونه از پروندهٔ {sampleOrder?.ProformaInvoiceID || "انتخاب‌نشده"} نمایش داده می‌شوند. تغییرات چیدمان با دکمهٔ ذخیره نگهداری می‌شوند.</div>
    <div className="sticky top-0 z-40 border-b border-slate-300 bg-white shadow-md">
      <div className="flex gap-1 border-b bg-slate-50 px-4">{([['design','DESIGN'],['arrange','ARRANGE'],['format','FORMAT']] as const).map(([id,label])=><button key={id} onClick={()=>setRibbonTab(id)} className={`px-4 py-2 text-[11px] font-bold ${ribbonTab===id?'border-b-2 border-indigo-600 text-indigo-700':'text-slate-500'}`}>{label}</button>)}</div>
      <div className={`min-h-20 gap-3 overflow-auto p-2 text-[10px] ${toolbarOrientation==='horizontal'?'flex items-stretch':'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
        <div className="min-w-56 border-l px-2"><div className="mb-2 flex items-center justify-between"><b className="text-slate-500">Font Manager</b><div className="flex rounded border bg-slate-50"><button onClick={()=>setToolbarOrientation('horizontal')} className={`px-2 py-1 ${toolbarOrientation==='horizontal'?'bg-indigo-600 text-white':''}`}>↔</button><button onClick={()=>setToolbarOrientation('vertical')} className={`px-2 py-1 ${toolbarOrientation==='vertical'?'bg-indigo-600 text-white':''}`}>↕</button></div></div><div className="flex gap-1"><select value={db.settings?.fontFamily||""} onChange={e=>onApplyAppFont(e.target.value)} className="min-w-0 flex-1 rounded border p-2"><option value="">فونت پیش‌فرض سایت</option>{fontOptions.map(font=><option key={font}>{font}</option>)}</select><label className="cursor-pointer rounded bg-indigo-600 px-3 py-2 font-bold text-white">+ Font<input type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={e=>uploadFont(e.target.files?.[0])} className="hidden"/></label></div>{(db.customFonts||[]).length>0&&<div className="mt-1 flex flex-wrap gap-1">{(db.customFonts||[]).map(font=><span key={font.id} className="rounded bg-slate-100 px-1.5 py-0.5" style={{fontFamily:font.family}}>{font.name}<button onClick={()=>onDeleteFont(font.id)} className="ml-1 text-rose-500">×</button></span>)}</div>}</div>
        {ribbonTab==='design'&&<><div className="min-w-80 border-l px-2"><b className="mb-1 block text-slate-500">Controls</b><div className="flex items-stretch gap-1"><RibbonButton label="Select" icon={MousePointer2} active={!multiSelectMode} onClick={()=>setMultiSelectMode(false)}/><RibbonButton label="Multi Select" icon={ListPlus} active={multiSelectMode} onClick={()=>setMultiSelectMode(current=>!current)}/><RibbonButton label="Add Field" icon={TextCursorInput} onClick={addBlankField}/><RibbonButton label="Line" icon={Minus} onClick={()=>addField('custom','Line','')}/><RibbonButton label="Rectangle" icon={Square} onClick={()=>addField('custom','Rectangle','')}/><label title="Insert Image" className="flex min-w-13 cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[9px] text-slate-600 hover:bg-slate-100 hover:text-indigo-700"><ImagePlus size={22} strokeWidth={1.6}/><span>Image</span><input type="file" accept="image/*" onChange={e=>upload(e.target.files?.[0])} className="hidden"/></label></div></div><div className="min-w-40 border-l px-2"><b className="mb-1 block text-slate-500">Tools</b><div className="flex"><RibbonButton label="Duplicate Field" icon={ListPlus} onClick={duplicateSelected}/><RibbonButton label="Delete" icon={Trash2} onClick={deleteSelected}/></div></div></>}
        {ribbonTab==='arrange'&&<><div className="min-w-72 border-l px-2"><b className="mb-1 block text-slate-500">Align</b><div className="flex gap-1"><RibbonButton label="Left" icon={AlignLeft} onClick={()=>alignSelected('left')}/><RibbonButton label="Center" icon={AlignCenter} onClick={()=>alignSelected('centerX')}/><RibbonButton label="Right" icon={AlignRight} onClick={()=>alignSelected('right')}/><RibbonButton label="Top" icon={AlignStartVertical} onClick={()=>alignSelected('top')}/><RibbonButton label="Middle" icon={AlignVerticalJustifyCenter} onClick={()=>alignSelected('centerY')}/><RibbonButton label="Bottom" icon={AlignEndVertical} onClick={()=>alignSelected('bottom')}/></div></div><div className="min-w-48 border-l px-2"><b className="mb-1 block text-slate-500">Size / Spacing</b><div className="flex gap-1"><RibbonButton label="Same Width" icon={Move} onClick={()=>sizeOrDistribute('sameWidth')}/><RibbonButton label="Same Height" icon={Move} onClick={()=>sizeOrDistribute('sameHeight')}/><RibbonButton label="Space ↔" icon={AlignHorizontalJustifyCenter} onClick={()=>sizeOrDistribute('distributeH')}/><RibbonButton label="Space ↕" icon={AlignVerticalJustifyCenter} onClick={()=>sizeOrDistribute('distributeV')}/></div></div><div className="border-l px-2"><b className="mb-1 block text-slate-500">Position</b><div className="flex"><RibbonButton label="Bring Front" icon={Layers} onClick={()=>changeLayer('front')}/><RibbonButton label="Send Back" icon={Layers} onClick={()=>changeLayer('back')}/></div></div></>}
        {ribbonTab==='format'&&<><div className="min-w-52 border-l px-2"><b className="mb-2 block text-slate-500">Font</b><div className="flex gap-1"><select value={selected?.fontFamily||'Arial'} onChange={e=>updateSelectedFields({fontFamily:e.target.value})} className="min-w-0 rounded border p-2">{fontOptions.map(font=><option key={font}>{font}</option>)}</select><input type="number" value={selected?.fontSize||11} onChange={e=>updateSelectedFields({fontSize:Number(e.target.value)})} className="w-14 rounded border p-2"/><button onClick={()=>updateSelectedFields({bold:!selected?.bold})} className="rounded border px-3 font-bold">B</button></div></div><div className="border-l px-2"><b className="mb-2 block text-slate-500">Control Formatting</b><div className="flex gap-2"><label>Text<input type="color" value={selected?.color||'#111827'} onChange={e=>updateSelectedFields({color:e.target.value})} className="block h-7"/></label><label>Fill<input type="color" value={selected?.backgroundColor||'#ffffff'} onChange={e=>updateSelectedFields({backgroundColor:e.target.value})} className="block h-7"/></label><label>Border<input type="color" value={selected?.borderColor||'#94a3b8'} onChange={e=>updateSelectedFields({borderColor:e.target.value,borderWidth:1})} className="block h-7"/></label></div></div></>}
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_260px]" style={fullscreen ? { gridTemplateColumns: `minmax(0,1fr) ${rightCollapsed ? 44 : 220}px` } : undefined}>
      <main className={`min-w-0 bg-slate-100 ${fullscreen ? "p-3" : "p-3 sm:p-4"}`}>{canvas}</main>
      <aside className={`min-h-full space-y-2 border-r border-slate-200 p-2 text-xs md:self-stretch md:overflow-y-auto ${fullscreen && rightCollapsed ? "[&>*:not(.dock-toggle)]:hidden" : ""}`}>
        {fullscreen&&<button onClick={()=>setRightCollapsed(current=>!current)} className="dock-toggle flex w-full items-center justify-center rounded border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="باز/بستن Property Sheet">{rightCollapsed?<ChevronRight size={15}/>:<ChevronLeft size={15}/>}</button>}
        <button onClick={addBlankField} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 p-2 font-bold text-white"><Plus size={15}/>افزودن فیلد</button>
        <label className="block">نام قالب<input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded border p-2"/></label>
        <label className="block">Theme<select value={theme} onChange={e=>setTheme(e.target.value as any)} className="mt-1 w-full rounded border p-2">{commercialTemplateOptions.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {documentType==="COO"&&<label className="block">Country of Origin<input value={country} onChange={e=>setCountry(e.target.value)} className="mt-1 w-full rounded border p-2" placeholder="Turkey / UAE"/></label>}
        <label className="block">شرکت صادرکننده<select value={issuerCompanyId} onChange={e=>setIssuerCompanyId(e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">همه شرکت‌ها</option>{db.suppliers.map(item=><option key={item.SupplierID} value={item.SupplierID}>{item.SupplierName}</option>)}</select></label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50 p-3 text-indigo-700"><Upload size={15}/>آپلود تصویر زمینه<input type="file" accept="image/*" onChange={e=>upload(e.target.files?.[0])} className="hidden"/></label>
        <div className="rounded-xl border border-slate-200 p-3"><b className="mb-2 block">تنظیمات صفحه</b><label className="flex items-center justify-between">رنگ زمینه<input type="color" value={canvasBackground} onChange={e=>setCanvasBackground(e.target.value)} className="h-7 w-12 rounded border"/></label><button onClick={()=>setImageData(undefined)} disabled={!imageData} className="mt-2 w-full rounded border p-1.5 text-[10px] text-slate-600 disabled:opacity-40">حذف تصویر پس‌زمینه</button></div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"><input type="checkbox" checked={isActive} onChange={e=>setIsActive(e.target.checked)}/>فعال‌سازی پس از ذخیره</label>
        {selectedFieldIds.length > 1 && <div className="rounded-xl border border-slate-200 p-2"><b className="mb-2 block">هم‌راستاسازی {selectedFieldIds.length} فیلد</b><div className="grid grid-cols-3 gap-1"><button onClick={()=>alignSelected("left")} className="rounded border bg-white p-2 text-[10px]">لبه چپ</button><button onClick={()=>alignSelected("centerX")} className="rounded border bg-white p-2 text-[10px]">مرکز عمودی</button><button onClick={()=>alignSelected("right")} className="rounded border bg-white p-2 text-[10px]">لبه راست</button><button onClick={()=>alignSelected("top")} className="rounded border bg-white p-2 text-[10px]">لبه بالا</button><button onClick={()=>alignSelected("centerY")} className="rounded border bg-white p-2 text-[10px]">مرکز افقی</button><button onClick={()=>alignSelected("bottom")} className="rounded border bg-white p-2 text-[10px]">لبه پایین</button></div><InlineHelp><p className="mt-1 text-[9px] text-slate-400">از Multi Select یا Shift/Ctrl برای انتخاب چند فیلد استفاده کنید.</p></InlineHelp></div>}
        {selected&&<div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3"><div className="flex justify-between"><b>Properties · {selectedFieldIds.length} مورد</b><button onClick={()=>{setFields(fields.filter(f=>!selectedFieldIds.includes(f.id)));setSelectedFieldIds([]);setSelectedFieldId(null);}} className="text-rose-600"><Trash2 size={14}/></button></div><label className="block font-bold text-indigo-900">نام نمایشی فیلد<input value={selected.label} onChange={e=>updateField({label:e.target.value})} className="mt-1 w-full rounded border border-indigo-200 bg-white p-2 font-normal"/></label><label className="block font-bold text-indigo-900">کنترلر / فیلد پروفورما<select value={selected.source} disabled={selected.source.startsWith("standard:")} onChange={e=>updateField({source:e.target.value})} className="mt-1 w-full rounded border border-indigo-300 bg-white p-2 font-normal"><option value="custom">مقدار ثابت / بدون ارتباط</option>{fieldLibrary.map(([source,label])=><option key={source} value={source}>{label}</option>)}</select></label>{selected.source==="custom"&&<label className="block font-bold text-indigo-900">مقدار ثابت<input value={selected.customValue||""} onChange={e=>updateField({customValue:e.target.value})} className="mt-1 w-full rounded border border-indigo-200 bg-white p-2 font-normal"/></label>}<InlineHelp><p className="rounded bg-white/70 p-1.5 text-[9px] text-slate-500">مقدار چاپی این باکس از کنترلر انتخاب‌شده خوانده می‌شود؛ نام نمایشی می‌تواند متفاوت باشد.</p></InlineHelp><label>فونت<select value={selected.fontFamily} onChange={e=>updateSelectedFields({fontFamily:e.target.value})} className="mt-1 w-full rounded border p-1.5">{fontOptions.map(font=><option key={font}>{font}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label>اندازه<input type="number" min="6" max="72" value={selected.fontSize} onChange={e=>updateSelectedFields({fontSize:Number(e.target.value)})} className="mt-1 w-full rounded border p-1.5"/></label><label>چرخش<input type="number" min="-180" max="180" value={selected.rotation||0} onChange={e=>updateSelectedFields({rotation:Number(e.target.value)})} className="mt-1 w-full rounded border p-1.5"/></label></div><div className="grid grid-cols-3 gap-2"><label className="text-[9px]">متن<input type="color" value={selected.color||"#111827"} onChange={e=>updateSelectedFields({color:e.target.value})} className="block h-7 w-full"/></label><label className="text-[9px]">پس‌زمینه<input type="color" value={selected.backgroundColor||"#ffffff"} onChange={e=>updateSelectedFields({backgroundColor:e.target.value})} className="block h-7 w-full"/></label><label className="text-[9px]">کادر<input type="color" value={selected.borderColor||"#94a3b8"} onChange={e=>updateSelectedFields({borderColor:e.target.value,borderWidth:1})} className="block h-7 w-full"/></label></div><div className="grid grid-cols-3 gap-1"><button onClick={()=>updateSelectedFields({align:"left"})} className="rounded border bg-white p-1.5">Left</button><button onClick={()=>updateSelectedFields({align:"center"})} className="rounded border bg-white p-1.5">Center</button><button onClick={()=>updateSelectedFields({align:"right"})} className="rounded border bg-white p-1.5">Right</button></div><button onClick={()=>updateSelectedFields({bold:!selected.bold})} className={`flex w-full items-center justify-center gap-1 rounded border p-2 ${selected.bold?"bg-indigo-600 text-white":"bg-white"}`}><Bold size={13}/>Bold</button><div className="grid grid-cols-3 gap-1"><button onClick={duplicateSelected} className="rounded border bg-white p-1.5 text-[9px]">تکثیر</button><button onClick={()=>changeLayer("front")} className="rounded border bg-white p-1.5 text-[9px]">جلو</button><button onClick={()=>changeLayer("back")} className="rounded border bg-white p-1.5 text-[9px]">عقب</button></div></div>}
        <div className="flex gap-2"><button onClick={save} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 p-2 text-white"><Save size={14}/>ذخیره</button><button onClick={()=>setPreview(true)} className="flex items-center gap-1 rounded-lg border px-3"><Eye size={14}/>پیش‌نمایش</button></div>
        <div className="border-t pt-3"><b>قالب‌های ذخیره‌شده</b><div className="mt-2 space-y-2"><div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-2"><div className="flex items-center gap-1 font-bold text-emerald-800"><Lock size={12}/>قالب پیش‌فرض فعلی</div><div className="mt-1 text-[10px] text-emerald-700">داخلی، پایدار و غیرقابل حذف</div><button onClick={activateDefault} className="mt-2 rounded bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white">فعال کردن قالب پیش‌فرض</button></div>{matchingTemplates.map(item=><div key={item.id} className={`rounded-lg border p-2 ${item.isActive?"border-indigo-400 bg-indigo-50":""}`}><button onClick={()=>loadTemplate(item)} className="w-full text-right font-bold text-indigo-700">{item.name}{item.isActive?" — فعال":""}</button><div className="mt-2 flex items-center justify-between gap-1 text-[10px]"><span className="text-slate-400">{item.country||item.theme}{item.isBuiltIn?" · پایه":""}</span><div className="flex gap-1"><button onClick={()=>copyTemplate(item)} className="rounded border border-indigo-200 bg-white px-2 py-1 text-indigo-700">کپی و ویرایش</button>{!item.isBuiltIn&&<button onClick={()=>onDelete(item.id)} className="rounded px-1 text-rose-500">حذف</button>}</div></div></div>)}</div></div>
      </aside>
    </div>
    {preview&&<div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-5"><div className="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-xl bg-slate-100 p-4"><div className="mb-3 flex justify-between"><b>پیش‌نمایش چاپ</b><div className="flex gap-2"><button onClick={save} className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white">ذخیره</button><button onClick={()=>setPreview(false)} className="rounded border bg-white px-3 py-1.5 text-xs"><X size={14} className="inline"/> بستن پیش‌نمایش</button></div></div>{canvas}</div></div>}
  </div></section>;
};
