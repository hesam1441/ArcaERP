import { InlineHelp } from "./InlineHelp";
import React from 'react';
import { InterfaceVersion } from '../utils/interfaceVersion';
export function InterfaceVersionSwitch({current,onChange}:{current:InterfaceVersion;onChange:(version:InterfaceVersion)=>void}) {
 return <section data-interface-version className="rounded-xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">نسخهٔ برنامه</h2><div className="flex flex-wrap gap-2">{([['new','نسخهٔ جدید'],['legacy','نسخهٔ قدیمی']] as const).map(([id,title])=><button key={id} type="button" aria-pressed={current===id} onClick={()=>onChange(id)} className={`rounded-lg border px-4 py-2 text-xs ${current===id?'bg-indigo-600 text-white':'bg-white text-slate-700'}`}>{title}</button>)}</div><InlineHelp><p className="mt-3 text-xs text-slate-500">اطلاعات هر دو نسخه مشترک است؛ انتخاب نسخه روی این دستگاه حفظ می‌شود.</p></InlineHelp></section>;
}
