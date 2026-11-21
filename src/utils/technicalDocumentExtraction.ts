import { pdfRenderingOptions } from "./pdfRendering";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { CommercialDocumentFile, TechnicalDocumentExtraction } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;

const clean = (value?: string) => String(value || "").replace(/\s+/g, " ").trim();
const field = (text: string, label: string) => clean(text.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i"))?.[1]);
const specification = (text: string, label: string) => clean(text.match(new RegExp(`${label}\\s*([0-9.,]+\\s*(?:min\\.|max\\.|%|°C)?)`, "i"))?.[1]);
const date = (value?: string) => { const match = clean(value).match(/(\d{2})\.(\d{2})\.(\d{4})/); return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined; };
const detectedHeaders = (text: string) => {
  if (/TEST\s*\n\s*VALUE/i.test(text)) return { property: "Test", specification: "Value" };
  if (/TEST\s+DESCRIPTION/i.test(text)) return { property: "Test Description", specification: /SPECIFICATION/i.test(text) ? "Specification" : "Value", result: /(?:TEST\s+)?RESULT/i.test(text) ? "Result" : undefined };
  return { property: "Test", specification: "Specification", result: /(?:TEST\s+)?RESULT/i.test(text) ? "Result" : undefined };
};

/** Runs only after an explicit user action. The original uploaded file remains authoritative. */
export const extractTechnicalPdf = async (file: Pick<CommercialDocumentFile, "id" | "name" | "mimeType" | "data">): Promise<TechnicalDocumentExtraction> => {
  if (file.mimeType !== "application/pdf") throw new Error("PDF extraction is available for PDF files only.");
  const bytes = await fetch(file.data).then((response) => response.arrayBuffer());
  const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(bytes) }).promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const content = await (await pdf.getPage(index + 1)).getTextContent();
    return content.items.map((item) => "str" in item ? item.str : "").join("\n");
  }));
  const text = pages.join("\n");
  const isCoa = /CERTIFICATE\s+OF\s+ANALYSIS|BATCH\s+NO|TEST\s+VALUE/i.test(text);
  const rows = [["Solidification point", "Solidification\\s+point"], ["Pt/Co scale colour", "Pt/Co\\s+scale\\s+colour"], ["Water by Karl Fischer", "Water\\s+by\\s+Karl\\s+Fischer"], ["Purity", "Purity"], ["2-methylbenzofuran (2-MBF)", "2-methylbenzofurane?\\s*\\(2-MBF\\)"], ["o-mesityl", "o-mesityl"], ["Carbonyl number", "Carbonyl\\s+Number"], ["Water miscibility", "Water\\s+miscibility"]]
    .map(([property, label]) => ({ property, specification: specification(text, label) || "Not stated", status: "needs_review" as const }))
    .filter((row) => row.specification !== "Not stated");
  return { attachmentId: file.id, attachmentName: file.name, documentKind: isCoa ? "COA" : /TDS|TECHNICAL/i.test(file.name) ? "TDS" : "OTHER", productName: field(text, "PRODUCT\\s+NAME") || field(text, "PRODUCT") || undefined, batchNumber: field(text, "BATCH\\s+NO") || undefined, documentNumber: field(text, "DOCUMENT\\s+NO") || undefined, productDate: date(field(text, "PRODUCT\\s+DATE")), expiryDate: date(field(text, "EXPIRY\\s+DATE")), specifications: rows, columnHeaders: detectedHeaders(text), sourceText: text.slice(0, 12000), extractedAt: new Date().toISOString(), status: "draft" };
};
