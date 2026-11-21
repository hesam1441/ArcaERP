import React from 'react';
import { GuidedSection } from './GuidedSection';

type Element = React.ReactElement<{ children?: React.ReactNode }>;
const elements = (children: React.ReactNode) => React.Children.toArray(children).filter(React.isValidElement) as Element[];

/** Reuses the original cells and callbacks, so card and table edits share one draft. */
export function GuidedEntryTable({ guided = false, children, className }: {
  guided?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!guided) return <table className={className}>{children}</table>;
  const sections = elements(children);
  const head = sections.find(section => section.type === 'thead');
  const body = sections.find(section => section.type === 'tbody');
  const foot = sections.find(section => section.type === 'tfoot');
  const headers = elements(elements(head?.props.children)[0]?.props.children);
  const core = [0, 4, 5, 7, 8];
  return <div data-guided-items className="space-y-3 p-3 text-xs">
    {elements(body?.props.children).map((row, index) => {
      const cells = elements(row.props.children);
      const fields = (primary: boolean) => cells.map((cell, column) => core.includes(column) === primary && <div key={column} className={column === 0 ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
        <div className="mb-2 font-semibold text-slate-600">{headers[column]?.props.children}</div>
        <div>{cell.props.children}</div>
      </div>);
      return <section key={row.key ?? index} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-bold text-indigo-800">کالای {index + 1}</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields(true)}</div>
        <GuidedSection guided title="تعرفه، بسته‌بندی، وزن ناخالص و قیمت مبدأ"><div className="grid gap-4 sm:grid-cols-2">{fields(false)}</div></GuidedSection>
      </section>;
    })}
    {foot && <table className="w-full text-right">{foot}</table>}
  </div>;
}
