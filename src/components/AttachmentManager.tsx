import React from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { FileAttachment } from "../types";

export const AttachmentManager: React.FC<{ attachments?: FileAttachment[]; onChange: (items: FileAttachment[]) => void; productMode?: boolean }> = ({ attachments = [], onChange, productMode }) => {
  const add = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange([...attachments, { id: `file-${Date.now()}`, name: file.name, category: productMode ? "technical" : "financial", mimeType: file.type || "application/octet-stream", data: String(reader.result), uploadedAt: new Date().toISOString() }]);
    reader.readAsDataURL(file);
  };
  const download = (item: FileAttachment) => { const link = document.createElement("a"); link.href = item.data; link.download = item.name; link.click(); };
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs text-slate-800">مدارک مرتبط</b><p className="mt-0.5 text-[10px] text-slate-500">{productMode ? "TDS، MSDS، کاتالوگ، گواهی آنالیز و سایر مدارک فنی" : "مدارک فنی و مالی مرتبط با این پرونده"}</p></div><label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"><Upload size={13}/>بارگذاری فایل<input className="hidden" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e=>add(e.target.files?.[0])}/></label></div>
    <div className="space-y-1.5">{attachments.length === 0 ? <div className="py-2 text-center text-[11px] text-slate-400">هنوز مدرکی ثبت نشده است.</div> : attachments.map(item => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs"><FileText size={15} className="text-indigo-500"/><div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-700">{item.name}</div><div className="text-[10px] text-slate-400">{item.category === "technical" ? "فنی" : item.category === "financial" ? "مالی" : "سایر"} · {item.uploadedAt.slice(0, 10)}</div></div><label className="flex items-center gap-1 text-[10px] text-amber-800" hidden={productMode}><input type="checkbox" checked={item.agentVisible === true} onChange={e=>onChange(attachments.map(a=>a.id===item.id?{...a,agentVisible:e.target.checked}:a))}/>قابل نمایش به ایجنت</label><select value={item.category} onChange={e=>onChange(attachments.map(a=>a.id===item.id?{...a,category:e.target.value as FileAttachment["category"]}:a))} className="rounded border border-slate-200 p-1 text-[10px]"><option value="technical">فنی</option><option value="financial">مالی</option><option value="other">سایر</option></select><button onClick={()=>download(item)} className="text-slate-500 hover:text-indigo-600"><Download size={14}/></button><button onClick={()=>onChange(attachments.filter(a=>a.id!==item.id))} className="text-slate-400 hover:text-rose-600"><Trash2 size={14}/></button></div>)}</div>
  </div>;
};
