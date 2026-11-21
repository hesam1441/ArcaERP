import React, { useEffect, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  value: string | number;
  label: string;
  keywords?: string;
  disabled?: boolean;
};

type Props = {
  value: string | number | undefined | null;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
};

const normalise = (value: string) => value.toLocaleLowerCase("fa")
  .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();

/** A lightweight, reusable searchable select for ERP reference data. */
export function SearchableSelect({ value, options, onChange, placeholder = "جست‌وجو و انتخاب…", className = "", disabled, emptyLabel = "موردی پیدا نشد.", "aria-label": ariaLabel }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => options.find((option) => String(option.value) === String(value)), [options, value]);
  const visibleOptions = useMemo(() => {
    const term = normalise(query);
    if (!term) return options;
    return options.filter((option) => normalise(`${option.label} ${option.keywords || ""}`).includes(term));
  }, [options, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return <div ref={rootRef} className={`relative min-w-0 ${className}`}>
    <input
      aria-label={ariaLabel}
      type="text"
      disabled={disabled}
      value={open ? query : (selected?.label || query)}
      placeholder={placeholder}
      autoComplete="off"
      onFocus={() => { setQuery(""); setOpen(true); }}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "Enter" && visibleOptions.length === 1 && !visibleOptions[0].disabled) {
          event.preventDefault(); onChange(String(visibleOptions[0].value)); setOpen(false); setQuery("");
        }
      }}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
    />
    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-slate-400">⌄</span>
    {open && !disabled && <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="listbox">
      {visibleOptions.length ? visibleOptions.map((option) => <button
        type="button" role="option" aria-selected={String(option.value) === String(value)} disabled={option.disabled}
        key={String(option.value)} onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (!option.disabled) { onChange(String(option.value)); setQuery(""); setOpen(false); } }}
        className={`block w-full rounded-md px-3 py-2 text-right text-xs ${String(option.value) === String(value) ? "bg-indigo-50 font-bold text-indigo-700" : "hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-40`}
      >{option.label}</button>) : <p className="px-3 py-2 text-xs text-slate-400">{emptyLabel}</p>}
    </div>}
  </div>;
}
