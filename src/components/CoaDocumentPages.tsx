import { pdfRenderingOptions } from "../utils/pdfRendering";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { CommercialDocumentFile, Supplier } from "../types";
import { ReferencePdfPage } from "./ReferencePdfPage";

GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  pages: CommercialDocumentFile[];
  supplier?: Supplier;
  documentTitle: string;
  productName?: string;
  metadata?: React.ReactNode;
  includeHeaderFooter?: boolean;
  contentAlignment?: "left" | "center" | "right";
  emptyMessage: string;
  onUpdatePage: (id: string, html: string) => void;
  onRemovePage: (id: string) => void;
}

type RenderPage = { file: CommercialDocumentFile; sourceId: string; chunkIndex: number; chunkCount: number; pdfPageNumber?: number };

const splitHtmlToPages = (html: string): string[] => {
  const source = new DOMParser().parseFromString(html, "text/html").body;
  // docx-preview preserves original Word pages as section.docx. Respect these
  // boundaries before doing height-based splitting so a short second page (for
  // example a disclaimer) is never merged into or clipped after page one.
  const wordPages = Array.from(source.querySelectorAll(":scope > section.docx"))
    .map((section) => section.querySelector("article")?.innerHTML.trim() || "")
    .filter((content) => content.replace(/<p>\s*<\/p>|\s/g, "").length > 0);
  if (wordPages.length) return wordPages;
  const measure = document.createElement("div");
  measure.className = "coa-rich-editor coa-page-measurer";
  document.body.appendChild(measure);
  let page = document.createElement("div");
  measure.appendChild(page);
  const result: string[] = [];
  const fits = () => measure.scrollHeight <= measure.clientHeight + 1;
  const flush = () => {
    if (page.innerHTML.trim()) result.push(page.innerHTML);
    page = document.createElement("div");
    measure.replaceChildren(page);
  };
  Array.from(source.childNodes).forEach((original) => {
    const node = original.cloneNode(true) as HTMLElement;
    page.appendChild(node);
    if (fits()) return;
    page.removeChild(node);
    if (node instanceof HTMLTableElement && node.tBodies[0]?.rows.length) {
      let table = node.cloneNode(true) as HTMLTableElement;
      table.tBodies[0].replaceChildren();
      page.appendChild(table);
      Array.from(node.tBodies[0].rows).forEach((row) => {
        table.tBodies[0].appendChild(row.cloneNode(true));
        if (fits()) return;
        table.tBodies[0].lastElementChild?.remove();
        if (table.tBodies[0].rows.length) flush();
        table = node.cloneNode(true) as HTMLTableElement;
        table.tBodies[0].replaceChildren(row.cloneNode(true));
        page.appendChild(table);
      });
      return;
    }
    if (page.innerHTML.trim()) flush();
    page.appendChild(node);
  });
  flush();
  measure.remove();
  return result.length ? result : [""];
};

const isEmptyEditorPlaceholder = (html: string) => {
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\u00a0/g, " ").trim() || "";
  return text === "متن یا جدول را اینجا Paste کنید…";
};

export const CoaDocumentPages: React.FC<Props> = ({ pages, supplier, documentTitle, productName, metadata, includeHeaderFooter = true, contentAlignment = "left", emptyMessage, onUpdatePage, onRemovePage }) => {
  const [renderPages, setRenderPages] = useState<RenderPage[]>([]);
  const [pdfPageCounts, setPdfPageCounts] = useState<Record<string, number>>({});
  const editorDrafts = useRef<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const referencePdfs = pages.filter((file) => !file.excludeFromPrint && file.sourceKind === "upload" && file.mimeType === "application/pdf");
    Promise.all(referencePdfs.map(async (file) => {
      try {
        const bytes = await fetch(file.data).then((response) => response.arrayBuffer());
        const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(bytes) }).promise;
        return [file.id, Math.max(pdf.numPages, 1)] as const;
      } catch (error) {
        console.error("Could not read COA PDF page count", error);
        return [file.id, 1] as const;
      }
    })).then((counts) => {
      if (!cancelled) setPdfPageCounts(Object.fromEntries(counts));
    });
    return () => { cancelled = true; };
  }, [pages]);
  useLayoutEffect(() => {
    const next = pages.filter((file) => !file.excludeFromPrint).flatMap((file): RenderPage[] => {
      if (file.sourceKind === "upload" && file.mimeType === "application/pdf") {
        const pageCount = pdfPageCounts[file.id] || 1;
        return Array.from({ length: pageCount }, (_, chunkIndex) => ({ file, sourceId: file.id, chunkIndex, chunkCount: pageCount, pdfPageNumber: chunkIndex + 1 }));
      }
      if (file.editableHtml === undefined) return [{ file, sourceId: file.id, chunkIndex: 0, chunkCount: 1 }];
      const chunks = splitHtmlToPages(file.editableHtml);
      return chunks.map((editableHtml, chunkIndex) => ({ file: { ...file, data: "", sourceKind: file.sourceKind === "excel" ? "excel" : "pasted", editableHtml }, sourceId: file.id, chunkIndex, chunkCount: chunks.length }));
    });
    // Keep an in-progress paste while the parent re-renders (for example when
    // the user clicks the COA metadata inputs). Only a deliberately empty
    // page may show its placeholder again.
    next.forEach((item) => {
      if (editorDrafts.current[item.sourceId] === undefined) editorDrafts.current[item.sourceId] = item.file.editableHtml || "";
    });
    setRenderPages(next);
  }, [pages, pdfPageCounts]);
  const updateChunk = (renderPage: RenderPage, html: string) => {
    const siblings = renderPages.filter((item) => item.sourceId === renderPage.sourceId);
    const combined = siblings.map((item) => item.chunkIndex === renderPage.chunkIndex ? html : item.file.editableHtml || "").join("");
    onUpdatePage(renderPage.sourceId, combined);
  };
  return <div className="space-y-4">
    {renderPages.map((renderPage, index) => {
      const file = renderPage.file;
      const isReferencePdf = file.sourceKind === "upload" && file.mimeType === "application/pdf";
      return <section key={`${renderPage.sourceId}-${renderPage.chunkIndex}`} className="coa-page-sheet"><article className={`coa-print-page break-after-page min-h-[270mm] border border-slate-200 bg-white p-[2mm] ${isReferencePdf ? "reference-pdf-page" : ""}`}>
      <div className="print:hidden mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><span>{file.name}{isReferencePdf && renderPage.chunkCount > 1 ? ` — صفحه ${renderPage.pdfPageNumber} از ${renderPage.chunkCount}` : ""}</span><button type="button" onClick={() => onRemovePage(file.id)} className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={13}/>حذف صفحه</button></div>
      {includeHeaderFooter && <header className="coa-print-header mb-4 flex items-start justify-between border-b-2 border-slate-900 pb-3">
        <div>{supplier?.LogoT ? <img src={supplier.LogoT} alt={supplier.SupplierName} className="h-14 max-w-52 object-contain"/> : <b>{supplier?.SupplierName}</b>}</div>
        <div className="text-right text-xs"><b className="block text-base">{documentTitle}</b>{metadata}</div>
      </header>}
      {productName && !isReferencePdf && <h1 className="mb-3 text-center text-[25px] font-bold leading-tight">{productName}</h1>}
      <div className="coa-print-content" style={{ textAlign: contentAlignment, paddingLeft: contentAlignment === "left" ? "2mm" : contentAlignment === "center" ? "2mm" : undefined, paddingRight: contentAlignment === "right" ? "2mm" : contentAlignment === "center" ? "2mm" : undefined }}>
        {isReferencePdf ? <ReferencePdfPage data={file.data} pageNumber={renderPage.pdfPageNumber}/>
        : file.editableHtml !== undefined ? <div className="coa-rich-editor h-full w-full overflow-hidden rounded border border-dashed border-indigo-200 text-[11px] leading-relaxed outline-none print:border-0" contentEditable suppressContentEditableWarning onFocus={(event) => { const draft = editorDrafts.current[renderPage.sourceId] ?? file.editableHtml; if (isEmptyEditorPlaceholder(draft)) { editorDrafts.current[renderPage.sourceId] = ""; event.currentTarget.innerHTML = ""; } }} onInput={(event) => { editorDrafts.current[renderPage.sourceId] = event.currentTarget.innerHTML; }} onBlur={(event) => { const html = event.currentTarget.innerHTML; editorDrafts.current[renderPage.sourceId] = html; updateChunk(renderPage, html); }} dangerouslySetInnerHTML={{ __html: (editorDrafts.current[renderPage.sourceId] ?? file.editableHtml).trim() || "<p class='text-center text-slate-400 placeholder-coa'>متن یا جدول را اینجا Paste کنید…</p>" }}/>
        : file.mimeType.startsWith("image/") ? <img src={file.data} className="mx-auto max-h-[215mm] w-full object-contain"/> : <object data={file.data} type="application/pdf" className="h-[215mm] w-full"><a href={file.data}>{file.name}</a></object>}
      </div>
      {includeHeaderFooter && <footer className="coa-print-footer mt-3 border-t border-slate-400 pt-2 text-center text-[9px] leading-snug text-slate-600">
        <div className="font-bold text-slate-800">{supplier?.SupplierName}</div>
        <div>{[supplier?.Address, supplier?.Tel && `Tel: ${supplier.Tel}`, supplier?.Email && `Email: ${supplier.Email}`].filter(Boolean).join("  |  ")}</div>
        <div className="mt-1 font-medium text-slate-700">Page {index + 1} of {renderPages.length}</div>
      </footer>}
    </article></section>})}
    {renderPages.length === 0 && <div className="grid min-h-[220mm] place-items-center text-sm text-slate-400">{emptyMessage}</div>}
  </div>;
};
