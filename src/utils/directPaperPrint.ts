import { installAutomaticPrintFit } from './automaticPrintFit';

/** Print live HTML in the local browser; no PDF generation or server roundtrip. */
export async function directPaperPrint({ html, styles, title }: { html: string; styles: string; title: string }) {
  const frame = document.createElement('iframe');
  frame.sandbox.add('allow-same-origin', 'allow-modals');
  frame.title = 'چاپ مستقیم روی کاغذ';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  const target = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!target || !doc) { frame.remove(); throw new Error('پنجرهٔ چاپ در دسترس نیست.'); }
  const previousTitle = document.title;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (cleanupTimer) clearTimeout(cleanupTimer);
    document.title = previousTitle;
    frame.remove();
  };
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  try {
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${escape(document.baseURI)}"><title>${escape(title)}</title>${styles}<style>@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important;background:white}body,body *{visibility:visible!important}.print\\:hidden{display:none!important}</style></head><body>${html}</body></html>`);
    doc.close();
    const assetsReady = Promise.all([
      doc.fonts.ready,
      ...Array.from(doc.images).map(image => image.complete ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), {once:true});
        image.addEventListener('error', () => reject(new Error('یکی از تصاویر چاپ بارگذاری نشد. دوباره تلاش کنید.')), {once:true});
      })),
    ]);
    let assetTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([assetsReady, new Promise((_, reject) => { assetTimer = setTimeout(() => reject(new Error('بارگذاری منابع چاپ طول کشید؛ اتصال را بررسی و دوباره تلاش کنید.')), 20000); })]);
    } finally { if (assetTimer) clearTimeout(assetTimer); }
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    installAutomaticPrintFit(target);
    target.addEventListener('afterprint', cleanup, {once:true});
    document.title = title;
    target.focus();
    // The browser owns the native printer dialog; keep the document alive until
    // printing/cancellation, including browsers where print() returns early.
    cleanupTimer = setTimeout(cleanup, 10 * 60 * 1000);
    target.print();
  } catch (error) { cleanup(); throw error; }
}
