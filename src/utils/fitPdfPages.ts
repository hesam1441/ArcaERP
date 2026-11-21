import { PDFDocument, degrees } from "pdf-lib";

/** Preserve every imported page while fitting it inside a 5 mm A4 margin. */
export async function appendFittedPdfPages(output: PDFDocument, source: PDFDocument) {
  const width = 210 * 72 / 25.4;
  const height = 297 * 72 / 25.4;
  const margin = 5 * 72 / 25.4;
  const originals = source.getPages();
  const embedded = await output.embedPages(originals);
  embedded.forEach((content, index) => {
    const angle = ((originals[index].getRotation().angle % 360) + 360) % 360;
    const sideways = angle === 90 || angle === 270;
    const visualWidth = sideways ? content.height : content.width;
    const visualHeight = sideways ? content.width : content.height;
    const scale = Math.min((width - margin * 2) / visualWidth, (height - margin * 2) / visualHeight);
    const left = (width - visualWidth * scale) / 2;
    const bottom = (height - visualHeight * scale) / 2;
    // PDF page rotation is clockwise; drawing rotation is counterclockwise.
    const rotation = (360 - angle) % 360;
    const x = left + (rotation === 90 || rotation === 180 ? (rotation === 90 ? content.height : content.width) * scale : 0);
    const y = bottom + (rotation === 180 || rotation === 270 ? (rotation === 180 ? content.height : content.width) * scale : 0);
    output.addPage([width, height]).drawPage(content, { x, y, width: content.width * scale, height: content.height * scale, rotate: degrees(rotation) });
  });
}
