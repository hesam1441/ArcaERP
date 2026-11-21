/** Runs inside the PDF browser, after print styles, fonts and images are ready. */
export function fitPrintDocuments(document: Document = globalThis.document) {
  const setBase = (element: HTMLElement, values: Record<string, string>) => {
    for (const [property, value] of Object.entries(values)) element.style.setProperty(property, value, "important");
  };
  const explicitPages = ".bundle-cover,.coa-source-sheet,.coa-document-page,.coa-page-sheet,.coa-bundle-page,.embedded-pdf-page,.embedded-canvas-page";
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(explicitPages)).filter(element => !element.closest(".bundle-document") && !element.parentElement?.closest(explicitPages));
  candidates.push(...Array.from(document.querySelectorAll<HTMLElement>(".printable-document,.printable-correspondence")).filter(element => !element.closest(".bundle-document") && !element.querySelector(explicitPages)));
  for (const element of candidates) {
    const sheet = document.createElement("section");
    sheet.className = "bundle-document";
    sheet.dataset.autoFitWrapper = "true";
    element.before(sheet);
    if (element.matches(".printable-document")) sheet.appendChild(element);
    else {
      const viewport = document.createElement("div");
      viewport.className = "printable-document";
      viewport.dataset.autoFitWrapper = "true";
      sheet.appendChild(viewport);
      const paper = document.createElement("div");
      paper.dataset.autoFitWrapper = "true";
      viewport.appendChild(paper);
      paper.appendChild(element);
      setBase(element, { position: "relative", inset: "auto", width: "100%", "max-width": "100%", "min-height": "0", "max-height": "none", overflow: "visible", margin: "0", "break-after": "auto", "page-break-after": "auto", height: "auto" });
      if (!element.matches(".bundle-cover")) setBase(element, { padding: "0" });
    }
    for (let parent = sheet.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (parent.matches(".printable-document,.printable-document > div")) setBase(parent, { position: "static", inset: "auto", display: "block", width: "210mm", height: "auto", "min-height": "0", "max-height": "none", padding: "0", margin: "0", overflow: "visible" });
    }
  }
  for (const sheet of document.querySelectorAll<HTMLElement>(".bundle-document")) {
    if (sheet.querySelector(":scope > .printable-document")) continue;
    const viewport = document.createElement("div");
    const paper = document.createElement("div");
    viewport.className = "printable-document";
    viewport.dataset.autoFitWrapper = paper.dataset.autoFitWrapper = "true";
    while (sheet.firstChild) paper.appendChild(sheet.firstChild);
    viewport.appendChild(paper);
    sheet.appendChild(viewport);
  }
  const results: Array<{ scale: number; height: number; availableHeight: number }> = [];
  for (const page of document.querySelectorAll<HTMLElement>(".bundle-document")) {
    const viewport = page.querySelector<HTMLElement>(":scope > .printable-document");
    const paper = viewport?.firstElementChild as HTMLElement | null;
    // Uploaded PDF/image pages retain their original pagination and proportions.
    if (!viewport || !paper) continue;
    const set = setBase;
    // Keep content inside the printable area of ordinary A4 office printers.
    set(page, { width: "210mm", height: "297mm", padding: "5mm", overflow: "hidden", position: "relative", "box-sizing": "border-box", "break-after": "page", "page-break-after": "always", visibility: "visible" });
    if (!page.nextElementSibling) set(page, { "break-after": "auto", "page-break-after": "auto" });
    set(viewport, { width: "200mm", height: "287mm", "min-height": "0", "max-height": "287mm", padding: "0", margin: "0", position: "relative", inset: "auto", overflow: "hidden" });
    set(paper, { width: "200mm", "max-width": "none", height: "auto", "min-height": "0", "max-height": "none", padding: "0", margin: "0", transform: "none", "box-sizing": "border-box", overflow: "visible", position: "relative", inset: "auto" });
    if (document.defaultView!.getComputedStyle(paper).display === "block") set(paper, { display: "flow-root" });
    // Framed COA images are absolutely positioned inside a fixed-height flex
    // frame. Making that frame/content height auto collapses the source image
    // to zero height, leaving only the header and footer in exported PDFs.
    for (const content of paper.querySelectorAll<HTMLElement>(".coa-print-page,.coa-print-content,.coa-editable-print")) set(content, { height: "auto", "min-height": "0", "max-height": "none", overflow: "visible", "flex-shrink": "0" });
    // Measure natural content first. A previous fit may have stretched the footer
    // container; keeping that height would progressively shrink repeated exports.
    const footer = paper.querySelector<HTMLElement>('[data-standard-block="footer"]');
    const footerStyle = footer && document.defaultView!.getComputedStyle(footer);
    const footerParent = footer && footerStyle?.display !== "none" && !["absolute", "fixed"].includes(footerStyle!.position)
      ? footer.parentElement : null;
    if (footer && footerParent) {
      set(footerParent, { display: "flex", "flex-direction": "column", "min-height": "0", height: "auto" });
      set(footer, { "margin-top": "0", "flex-shrink": "0" });
    }
    const availableWidth = viewport.clientWidth;
    const availableHeight = viewport.clientHeight;
    const measure = () => {
      const origin = paper.getBoundingClientRect();
      let width = Math.max(paper.scrollWidth, origin.width);
      let height = Math.max(paper.scrollHeight, origin.height);
      for (const child of paper.querySelectorAll<HTMLElement>("*")) {
        const rect = child.getBoundingClientRect();
        width = Math.max(width, rect.right - origin.left);
        height = Math.max(height, rect.bottom - origin.top);
      }
      return { width, height };
    };
    let size = measure();
    if (size.height > availableHeight) {
      // Remove spare layout space before reducing any text or artwork.
      for (const section of Array.from(paper.children) as HTMLElement[]) {
        const style = document.defaultView!.getComputedStyle(section);
        if (parseFloat(style.marginTop) > 8) set(section, { "margin-top": "8px" });
        if (parseFloat(style.paddingTop) > 8) set(section, { "padding-top": "8px" });
        if (parseFloat(style.rowGap) > 8) set(section, { "row-gap": "8px" });
      }
      for (const term of paper.querySelectorAll<HTMLElement>("section:has([data-print-term])")) set(term, { "min-height": "0" });
      size = measure();
    }
    const scale = Math.min(1, (availableWidth - 1) / Math.max(1, size.width), (availableHeight - 1) / Math.max(1, size.height));
    if (footer && footerParent) {
      // Stretch only the free space above the footer, accounting for the final
      // scale. The bank/signature block then ends at the printable bottom edge.
      const offset = footerParent.getBoundingClientRect().top - paper.getBoundingClientRect().top;
      set(footerParent, { "min-height": `${Math.max(0, (availableHeight - 1) / scale - offset)}px` });
      set(footer, { "margin-top": "auto" });
    }
    set(paper, { transform: `scale(${scale})`, "transform-origin": "top left", "margin-left": `${Math.max(0, (availableWidth - size.width * scale) / 2)}px` });
    page.dataset.printFitScale = String(scale);
    results.push({ scale, height: size.height, availableHeight });
  }
  return results;
}
