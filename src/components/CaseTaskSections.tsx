import React, { useState } from 'react';
/** Keeps every section mounted so switching tasks cannot discard local drafts. */
export function CaseTaskSections({guided=false,titles,children}:{guided?:boolean;titles:readonly string[];children:React.ReactNode}) {
 const [selected,setSelected]=useState(0);
 const sections=React.Children.toArray(children);
 if(!guided)return <>{children}</>;
 return <section data-case-task-sections className="space-y-4"><nav aria-label="مراحل بخش پرونده" className="flex flex-wrap gap-2">{titles.map((title,index)=><button type="button" key={title} aria-pressed={selected===index} onClick={()=>setSelected(index)} className={`rounded-xl border px-4 py-3 text-xs font-bold ${selected===index?'border-indigo-600 bg-indigo-600 text-white':'bg-white'}`}>{title}</button>)}</nav>{sections.map((section,index)=><div key={index} hidden={index!==selected}>{section}</div>)}</section>;
}
