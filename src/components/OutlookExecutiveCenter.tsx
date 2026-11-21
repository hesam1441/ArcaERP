import { InlineHelp } from "./InlineHelp";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, ExternalLink, Mail, PackageCheck, Plus, RefreshCw, Search, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

type DashboardItem = {
  id: string;
  title: string;
  subtitle?: string;
  sender?: string;
  company?: string;
  date?: string;
  dueDate?: string;
  priority?: "high" | "medium" | "low";
  status?: string;
  link?: string;
  amount?: number;
  currency?: string;
  unit?: string;
  product?: string;
  direction?: "up" | "down" | "same";
};

type OutlookDashboard = {
  connected: boolean;
  configured: boolean;
  account?: string;
  lastSyncAt?: string;
  summary?: { scannedEmails: number; urgent: number; upcoming: number; unanswered: number; prices: number };
  urgent?: DashboardItem[];
  upcoming?: DashboardItem[];
  shipments?: DashboardItem[];
  unanswered?: DashboardItem[];
  prices?: DashboardItem[];
};
type ExecutiveTask = { id: string; title: string; description: string; completed: boolean; createdAt: string; completedAt?: string };

const emptyData: OutlookDashboard = { connected: false, configured: false };
const priorityClass = (priority?: string) => priority === "high" ? "bg-rose-50 text-rose-700 border-rose-200" : priority === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200";
const faDate = (value?: string) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(new Date(value)) : "—";

const renderInlineMarkdown = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
  part.startsWith("**") && part.endsWith("**")
    ? <strong key={index} className="font-black text-slate-900">{part.slice(2, -2)}</strong>
    : <React.Fragment key={index}>{part}</React.Fragment>
);

const ExecutiveReport: React.FC<{ text: string }> = ({ text }) => <div className="space-y-2 text-[15px] leading-8 text-slate-700">
  {text.split(/\r?\n/).map((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return <div key={index} className="h-1" />;
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1] || line.match(/^\*\*([^*]+):?\*\*:?$/)?.[1];
    if (heading) return <h3 key={index} className="mt-5 border-r-4 border-indigo-500 pr-3 text-base font-black text-indigo-950 first:mt-0">{heading.replace(/:$/, "")}</h3>;
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) return <div key={index} className="grid grid-cols-[1.8rem_minmax(0,1fr)] items-start gap-2 rounded-xl bg-white/60 px-3 py-1.5"><span className="mt-1 grid h-6 w-6 place-items-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700">{numbered[1]}</span><p>{renderInlineMarkdown(numbered[2])}</p></div>;
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) return <div key={index} className="flex items-start gap-2 px-2"><span className="mt-[0.78rem] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500"/><p>{renderInlineMarkdown(bullet[1])}</p></div>;
    return <p key={index} className="px-2">{renderInlineMarkdown(line)}</p>;
  })}
</div>;

export const OutlookExecutiveCenter: React.FC = () => {
  const [data, setData] = useState<OutlookDashboard>(emptyData);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"urgent" | "upcoming" | "shipments" | "unanswered" | "prices">("urgent");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<ExecutiveTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [finishingTaskId, setFinishingTaskId] = useState<string | null>(null);
  const [assistantRunning, setAssistantRunning] = useState(false);
  const [assistantReport, setAssistantReport] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/outlook/dashboard", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "دریافت اطلاعات ناموفق بود.");
      setData(json);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const loadTasks = async () => {
    try {
      const response = await fetch("/api/executive-tasks", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (response.ok) setTasks((json.tasks || []).filter((task: ExecutiveTask) => !task.completed));
    } catch { /* Outlook panel remains usable if task loading is temporarily unavailable. */ }
  };
  useEffect(() => { void load(); void loadTasks(); }, []);

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setAddingTask(true); setError("");
    try {
      const response = await fetch("/api/executive-tasks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: taskTitle, description: taskDescription }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "ثبت کار ناموفق بود.");
      setTasks((current) => [json.task, ...current]); setTaskTitle(""); setTaskDescription("");
    } catch (e: any) { setError(e.message); }
    finally { setAddingTask(false); }
  };
  const finishTask = async (task: ExecutiveTask) => {
    setFinishingTaskId(task.id); setError("");
    try {
      const response = await fetch(`/api/executive-tasks/${encodeURIComponent(task.id)}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: true }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "ثبت انجام کار ناموفق بود.");
      window.setTimeout(() => { setTasks((current) => current.filter((item) => item.id !== task.id)); setFinishingTaskId(null); }, 650);
    } catch (e: any) { setFinishingTaskId(null); setError(e.message); }
  };

  const sync = async () => {
    setSyncing(true); setError("");
    try {
      const response = await fetch("/api/outlook/sync", { method: "POST", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "به‌روزرسانی ناموفق بود.");
      setData(json);
    } catch (e: any) { setError(e.message); }
    finally { setSyncing(false); }
  };

  const runAssistant = async () => {
    setAssistantRunning(true); setError("");
    try {
      const currentAppContext = {
        tasks: tasks.map(({ title, description, createdAt }) => ({ title, description, createdAt })),
        outlook: { connected: data.connected, lastSyncAt: data.lastSyncAt, summary: data.summary, urgent: data.urgent?.slice(0, 20), upcoming: data.upcoming?.slice(0, 20), shipments: data.shipments?.slice(0, 20), unanswered: data.unanswered?.slice(0, 20), prices: data.prices?.slice(0, 30) },
      };
      const response = await fetch("/api/ai/assistant", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "اطلاعات منشی را تحلیل و یک گزارش اجرایی آماده کن. نتیجه را اول بگو؛ سپس فقط بخش‌های دارای داده از جمع‌بندی مدیریتی، اقدام فوری امروز، کارهای در انتظار، حمل و موعدها، استعلام‌ها و قیمت‌ها، و ریسک‌ها و تصمیم‌های لازم را بیاور. هر مورد باید مشخص، کوتاه و قابل اقدام باشد.", currentAppContext, aiMode: "normal", userRole: "superadmin", conversationHistory: [] }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "اجرای منشی هوشمند ناموفق بود.");
      setAssistantReport(json.reply || "گزارشی دریافت نشد.");
    } catch (e: any) { setError(e.message); }
    finally { setAssistantRunning(false); }
  };

  const items = useMemo(() => (data[section] || []).filter((item) => `${item.title} ${item.subtitle || ""} ${item.sender || ""} ${item.product || ""}`.toLowerCase().includes(query.toLowerCase())), [data, section, query]);
  const tabs = [
    ["urgent", "اقدام فوری", data.summary?.urgent || 0], ["upcoming", "پیش رو", data.summary?.upcoming || 0],
    ["shipments", "حمل‌ها", data.shipments?.length || 0], ["unanswered", "منتظر پاسخ", data.summary?.unanswered || 0], ["prices", "تاریخچه قیمت", data.summary?.prices || 0],
  ] as const;

  if (loading) return <div className="min-h-[65vh] grid place-items-center"><RefreshCw className="animate-spin text-indigo-600" size={30}/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-5" dir="rtl">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-200/50">
      <div className="relative p-5 sm:p-7">
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_15%_20%,#2563eb_0,transparent_28%),radial-gradient(circle_at_85%_0%,#0d9488_0,transparent_26%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-cyan-200"><ShieldCheck size={17}/><span>{data.connected ? `Gmail متصل · ${data.account || ""}` : "مرکز فرمان منشی اجرایی"}</span></div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">امروز چه چیزی به توجه شما نیاز دارد؟</h1>
            <InlineHelp><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">ایمیل‌ها، موعدها، حمل‌ها و تغییرات قیمت را در یک نمای اجرایی ببینید.</p></InlineHelp>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {data.lastSyncAt && <span className="text-xs text-slate-300">آخرین اجرا: {faDate(data.lastSyncAt)}</span>}
            <button onClick={runAssistant} disabled={assistantRunning} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:opacity-60"><Sparkles size={18} className={assistantRunning ? "animate-pulse" : ""}/>{assistantRunning ? "در حال تحلیل…" : "اجرای منشی GPT"}</button>
            {data.connected ? <button onClick={sync} disabled={syncing} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 disabled:opacity-60">
              <RefreshCw size={18} className={syncing ? "animate-spin" : ""}/>{syncing ? "در حال بررسی…" : "اجرا و به‌روزرسانی"}
            </button> : <button type="button" disabled className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 opacity-90"><CheckCircle2 size={18}/>Gmail متصل به منشی</button>}
          </div>
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="shrink-0" size={19}/><span>{error}</span></div>}
    {!data.configured && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900"><strong>منشی GPT قابل استفاده است؛ اتصال Gmail در حال آماده‌سازی است.</strong><br/>حساب demo@example.invalid برای منشی متصل شده است. GPT در پنل اطلاعات موجود در سامانه و کارهای ثبت‌شده را تحلیل می‌کند.</div>}
    {assistantReport && <section className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2 border-b border-indigo-100 pb-4 text-indigo-900"><Bot size={22}/><h2 className="text-lg font-black">گزارش منشی هوشمند</h2></div><ExecutiveReport text={assistantReport}/></section>}

    <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)] lg:p-5">
      <form onSubmit={addTask} className="rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex items-center gap-2"><ClipboardCheck className="text-cyan-300" size={21}/><h2 className="text-lg font-black">افزودن کار جدید</h2></div>
        <label className="mt-5 block text-sm font-bold text-slate-200">عنوان کار<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} maxLength={240} placeholder="مثلاً پیگیری قیمت Phenol" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"/></label>
        <label className="mt-3 block text-sm font-bold text-slate-200">توضیحات<textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} maxLength={4000} rows={3} placeholder="جزئیات، مسئول، موعد یا نکته‌های لازم…" className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-base leading-7 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"/></label>
        <button disabled={addingTask || !taskTitle.trim()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"><Plus size={18}/>{addingTask ? "در حال ثبت…" : "ثبت در فهرست کارها"}</button>
      </form>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 px-1 pb-3"><div><h2 className="text-lg font-black text-slate-900">کارهای در انتظار</h2><p className="mt-1 text-sm text-slate-500">با انجام هر کار، مربع کنار آن را علامت بزنید.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-black text-indigo-700">{tasks.length.toLocaleString("fa-IR")}</span></div>
        <div className="max-h-[360px] space-y-2 overflow-y-auto pl-1">
          {!tasks.length && <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-slate-200 text-center text-sm text-slate-400"><div><CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={27}/>همه کارها انجام شده‌اند.</div></div>}
          {tasks.map((task) => {
            const finishing = finishingTaskId === task.id;
            return <label key={task.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${finishing ? "border-emerald-200 bg-emerald-50 opacity-60" : "border-slate-200 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/40"}`}>
              <input type="checkbox" checked={finishing} disabled={Boolean(finishingTaskId)} onChange={() => void finishTask(task)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-emerald-600"/>
              <span className="min-w-0 flex-1"><strong className={`block text-sm text-slate-900 ${finishing ? "line-through" : ""}`}>{task.title}</strong>{task.description && <span className={`mt-1 block whitespace-pre-wrap text-sm leading-6 text-slate-500 ${finishing ? "line-through" : ""}`}>{task.description}</span>}<span className="mt-2 block text-xs text-slate-400">ثبت‌شده در {faDate(task.createdAt)}</span></span>
            </label>;
          })}
        </div>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[
        ["ایمیل بررسی‌شده", data.summary?.scannedEmails || 0, Mail, "text-blue-600"], ["فوری", data.summary?.urgent || 0, AlertTriangle, "text-rose-600"],
        ["رویداد پیش رو", data.summary?.upcoming || 0, CalendarDays, "text-violet-600"], ["منتظر پاسخ", data.summary?.unanswered || 0, Clock3, "text-amber-600"], ["قیمت ثبت‌شده", data.summary?.prices || 0, PackageCheck, "text-emerald-600"],
      ].map(([label, value, Icon, color]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon size={20} className={color}/><div className="mt-3 text-2xl font-black text-slate-900">{value.toLocaleString("fa-IR")}</div><div className="mt-1 text-sm text-slate-500">{label}</div></div>)}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map(([id, label, count]) => <button key={id} onClick={() => setSection(id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${section === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}<span className="mr-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">{count.toLocaleString("fa-IR")}</span></button>)}
        </div>
        <label className="relative block lg:w-72"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو در این بخش…" className="w-full rounded-xl border border-slate-200 py-2.5 pr-10 pl-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/></label>
      </div>
      <div className="divide-y divide-slate-100">
        {!items.length && <div className="grid min-h-52 place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto text-emerald-500" size={32}/><p className="mt-3 font-bold text-slate-700">موردی برای نمایش وجود ندارد</p><p className="mt-1 text-sm text-slate-400">برای دریافت تازه‌ترین اطلاعات، دکمه اجرا را بزنید.</p></div></div>}
        {items.map((item) => <article key={item.id} className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50 sm:p-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{item.product || item.title}</h3>{item.priority && <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${priorityClass(item.priority)}`}>{item.priority === "high" ? "فوری" : item.priority === "medium" ? "مهم" : "عادی"}</span>}{item.status && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">{item.status}</span>}</div><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.product ? item.title : item.subtitle}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>{item.sender || item.company || "Outlook"}</span><span>{faDate(item.dueDate || item.date)}</span></div></div>
          {typeof item.amount === "number" && <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 font-mono font-black text-slate-800">{item.direction === "up" ? <TrendingUp size={17} className="text-rose-500"/> : item.direction === "down" ? <TrendingDown size={17} className="text-emerald-500"/> : null}{item.amount.toLocaleString("en-US")} {item.currency} <span className="text-xs font-normal text-slate-500">/{item.unit || "MT"}</span></div>}
          {item.link && <a href={item.link} target="_blank" rel="noreferrer" aria-label="باز کردن در Outlook" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"><ExternalLink size={17}/></a>}
        </article>)}
      </div>
    </section>
  </div>;
};
