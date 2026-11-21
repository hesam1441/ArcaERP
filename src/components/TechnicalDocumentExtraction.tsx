import { InlineHelp } from "./InlineHelp";
import { pdfRenderingOptions } from "../utils/pdfRendering";
import React, { useState } from "react";
import { FileSearch, LoaderCircle, Sparkles } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { FileAttachment, Order, TechnicalDocumentExtraction } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;

const clean = (value?: string) => String(value || "").replace(/\s+/g, " ").trim();
const date = (value?: string) => {
  const match = clean(value).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
};
const field = (text: string, label: string) => clean(text.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i"))?.[1]);
const specification = (text: string, label: string) => clean(text.match(new RegExp(`${label}\\s*([0-9.,]+\\s*(?:min\\.|max\\.|%|°C)?)`, "i"))?.[1]);

const extract = async (file: FileAttachment): Promise<TechnicalDocumentExtraction> => {
  if (file.mimeType !== "application/pdf") throw new Error("Only PDF extraction is available in this first version.");
  const bytes = await fetch(file.data).then((response) => response.arrayBuffer());
  const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(bytes) }).promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const content = await (await pdf.getPage(index + 1)).getTextContent();
    return content.items.map((item) => "str" in item ? item.str : "").join("\n");
  }));
  const text = pages.join("\n");
  const productName = field(text, "PRODUCT\\s+NAME") || field(text, "PRODUCT");
  const isCoa = /CERTIFICATE\s+OF\s+ANALYSIS|BATCH\s+NO|TEST\s+VALUE/i.test(text);
  const rows = [
    ["Solidification point", "Solidification\\s+point"], ["Pt/Co scale colour", "Pt/Co\\s+scale\\s+colour"],
    ["Water by Karl Fischer", "Water\\s+by\\s+Karl\\s+Fischer"], ["Purity", "Purity"],
    ["2-methylbenzofuran (2-MBF)", "2-methylbenzofurane?\\s*\\(2-MBF\\)"], ["o-mesityl", "o-mesityl"],
    ["Carbonyl number", "Carbonyl\\s+Number"], ["Water miscibility", "Water\\s+miscibility"],
  ].map(([property, label]) => ({ property, specification: specification(text, label) || "Not stated", status: "needs_review" as const }));
  return {
    attachmentId: file.id, attachmentName: file.name, documentKind: isCoa ? "COA" : /TDS|TECHNICAL/i.test(file.name) ? "TDS" : "OTHER",
    productName: productName || undefined, batchNumber: field(text, "BATCH\\s+NO") || undefined,
    documentNumber: field(text, "DOCUMENT\\s+NO") || undefined, productDate: date(field(text, "PRODUCT\\s+DATE")), expiryDate: date(field(text, "EXPIRY\\s+DATE")),
    specifications: rows.filter((row) => row.specification !== "Not stated"), sourceText: text.slice(0, 12000), extractedAt: new Date().toISOString(), status: "draft",
  };
};

export const TechnicalDocumentExtractionPanel: React.FC<{ order: Order; onChange: (order: Order) => void }> = ({ order, onChange }) => {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const extraction = order.technicalDocumentExtraction;
  const source = (order.attachments || []).find((item) => item.id === extraction?.attachmentId);
  const run = async () => {
    const file = (order.attachments || []).find((item) => item.mimeType === "application/pdf");
    if (!file) return setMessage("Upload a PDF COA or TDS first.");
    setBusy(true); setMessage("");
    try { onChange({ ...order, technicalDocumentExtraction: await extract(file) }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Extraction failed."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-3" dir="ltr">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="flex items-center gap-1.5 text-xs font-bold text-violet-950"><FileSearch size={15}/> COA / TDS extraction</h4><InlineHelp><p className="mt-1 text-[10px] text-violet-800">Extract a PDF into an English draft. Nothing is posted or used in issued documents until reviewed.</p></InlineHelp></div><button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300">{busy ? <LoaderCircle className="animate-spin" size={14}/> : <Sparkles size={14}/>} Extract PDF</button></div>
    {message && <p className="mt-2 text-[11px] font-semibold text-rose-700">{message}</p>}
    {extraction && <div className="mt-3 rounded-lg border border-violet-100 bg-white p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><b>{extraction.documentKind} draft · {extraction.attachmentName}</b><span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Needs review</span></div><div className="mt-2 grid gap-2 sm:grid-cols-3"><span>Product: <b>{extraction.productName || "Not found"}</b></span><span>Batch: <b>{extraction.batchNumber || "Not found"}</b></span><span>Document: <b>{extraction.documentNumber || "Not found"}</b></span></div><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-slate-500"><tr><th className="py-1">Property</th><th>Specification</th><th>Result</th></tr></thead><tbody>{extraction.specifications.map((row) => <tr key={row.property} className="border-t"><td className="py-1">{row.property}</td><td>{row.specification}</td><td className="text-amber-700">Not stated — review</td></tr>)}</tbody></table></div></div>}
    {source === undefined && extraction && <p className="mt-2 text-[10px] text-rose-700">The original source file was removed; this draft cannot be approved.</p>}
  </section>;
};
