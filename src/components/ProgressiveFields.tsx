import { InlineHelp } from "./InlineHelp";
import React from 'react';

/** Explicit primary field indexes; every other field remains reachable in the
 * optional section. Controlled drafts are retained when the section closes. */
export function ProgressiveFields({guided=false,core,extraTitle,children}:{guided?:boolean;core:readonly number[];extraTitle:string;children:React.ReactNode}) {
 const fields=React.Children.toArray(children);
 const grid='grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs';
 if(!guided)return <div className={grid}>{fields}</div>;
 return <div data-progressive-fields className="space-y-4"><InlineHelp><p className="text-xs leading-6 text-slate-500">ابتدا اطلاعات اصلی را وارد کنید. اطلاعات تکمیلی اختیاری است؛ با بستن این بخش پاک نمی‌شود.</p></InlineHelp><div className={grid}>{fields.filter((_,i)=>core.includes(i))}</div><details className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><summary className="cursor-pointer text-xs font-bold text-indigo-700">{extraTitle}</summary><div className={`${grid} mt-4`}>{fields.filter((_,i)=>!core.includes(i))}</div></details></div>;
}
