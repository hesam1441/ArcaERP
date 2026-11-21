import { Briefcase, Banknote, ShoppingCart, Calculator, Truck } from "lucide-react";
import React from 'react';
const groupIcons=[Briefcase,Banknote,ShoppingCart,Calculator,Truck];
const groups = [
 {title:'معامله و کالا',hint:'طرفین، مشخصات و اقلام',items:[['general','مشخصات معامله'],['items','کالا، مقدار و قیمت']]},
 {title:'ارز و قرارداد',hint:'ارز صدور و شرایط توافق',items:[['currency_conversion','ارز و نرخ تبدیل'],['clauses','شرایط قرارداد']]},
 {title:'خرید',hint:'پروفورمای تأمین‌کننده و پیگیری',items:[['purchase','خرید و دفتر آن']]},
 {title:'حسابداری',hint:'دریافت، هزینه، سود و سهم‌ها',items:[['payments','حسابداری جامع ساده']]},
 {title:'حمل و مدارک',hint:'رهگیری و اسناد قابل چاپ',items:[['shipping','اطلاعات حمل'],['documents','مدارک و چاپ']]},
];
export function CaseWorkflowNavigation({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
 const active=groups.find(g=>g.items.some(([id])=>id===(value==='shares'?'payments':value)))||groups[0];
 return <div data-case-workflow className="border-b border-slate-200 bg-white p-3">
  <nav aria-label="گروه‌های پرونده ساده" className="flex flex-wrap gap-1">{groups.map((group,index)=><button type="button" key={group.title} aria-label={group.title} title={`${group.title}: ${group.hint}`} disabled={disabled} aria-pressed={active===group} onClick={()=>onChange(group.items[0][0])} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-right disabled:opacity-40 ${active===group?'bg-indigo-50 text-indigo-700':'text-slate-600 hover:bg-slate-50'}`}>{React.createElement(groupIcons[index],{size:16})}<b className="text-xs">{group.title}</b></button>)}</nav>
  {active.items.length>1&&<select data-mobile-case-subsection aria-label="بخش پرونده" value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{active.items.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select>}
  {active.items.length>1&&<nav aria-label="بخش‌های گروه پرونده" className="mt-2 flex flex-wrap gap-2">{active.items.map(([id,title])=><button type="button" key={id} disabled={disabled} aria-current={value===id||(value==='shares'&&id==='payments')?'page':undefined} onClick={()=>onChange(id)} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 ${value===id||(value==='shares'&&id==='payments')?'bg-indigo-50 text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>{title}</button>)}</nav>}
  {disabled&&<p role="status" className="mt-2 text-xs text-amber-700">ابتدا ورودی بخش جاری را ثبت یا لغو کنید؛ سپس بخش پرونده را تغییر دهید.</p>}
 </div>;
}
