import React, { useEffect, useState } from 'react';
import { normalizePrintPagePosition, savePrintPagePosition, type PrintPagePosition } from '../utils/printPagePosition';

function PositionInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <input aria-label={label} type="text" inputMode="decimal" dir="ltr" value={text} onChange={event=>{
    const raw = event.target.value.replace(/[۰-۹]/g, digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    if (!/^-?\d*(\.\d*)?$/.test(raw)) return;
    setText(raw);
    if (!['', '-', '.', '-.'].includes(raw)) onChange(Number(raw));
  }} onBlur={()=>setText(String(value))} className="mt-1 w-full rounded border p-2"/>;
}

export function PrintPagePositionControls({ position, onChange, preview, onPreviewChange }: {
  position: PrintPagePosition; onChange: (value: PrintPagePosition) => void;
  preview: boolean; onPreviewChange: (value: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  const update = (value: PrintPagePosition) => { onChange(normalizePrintPagePosition(value)); setMessage(''); };
  return <details className="mt-3 rounded-xl border border-slate-200 bg-white text-xs" dir="rtl">
    <summary className="cursor-pointer px-3 py-2 font-bold text-slate-700">جابجایی کل چک در چاپ</summary>
    <div className="space-y-3 border-t p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>افقی (میلی‌متر) — مثبت: راست، منفی: چپ<PositionInput label="جابجایی افقی صفحه" value={position.x} onChange={x=>update({...position,x})}/></label>
        <label>عمودی (میلی‌متر) — مثبت: پایین، منفی: بالا<PositionInput label="جابجایی عمودی صفحه" value={position.y} onChange={y=>update({...position,y})}/></label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={preview} onChange={e=>onPreviewChange(e.target.checked)}/>نمایش جابجایی در پیش‌نمایش</label>
      <p className="text-slate-500">فقط نوشته‌های چک با هم جابه‌جا می‌شوند؛ جانمایی تک‌تک فیلدها و تصویر راهنما ثابت می‌مانند.</p>
      {(Math.abs(position.x)>5||Math.abs(position.y)>5)&&<p className="text-amber-800">جابجایی بیش از ۵ میلی‌متر ممکن است بخشی از نوشته‌های چک را از لبهٔ کاغذ خارج کند.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>{try{savePrintPagePosition(position);setMessage('برای این مرورگر ذخیره شد.');}catch{setMessage('ذخیره در این مرورگر ممکن نیست.');}}} className="rounded bg-indigo-600 px-3 py-2 font-bold text-white">ذخیره جابجایی</button>
        <button type="button" onClick={()=>update({x:0,y:0})} className="rounded border px-3 py-2">بازگشت به صفر</button>
        <span role="status" className="text-slate-500">{message}</span>
      </div>
      <p className="text-[10px] text-slate-400">این تنظیم روی همین مرورگر نگه داشته می‌شود و قالب مدارک تجاری یا اطلاعات پرونده‌ها را تغییر نمی‌دهد.</p>
    </div>
  </details>;
}
