import React, { useLayoutEffect, useRef } from "react";
import { fitProductNames } from "../utils/fitProductNames";

export function PrintProductName({ text, namePt, detailPt }: { text: string; namePt?: number; detailPt?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const table = ref.current?.closest("table");
    if (!table) return;
    let active = true;
    const fit = () => { if (active) fitProductNames(table); };
    const observer = new ResizeObserver(fit);
    observer.observe(table);
    fit();
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [text, namePt, detailPt]);
  return <div style={{ width: 0, minWidth: "100%" }}><div ref={ref} data-print-product-name data-preferred-size-pt={namePt} className="font-normal text-slate-950 uppercase" style={{ whiteSpace: "nowrap" }}>{text}</div></div>;
}
