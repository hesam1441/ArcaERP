import { InlineHelp } from "./InlineHelp";
import { PrintPagePositionControls } from "./PrintPagePositionControls";
import { readPrintPagePosition } from "../utils/printPagePosition";
import React, { useMemo, useState } from "react";
import { Check, ChevronDown, FileText, Pencil, Plus, Printer, RotateCcw, Save, Settings2, Trash2, X } from "lucide-react";
import { AppDatabase, ChequePrintField, ChequePrintFieldStyle, ChequePrintFormat, ChequePrintSettings, PrintedCheque } from "../types";

const fields: Array<{ id: ChequePrintField; label: string; sample: string }> = [
  { id: "date", label: "تاریخ", sample: "2026-11-03" },
  { id: "payee", label: "دریافت‌کننده", sample: "PAYEE NAME" },
  { id: "amount", label: "مبلغ عددی", sample: "1,250.00" },
  { id: "amountWords", label: "مبلغ به حروف", sample: "One Thousand Two Hundred Fifty and Fifty" },
  { id: "memo", label: "یادداشت", sample: "Invoice / reference" },
];

const defaultSettings: ChequePrintSettings = {
  version: 2,
  template: "bmo_canada_158x68",
  fields: {
    // The physical BMO form already prints the "20" prefix. The supplied
    // guide places YY immediately after it, then MM and DD between the dashes.
    date: { left: 117.2, top: 12.2, fontSize: 4.8, fontFamily: "Arial", fontWeight: 500 },
    payee: { left: 31.5, top: 21.0, fontSize: 4.2, fontFamily: "Arial", fontWeight: 500 },
    amount: { left: 123.5, top: 21.2, fontSize: 4.5, fontFamily: "Arial", fontWeight: 600 },
    amountWords: { left: 8, top: 33.8, fontSize: 3.2, fontFamily: "Arial", fontWeight: 500 },
    memo: { left: 14, top: 54.5, fontSize: 3.6, fontFamily: "Arial", fontWeight: 400 },
  },
};

const emptyCheque = (userId: string): PrintedCheque => ({
  id: `cheque-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  chequeNumber: "",
  issueDate: new Date().toISOString().slice(0, 10),
  payee: "",
  amount: 0,
  currency: "CAD",
  amountWords: "",
  memo: "",
  status: "draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdByUserId: userId,
});

const numberWords = (value: number) => {
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowThousand = (n: number): string => n < 20 ? ones[n] : n < 100 ? `${tens[Math.floor(n / 10)]}${n % 10 ? `-${ones[n % 10]}` : ""}` : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${belowThousand(n % 100)}` : ""}`;
  const whole = Math.floor(Math.max(0, value));
  const groups: Array<[number, string]> = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]];
  let remaining = whole;
  const parts: string[] = [];
  for (const [unit, name] of groups) if (remaining >= unit) { parts.push(`${belowThousand(Math.floor(remaining / unit))} ${name}`); remaining %= unit; }
  if (remaining || !parts.length) parts.push(belowThousand(remaining));
  const cents = Math.round((value - Math.floor(value)) * 100);
  // The blank BMO form already prints both "/100" and "DOLLARS" on the
  // right-hand side. Only the words and cents fraction belong in this line.
  return `${parts.join(" ")} and ${belowThousand(cents)}`;
};

const monetary = (amount: number) => `$ ${Number(amount || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const chequeAmount = (amount: number) => Number(amount || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// BMO's physical cheque already contains the fixed "20" year prefix. Only
// YY, MM and DD are written into the three blank sections that follow it.
const dateParts = (value: string) => {
  const [year = "", month = "", day = ""] = value.split("-");
  return { year: year.slice(-2), month, day };
};

export const BmoChequeIssuer: React.FC<{ db: AppDatabase; userId: string; onSave: (cheques: PrintedCheque[], settings: ChequePrintSettings, formats: ChequePrintFormat[]) => void }> = ({ db, userId, onSave }) => {
  const [cheques, setCheques] = useState<PrintedCheque[]>(() => db.printedCheques || []);
  // Version 1 used the first, uncalibrated visual positions. It is safe to
  // migrate it because no calibrated BMO layout existed before this tool.
  const [settings, setSettings] = useState<ChequePrintSettings>(() => !db.chequePrintSettings || (db.chequePrintSettings.version || 1) < 2 ? defaultSettings : db.chequePrintSettings);
  const [formats, setFormats] = useState<ChequePrintFormat[]>(() => db.chequePrintFormats || []);
  const [formatName, setFormatName] = useState("");
  const [selectedFormatId, setSelectedFormatId] = useState("");
  const [draft, setDraft] = useState<PrintedCheque>(() => emptyCheque(userId));
  const [selectedField, setSelectedField] = useState<ChequePrintField>("payee");
  const [showCalibration, setShowCalibration] = useState(true);
  const [printPagePosition, setPrintPagePosition] = useState(readPrintPagePosition);
  const [showPrintPositionPreview, setShowPrintPositionPreview] = useState(false);

  const isSaved = useMemo(() => cheques.some((item) => item.id === draft.id), [cheques, draft.id]);
  const updateDraft = (changes: Partial<PrintedCheque>) => setDraft((current) => ({ ...current, ...changes, updatedAt: new Date().toISOString() }));
  const persist = (nextCheques = cheques, nextSettings = settings, nextFormats = formats) => { setCheques(nextCheques); setSettings(nextSettings); setFormats(nextFormats); onSave(nextCheques, nextSettings, nextFormats); };
  const saveCheque = () => {
    if (!draft.payee.trim() || draft.amount <= 0) return;
    const item = { ...draft, amountWords: draft.amountWords?.trim() || numberWords(draft.amount), updatedAt: new Date().toISOString() };
    setDraft(item);
    persist([item, ...cheques.filter((cheque) => cheque.id !== item.id)], settings);
  };
  const startNew = () => setDraft(emptyCheque(userId));
  const printCheque = () => {
    const item = { ...draft, amountWords: draft.amountWords?.trim() || numberWords(draft.amount), status: "printed" as const, updatedAt: new Date().toISOString() };
    setDraft(item);
    persist([item, ...cheques.filter((cheque) => cheque.id !== item.id)], settings);
    // Browser print headers/footers are outside the document and must be
    // disabled in the native dialog. A temporary blank title avoids printing
    // the application name when the browser honours that setting.
    const previousTitle = document.title;
    document.title = " ";
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => { document.title = previousTitle; }, 500);
    }, 60);
  };
  const updateStyle = (changes: Partial<ChequePrintFieldStyle>) => {
    const next = { ...settings, fields: { ...settings.fields, [selectedField]: { ...settings.fields[selectedField], ...changes } } };
    persist(cheques, next);
  };
  const saveFormat = () => {
    const name = formatName.trim();
    if (!name) return;
    const existing = formats.find((format) => format.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const format: ChequePrintFormat = { id: existing?.id || `cheque-format-${Date.now()}`, name, settings, createdAt: existing?.createdAt || new Date().toISOString() };
    const nextFormats = [format, ...formats.filter((item) => item.id !== format.id)];
    setSelectedFormatId(format.id);
    setFormatName(name);
    persist(cheques, settings, nextFormats);
  };
  const applyFormat = (id: string) => {
    setSelectedFormatId(id);
    const format = formats.find((item) => item.id === id);
    if (format) persist(cheques, { ...format.settings, version: 2 }, formats);
  };
  const deleteFormat = () => {
    if (!selectedFormatId) return;
    const nextFormats = formats.filter((format) => format.id !== selectedFormatId);
    setSelectedFormatId("");
    persist(cheques, settings, nextFormats);
  };
  const deleteCheque = (id: string) => {
    if (!window.confirm("این رکورد چک حذف شود؟")) return;
    const next = cheques.filter((item) => item.id !== id);
    persist(next, settings);
    if (draft.id === id) startNew();
  };
  const printValue = (field: Exclude<ChequePrintField, "date">) => ({
    payee: draft.payee, amount: chequeAmount(draft.amount), amountWords: draft.amountWords?.trim() || numberWords(draft.amount), memo: draft.memo || "",
  })[field];

  return <div className="mx-auto max-w-[1500px] space-y-4" dir="rtl">
    <style>{`@media print {
      #bmo-cheque-print [data-cheque-print-content] { translate: ${printPagePosition.x}mm ${printPagePosition.y}mm !important; }
      @page { size: 158mm 68mm !important; margin: 0 !important; }
      html, body { width: 158mm !important; min-width: 158mm !important; max-width: 158mm !important; height: 68mm !important; min-height: 68mm !important; max-height: 68mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
      body * { visibility: hidden !important; }
      #bmo-cheque-print, #bmo-cheque-print * { visibility: visible !important; }
      #bmo-cheque-print { position: fixed !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important; box-sizing: border-box !important; transform: none !important; width: 158mm !important; min-width: 158mm !important; max-width: 158mm !important; height: 68mm !important; min-height: 68mm !important; max-height: 68mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; box-shadow: none !important; border: 0 !important; background: transparent !important; }
    }`}</style>
    <section className="print:hidden rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"><b>صدور مستقل چک BMO</b> — این ابزار هیچ سند، موجودی یا محاسبهٔ حسابداری را تغییر نمی‌دهد. کاغذ چک واقعی باید در پرینتر قرار بگیرد؛ در چاپ فقط نوشته‌ها روی چک با ابعاد <b>۱۵۸ × ۶۸ میلی‌متر</b> چاپ می‌شوند.</section>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="print:hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-base font-bold text-slate-900">صدور چک BMO (CAD)</h1><InlineHelp><p className="mt-1 text-[11px] text-slate-500">فقط برای مدیر مجاز؛ سوابق چک مستقل و ذخیره‌شده هستند.</p></InlineHelp></div><div className="flex gap-2"><button type="button" onClick={startNew} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Plus size={14}/>چک جدید</button><button type="button" onClick={saveCheque} disabled={!draft.payee.trim() || draft.amount <= 0} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Save size={14}/>{isSaved ? "ذخیرهٔ تغییرات" : "ذخیرهٔ چک"}</button><button type="button" onClick={printCheque} disabled={!draft.payee.trim() || draft.amount <= 0} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Printer size={14}/>چاپ روی چک</button></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-700">شمارهٔ چک<input value={draft.chequeNumber} onChange={(event) => updateDraft({ chequeNumber: event.target.value })} placeholder="شمارهٔ چاپ‌شده روی برگه" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-left font-mono outline-none focus:border-indigo-500" dir="ltr"/></label><label className="text-xs font-medium text-slate-700">تاریخ چک<input type="date" value={draft.issueDate} onChange={(event) => updateDraft({ issueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" dir="ltr"/></label><label className="sm:col-span-2 text-xs font-medium text-slate-700">در وجه<input value={draft.payee} onChange={(event) => updateDraft({ payee: event.target.value })} placeholder="نام دریافت‌کننده" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-indigo-500" dir="ltr"/></label><label className="text-xs font-medium text-slate-700">مبلغ (CAD)<input type="number" min="0" step="0.01" value={draft.amount || ""} onChange={(event) => updateDraft({ amount: Number(event.target.value) || 0, amountWords: "" })} placeholder="0.00" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-left font-mono outline-none focus:border-indigo-500" dir="ltr"/></label><label className="text-xs font-medium text-slate-700">یادداشت (اختیاری)<input value={draft.memo || ""} onChange={(event) => updateDraft({ memo: event.target.value })} placeholder="Invoice / reference" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-indigo-500" dir="ltr"/></label><label className="sm:col-span-2 text-xs font-medium text-slate-700">مبلغ به حروف <span className="font-normal text-slate-400">(خالی باشد خودکار تولید می‌شود)</span><input value={draft.amountWords || ""} onChange={(event) => updateDraft({ amountWords: event.target.value })} placeholder={numberWords(draft.amount)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-left outline-none focus:border-indigo-500" dir="ltr"/></label></div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900"><b>پیش از استفادهٔ واقعی:</b> ابتدا روی کاغذ عادی با همان اندازهٔ چک چاپ آزمایشی بگیرید، آن را روی چک قرار دهید و با تنظیمات کالیبره کنید. در پنجرهٔ چاپ، از <b>More settings</b> اندازهٔ کاغذ را <b>158 × 68 mm</b> (یا اندازهٔ سفارشی تعریف‌شده در درایور Brother) انتخاب کنید، <b>Margins: None</b> و <b>Scale: 100%</b> را قرار دهید و <b>Headers and footers</b> را خاموش کنید. این گزینهٔ آخر توسط مرورگر کنترل می‌شود و برنامه نمی‌تواند آن را از داخل صفحه تغییر دهد.</div>
      </section>
      <aside className="print:hidden space-y-3"><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><button type="button" onClick={() => setShowCalibration((value) => !value)} className="flex w-full items-center justify-between text-right"><span className="flex items-center gap-2 text-sm font-bold text-slate-900"><Settings2 size={17} className="text-indigo-600"/>تنظیم جایگاه و فونت</span><ChevronDown size={16} className={showCalibration ? "rotate-180" : ""}/></button>{showCalibration && <div className="mt-3 space-y-3"><label className="text-[11px] font-bold text-slate-600">عنصر<select value={selectedField} onChange={(event) => setSelectedField(event.target.value as ChequePrintField)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2">{fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-600">از چپ (mm)<input type="number" step="0.1" value={settings.fields[selectedField].left} onChange={(e) => updateStyle({ left: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-[11px] text-slate-600">از بالا (mm)<input type="number" step="0.1" value={settings.fields[selectedField].top} onChange={(e) => updateStyle({ top: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-[11px] text-slate-600">اندازهٔ فونت (mm)<input type="number" step="0.1" min="1" value={settings.fields[selectedField].fontSize} onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-[11px] text-slate-600">ضخامت<select value={settings.fields[selectedField].fontWeight} onChange={(e) => updateStyle({ fontWeight: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2"><option value={400}>عادی</option><option value={500}>متوسط</option><option value={600}>نیمه‌پررنگ</option><option value={700}>پررنگ</option></select></label></div><label className="block text-[11px] text-slate-600">فونت<select value={settings.fields[selectedField].fontFamily} onChange={(e) => updateStyle({ fontFamily: e.target.value })} className="mt-1 w-full rounded-lg border p-2" dir="ltr"><option>Arial</option><option>Helvetica</option><option>Calibri</option><option>Times New Roman</option></select></label><div className="border-t border-slate-100 pt-3"><p className="text-[11px] font-bold text-slate-700">فرمت چاپ</p><select value={selectedFormatId} onChange={(event) => applyFormat(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"><option value="">انتخاب فرمت ذخیره‌شده…</option>{formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}</select><div className="mt-2 flex gap-2"><input value={formatName} onChange={(event) => setFormatName(event.target.value)} placeholder="نام فرمت، مثلاً BMO دفتر" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-xs outline-none focus:border-indigo-500"/><button type="button" onClick={saveFormat} disabled={!formatName.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-40"><Save size={13}/>ذخیره</button>{selectedFormatId && <button type="button" onClick={deleteFormat} className="rounded-lg border border-rose-200 px-2 text-rose-600" title="حذف فرمت"><Trash2 size={13}/></button>}</div><InlineHelp><p className="mt-1 text-[10px] leading-4 text-slate-400">جانمایی و فونت فعلی را با نام دلخواه ذخیره کنید؛ انتخاب هر فرمت، آن را فوراً اعمال می‌کند.</p></InlineHelp></div><button type="button" onClick={() => persist(cheques, defaultSettings, formats)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-rose-700"><RotateCcw size={13}/>بازگردانی جانمایی اولیه</button></div>}</section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-2 text-sm font-bold text-slate-900">سوابق چک‌ها</h2><div className="max-h-[24rem] space-y-2 overflow-auto">{cheques.length ? cheques.map((item) => <div key={item.id} className={`rounded-lg border p-2 text-xs ${item.id === draft.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}><button type="button" onClick={() => setDraft(item)} className="w-full text-right"><div className="flex justify-between gap-2"><b dir="ltr">{item.chequeNumber || "بدون شماره"}</b><span className={item.status === "printed" ? "text-emerald-700" : "text-slate-500"}>{item.status === "printed" ? "چاپ‌شده" : item.status === "void" ? "باطل" : "پیش‌نویس"}</span></div><div className="mt-1 truncate text-slate-600" dir="ltr">{item.payee} · {monetary(item.amount)}</div></button><div className="mt-2 flex gap-2"><button type="button" onClick={() => setDraft(item)} className="text-indigo-600"><Pencil size={14}/></button><button type="button" onClick={() => deleteCheque(item.id)} className="text-rose-600"><Trash2 size={14}/></button></div></div>) : <p className="py-5 text-center text-xs text-slate-400">هنوز چکی ذخیره نشده است.</p>}</div></section></aside>
    </div>
    <div className="print:hidden"><PrintPagePositionControls position={printPagePosition} onChange={setPrintPagePosition} preview={showPrintPositionPreview} onPreviewChange={setShowPrintPositionPreview}/></div>
    <div className="overflow-auto rounded-xl bg-slate-200 p-4 print:overflow-visible print:bg-transparent print:p-0" dir="ltr"><div id="bmo-cheque-print" className="relative shrink-0 bg-white shadow-lg print:shadow-none" style={{ width: "158mm", height: "68mm" }} aria-label="BMO cheque print preview"><img src="/bmo-cheque-guide.jpg" alt="BMO cheque alignment guide" className="pointer-events-none absolute inset-0 h-full w-full object-fill print:hidden" /><div data-cheque-print-content className="absolute inset-0" style={{translate: showPrintPositionPreview ? `${printPagePosition.x}mm ${printPagePosition.y}mm` : undefined}}>{fields.filter((field) => field.id !== "date").map((field) => { const style = settings.fields[field.id]; const value = printValue(field.id as Exclude<ChequePrintField, "date">); return value ? <span key={field.id} className="absolute whitespace-nowrap text-black" style={{ left: `${style.left}mm`, top: `${style.top}mm`, fontSize: `${style.fontSize}mm`, fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: 1.1 }}>{value}</span> : null; })}{(() => { const style = settings.fields.date; const date = dateParts(draft.issueDate); return <><span className="absolute whitespace-nowrap text-black" style={{ left: `${style.left}mm`, top: `${style.top}mm`, fontSize: `${style.fontSize}mm`, fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: 1.1 }}>{date.year}</span><span className="absolute whitespace-nowrap text-black" style={{ left: `${style.left + 10.8}mm`, top: `${style.top}mm`, fontSize: `${style.fontSize}mm`, fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: 1.1 }}>{date.month}</span><span className="absolute whitespace-nowrap text-black" style={{ left: `${style.left + 21.6}mm`, top: `${style.top}mm`, fontSize: `${style.fontSize}mm`, fontFamily: style.fontFamily, fontWeight: style.fontWeight, lineHeight: 1.1 }}>{date.day}</span></>; })()}</div></div></div>
    <InlineHelp><p className="print:hidden text-center text-[11px] text-slate-500">تصویر فقط راهنمای جانمایی در پیش‌نمایش است. هنگام چاپ روی چک واقعی، تصویر چاپ نمی‌شود و فقط اطلاعات واردشده چاپ خواهند شد.</p></InlineHelp>
  </div>;
};
