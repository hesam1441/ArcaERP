import { InlineHelp } from "./InlineHelp";
import { installAutomaticPrintFit } from "../utils/automaticPrintFit";
import React, { useMemo, useState } from "react";
import { ClipboardPaste, FileSearch, LoaderCircle, Printer, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { CommercialDocumentFile, Product, ProductTdsDocument, Supplier } from "../types";
import { uploadDocumentAttachment } from "../services/storageService";
import { CoaDocumentPages } from "./CoaDocumentPages";
import { extractTechnicalPdf } from "../utils/technicalDocumentExtraction";

interface Props {
  product: Product;
  suppliers: Supplier[];
  initialDocument?: ProductTdsDocument;
  documentKind?: "TDS" | "MSDS";
  onSave: (document: ProductTdsDocument) => void;
  onClose: () => void;
}

const cleanHtml = (html: string) => {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script,style,iframe,object,embed").forEach((node) => node.remove());
  parsed.querySelectorAll("*").forEach((node) => Array.from(node.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase().startsWith("on") || attribute.name.toLowerCase() === "contenteditable") node.removeAttribute(attribute.name);
  }));
  return parsed.body.innerHTML;
};

const filenamePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").trim();

export const TdsDocumentModal: React.FC<Props> = ({ product, suppliers, initialDocument, documentKind = "TDS", onSave, onClose }) => {
  const [document, setDocument] = useState<ProductTdsDocument>(() => initialDocument ? JSON.parse(JSON.stringify(initialDocument)) : ({
    id: `tds-${Date.now()}`,
    name: "",
    supplierId: undefined,
    contentAlignment: "left",
    pages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState("");
  const supplier = useMemo(() => suppliers.find((item) => item.SupplierID === document.supplierId), [suppliers, document.supplierId]);
  const update = (partial: Partial<ProductTdsDocument>) => setDocument((current) => ({ ...current, ...partial, updatedAt: new Date().toISOString() }));
  const addBlankPage = () => update({ pages: [...document.pages, { id: `${documentKind.toLowerCase()}-page-${Date.now()}`, name: `Editable ${documentKind} page`, mimeType: "text/html", data: "", editableHtml: "<p>متن یا جدول را اینجا Paste کنید…</p>", sourceKind: "pasted", pageNumber: document.pages.length + 1, uploadedAt: new Date().toISOString() }] });
  const removePage = (id: string) => update({ pages: document.pages.filter((page) => page.id !== id).map((page, index) => ({ ...page, pageNumber: index + 1 })) });
  const updatePage = (id: string, editableHtml: string) => update({ pages: document.pages.map((page) => page.id === id ? { ...page, editableHtml: cleanHtml(editableHtml) } : page) });
  const upload = async (files?: FileList | null) => {
    if (!files?.length) return;
    const pages = await Promise.all(Array.from(files).map(async (file, index): Promise<CommercialDocumentFile> => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const storedUrl = await uploadDocumentAttachment(file);
      const base = { id: `tds-file-${Date.now()}-${index}`, name: file.name, mimeType: file.type || "application/octet-stream", data: storedUrl, pageNumber: document.pages.length + index + 1, uploadedAt: new Date().toISOString() };
      if (extension === "docx") {
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        return { ...base, sourceKind: "word", editableHtml: cleanHtml(result.value) };
      }
      if (["xlsx", "xls", "csv"].includes(extension || "")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        return { ...base, sourceKind: "excel", editableHtml: cleanHtml(workbook.SheetNames.map((name) => `<h3>${name}</h3>${XLSX.utils.sheet_to_html(workbook.Sheets[name])}`).join("<br/>")) };
      }
      return { ...base, sourceKind: "upload" };
    }));
    update({ pages: [...document.pages, ...pages] });
  };
  const extract = async () => {
    const file = document.pages.find((page) => page.mimeType === "application/pdf");
    if (!file) { setExtractionMessage("Upload a PDF first, then choose Extract PDF data."); return; }
    setExtracting(true); setExtractionMessage("");
    try { update({ extraction: await extractTechnicalPdf(file) }); }
    catch (error) { setExtractionMessage(error instanceof Error ? error.message : "Extraction failed."); }
    finally { setExtracting(false); }
  };
  const print = () => {
    const previousTitle = window.document.title;
    window.document.title = `${documentKind}_${filenamePart(document.name || supplier?.SupplierName || product.ProductName)}`;
    const source = window.document.querySelector(".printable-document");
    if (!source) return;
    const frame = window.document.createElement("iframe");
    frame.className = "document-print-frame";
    frame.setAttribute("aria-hidden", "true");
    window.document.body.appendChild(frame);
    const printDocument = frame.contentDocument;
    if (!printDocument) { frame.remove(); return; }
    const clone = source.cloneNode(true) as HTMLElement;
    const sourceCanvases = Array.from(source.querySelectorAll("canvas"));
    Array.from(clone.querySelectorAll("canvas")).forEach((canvas, index) => {
      const image = printDocument.createElement("img");
      image.className = canvas.className;
      image.src = sourceCanvases[index]?.toDataURL("image/png") || "";
      canvas.replaceWith(image);
    });
    const styles = Array.from(window.document.querySelectorAll('link[rel="stylesheet"], style')).map((node) => node.outerHTML).join("");
    printDocument.open();
    printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>${window.document.title}</title>${styles}</head><body class="standalone-document-print"></body></html>`);
    printDocument.close();
    printDocument.body.appendChild(printDocument.adoptNode(clone));
    const finish = () => { window.document.title = previousTitle; window.setTimeout(() => frame.remove(), 250); };
    window.setTimeout(async () => {
      await printDocument.fonts?.ready;
      await Promise.all(Array.from(printDocument.images).map((image) => image.decode?.().catch(() => undefined)));
      frame.contentWindow?.addEventListener("afterprint", finish, { once: true });
      if (frame.contentWindow) installAutomaticPrintFit(frame.contentWindow);
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    }, 500);
  };
  const save = () => {
    if (!document.name.trim() || !document.supplierId) return alert("نام مدرک و تأمین‌کنندهٔ صادرکننده را انتخاب کنید.");
    onSave(document);
    onClose();
  };
  return <div className="tds-modal-root fixed inset-0 z-[80] flex flex-col bg-slate-950/80 p-2 sm:p-5 print:bg-white" dir="rtl">
    <div className="tds-modal-shell mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:overflow-visible print:rounded-none">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-900 p-3 text-white print:hidden"><div><b>مدارک {documentKind}: {product.ProductName}</b><span className="mr-2 text-xs text-slate-300">قالب و عملکرد مشابه COA</span></div><div className="flex gap-2"><button onClick={print} className="rounded bg-white/10 px-3 py-1.5 text-xs font-bold"><Printer size={14} className="ml-1 inline"/>خروجی PDF / چاپ</button><button onClick={save} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold"><Save size={14} className="ml-1 inline"/>ذخیره</button><button onClick={onClose} className="p-1.5"><X size={18}/></button></div></header>
      <div className="grid gap-3 border-b bg-slate-50 p-3 text-xs sm:grid-cols-2 print:hidden"><label>نام مدرک / تولیدکننده<input value={document.name} onChange={(event) => update({ name: event.target.value })} className="mt-1 w-full rounded border bg-white p-2" placeholder="مثال: Berakem - Phenol"/></label><label>تأمین‌کنندهٔ صادرکننده<select value={document.supplierId || ""} onChange={(event) => update({ supplierId: Number(event.target.value) || undefined })} className="mt-1 w-full rounded border bg-white p-2"><option value="">انتخاب کنید</option>{suppliers.map((item) => <option key={item.SupplierID} value={item.SupplierID}>{item.SupplierName}</option>)}</select></label><div className="sm:col-span-2 flex flex-wrap items-center gap-2"><span className="font-bold text-slate-600">شروع محتوا با فاصلهٔ ۲mm از:</span>{(["left", "center", "right"] as const).map((alignment) => <button key={alignment} type="button" onClick={() => update({ contentAlignment: alignment })} className={`rounded px-3 py-1.5 font-bold ${document.contentAlignment === alignment ? "bg-indigo-600 text-white" : "border bg-white text-slate-600"}`}>{alignment === "left" ? "چپ" : alignment === "center" ? "وسط" : "راست"}</button>)}</div><div className="sm:col-span-2 flex flex-wrap gap-2"><label className="cursor-pointer rounded bg-indigo-600 px-3 py-2 font-bold text-white"><Upload size={14} className="ml-1 inline"/>افزودن تصویر، PDF، Word یا Excel<input type="file" multiple accept="image/*,application/pdf,.docx,.xls,.xlsx,.csv" className="hidden" onChange={(event) => upload(event.target.files)}/></label><button onClick={addBlankPage} className="rounded border border-indigo-200 bg-white px-3 py-2 font-bold text-indigo-700"><ClipboardPaste size={14} className="ml-1 inline"/>صفحهٔ قابل ویرایش برای Paste</button><button type="button" disabled={extracting} onClick={extract} className="rounded border border-violet-200 bg-white px-3 py-2 font-bold text-violet-700 disabled:text-slate-400">{extracting ? <LoaderCircle size={14} className="ml-1 inline animate-spin"/> : <Sparkles size={14} className="ml-1 inline"/>}Extract PDF data (optional)</button></div>{extractionMessage && <p className="sm:col-span-2 text-rose-700">{extractionMessage}</p>}{document.extraction && <div className="sm:col-span-2 rounded border border-violet-200 bg-white p-2 text-left" dir="ltr"><b className="flex items-center gap-1 text-violet-900"><FileSearch size={14}/> Extraction draft — review required</b><InlineHelp><p className="mt-1 text-slate-600">The uploaded file remains unchanged and is still the source document.</p></InlineHelp><span>Product: <b>{document.extraction.productName || "Not found"}</b> · Batch: <b>{document.extraction.batchNumber || "Not found"}</b></span></div>}</div>
      <main className="printable-document flex-1 overflow-y-auto bg-slate-100 p-4 font-sans text-slate-900 sm:p-8" dir="ltr">
        <div className="mx-auto max-w-4xl bg-white p-8 text-left font-sans text-[11px] leading-snug sm:p-10">
          <CoaDocumentPages pages={document.pages} supplier={supplier} documentTitle={documentKind === "TDS" ? "TECHNICAL DATA SHEET" : "MATERIAL SAFETY DATA SHEET"} productName={product.ProductName || documentKind} contentAlignment={document.contentAlignment || "left"} emptyMessage="یک فایل بارگذاری کنید یا صفحهٔ قابل ویرایش بسازید." onUpdatePage={updatePage} onRemovePage={removePage}/>
        </div>
      </main>
    </div>
  </div>;
};
