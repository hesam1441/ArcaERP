import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Order } from '../types';
import { containerEntriesFor, containerTextFor } from '../utils/shippingReferences';

export function ShippingReferencesEditor({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  const inputClass = 'min-w-0 w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-sm';
  const numbersEditor = (field: 'BLNo' | 'TruckNo', label: string, placeholder: string) => {
    const numbers = (order[field] || '').split(/[,،;؛\n]+/).filter(value => value.length > 0);
    return <div><label className="mb-1 block font-semibold text-slate-600">{label} ({numbers.length})</label>
      <div className="space-y-2">{[...numbers, ''].map((number, index) => <div key={index} className="flex gap-2">
        <input dir="ltr" aria-label={`${placeholder} ${index + 1}`} value={number} placeholder={placeholder} className={inputClass}
          onChange={event => { const next = [...numbers]; next[index] = event.target.value; onChange({ ...order, [field]: next.join(',') }); }}/>
        {index < numbers.length && <button type="button" aria-label={`حذف ${placeholder} ${index + 1}`} onClick={() => onChange({ ...order, [field]: numbers.filter((_, i) => i !== index).join(',') })} className="p-2 text-rose-600"><Trash2 size={16}/></button>}
      </div>)}</div></div>;
  };
  const entries = containerEntriesFor(order);
  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
    {numbersEditor('BLNo', 'شماره‌های بارنامه', 'B/L No.')}
    <div><label className="mb-1 block font-semibold text-slate-600">کانتینر و پلمب / Seal ({entries.filter(entry => entry.containerNo).length})</label>
      <div className="space-y-2">{[...entries, { containerNo: '', sealNo: '' }].map((entry, index) => <div key={index} className="flex gap-2">
        {(['containerNo', 'sealNo'] as const).map(field => <input key={field} dir="ltr" aria-label={`${field === 'containerNo' ? 'Container No.' : 'Seal No.'} ${index + 1}`} placeholder={field === 'containerNo' ? 'Container No.' : 'Seal No.'} value={entry[field]} className={inputClass} onChange={event => {
          const next = [...entries]; next[index] = { ...entry, [field]: event.target.value };
          onChange({ ...order, ContainerSealEntries: next, ContainerNo: containerTextFor(next) });
        }}/>) }
        {index < entries.length && <button type="button" aria-label={`حذف کانتینر ${index + 1}`} className="p-2 text-rose-600" onClick={() => {
          const next = entries.filter((_, i) => i !== index); onChange({ ...order, ContainerSealEntries: next, ContainerNo: containerTextFor(next) });
        }}><Trash2 size={16}/></button>}
      </div>)}</div>
    </div>
    {numbersEditor('TruckNo', 'شماره‌های کامیون', 'Truck No.')}
  </div>;
}
