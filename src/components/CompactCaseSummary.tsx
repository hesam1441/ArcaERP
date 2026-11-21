import React, { useMemo } from 'react';
import type { AppDatabase, Order } from '../types';
import { CaseSummaryPage } from './approved/CaseSummaryPage';
import { projectApprovedCase, applyApprovedSummary } from '../utils/approvedDesign';
import { toggleCaseActivity } from '../utils/caseDirectory';

export function CompactCaseSummary({db,order,onSave,onDirty,onEdit,onDocuments,onShipping,onAccounting}:{
 db:AppDatabase;order:Order;onSave:(order:Order)=>void;onDirty:(dirty:boolean)=>void;
 onEdit:()=>void;onDocuments?:()=>void;onShipping?:()=>void;onAccounting?:()=>void;
}) {
 const projection=useMemo(()=>projectApprovedCase(db,order),[db,order]);
 return <div data-compact-case-summary data-approved-summary>
  <CaseSummaryPage caseData={projection} onDirty={onDirty} onEdit={onEdit}
   onSaveSummary={(_,patch)=>onSave(applyApprovedSummary(order,patch))}
   onOpenAccounting={()=>onAccounting?.()} showAccounting={Boolean(onAccounting)}
   onOpenShipping={onShipping?()=>onShipping():undefined}
   onToggleActive={(_,active)=>{if(active!==order.ActiveOrder)onSave(toggleCaseActivity(order));}}/>
  {onDocuments&&<button type="button" onClick={onDocuments} className="arca-control arca-control-touch mt-2 rounded-lg border px-3 text-xs">مدارک و چاپ</button>}
 </div>;
}
