import type { DocumentTemplateField } from "../types";

/** Rearrange the real document blocks while keeping live order data and calculations. */
export function applyStandardTemplateLayout(paper: HTMLElement, fields: DocumentTemplateField[]) {
  const originals = new Map<HTMLElement, string | null>();
  const clones: HTMLElement[] = [];
  const remember = (node: HTMLElement) => { if (!originals.has(node)) originals.set(node, node.getAttribute("style")); };
  remember(paper);
  paper.style.position = "relative";
  paper.style.minHeight = "0";
  paper.style.height = "auto";
  paper.style.aspectRatio = "210 / 297";
  for (const block of paper.querySelectorAll<HTMLElement>("[data-standard-block]")) {
    remember(block);
    const field = fields.find(item => item.source === `standard:${block.dataset.standardBlock}`);
    if (!field) { block.style.display = "none"; continue; }
    const base = parseFloat(getComputedStyle(block).fontSize) || 11;
    const ratio = field.fontSize / base;
    const fonts = [block, ...block.querySelectorAll<HTMLElement>("*")].map(node => ({node, font: parseFloat(getComputedStyle(node).fontSize)}));
    for (const {node, font} of fonts) {
      remember(node);
      if (Number.isFinite(font)) node.style.fontSize = `${font * ratio}px`;
      node.style.fontFamily = field.fontFamily;
      if (field.bold) node.style.fontWeight = "700";
      if (field.color) node.style.color = field.color;
      if (field.align) node.style.textAlign = field.align;
    }
    Object.assign(block.style, { position: "absolute", left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, maxWidth: "none", margin: "0", height: "auto", minHeight: `${field.height || 0}%`, color: field.color || "", backgroundColor: field.backgroundColor || "", textAlign: field.align || "left", transform: `rotate(${field.rotation || 0}deg)`, zIndex: String(field.zIndex || 0) });
    if (field.borderWidth !== undefined) block.style.border = `${field.borderWidth}px solid ${field.borderColor || "#94a3b8"}`;
    for (const duplicate of fields.filter(item => item.source === field.source && item.id !== field.id)) {
      const clone = block.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {left:`${duplicate.x}%`,top:`${duplicate.y}%`,width:`${duplicate.width}%`,minHeight:`${duplicate.height || 0}%`,transform:`rotate(${duplicate.rotation || 0}deg)`,zIndex:String(duplicate.zIndex || 0)});
      for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
        const size = parseFloat(node.style.fontSize);
        if (Number.isFinite(size)) node.style.fontSize = `${size * duplicate.fontSize / field.fontSize}px`;
        node.style.fontFamily = duplicate.fontFamily;
        if (duplicate.color) node.style.color = duplicate.color;
        if (duplicate.bold) node.style.fontWeight = "700";
        if (duplicate.align) node.style.textAlign = duplicate.align;
      }
      paper.appendChild(clone);
      clones.push(clone);
    }
  }
  return () => { clones.forEach(node => node.remove()); for (const [node, style] of originals) { if (style === null) node.removeAttribute("style"); else node.setAttribute("style", style); } };
}
