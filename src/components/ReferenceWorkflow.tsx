import React from "react";

/** Small task navigation: each choice exposes only the form needed now. */
export function ReferenceWorkflow({title,description,steps,value,onChange,hideTitle=false}:{hideTitle?:boolean;title:string;description:string;steps:readonly {id:string;title:string;hint:string}[];value:string;onChange:(id:string)=>void}) {
  return <header className="mb-4 space-y-3" data-reference-workflow>
    <div>{!hideTitle&&<h3 className="text-base font-bold text-slate-900">{title}</h3>}<details className="mt-1 text-xs text-slate-500"><summary className="w-fit cursor-pointer">راهنما</summary><p className="mt-2 leading-6">{description}</p><ul className="mt-2 space-y-1">{steps.map(step=><li key={step.id}>{step.title}: {step.hint}</li>)}</ul></details></div>
    <div className="flex flex-wrap gap-1">{steps.map(step=><button key={step.id} title={step.hint} type="button" aria-pressed={step.id===value} onClick={()=>onChange(step.id)} className={`flex items-center rounded-lg px-3 py-2 text-right ${step.id===value?'border-indigo-400 bg-indigo-50':'border-slate-200 bg-white hover:bg-slate-50'}`}><b className="text-xs">{step.title}</b></button>)}</div>
  </header>;
}
