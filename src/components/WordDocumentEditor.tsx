import React, { useEffect, useRef } from "react";
import { renderAsync } from "docx-preview";

interface Props {
  data: string;
  fallbackHtml?: string;
  onChange: (html: string) => void;
  className?: string;
}

/** Renders the original DOCX instead of reducing it to plain HTML, preserving Word tables and lists. */
export const WordDocumentEditor: React.FC<Props> = ({ data, fallbackHtml, onChange, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!containerRef.current || !data) return;
      try {
        const buffer = await fetch(data).then((response) => response.arrayBuffer());
        if (cancelled || !containerRef.current) return;
        // The document is rendered inside an A4 editor page. Ignoring DOCX page dimensions
        // prevents Word's own A4 canvas from being added inside this A4 canvas.
        await renderAsync(buffer, containerRef.current, undefined, { inWrapper: false, breakPages: false, ignoreWidth: true, ignoreHeight: true, ignoreFonts: false, experimental: true });
      } catch {
        if (containerRef.current) containerRef.current.innerHTML = fallbackHtml || "<p>فایل Word قابل‌نمایش نیست.</p>";
      }
    };
    render();
    return () => { cancelled = true; };
  }, [data, fallbackHtml]);
  return <div ref={containerRef} className={className} contentEditable suppressContentEditableWarning onInput={(event) => onChange(event.currentTarget.innerHTML)} onBlur={(event) => onChange(event.currentTarget.innerHTML)}/>;
};
