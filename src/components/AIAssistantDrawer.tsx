import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  TrendingUp,
  FileSpreadsheet,
  Wallet,
  RefreshCw,
  HelpCircle,
  Check,
  ChevronLeft,
  Paperclip,
  FileText,
} from "lucide-react";
import { AppDatabase, ChatMessage, Order, Customer, CashEntry, UserRole } from "../types";
import { AIAttachment, sendChatMessageToAI } from "../services/geminiService";

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  db: AppDatabase;
  userRole: UserRole;
  onApplyAIAction: (actionType: string, payload: any) => void | Promise<void>;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  isOpen,
  onClose,
  db,
  userRole,
  onApplyAIAction,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "assistant",
      text: "سلام! من دستیار هوشمند حسابداری و بازرگانی بین‌المللی شما هستم.\nمی‌توانید هر کاری از جمله صدور پیش‌فاکتور، تعریف مشتری، استعلام موجودی صندوق ارزی، محاسبه مارجین یا تحلیل سهم شرکا را به زبان ساده از من بخواهید تا بلافاصله برایتان انجام دهم.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"normal" | "professional">("normal");
  const [executedActions, setExecutedActions] = useState<Record<string, boolean>>({});
  const [settlementInputs, setSettlementInputs] = useState<Record<string, { confirmed: boolean; date: string; note: string; error: string }>>({});
  const [attachment, setAttachment] = useState<AIAttachment | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const quickPrompts = [
    "سود خالص کل و سهم آرکا از سفارشات فعال چقدر است؟",
    "محاسبات و موانع تسویهٔ لیست حسابداری من را بررسی کن",
    "تراز موجودی نقدی دلار و یورو در صندوق‌ها را خلاصه کن",
    "یک مشتری جدید به نام پتروشیمی زاگرس با شناسه ۱۰۹۲۸۳۷ تعریف کن",
    "وضعیت محموله‌های در حال حرکت کشتی را بررسی کن",
  ];

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputMessage("");
    setIsLoading(true);

    try {
      const response = await sendChatMessageToAI(textToSend, db, [], aiMode, userRole, attachment || undefined);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: response.reply,
        timestamp: new Date().toISOString(),
        action: response.action,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If action has payload, user can execute or auto execute
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: "متأسفانه در پردازش درخواست خطایی رخ داد. لطفاً دوباره تلاش کنید.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setAttachment(null);
    } finally {
      setIsLoading(false);
    }
  };

  const importForAnalysis = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("حداکثر حجم فایل تحلیل ۱۰ مگابایت است.");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (["xlsx", "xls", "csv"].includes(extension || "")) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const text = workbook.SheetNames.map((name) => `--- ${name} ---\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n").slice(0, 24000);
      setAttachment({ name: file.name, mimeType: file.type || "application/vnd.ms-excel", extractedText: text });
      return;
    }
    if (file.type.startsWith("image/")) {
      const imageData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      setAttachment({ name: file.name, mimeType: file.type, imageData });
      return;
    }
    alert("فقط تصویر، Excel یا CSV برای تحلیل پشتیبانی می‌شود.");
  };

  const handleExecuteAction = async (action: any, msgId: string) => {
    if (!action) return;
    const settlement = settlementInputs[msgId];
    if (action.type === "SETTLE_ACCOUNTING_LIST") {
      if (!settlement?.confirmed || !settlement.date || !settlement.note.trim()) return;
    }
    try {
      const payload = action.type === "SETTLE_ACCOUNTING_LIST" && settlement
        ? { ...action.payload, date: settlement.date, note: settlement.note.trim(), receiptAndSharesConfirmed: true }
        : action.payload;
      await onApplyAIAction(action.type, payload);
      setExecutedActions((prev) => ({ ...prev, [msgId]: true }));
    } catch (error) {
      setSettlementInputs((prev) => ({ ...prev, [msgId]: { ...(prev[msgId] || { confirmed: false, date: new Date().toISOString().slice(0, 10), note: "" }), error: error instanceof Error ? error.message : "اجرای عملیات ناموفق بود." } }));
    }
  };

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-full sm:w-[460px] bg-white shadow-2xl border-r border-slate-200 flex flex-col transition-all duration-300 animate-slide-in">
      {/* Drawer Header */}
      <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="font-bold text-xs">دستیار حسابدار و مدیر بازرگانی هوشمند</h3>
            <p className="text-[10px] text-slate-400">تحلیل مالی، صدور اسناد و کنترل لحظه‌ای دیتابیس</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick Prompts Carousel */}
      <div className="p-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto whitespace-nowrap space-x-2 space-x-reverse flex text-xs">
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-700 text-[10px] font-medium shadow-2xs transition-all shrink-0"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div className="p-3.5 overflow-y-auto flex-1 space-y-3.5 text-xs bg-[#F8FAFC]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] p-3 rounded-xl space-y-2 shadow-2xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-indigo-600 text-white rounded-br-xs"
                  : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
              }`}
            >
              <div className="whitespace-pre-line text-xs">{msg.text}</div>

              {/* Action execution widget returned by the AI service */}
              {msg.action && (
                <div className="pt-2 border-t border-slate-200/80 mt-2 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                    <span className="flex items-center gap-1 text-indigo-700">
                      <Sparkles size={12} />
                      اقدام سیستمی پیشنهادی:
                    </span>
                    <span className="font-mono text-slate-500">{msg.action.type}</span>
                  </div>

                  {msg.action.type === "SETTLE_ACCOUNTING_LIST" && !executedActions[msg.id] && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-950">
                    <p>این فقط تأیید تاریخی ثبت می‌کند و پرداخت جدید نمی‌سازد. ادامه دهید فقط اگر وجه شرکت واقعاً وصول شده و تمام سهم‌ها واقعاً پرداخت شده‌اند.</p>
                    <div className="grid grid-cols-2 gap-2"><label>تاریخ تأیید<input type="date" value={settlementInputs[msg.id]?.date || new Date().toISOString().slice(0, 10)} onChange={(event) => setSettlementInputs((prev) => ({ ...prev, [msg.id]: { ...(prev[msg.id] || { confirmed: false, date: "", note: "", error: "" }), date: event.target.value, error: "" } }))} className="mt-1 block w-full rounded border p-1.5"/></label><label>شرح یا مرجع<input value={settlementInputs[msg.id]?.note || ""} onChange={(event) => setSettlementInputs((prev) => ({ ...prev, [msg.id]: { ...(prev[msg.id] || { confirmed: false, date: new Date().toISOString().slice(0, 10), note: "", error: "" }), note: event.target.value, error: "" } }))} placeholder="شماره رسید یا مرجع" className="mt-1 block w-full rounded border p-1.5"/></label></div>
                    <label className="flex items-start gap-2"><input type="checkbox" checked={settlementInputs[msg.id]?.confirmed || false} onChange={(event) => setSettlementInputs((prev) => ({ ...prev, [msg.id]: { ...(prev[msg.id] || { date: new Date().toISOString().slice(0, 10), note: "", error: "" }), confirmed: event.target.checked, error: "" } }))}/><span>تأیید می‌کنم دریافت سود و پرداخت همهٔ سهم‌ها واقعاً انجام شده است.</span></label>
                    {settlementInputs[msg.id]?.error && <p role="alert" className="text-rose-700">{settlementInputs[msg.id]?.error}</p>}
                  </div>}

                  {executedActions[msg.id] ? (
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1.5">
                      <Check size={13} className="text-emerald-600" />
                      <span>این اقدام با موفقیت در دیتابیس سامانه ثبت شد.</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleExecuteAction(msg.action, msg.id)}
                      disabled={msg.action.type === "SETTLE_ACCOUNTING_LIST" && (!settlementInputs[msg.id]?.confirmed || !settlementInputs[msg.id]?.date || !settlementInputs[msg.id]?.note.trim())}
                      className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-98 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCircle2 size={14} />
                      <span>تأیید و اجرای مستقیم در نرم‌افزار</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <span className="text-[9px] text-slate-400 mt-1 px-1 font-mono">
              {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 max-w-fit shadow-2xs">
            <RefreshCw size={13} className="animate-spin text-indigo-600" />
            <span className="text-xs">دستیار در حال بررسی دفاتر حسابداری و انجام محاسبات...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="p-2.5 bg-white border-t border-slate-200">
        {attachment && <div className="mb-2 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[10px] text-indigo-800"><span className="inline-flex min-w-0 items-center gap-1.5"><FileText size={13}/><b className="truncate">{attachment.name}</b><span>{attachment.imageData ? "تصویر آماده تحلیل" : "جدول آماده تحلیل"}</span></span><button type="button" onClick={() => setAttachment(null)} className="text-rose-600"><X size={13}/></button></div>}
        <div className="mb-2 flex items-center gap-1.5 text-[10px]">
          <button type="button" onClick={() => setAiMode("normal")} className={`rounded-md px-2 py-1 font-bold transition-colors ${aiMode === "normal" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>عادی · Groq</button>
          <button type="button" onClick={() => setAiMode("professional")} className={`rounded-md px-2 py-1 font-bold transition-colors ${aiMode === "professional" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>تحلیل حرفه‌ای · GPT-4o mini</button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="مثال: وضعیت سود این ماه را بررسی کن یا پیش‌فاکتور صادر کن..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
            className="flex-1 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
          />

          <label className="cursor-pointer rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700" title="افزودن تصویر یا Excel برای تحلیل"><Paperclip size={15}/><input type="file" accept="image/*,.xlsx,.xls,.csv" className="hidden" disabled={isLoading} onChange={(event) => { importForAnalysis(event.target.files?.[0]); event.target.value = ""; }}/></label>

          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-all shadow-2xs"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
};
