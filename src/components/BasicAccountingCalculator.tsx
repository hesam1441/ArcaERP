import { InlineHelp } from "./InlineHelp";
import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Clock3, RotateCcw, Trash2 } from "lucide-react";

const STORAGE_KEY = "arcatav.accounting-calculator";
type HistoryEntry = { id: string; expression: string; result: string; savedAt: string };
type CalculatorState = { display: string; first: number | null; operator: string | null; replace: boolean; memory: number; history: HistoryEntry[] };

const initialState: CalculatorState = { display: "0", first: null, operator: null, replace: true, memory: 0, history: [] };
const loadState = (): CalculatorState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
  } catch { return initialState; }
};
const formatResult = (number: number) => String(Number(number.toFixed(10)));
const formatForReading = (raw: string) => {
  if (raw === "Error") return raw;
  const negative = raw.startsWith("-");
  const [integer = "0", decimal] = (negative ? raw.slice(1) : raw).split(".");
  const grouped = (Number(integer || 0)).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${negative ? "-" : ""}${grouped}${decimal === undefined ? "" : `.${decimal}`}`;
};

export const BasicAccountingCalculator: React.FC = () => {
  const [state, setState] = useState(loadState);
  const value = Number(state.display) || 0;
  const pendingExpression = useMemo(() => state.first !== null && state.operator ? `${formatResult(state.first)} ${state.operator}` : "", [state.first, state.operator]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);

  const calculate = (left: number, right: number, op: string) => {
    if (op === "+") return left + right;
    if (op === "−") return left - right;
    if (op === "×") return left * right;
    if (op === "÷") return right === 0 ? NaN : left / right;
    return right;
  };
  const setNumber = (next: number) => setState((current) => ({ ...current, display: formatResult(next), replace: true }));
  const enter = (digit: string) => setState((current) => {
    const next = current.replace ? (digit === "." ? "0." : digit) : digit === "." && current.display.includes(".") ? current.display : current.display + digit;
    return { ...current, display: next, replace: false };
  });
  const chooseOperator = (nextOperator: string) => setState((current) => {
    const currentValue = Number(current.display) || 0;
    if (current.first !== null && current.operator && !current.replace) {
      const result = calculate(current.first, currentValue, current.operator);
      return Number.isFinite(result) ? { ...current, display: formatResult(result), first: result, operator: nextOperator, replace: true } : { ...current, display: "Error", first: null, operator: null, replace: true };
    }
    return { ...current, first: currentValue, operator: nextOperator, replace: true };
  });
  const equals = () => setState((current) => {
    if (current.first === null || !current.operator) return current;
    const right = Number(current.display) || 0;
    const result = calculate(current.first, right, current.operator);
    if (!Number.isFinite(result)) return { ...current, display: "Error", first: null, operator: null, replace: true };
    const display = formatResult(result);
    const entry: HistoryEntry = { id: `${Date.now()}-${Math.random()}`, expression: `${formatResult(current.first)} ${current.operator} ${formatResult(right)}`, result: display, savedAt: new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) };
    return { ...current, display, first: null, operator: null, replace: true, history: [entry, ...current.history].slice(0, 50) };
  });
  const clear = () => setState((current) => ({ ...current, display: "0", first: null, operator: null, replace: true }));
  const clearAll = () => setState(initialState);
  const backspace = () => setState((current) => current.replace || current.display === "Error" ? { ...current, display: "0", replace: true } : { ...current, display: current.display.length > 1 ? current.display.slice(0, -1) : "0" });
  const addHistory = (expression: string, result: number) => setState((current) => ({ ...current, display: formatResult(result), replace: true, history: [{ id: `${Date.now()}-${Math.random()}`, expression, result: formatResult(result), savedAt: new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) }, ...current.history].slice(0, 50) }));
  const unary = (kind: "sign" | "sqrt" | "square" | "inverse" | "percent") => {
    if (kind === "sign") return setNumber(-value);
    if (kind === "sqrt") return value < 0 ? setState((current) => ({ ...current, display: "Error", replace: true })) : addHistory(`√${formatResult(value)}`, Math.sqrt(value));
    if (kind === "square") return addHistory(`${formatResult(value)}²`, value * value);
    if (kind === "inverse") return value === 0 ? setState((current) => ({ ...current, display: "Error", replace: true })) : addHistory(`1 ÷ ${formatResult(value)}`, 1 / value);
    addHistory(`${formatResult(value)}%`, value / 100);
  };
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const operatorMap: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
      if (/^\d$/.test(event.key)) { event.preventDefault(); enter(event.key); return; }
      if (event.key === "." || event.key === ",") { event.preventDefault(); enter("."); return; }
      if (operatorMap[event.key]) { event.preventDefault(); chooseOperator(operatorMap[event.key]); return; }
      if (event.key === "Enter" || event.key === "=") { event.preventDefault(); equals(); return; }
      if (event.key === "%") { event.preventDefault(); unary("percent"); return; }
      if (event.key === "Backspace") { event.preventDefault(); backspace(); return; }
      if (event.key === "Escape") { event.preventDefault(); clear(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs" dir="ltr">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2 text-slate-800"><Calculator size={19} className="text-indigo-600" /><div><h2 className="text-sm font-bold">ماشین‌حساب حسابداری</h2><InlineHelp><p className="text-[10px] text-slate-500">محاسبه و تاریخچه مستقل است و هیچ سند یا مبلغ حسابداری را تغییر نمی‌دهد.</p></InlineHelp></div></div><button type="button" onClick={clearAll} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"><Trash2 size={14} />پاک‌سازی کامل</button></div>
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_19rem]">
      <div><div className="mb-3 rounded-xl bg-slate-950 p-4 text-right font-mono text-3xl font-bold text-white shadow-inner"><div className="min-h-4 text-xs font-normal text-slate-400">{pendingExpression || " "}</div><div className="truncate" aria-live="polite">{formatForReading(state.display)}</div></div>
        <div className="mb-2 grid grid-cols-5 gap-2"><button type="button" onClick={clear} className="rounded-lg bg-rose-100 py-2 text-xs font-bold text-rose-700">CE</button><button type="button" onClick={backspace} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">⌫</button><button type="button" onClick={() => setState((current) => ({ ...current, memory: 0 }))} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">MC</button><button type="button" onClick={() => setNumber(state.memory)} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">MR</button><button type="button" onClick={() => setState((current) => ({ ...current, memory: current.memory + value }))} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">M+</button></div>
        <div className="mb-2 grid grid-cols-5 gap-2"><button type="button" onClick={() => setState((current) => ({ ...current, memory: current.memory - value }))} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">M−</button><button type="button" onClick={() => unary("sign")} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">±</button><button type="button" onClick={() => unary("sqrt")} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">√</button><button type="button" onClick={() => unary("square")} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">x²</button><button type="button" onClick={() => unary("inverse")} className="rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-700">1/x</button></div>
        <div className="grid grid-cols-4 gap-2">{keys.map((key) => <button key={key} type="button" onClick={() => key === "=" ? equals() : ["+", "−", "×", "÷"].includes(key) ? chooseOperator(key) : enter(key)} className={`rounded-lg py-3 text-base font-bold transition ${["+", "−", "×", "÷", "="].includes(key) ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>{key}</button>)}<button type="button" onClick={() => unary("percent")} className="col-span-4 rounded-lg bg-slate-100 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">%</button></div>
      </div>
      <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3" dir="rtl"><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-1 text-xs font-bold text-slate-800"><Clock3 size={15} />مراحل محاسبه</h3><button type="button" onClick={() => setState((current) => ({ ...current, history: [] }))} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-rose-600"><RotateCcw size={12} />پاک کردن</button></div><InlineHelp><p className="mb-2 text-[10px] text-slate-500">با انتخاب هر نتیجه، همان عدد دوباره وارد ماشین‌حساب می‌شود.</p></InlineHelp><div className="max-h-80 space-y-1 overflow-auto">{state.history.length ? state.history.map((item) => <button type="button" key={item.id} onClick={() => setNumber(Number(item.result))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-right hover:border-indigo-300 hover:bg-indigo-50"><span className="block font-mono text-xs text-slate-500" dir="ltr">{item.expression}</span><span className="mt-0.5 flex items-center justify-between font-mono text-sm font-bold text-slate-900"><span>{formatForReading(item.result)}</span><small className="font-sans text-[10px] font-normal text-slate-400">{item.savedAt}</small></span></button>) : <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">هنوز محاسبه‌ای ثبت نشده است.</div>}</div></aside>
    </div>
  </section>;
};
