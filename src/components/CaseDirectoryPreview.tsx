import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, Pencil } from 'lucide-react';
import type { AppDatabase, Order } from '../types';
import { CasesListPage } from './approved/CasesListPage';
import { CompactCaseSummary } from './CompactCaseSummary';
import type { CasesListFilterState } from './approved/types';
import { projectApprovedCase, matchesApprovedCase } from '../utils/approvedDesign';
import { exportOrderListExcel } from './OrderListTools';
import { matchesCaseOwnership, type CaseOwnershipFilter } from '../utils/caseOwnership';
import { toggleCaseActivity } from '../utils/caseDirectory';

export function CaseActivityToggle({order,onSave}:{order:Order;onSave:(order:Order)=>void}) {
 return <button type="button" role="switch" aria-checked={!!order.ActiveOrder} aria-label={`وضعیت پرونده ${order.ProformaInvoiceID}`} onClick={()=>onSave(toggleCaseActivity(order))} className={`arca-control arca-control-touch rounded-lg px-3 text-xs ${order.ActiveOrder?'bg-emerald-50 text-emerald-800':'bg-slate-100 text-slate-600'}`}>{order.ActiveOrder?'فعال':'غیرفعال'}</button>;
}
const defaults:CasesListFilterState={searchQuery:'',activeFilter:'all',ownershipFilter:'all',scrollTop:0};
function readFilters():CasesListFilterState {try{return {...defaults,...JSON.parse(sessionStorage.getItem('arca.directory.filters')||'{}')};}catch{return defaults;}}
export function CaseDirectoryPreview({db,onOpen,onSave,canOpenAccounting=true}:{db:AppDatabase;onOpen:(id:number)=>void;onSave:(order:Order)=>void;canOpenAccounting?:boolean}) {
 const [filters,setFilters]=useState(readFilters);
 const [ownership,setOwnership]=useState<CaseOwnershipFilter>(()=>{try{return sessionStorage.getItem('arca.directory.ownership') as CaseOwnershipFilter||'ALL';}catch{return 'ALL';}});
 const [selected,setSelected]=useState<number|null>(null),[dirty,setDirty]=useState(false);
 const changeFilters=(next:CasesListFilterState)=>setFilters(current=>({...next,page:current.searchQuery!==next.searchQuery||current.activeFilter!==next.activeFilter||current.ownershipFilter!==next.ownershipFilter?0:next.page??current.page}));
 const scroll=useRef(filters.scrollTop);
 useEffect(()=>{try{sessionStorage.setItem('arca.directory.filters',JSON.stringify(filters));sessionStorage.setItem('arca.directory.ownership',ownership);}catch{}},[filters,ownership]);
 const realOrders=useMemo(()=>db.orders.filter(o=>!o.IsDummy&&!o.ExcludeFromCalculations&&matchesCaseOwnership(db,o,ownership)).slice().sort((a,b)=>(b.PIDate||'').localeCompare(a.PIDate||'')),[db,ownership]);
 const cases=useMemo(()=>realOrders.map(o=>projectApprovedCase(db,o)),[db,realOrders]);
 const order=db.orders.find(o=>o.OrderID===selected);
 const accounting=(id:number)=>{
  if(dirty||!canOpenAccounting)return;
  try{sessionStorage.setItem('arca.reference.case',String(id));sessionStorage.setItem('arca.reference.area','case');sessionStorage.setItem('arca.reference.section','case');}catch{}
  window.dispatchEvent(new CustomEvent('arca-reference-select',{detail:{id}}));
  window.dispatchEvent(new CustomEvent('arca-workspace-navigate',{detail:{page:'accounting',section:'main'}}));
 };
 const back=()=>{if(dirty)return;setSelected(null);requestAnimationFrame(()=>{const main=document.querySelector('#app-shell main');if(main)main.scrollTop=scroll.current;});};
 return <section data-reference-directory data-approved-directory dir="rtl" className="space-y-3 text-xs">
  {order?<><button type="button" disabled={dirty} onClick={back} className="arca-control arca-control-touch inline-flex items-center gap-2 rounded-lg border px-3 disabled:opacity-40"><ArrowRight size={15}/>بازگشت به فهرست</button><CompactCaseSummary key={order.OrderID} db={db} order={order} onSave={onSave} onDirty={setDirty} onEdit={()=>onOpen(order.OrderID)} onAccounting={canOpenAccounting?()=>accounting(order.OrderID):undefined}/></>:<>
   <div className="flex flex-wrap items-center justify-between gap-2"><label className="inline-flex items-center gap-2 text-[var(--arca-text-muted)]">نوع مالکیت پرونده<select data-directory-ownership-filter aria-label="فیلتر نوع مالکیت پرونده" value={ownership} onChange={e=>setOwnership(e.target.value as CaseOwnershipFilter)} className="arca-control arca-control-touch rounded-lg border px-2"><option value="ALL">همه نوع‌های مالکیت</option><option value="OWN">◆ به حساب خودم</option><option value="CUSTOMER">متعلق به مشتری</option><option value="PENDING">ملکی؛ در انتظار تحقق</option><option value="REALIZED">ملکی؛ محقق‌شده</option></select></label><button type="button" onClick={()=>exportOrderListExcel('ARCA_Cases',realOrders.filter(o=>matchesApprovedCase(projectApprovedCase(db,o),filters)))} className="arca-control arca-control-touch inline-flex items-center gap-1 rounded-lg border px-3"><Download size={14}/>خروجی Excel</button></div>
   <CasesListPage canOpenAccounting={canOpenAccounting} cases={cases} filters={filters} onFiltersChange={changeFilters} onOpenSummary={id=>{scroll.current=document.querySelector('#app-shell main')?.scrollTop||0;setSelected(Number(id));}} onOpenAccounting={id=>accounting(Number(id))} onToggleActive={(id,active)=>{const original=db.orders.find(o=>o.OrderID===Number(id));if(original&&original.ActiveOrder!==active)onSave(toggleCaseActivity(original));}}/>
  </>}
 </section>;
}
