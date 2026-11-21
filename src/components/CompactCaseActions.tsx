import { MoreHorizontal } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

/** Keep save/print/close visible; place secondary case actions in one menu. */
export function CompactCaseActions({guided=false,children}:{guided?:boolean;children:React.ReactNode}) {
 const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(menu.current&&!menu.current.contains(event.target as Node))menu.current.open=false;};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus();}};
  if(!guided)return;
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[guided]);
 const actions=React.Children.toArray(children);
 if(!guided)return <div className="flex flex-wrap items-center gap-2">{children}</div>;
 return <div data-compact-case-actions className="flex flex-wrap items-center gap-2">
  {actions.filter((_,index)=>index>=3)}
  <details ref={menu} className="relative"><summary aria-label="سایر کارهای پرونده" className="cursor-pointer list-none rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200"><MoreHorizontal size={20}/><span>بیشتر ···</span></summary><div onClick={event=>{if((event.target as HTMLElement).closest('button')&&menu.current)menu.current.open=false;}} className="absolute left-0 top-full z-50 mt-2 flex min-w-52 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-900 p-2 shadow-lg">{actions.filter((_,index)=>index<3)}</div></details>
 </div>;
}
