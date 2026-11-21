import React, { useEffect, useState } from "react";
import { KeyRound, Save } from "lucide-react";

export const AIKeySettings: React.FC<{ username: string }> = ({ username }) => {
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [connection, setConnection] = useState("");
  useEffect(() => { fetch("/api/ai/status").then(r => r.json()).then(data => setConnection(data.primary || "")).catch(() => {}); }, []);
  const save = async () => {
    if (!apiKey.trim() || !password) return setStatus("کلید API و رمز مدیر ارشد را وارد کنید.");
    setStatus("در حال ذخیره‌سازی و بررسی اتصال...");
    try {
      const response = await fetch("/api/settings/openai-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, apiKey }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setStatus(data.error || "ذخیره کلید ناموفق بود.");
      setApiKey(""); setPassword(""); setStatus("کلید با موفقیت و به‌صورت رمزگذاری‌شده ذخیره شد. اکنون دستیار را امتحان کنید.");
    } catch { setStatus("ارتباط با سرور برقرار نشد. دوباره تلاش کنید."); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound size={18} className="text-indigo-600"/>اتصال هوش مصنوعی</h2><p className="mt-1 text-xs text-slate-500">{connection === "groq" ? "مسیر فعال: Groq → Dify → OpenAI؛ در پایان سهمیه یا خطا، مسیر بعدی خودکار فعال می‌شود." : connection === "dify" ? "مسیر فعال: Dify → OpenAI؛ در خطا یا پایان سهمیه، OpenAI پشتیبان است." : "کلید OpenAI را وارد کنید. کلید در دیتابیس برنامه ذخیره نمی‌شود و روی سرور به‌صورت رمزگذاری‌شده نگهداری خواهد شد."}</p><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]"><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="OpenAI API Key (sk-...)" className="rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs" autoComplete="off"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="رمز مدیر ارشد" className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" autoComplete="current-password"/><button type="button" onClick={save} className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><Save size={14}/>ذخیره کلید</button></div>{status && <div className={`mt-2 rounded-lg p-2 text-xs ${status.includes("موفقیت") ? "bg-emerald-50 text-emerald-700" : status.includes("در حال") ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700"}`}>{status}</div>}</section>;
};
