import { InlineHelp } from "./InlineHelp";
import React, { useRef, useState } from "react";

interface Module { id: string; title: string; wide?: boolean; content: React.ReactNode }
const storageKey = "arcatav.workbench.layout.v1";
export const WorkbenchModules: React.FC<{ modules: Module[] }> = ({ modules }) => {
  const [layout, setLayout] = useState<{ order: string[]; widths: Record<string, boolean> }>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.order) && saved.order.every((id: unknown) => typeof id === "string") && saved.widths && typeof saved.widths === "object") return saved;
    } catch { /* Layout storage is optional. */ }
    return { order: [], widths: {} };
  });
  const dragging = useRef<string | null>(null);
  const ids = [...new Set([...layout.order.filter(id => modules.some(m => m.id === id)), ...modules.map(m => m.id)])];
  const save = (next: typeof layout) => { setLayout(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep this session's layout. */ } };
  const move = (id: string, target: string) => {
    if (id === target || !ids.includes(id) || !ids.includes(target)) return;
    const order = ids.filter(item => item !== id); order.splice(ids.indexOf(target), 0, id);
    save({ ...layout, order });
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><InlineHelp><span>چیدمان دلخواه: ماژول‌ها را با دستگیره جابه‌جا کنید یا از دکمه‌های بالا و پایین استفاده کنید.</span></InlineHelp><button type="button" className="rounded border bg-white px-3 py-2" onClick={() => save({ order: [], widths: {} })}>بازگردانی چیدمان</button></div>
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">{ids.map((id, index) => {
      const module = modules.find(m => m.id === id)!;
      const wide = layout.widths[id] ?? !!module.wide;
      return <div key={id} data-workbench-module={id} className={`min-w-0 ${wide ? "xl:col-span-2" : ""}`} onDragOver={event => { if (dragging.current) event.preventDefault(); }} onDrop={event => { if (!dragging.current) return; event.preventDefault(); move(dragging.current, id); dragging.current = null; }}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <span draggable onDragStart={event => { dragging.current = id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }} onDragEnd={() => { dragging.current = null; }} className="cursor-grab font-semibold active:cursor-grabbing" title="برای جابه‌جایی بکشید">⠿ {module.title}</span>
          <div className="flex gap-1"><button type="button" aria-label={`انتقال ${module.title} به بالا`} disabled={index === 0} onClick={() => move(id, ids[index - 1])} className="rounded border bg-white px-2 py-1 disabled:opacity-30">↑</button><button type="button" aria-label={`انتقال ${module.title} به پایین`} disabled={index === ids.length - 1} onClick={() => move(id, ids[index + 1])} className="rounded border bg-white px-2 py-1 disabled:opacity-30">↓</button><button type="button" aria-label={`تغییر پهنای ${module.title}`} onClick={() => save({ ...layout, widths: { ...layout.widths, [id]: !wide } })} className="rounded border bg-white px-2 py-1">{wide ? "نیم‌عرض" : "تمام‌عرض"}</button></div>
        </div>
        {module.content}
      </div>;
    })}</div>
  </div>;
};
