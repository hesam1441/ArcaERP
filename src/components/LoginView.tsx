import React, { useRef, useState } from "react";
import { AppUser, Language } from "../types";
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

type LoginViewProps = { users: AppUser[]; language: Language; onLogin: (user: AppUser, bootstrapHash?: string) => void };

async function authRequest(path: string, body: unknown) {
  // localhost is a development fallback only. On a phone it means the phone
  // itself and creates a second, misleading login attempt after a slow request.
  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const urls = [path];
  let lastError = "ارتباط با سرور برقرار نشد.";
  for (const url of urls) {
    let receivedResponse = false;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(url, { method: "POST", credentials: "include", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      window.clearTimeout(timeout);
      receivedResponse = true;
      const result = await response.json().catch(() => ({}));
      if (response.ok) return result;
      // The main server answered: its message (such as an incorrect password)
      // is definitive. Do not then wait for localhost on the user's own device.
      throw new Error(result.error || lastError);
    } catch (error: any) { if (receivedResponse) throw error; lastError = error?.message || lastError; }
  }
  throw new Error(lastError);
}

export const LoginView: React.FC<LoginViewProps> = ({ users, language, onLogin }) => {
  const fa = language === "fa";
  const resetToken = new URLSearchParams(window.location.search).get("resetToken") || "";
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(resetToken ? "reset" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setIsError(true);
      setMessage(fa ? "نام کاربری و رمز عبور را وارد کنید." : "Enter your username and password.");
      return;
    }
    submitting.current = true;
    setMessage(""); setIsError(false); setLoading(true);
    try {
      const result = await authRequest("/api/auth/login", { username: normalizedUsername, password });
      if (!result.user?.id) throw new Error(fa ? "پاسخ ورود معتبر نیست." : "Invalid sign-in response.");
      onLogin(result.user as AppUser);
    } catch (error: any) {
      setIsError(true);
      setMessage(error.message || (fa ? "ورود ناموفق بود." : "Sign in failed."));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault(); if (!username.trim()) return;
    setLoading(true); setMessage("");
    try { const result = await authRequest("/api/auth/request-password-reset", { username: username.trim() }); setIsError(false); setMessage(result.message); }
    catch (error: any) { setIsError(true); setMessage(error.message); }
    finally { setLoading(false); }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setIsError(true); return setMessage("رمز عبور باید حداقل ۸ کاراکتر باشد."); }
    if (password !== confirmPassword) { setIsError(true); return setMessage("تکرار رمز عبور یکسان نیست."); }
    setLoading(true); setMessage("");
    try {
      await authRequest("/api/auth/reset-password", { token: resetToken, password });
      window.history.replaceState({}, "", window.location.pathname);
      setPassword(""); setConfirmPassword(""); setMode("login"); setIsError(false); setMessage("رمز عبور تغییر کرد؛ اکنون وارد شوید.");
    } catch (error: any) { setIsError(true); setMessage(error.message); }
    finally { setLoading(false); }
  };

  return <main dir={fa ? "rtl" : "ltr"} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-5">
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true"><img src="/arcatav-logo.png" alt="" className="h-[min(78vw,620px)] w-[min(78vw,620px)] object-contain opacity-[0.16] blur-[1px]" /></div>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.16)_45%,rgba(2,6,23,0.7)_100%)]" aria-hidden="true" />
    <form onSubmit={mode === "login" ? login : mode === "forgot" ? requestReset : resetPassword} className="relative z-10 w-full max-w-sm space-y-5 rounded-2xl border border-white/20 bg-slate-950/45 p-7 shadow-2xl shadow-indigo-950/40 backdrop-blur-md">
      <div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">{mode === "forgot" ? <Mail size={22}/> : mode === "reset" ? <KeyRound size={22}/> : <LockKeyhole size={22}/>}</div><h1 className="font-bold text-white">ARCATAV</h1><p className="mt-1 text-xs text-slate-400">{mode === "login" ? (fa ? "ورود به سامانه" : "Sign in") : mode === "forgot" ? "بازیابی رمز عبور" : "تعیین رمز عبور جدید"}</p></div>
      {mode !== "reset" && <label className="block text-xs text-slate-200">{fa ? "نام کاربری" : "Username"}<input required autoFocus value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/50 p-2.5 text-white outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-slate-950/70"/></label>}
      {mode !== "forgot" && <label className="block text-xs text-slate-200">{mode === "reset" ? "رمز عبور جدید" : (fa ? "رمز عبور" : "Password")}<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "reset" ? "new-password" : "current-password"} className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/50 p-2.5 text-white outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-slate-950/70"/></label>}
      {mode === "reset" && <label className="block text-xs text-slate-200">تکرار رمز عبور جدید<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/50 p-2.5 text-white outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-slate-950/70"/></label>}
      {message && <p className={`rounded-lg px-3 py-2 text-xs ${isError ? "bg-rose-950/50 text-rose-300" : "bg-emerald-950/50 text-emerald-300"}`}>{message}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50">{loading ? "لطفاً صبر کنید…" : mode === "login" ? (fa ? "ورود" : "Sign in") : mode === "forgot" ? "ارسال لینک بازیابی" : "ذخیره رمز جدید"}</button>
      {mode === "login" ? <button type="button" onClick={() => { setMode("forgot"); setMessage(""); }} className="w-full text-xs text-indigo-300 hover:text-white">{fa ? "رمز عبور را فراموش کرده‌ام" : "Forgot password?"}</button> : <button type="button" onClick={() => { setMode("login"); setMessage(""); }} className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white"><ArrowRight size={13}/> بازگشت به ورود</button>}
      <p className="border-t border-slate-800 pt-3 text-center text-[10px] text-slate-500"><ShieldCheck className="inline ml-1" size={11}/>لینک بازیابی ۳۰ دقیقه اعتبار دارد و یک‌بار قابل استفاده است.</p>
    </form>
  </main>;
};
