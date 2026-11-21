import React, { useEffect, useState } from 'react';
import { Palette, Moon, Sun } from 'lucide-react';

const options=[
 {id:'navy-glass',title:'شیشه‌ای سرمه‌ای',color:'linear-gradient(135deg,#1e3a8a,#6d28d9,#0d9488)'},
 {id:'classic-slate',title:'خاکستری مینیمال',color:'linear-gradient(135deg,#0f172a,#64748b)'},
 {id:'emerald-bronze',title:'زمردی و برنزی',color:'linear-gradient(135deg,#047857,#b45309)'},
 {id:'graphite-cobalt',title:'ذغالی و کبالت',color:'linear-gradient(135deg,#18181b,#2563eb)'},
] as const;
type Preset=typeof options[number]['id'];
const legacy:Record<string,Preset>={glass:'navy-glass',classic:'navy-glass',ocean:'graphite-cobalt',forest:'emerald-bronze',minimal:'classic-slate'};
function read(){try{const old=localStorage.getItem('arca.workspace.appearance')||'';return {
 preset:options.some(o=>o.id===old)?old as Preset:legacy[old]||'navy-glass',
 mode:localStorage.getItem('arca.workspace.mode')==='dark'?'dark':'light',
 density:localStorage.getItem('arca.workspace.density')==='comfortable'?'comfortable':'compact',
};}catch{return {preset:'navy-glass' as Preset,mode:'light',density:'compact'};}}
function apply(){const value=read(),root=document.documentElement;root.dataset.workspaceAppearance='classic';root.dataset.approvedPreset=value.preset;root.dataset.approvedMode=value.mode;root.dataset.approvedDensity=value.density;}
function write(key:string,value:string){try{localStorage.setItem(`arca.workspace.${key}`,value);}catch{}apply();window.dispatchEvent(new Event('arca-appearance'));}
export function toggleApprovedTheme(){write('mode',read().mode==='dark'?'light':'dark');}
/** Appearance remains a device preference; never writes production settings or records. */
export function useWorkspaceAppearance(){useEffect(()=>{apply();window.addEventListener('arca-appearance',apply);window.addEventListener('storage',apply);return()=>{window.removeEventListener('arca-appearance',apply);window.removeEventListener('storage',apply);};},[]);}
export function WorkspaceAppearance(){
 const [value,setValue]=useState(read);
 useEffect(()=>{const sync=()=>setValue(read());window.addEventListener('arca-appearance',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('arca-appearance',sync);window.removeEventListener('storage',sync);};},[]);
 return <section data-appearance-picker className="space-y-3 text-xs" aria-label="ظاهر برنامه">
  <h3 className="flex items-center gap-2 font-bold"><Palette size={16}/>تم و نمایش</h3>
  <div className="grid grid-cols-2 gap-2">{options.map(option=><button key={option.id} type="button" data-appearance-option={option.id} aria-pressed={value.preset===option.id} onClick={()=>write('appearance',option.id)} className="arca-panel flex items-center gap-2 p-3 text-right" style={{borderColor:value.preset===option.id?'var(--arca-purple)':undefined}}><span className="h-7 w-7 shrink-0 rounded-lg" style={{background:option.color}}/><span>{option.title}{value.preset===option.id?' ✓':''}</span></button>)}</div>
  <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={toggleApprovedTheme} aria-pressed={value.mode==='dark'} className="arca-control arca-control-touch inline-flex items-center gap-2 rounded-lg border px-3">{value.mode==='dark'?<Sun size={15}/>:<Moon size={15}/>}حالت {value.mode==='dark'?'تیره':'روشن'}</button><label className="inline-flex items-center gap-2">تراکم رابط<select aria-label="تراکم رابط" value={value.density} onChange={e=>write('density',e.target.value)} className="arca-control arca-control-touch rounded-lg border px-2"><option value="compact">جمع‌وجور</option><option value="comfortable">راحت</option></select></label></div>
 </section>;
}
