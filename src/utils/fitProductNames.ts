/** Fit product identities after the final table width and fonts are known. */
export function fitProductNames(root: ParentNode = document) {
  for (const name of root.querySelectorAll<HTMLElement>("[data-print-product-name]")) {
    const cell = name.closest("td");
    if (!cell) continue;
    const view = name.ownerDocument.defaultView!;
    const preferred = Number(name.dataset.preferredSizePt);
    const base = preferred > 0 ? Math.max(4, Math.min(30, preferred)) * 4 / 3 : parseFloat(view.getComputedStyle(cell).fontSize) || 11;
    name.style.fontSize = `${base}px`;
    const size = base * Math.min(1, Math.max(1, name.clientWidth - 1) / Math.max(1, name.scrollWidth));
    name.style.fontSize = `${size}px`;
    const detail = name.closest("tr")?.nextElementSibling?.querySelector<HTMLElement>("[data-print-product-detail]");
    if (detail) {
      const preferredDetail = Number(detail.dataset.preferredSizePt);
      const baseDetail = preferredDetail > 0 ? Math.min(Math.max(4, Math.min(30, preferredDetail)) * 4 / 3, size * 0.98) : Math.min(11, size * 0.95);
      detail.style.fontSize = `${baseDetail}px`;
      detail.style.fontSize = `${baseDetail * Math.min(1, Math.max(1, detail.clientWidth - 1) / Math.max(1, detail.scrollWidth))}px`;
    }
  }
}
