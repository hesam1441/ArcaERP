import React from 'react';

/** Collapsing optional fields never unmounts their editors or discards drafts. */
export function GuidedSection({ guided = false, title, children }: {
  guided?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  if (!guided) return <>{children}</>;
  return <details data-guided-section className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
    <summary className="cursor-pointer text-xs font-bold text-indigo-700">{title}</summary>
    <div className="mt-4 space-y-4">{children}</div>
  </details>;
}
