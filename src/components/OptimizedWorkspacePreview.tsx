import { toggleApprovedTheme } from './WorkspaceAppearance';
import { createPortal } from "react-dom";
import { readWorkspaceLayout, readCompactMenu } from "./WorkspaceLayoutPicker";
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Home, LayoutGrid, Search, ChevronDown, Menu, Settings, Wallet, Briefcase, X, Plus, PanelRightClose, PanelRightOpen, FileText, Calculator, Users, Package, Truck, ListTodo, BarChart3, CalendarDays, Mail, Moon } from "lucide-react";
import { AppDatabase } from "../types";

const moduleIcons:Record<string,typeof Home>={cases:FileText,accounting:Calculator,cash:Wallet,parties:Users,products:Package,logistics:Truck,tasks:ListTodo,calendar:CalendarDays,planning:CalendarDays,communications:Mail,reports:BarChart3,settings:Settings};
type Page = {id:string;title:string;description:string;content:React.ReactNode;defaultSection?:string};
function RetainedModule({active,children}:{active:boolean;children:React.ReactNode}) {
  const last=useRef<React.ReactNode>(null);
  if(active)last.current=children;
  return last.current?<div hidden={!active}>{last.current}</div>:null;
}
export function OptimizedWorkspacePreview({db,pages,onNewOrder,onOpenOrder}:{db:AppDatabase;pages:Page[];onNewOrder:()=>void;onOpenOrder:(id:number)=>void}) {
  const [page,setPage]=useState(()=>{try{const saved=sessionStorage.getItem('arca.optimized.page');return saved&&pages.some(p=>p.id===saved)?saved:'home';}catch{return 'home';}});
  const [history,setHistory]=useState<string[]>([]);
  const [query,setQuery]=useState('');
  const [layout,setLayout]=useState(readWorkspaceLayout);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [narrow,setNarrow]=useState(()=>window.matchMedia('(max-width:900px)').matches);
  const [compact,setCompact]=useState(readCompactMenu);
  useEffect(()=>{const sync=()=>setCompact(readCompactMenu());window.addEventListener('arca-workspace-density',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('arca-workspace-density',sync);window.removeEventListener('storage',sync);};},[]);
  const drawer=useRef<HTMLElement>(null);
  useEffect(()=>{const media=window.matchMedia('(max-width:900px)');const sync=()=>{setNarrow(media.matches);if(!media.matches)setMobileOpen(false);};media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
  useEffect(()=>{
    if(!narrow||!mobileOpen)return;
    const before=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const blocked=[document.querySelector('#app-header'),document.querySelector('[data-workspace-content]')].filter(Boolean) as HTMLElement[];
    const inertBefore=blocked.map(e=>e.inert);blocked.forEach(e=>e.inert=true);
    drawer.current?.querySelector<HTMLButtonElement>('[data-close-workspace-drawer]')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);}
      if(event.key==='Tab'){
        const focusable=[...drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select,input,[tabindex="0"]')||[]].filter(e=>e.getBoundingClientRect().height>0);
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;blocked.forEach((e,i)=>e.inert=inertBefore[i]);document.removeEventListener('keydown',key);before?.isConnected&&before.focus();};
  },[narrow,mobileOpen]);
  const toggleCompact=()=>{const next=!compact;setCompact(next);try{localStorage.setItem('arca.workspace.compact',String(next));}catch{}window.dispatchEvent(new Event('arca-workspace-density'));};
  useEffect(()=>{const toggle=()=>setMobileOpen(open=>!open);window.addEventListener('arca-workspace-menu',toggle);return()=>window.removeEventListener('arca-workspace-menu',toggle);},[]);
  useEffect(()=>{
    const sync=(event:Event)=>{const id=(event as CustomEvent).detail?.page;if(!id||!pages.some(p=>p.id===id))return;const section=(event as CustomEvent).detail?.section;if(section)try{sessionStorage.setItem(`arca.hub.${id}`,section);}catch{}setMobileOpen(false);setPage(current=>{if(current!==id)setHistory(h=>[...h,current]);return id;});};
    window.addEventListener('arca-workspace-navigate',sync);
    return()=>window.removeEventListener('arca-workspace-navigate',sync);
  },[pages]);
  const groups=[{id:'daily',title:'بازرگانی و عملیات',Icon:Briefcase,ids:['cases','logistics','planning','communications']},{id:'finance',title:'حسابداری و مالی',Icon:Wallet,ids:['accounting','cash','reports']},{id:'base',title:'اطلاعات پایه و تنظیمات',Icon:Settings,ids:['parties','products','settings']}];
  const [expanded,setExpanded]=useState<Record<string,boolean>>(()=>{try{const saved=JSON.parse(localStorage.getItem('arca.workspace.groups')||'null');if(saved&&typeof saved==='object')return saved;}catch{}return {daily:true,finance:true,base:true};});
  useEffect(()=>{const sync=()=>setLayout(readWorkspaceLayout());window.addEventListener('arca-workspace-layout',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('arca-workspace-layout',sync);window.removeEventListener('storage',sync);};},[]);
  const toggleGroup=(id:string)=>setExpanded(current=>{const next={...current,[id]:!current[id]};try{localStorage.setItem('arca.workspace.groups',JSON.stringify(next));}catch{}return next;});
  useEffect(()=>{try{sessionStorage.setItem('arca.optimized.page',page);}catch{}},[page]);
  const navigate=(id:string)=>{setMobileOpen(false);const section=pages.find(p=>p.id===id)?.defaultSection;if(section){try{sessionStorage.setItem(`arca.hub.${id}`,section);}catch{}window.dispatchEvent(new CustomEvent('arca-workspace-navigate',{detail:{page:id,section}}));return;}if(id===page)return;setHistory(h=>[...h,page]);setPage(id);setMobileOpen(false);const group=groups.find(g=>g.ids.includes(id));if(group)setExpanded(current=>({...current,[group.id]:true}));};
  const back=()=>{setMobileOpen(false);const previous=history[history.length-1];if(!previous)return;setHistory(h=>h.slice(0,-1));setPage(previous);};
  const visible=pages.filter(p=>`${p.title} ${p.description}`.includes(query.trim()));
  const orders=db.orders.filter(o=>!o.IsDummy&&!o.ExcludeFromCalculations);
  const recent=[...orders].sort((a,b)=>(b.PIDate||'').localeCompare(a.PIDate||'')).slice(0,6);
  const navigation = (<>
      <nav id="workspace-navigation" aria-label="منوی محیط یکپارچه" className="rounded-xl border bg-white p-2">
        <div data-workspace-brand><span>A</span><span data-menu-label>ARCA</span></div>
        <div data-workspace-menu-actions>
          <button type="button" onClick={()=>{setMobileOpen(false);onNewOrder();}} data-new-case-action title="پرونده جدید" aria-label="پرونده جدید" className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-3 text-xs font-bold text-white"><Plus size={18}/><span data-menu-label>پرونده جدید</span></button>
          {!narrow&&<button type="button" onClick={toggleCompact} title={compact?'نمایش نام منوها':'منوی آیکنی و جمع‌وجور'} aria-label={compact?'نمایش نام منوها':'منوی آیکنی و جمع‌وجور'} aria-pressed={compact} className="rounded-lg p-2">{compact?<PanelRightOpen size={18}/>:<PanelRightClose size={18}/>}</button>}
        </div>
        <div className="mb-2 flex gap-2"><button type="button" onClick={back} disabled={!history.length} className="rounded-lg border p-2 disabled:opacity-30" title="بازگشت یک مرحله" aria-label="بازگشت یک مرحله در محیط آزمایشی"><ArrowRight size={16}/></button><button type="button" title="شروع" aria-label="شروع" aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')} className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs"><Home size={17}/><span data-menu-label>شروع</span></button></div>
        {narrow||layout==='side'?groups.map(group=><div key={group.id} data-workspace-group><button type="button" title={group.title} aria-label={group.title} aria-expanded={!!expanded[group.id]} aria-controls={`workspace-group-${group.id}`} onClick={()=>toggleGroup(group.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-right text-xs"><group.Icon size={17}/><b data-menu-label className="flex-1">{group.title}</b><ChevronDown data-menu-label size={13} className={expanded[group.id]?'rotate-180':''}/></button><div id={`workspace-group-${group.id}`} hidden={!expanded[group.id]} className="mr-4 space-y-1 border-r border-white/15 pr-2">{pages.filter(p=>group.ids.includes(p.id)).map(p=>{const Icon=moduleIcons[p.id]||LayoutGrid;return <button type="button" key={p.id} title={p.title} aria-label={p.title} aria-current={page===p.id?'page':undefined} onClick={()=>navigate(p.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-xs"><Icon size={17}/><span data-menu-label>{p.title}</span></button>;})}</div></div>):pages.map(p=>{const Icon=moduleIcons[p.id]||LayoutGrid;return <button type="button" key={p.id} title={p.title} aria-label={p.title} aria-current={page===p.id?'page':undefined} onClick={()=>navigate(p.id)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"><Icon size={17}/><span data-menu-label>{p.title}</span></button>;})}
        <div className="mt-3 border-t border-white/10 pt-2"><button type="button" onClick={toggleApprovedTheme} title="تغییر حالت روشن و تیره" aria-label="تغییر حالت روشن و تیره" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs"><Moon size={16}/><span data-menu-label>حالت روشن / تیره</span></button></div>
      </nav>
  </>);
  return <section dir="rtl" data-optimized-workspace data-approved-workspace data-menu-layout={layout} data-menu-compact={!narrow&&compact} className="space-y-4">
    {createPortal(<nav data-mobile-quick-nav aria-label="ناوبری سریع موبایل">
      <button type="button" aria-label="بازکردن منوی کناری" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={()=>setMobileOpen(true)}><Menu size={21}/><span>منو</span></button>
      <button type="button" aria-label="شروع" aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')}><Home size={21}/><span>شروع</span></button>
      <button type="button" aria-label="پرونده‌ها" aria-current={page==='cases'?'page':undefined} onClick={()=>navigate('cases')}><FileText size={21}/><span>پرونده‌ها</span></button>
      <button type="button" aria-label="پرونده جدید" onClick={()=>{setMobileOpen(false);onNewOrder();}}><Plus size={21}/><span>پرونده جدید</span></button>
    </nav>,document.body)}
    <div data-workspace-layout>
    {!narrow&&<aside data-workspace-sidebar>{navigation}</aside>}
    {narrow&&mobileOpen&&createPortal(<div data-workspace-drawer-layer dir="rtl">
      <div data-workspace-drawer-backdrop onClick={()=>setMobileOpen(false)}/>
      <aside ref={drawer} data-workspace-sidebar data-workspace-drawer role="dialog" aria-modal="true" aria-label="منوی برنامه">
        <div className="flex items-center justify-between px-3 py-2"><b className="text-sm">ARCATAV</b><button data-close-workspace-drawer type="button" title="بستن منو" aria-label="بستن منو" onClick={()=>setMobileOpen(false)} className="rounded-lg p-3"><X size={20}/></button></div>
        {navigation}
      </aside>
    </div>,document.body)}
    <div data-workspace-content className="min-w-0 space-y-4">
    {page==='home'&&<div data-workspace-home className="space-y-4"><div data-home-stats className="grid gap-3 sm:grid-cols-3">{[['پرونده فعال',orders.filter(o=>o.ActiveOrder).length],['پرونده غیرفعال',orders.filter(o=>!o.ActiveOrder).length],['کار انجام‌نشده',(db.tasks||[]).filter(t=>!t.completed).length]].map(([title,value])=><div key={title} className="flex items-center justify-between rounded-lg border bg-white p-3"><span className="text-xs text-slate-500">{title}</span><b className="text-lg font-semibold text-slate-800">{value}</b></div>)}</div><label className="relative block"><Search size={16} className="absolute right-3 top-3 text-slate-400"/><input aria-label="پیدا کردن بخش آزمایشی" value={query} onChange={e=>setQuery(e.target.value)} placeholder="چه کاری می‌خواهید انجام دهید؟ حسابداری، کالا، مشتری…" className="w-full rounded-xl border bg-white p-3 pr-10 text-xs"/></label><div data-home-modules className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(p=><button type="button" key={p.id} data-workspace-module={p.id} title={p.description} onClick={()=>navigate(p.id)} className="flex items-center gap-3 rounded-lg border bg-white p-3 text-right hover:border-indigo-300 hover:bg-slate-50">{React.createElement(moduleIcons[p.id]||LayoutGrid,{size:18,className:"text-slate-500"})}<b className="block text-sm">{p.title}</b></button>)}</div>{!visible.length&&<p className="p-4 text-xs text-slate-500">بخشی مطابق این عبارت پیدا نشد.</p>}<section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 text-sm font-bold">پرونده‌های اخیر</h2><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{recent.map(order=><button type="button" key={order.OrderID} onClick={()=>onOpenOrder(order.OrderID)} className="rounded-xl bg-slate-50 p-3 text-right text-xs"><b className="block font-mono text-indigo-700">{order.ProformaInvoiceID}</b><span className="mt-1 block truncate text-slate-500">{order.CustomerName}</span></button>)}{!recent.length&&<p className="text-xs text-slate-500">هنوز پرونده‌ای ثبت نشده است.</p>}</div></section></div>}

    {pages.map(p=><RetainedModule key={p.id} active={p.id===page}>{p.content}</RetainedModule>)}
    </div></div>
  </section>;
}
