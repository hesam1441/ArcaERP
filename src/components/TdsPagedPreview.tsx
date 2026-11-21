import React, { useEffect, useRef } from "react";
import { Previewer } from "pagedjs";
import { Supplier } from "../types";

interface Props { html: string; productName: string; supplier?: Supplier; alignment?: "left" | "center" | "right"; }

const safeText = (value?: string) => (value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));

export const TdsPagedPreview: React.FC<Props> = ({ html, productName, supplier, alignment = "left" }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const header = `<div class="tds-page-overlay-header"><div>${supplier?.LogoT ? `<img src="${supplier.LogoT}"/>` : `<b>${safeText(supplier?.SupplierName)}</b>`}<span>TECHNICAL DATA SHEET</span></div><h1>${safeText(productName)}</h1></div>`;
    const footerInfo = safeText([supplier?.Address, supplier?.Tel && `Tel: ${supplier.Tel}`, supplier?.Email && `Email: ${supplier.Email}`].filter(Boolean).join("  |  "));
    const pageStyles = `
      @font-face { font-family:"Public Sans"; src:url("/fonts/public-sans/PublicSans-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; }
      @font-face { font-family:"Public Sans"; src:url("/fonts/public-sans/PublicSans-SemiBold.woff2") format("woff2"); font-weight:600; font-style:normal; }
      @font-face { font-family:"Public Sans"; src:url("/fonts/public-sans/PublicSans-Bold.woff2") format("woff2"); font-weight:700; font-style:normal; }
      @page { size: A4 portrait; margin: 40mm 12mm 23mm; }
      body, body * { font-family:"Public Sans",Arial,sans-serif !important; font-variant-numeric:tabular-nums; } body { font-size:11px; color:#0f172a; } main { text-align:${alignment}; padding-left:${alignment === "left" || alignment === "center" ? "2mm" : "0"}; padding-right:${alignment === "right" || alignment === "center" ? "2mm" : "0"}; } table { width:100%; border-collapse:collapse; } td,th { border:1px solid #64748b; padding:4px 6px; } img { max-width:100%; } ul,ol { padding-left:7mm; }
    `;
    const source = `<main>${html}</main>`;
    const render = async () => {
      if (!hostRef.current) return;
      hostRef.current.innerHTML = "";
      // Paged.js only guarantees @page parsing for stylesheet URLs. A Blob URL keeps
      // the stylesheet local while ensuring the A4 margins affect pagination itself.
      const stylesheetUrl = URL.createObjectURL(new Blob([pageStyles], { type: "text/css" }));
      try {
        await new Previewer().preview(source, [stylesheetUrl], hostRef.current);
      } finally {
        URL.revokeObjectURL(stylesheetUrl);
      }
      if (!hostRef.current || cancelled) return;
      const pages = [...hostRef.current.querySelectorAll<HTMLElement>(".pagedjs_page")] as HTMLElement[];
      pages.forEach((page, index) => {
        page.style.setProperty("--pagedjs-width", "210mm", "important");
        page.style.setProperty("--pagedjs-height", "297mm", "important");
        page.style.setProperty("--pagedjs-pagebox-width", "210mm", "important");
        page.style.setProperty("--pagedjs-pagebox-height", "297mm", "important");
        page.style.setProperty("--pagedjs-margin-top", "40mm", "important");
        page.style.setProperty("--pagedjs-margin-right", "12mm", "important");
        page.style.setProperty("--pagedjs-margin-bottom", "23mm", "important");
        page.style.setProperty("--pagedjs-margin-left", "12mm", "important");
        const pageBox = page.querySelector<HTMLElement>(".pagedjs_pagebox");
        if (!pageBox) return;
        pageBox.insertAdjacentHTML("beforeend", header);
        pageBox.insertAdjacentHTML("beforeend", `<div class="tds-page-overlay-footer"><b>${safeText(supplier?.SupplierName)}</b><span>${footerInfo}</span><span>Page ${index + 1} of ${pages.length}</span></div>`);
      });
      if (cancelled && hostRef.current) hostRef.current.innerHTML = "";
    };
    render();
    return () => { cancelled = true; };
  }, [html, productName, supplier, alignment]);
  return <div ref={hostRef} className="tds-paged-preview" dir="ltr"/>;
};
