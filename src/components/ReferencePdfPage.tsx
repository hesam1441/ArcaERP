import { pdfRenderingOptions } from "../utils/pdfRendering";
import React, { useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export const ReferencePdfPage: React.FC<{ data: string; pageNumber?: number }> = ({ data, pageNumber = 1 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const bytes = await fetch(data).then((response) => response.arrayBuffer());
      const pdf = await getDocument({ ...pdfRenderingOptions, data: new Uint8Array(bytes) }).promise;
      const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
      const viewport = page.getViewport({ scale: 2.25 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    };
    render().catch(console.error);
    return () => { cancelled = true; };
  }, [data, pageNumber]);
  return <canvas ref={canvasRef} className="reference-pdf-canvas"/>;
};
