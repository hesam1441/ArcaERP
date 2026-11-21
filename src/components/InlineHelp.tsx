import React from 'react';
import { CircleHelp } from 'lucide-react';

/** Section guidance is available on demand, never expanded on initial render. */
export function InlineHelp({ children }: { children: React.ReactNode }) {
  return <details data-inline-help className="text-xs text-slate-500">
    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-xs text-slate-500 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500">
      <CircleHelp size={14} aria-hidden="true"/><span>راهنما</span>
    </summary>
    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 leading-6">{children}</div>
  </details>;
}
