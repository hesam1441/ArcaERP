// PDF.js needs these assets for scanned JBIG2/JPX pages, CMaps and fonts.
// Keep preview, extraction and printed attachments on the same decoder setup.
export const pdfRenderingOptions = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};
