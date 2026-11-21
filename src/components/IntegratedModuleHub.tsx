import React, { useEffect, useRef, useState } from 'react';

type Section = { id: string; title: string; content: React.ReactNode; allowed?: boolean };
function SectionBody({ active, children }: { active: boolean; children: React.ReactNode }) {
  const retained = useRef<React.ReactNode>(null);
  if (active) retained.current = children;
  return retained.current ? <div hidden={!active} className="min-w-0">{retained.current}</div> : null;
}
/** Shared navigation only: each section retains its existing records and save handlers. */
export function IntegratedModuleHub({ id, sections, quickTabs = false }: { id: string; sections: Section[]; quickTabs?: boolean }) {
  const available = sections.filter(section => section.allowed !== false);
  const [selected, setSelected] = useState(() => {
    try { return sessionStorage.getItem(`arca.hub.${id}`) || available[0]?.id; } catch { return available[0]?.id; }
  });
  const active = available.some(section => section.id === selected) ? selected : available[0]?.id;
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.page === id) setSelected(detail.section || available[0]?.id);
    };
    window.addEventListener('arca-workspace-navigate', sync);
    return () => window.removeEventListener('arca-workspace-navigate', sync);
  }, [id, sections]);
  const navigate = (value: string) => { setSelected(value); try { sessionStorage.setItem(`arca.hub.${id}`, value); } catch {} };
  return <section data-integrated-module={id} className="min-w-0 space-y-3">
    {quickTabs ? <nav aria-label={`بخش‌های ${id}`} className="flex gap-2 rounded-xl border border-slate-200 bg-white/70 p-2">
      {available.map(section => <button type="button" key={section.id} data-hub-tab={section.id} aria-current={active === section.id ? 'page' : undefined} onClick={() => navigate(section.id)} className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-sm ${active === section.id ? 'bg-indigo-600 font-bold text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{section.title}</button>)}
    </nav> : <label className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
      <span className="text-slate-500">بخش</span>
      <select data-hub-selector aria-label={`انتخاب بخش ${id}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 sm:max-w-sm" value={active} onChange={event => navigate(event.target.value)}>
        {available.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
      </select>
    </label>}
    {available.map(section => <SectionBody key={section.id} active={active === section.id}>{section.content}</SectionBody>)}
  </section>;
}
