import React, { useEffect, useState } from 'react';
export const workspaceLayoutKey='arca.workspace.layout';
export function readWorkspaceLayout(): 'side'|'top' {try{return localStorage.getItem(workspaceLayoutKey)==='top'?'top':'side';}catch{return 'side';}}
export function readCompactMenu(){try{return localStorage.getItem('arca.workspace.compact')==='true';}catch{return false;}}
export function WorkspaceLayoutPicker() {
 const [value,setValue]=useState(readWorkspaceLayout);
 const [compact,setCompact]=useState(readCompactMenu);
 useEffect(()=>{const sync=()=>setCompact(readCompactMenu());window.addEventListener('arca-workspace-density',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('arca-workspace-density',sync);window.removeEventListener('storage',sync);};},[]);
 useEffect(()=>{const sync=()=>setValue(readWorkspaceLayout());window.addEventListener('arca-workspace-layout',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('arca-workspace-layout',sync);window.removeEventListener('storage',sync);};},[]);
 return <div className="space-y-3"><label className="flex items-center gap-2 text-xs text-slate-600">حالت منو<select aria-label="حالت منوی طراحی جدید" value={value} onChange={e=>{const next=e.target.value as 'side'|'top';setValue(next);try{localStorage.setItem(workspaceLayoutKey,next);}catch{}window.dispatchEvent(new Event('arca-workspace-layout'));}} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="side">کناری آبشاری</option><option value="top">بالایی</option></select></label><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" aria-label="منوی آیکنی در نمایشگر بزرگ" checked={compact} onChange={event=>{const next=event.target.checked;setCompact(next);try{localStorage.setItem('arca.workspace.compact',String(next));}catch{}window.dispatchEvent(new Event('arca-workspace-density'));}}/>منوی آیکنی در نمایشگر بزرگ</label><p className="text-[10px] text-slate-500">در موبایل منو همیشه کناری و آبشاری است.</p></div>;
}
