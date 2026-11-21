import { InlineHelp } from "./InlineHelp";
import React, { createContext, useContext, useState } from 'react';
import { AppDatabase, CashPartner } from '../types';
import { classifyParty, partyCategoryLabels } from '../utils/partyNormalization';
import { ownedCompanyFor, isPetromac, normalizePartnerName as norm } from '../utils/partnerIdentity';

const DirectoryContext = createContext<{ open: (selected?: (party: CashPartner) => void) => void }>({ open: () => {} });
export const usePartyDirectory = () => useContext(DirectoryContext);

export function PartyDirectory({ db, onSave, onDelete, onSelect }: { db: AppDatabase; onSave: (p: CashPartner) => void; onDelete?: (id: string) => void; onSelect?: (p: CashPartner) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<CashPartner | null>(null);
  const [error, setError] = useState('');
  const save = () => {
    if (!draft?.name.trim()) { setError('نام شخص یا شرکت الزامی است.'); return; }
    if (db.cashPartners.some(p => p.id !== draft.id && [p.name, p.nameEn, ...(p.aliases || [])].some(n => n && norm(n) === norm(draft.name)))) { setError('این نام قبلاً در فهرست ثبت شده است؛ همان رکورد را ویرایش یا انتخاب کنید.'); return; }
    onSave(classifyParty({ ...draft, name: draft.name.trim() })); setDraft(null); setError('');
    onSelect?.(draft);
  };
  return <section className="rounded-2xl border border-indigo-100 bg-white p-4" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">فهرست یکپارچه اشخاص و شرکت‌ها</h2><InlineHelp><p className="mt-1 text-xs text-slate-500">این فهرست در پرونده‌ها، سهم‌ها و صندوق مشترک است. ویرایش نام در سوابق مرتبط نیز اعمال می‌شود.</p></InlineHelp></div><button type="button" onClick={() => { setDraft({ id: `party:${Array.from(crypto.getRandomValues(new Uint32Array(4))).map(n => n.toString(16)).join('-')}`, name: '', role: '', category: 'commission_recipient', entityType: 'person' }); setError(''); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">+ تعریف شخص / شرکت</button></div>
    {draft && <div className="my-3 grid gap-3 rounded-xl bg-indigo-50 p-3 sm:grid-cols-2">
      <label className="text-xs">نام<input aria-label="نام شخص یا شرکت" disabled={Boolean(ownedCompanyFor(draft.name))} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full rounded border p-2"/></label>
      <label className="text-xs">نام انگلیسی<input disabled={Boolean(ownedCompanyFor(draft.name))} value={draft.nameEn || ''} onChange={e => setDraft({ ...draft, nameEn: e.target.value })} className="mt-1 w-full rounded border p-2"/></label>
      <label className="text-xs">نوع<select value={draft.entityType || 'person'} onChange={e => setDraft({ ...draft, entityType: e.target.value as 'person' | 'company' })} className="mt-1 w-full rounded border p-2"><option value="person">شخص</option><option value="company">شرکت</option></select></label>
      <label className="text-xs">نقش<select disabled={Boolean(ownedCompanyFor(draft.name)) || isPetromac(draft.name)} value={draft.category || 'commission_recipient'} onChange={e => setDraft({ ...draft, category: e.target.value as CashPartner['category'], isCustomer: e.target.value === 'customer' })} className="mt-1 w-full rounded border p-2">{Object.entries(partyCategoryLabels).map(([id, label]) => <option key={id} value={id} disabled={id === 'owned_company' && !ownedCompanyFor(draft.name)}>{label}</option>)}</select></label>
      <InlineHelp><p className="text-xs text-slate-500 sm:col-span-2">نقش از فهرست مشترک تعیین می‌شود. نام فارسی و انگلیسی شرکت‌های متعلق به خودم یک هویت دارند؛ پتروماک همکار/ایجنت است.</p></InlineHelp>
      {error && <p role="alert" className="text-xs text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2"><button type="button" onClick={save} className="rounded bg-indigo-600 px-4 py-2 text-xs text-white">ذخیره</button><button type="button" onClick={() => setDraft(null)} className="rounded bg-white px-4 py-2 text-xs">انصراف</button></div>
    </div>}
    <select aria-label="فیلتر نقش اشخاص و شرکت‌ها" value={category} onChange={e => setCategory(e.target.value)} className="mt-3 rounded border p-2 text-xs"><option value="">همه نقش‌ها</option>{Object.entries(partyCategoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
    <input aria-label="جستجوی اشخاص و شرکت‌ها" value={query} onChange={e => setQuery(e.target.value)} placeholder="جستجوی نام یا نقش…" className="my-3 w-full rounded-lg border p-2 text-xs"/>
    <div className="max-h-72 overflow-auto"><table className="w-full text-right text-xs"><thead><tr><th className="p-2">نام</th><th>نوع / نقش</th><th>عملیات</th></tr></thead><tbody>{db.cashPartners.filter(p => (!category || p.category === category) && [p.name, p.nameEn, p.role, ...(p.aliases || [])].some(value => norm(value).includes(norm(query)))).map(p => <tr key={p.id} className="border-t"><td className="p-2 font-bold">{p.name}<span className="block text-[10px] text-slate-500">{p.nameEn}</span></td><td>{p.entityType === 'company' ? 'شرکت' : 'شخص'} — {p.role}</td><td className="space-x-2 space-x-reverse"><button type="button" onClick={() => { setDraft({ ...p }); setError(''); }} className="rounded bg-slate-100 px-3 py-1">ویرایش</button>{onDelete && <button type="button" onClick={() => { if (window.confirm(`«${p.name}» از فهرست حذف شود؟ سوابق مالی و پرونده‌ها حذف نمی‌شوند.`)) onDelete(p.id); }} className="rounded bg-rose-50 px-3 py-1 text-rose-700">حذف</button>}{onSelect && <button type="button" onClick={() => onSelect(p)} className="rounded bg-indigo-50 px-3 py-1 text-indigo-700">انتخاب</button>}</td></tr>)}</tbody></table></div>
  </section>;
}

export function PartyDirectoryProvider({ db, onSave, onDelete, children }: { db: AppDatabase; onSave: (p: CashPartner) => void; onDelete?: (id: string) => void; children: React.ReactNode }) {
  const [dialog, setDialog] = useState<{ selected?: (p: CashPartner) => void } | null>(null);
  return <DirectoryContext.Provider value={{ open: selected => setDialog({ selected }) }}>{children}{dialog && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-3"><button type="button" onClick={() => setDialog(null)} className="mb-2 rounded bg-slate-100 px-3 py-2 text-xs">بستن فهرست</button><PartyDirectory db={db} onSave={onSave} onDelete={onDelete} onSelect={dialog.selected ? p => { dialog.selected?.(p); setDialog(null); } : undefined}/></div></div>}</DirectoryContext.Provider>;
}
