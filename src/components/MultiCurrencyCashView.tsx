import { InlineHelp } from "./InlineHelp";
import { GuidedSection } from "./GuidedSection";
import { cashPeople, cashCurrencies, cashAccountAmount, cashAccountTotal, cashCurrencyTotal } from "../utils/cashBalances";
import { usePartyDirectory } from "./PartyDirectory";
import React, { useState, useRef, useEffect } from "react";
import {
  Wallet,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Euro,
  Coins,
  Calendar,
  Save,
  Trash2,
  Download,
  Building,
  User,
  UserPlus,
  UserX,
  Users,
  CheckCircle2,
  Tag,
  Edit3,
} from "lucide-react";
import { CashEntry, AppDatabase, CashPartner, Language } from "../types";
import { formatCurrency, formatNumber, toJalaliDate } from "../utils/formatters";
import { exportToCSV } from "../services/storageService";
import { getTranslation } from "../i18n/translations";

// Keep intermediate text ("-", "-0.") while typing; persist only numeric amounts.
const CashAmountInput: React.FC<{value?:number;onChange:(amount:number)=>void;label:string}> = ({value,onChange,label}) => {
  const [text,setText]=useState(value===undefined?"":String(value));
  const lastValue=useRef(value);
  useEffect(()=>{if(!Object.is(value,lastValue.current)){lastValue.current=value;setText(value===undefined?"":String(value));}},[value]);
  return <input type="text" inputMode="decimal" dir="ltr" aria-label={label} pattern="-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)" value={text} onChange={event=>{
    const raw=event.target.value.replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/−/g,"-").replace(/٫/g,".").replace(/[,٬]/g,"");
    if(!/^-?\d*(?:\.\d*)?$/.test(raw))return;
    setText(raw);
    if(raw==="" || /\d/.test(raw)){const amount=raw===""?0:Number(raw);lastValue.current=amount;onChange(amount);}
  }} className="w-full rounded border border-slate-200 bg-white p-1.5 text-center font-mono"/>;
};

function QuickCashFields({entry,onChange}:{entry:CashEntry;onChange:(entry:CashEntry)=>void}) {
  const existing = cashPeople.flatMap(person=>cashCurrencies.map(currency=>({person,currency,amount:cashAccountAmount(entry,person,currency)}))).filter(row=>row.amount!==0);
  const [person,setPerson]=useState<string>(()=>existing[0]?.person || "دفتر");
  const [currency,setCurrency]=useState<string>(()=>existing[0]?.currency || "USD");
  const key=`${person}_${currency}`;
  return <section data-quick-cash className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
    <InlineHelp><p className="text-xs leading-6 text-indigo-900">حساب و ارز را انتخاب کنید. مبلغ مثبت برای ورود وجه و مبلغ منفی برای خروج وجه است. برای انتقال، مبلغ خروج را در حساب مبدأ و مبلغ ورود را در حساب مقصد همین سند وارد کنید.</p></InlineHelp>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-bold">حساب<select aria-label="حساب گردش" value={person} onChange={e=>setPerson(e.target.value)} className="mt-1 w-full rounded border p-2">{cashPeople.map(name=><option key={name}>{name}</option>)}</select></label>
      <label className="text-xs font-bold">ارز<select aria-label="ارز گردش" value={currency} onChange={e=>setCurrency(e.target.value)} className="mt-1 w-full rounded border p-2">{cashCurrencies.map(code=><option key={code}>{code}</option>)}</select></label>
      <label className="text-xs font-bold">مبلغ ورود / خروج<CashAmountInput key={key} label="مبلغ گردش ساده" value={cashAccountAmount(entry,person,currency)} onChange={amount=>onChange({...entry,accounts:{...entry.accounts,[key]:amount}})}/></label>
    </div>
    {existing.length>0&&<div className="flex flex-wrap gap-2">{existing.map(row=><button type="button" key={`${row.person}_${row.currency}`} onClick={()=>{setPerson(row.person);setCurrency(row.currency);}} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs">{row.person} · {row.currency} · <b dir="ltr">{formatNumber(row.amount)}</b></button>)}</div>}
    <InlineHelp><p className="text-xs text-slate-600">مبالغ حساب‌های دیگر حفظ می‌شوند. برای حذف مبلغ یک حساب، آن را انتخاب و صفر کنید؛ سپس سند را ذخیره کنید.</p></InlineHelp>
  </section>;
}

interface MultiCurrencyCashViewProps {
  guided?: boolean;
  db: AppDatabase;
  language: Language;
  onSaveCashEntry: (entry: CashEntry) => void;
  onDeleteCashEntry: (cashId: number) => void;
  onSavePartner?: (partner: CashPartner) => void;
  onDeletePartner?: (partnerId: string) => void;
}

export const MultiCurrencyCashView: React.FC<MultiCurrencyCashViewProps> = ({
  guided = false,
  db,
  language,
  onSaveCashEntry,
  onDeleteCashEntry,
  onSavePartner,
  onDeletePartner,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingCashId, setEditingCashId] = useState<number | null>(null);
  const directory = usePartyDirectory();
  const [selectedCurrencyTab, setSelectedCurrencyTab] = useState<"ALL" | "USD" | "EUR" | "AED" | "CAD" | "TL">("ALL");
  const [cashSearch, setCashSearch] = useState("");
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [selectedBreakdown, setSelectedBreakdown] = useState<"USD" | "EUR" | "AED" | "CAD" | "TL" | null>(null);
  const accountValue = cashAccountAmount;
  const accountTotal = (person:string,currency:string) => cashAccountTotal(db.cashEntries,person,currency);

  const t = (key: any) => getTranslation(language, key);


  const [newEntry, setNewEntry] = useState<CashEntry>({
    CashID: Date.now(),
    CashDate: new Date().toISOString().slice(0, 10),
    Note: "",
    HesamEUR: 0,
    RezaEUR: 0,
    HesamUSD: 0,
    RezaUSD: 0,
    HesamTL: 0,
    RezaTL: 0,
    HesamAED: 0,
    RezaAED: 0,
    HesamCAD: 0,
    RezaCAD: 0,

    HesamDebtEUR: 0,
    RezaDebtEUR: 0,
    HesamDebtUSD: 0,
    RezaDebtUSD: 0,
    HesamDebtTL: 0,
    RezaDebtTL: 0,
    HesamDebtAED: 0,
    RezaDebtAED: 0,
    HesamDebtCAD: 0,
    RezaDebtCAD: 0,

    ThirdPartyDebtEUR: 0,
    ThirdPartyDebtUSD: 0,
    ThirdPartyDebtTL: 0,
    ThirdPartyDebtAED: 0,
    ThirdPartyDebtCAD: 0,

    OfficeEUR: 0,
    OfficeUSD: 0,
    ArovinAED: 0,
    BerakemEUR: 0,
    BerakemUSD: 0,
    VanpexCAD: 0,
    TaleUSD: 0,
    TaleEUR: 0,
    TaleCAD: 0,
    TaleTR: 0,
    TaleAED: 0,
  });

  // Aggregates
  const totalHesamUSD = accountTotal("حسام", "USD");
  const totalRezaUSD = accountTotal("رضا", "USD");
  const totalOfficeUSD = accountTotal("دفتر", "USD");
  const totalBerakemUSD = accountTotal("براکم", "USD");
  const totalTaleUSD = accountTotal("طالع", "USD");
  const totalUSD = cashCurrencyTotal(db.cashEntries,"USD");

  const totalHesamEUR = accountTotal("حسام", "EUR");
  const totalRezaEUR = accountTotal("رضا", "EUR");
  const totalOfficeEUR = accountTotal("دفتر", "EUR");
  const totalBerakemEUR = accountTotal("براکم", "EUR");
  const totalTaleEUR = accountTotal("طالع", "EUR");
  const totalEUR = cashCurrencyTotal(db.cashEntries,"EUR");

  const totalHesamAED = accountTotal("حسام", "AED");
  const totalRezaAED = accountTotal("رضا", "AED");
  const totalArovinAED = accountTotal("آروین", "AED");
  const totalTaleAED = accountTotal("طالع", "AED");
  const totalAED = cashCurrencyTotal(db.cashEntries,"AED");

  const totalHesamCAD = accountTotal("حسام", "CAD");
  const totalRezaCAD = accountTotal("رضا", "CAD");
  const totalVanpexCAD = db.cashEntries.reduce((s, c) => s + (c.VanpexCAD || 0), 0);
  const totalTaleCAD = accountTotal("طالع", "CAD");
  const totalCAD = cashCurrencyTotal(db.cashEntries,"CAD");

  const totalHesamTL = accountTotal("حسام", "TL");
  const totalRezaTL = accountTotal("رضا", "TL");
  const totalTaleTR = accountTotal("طالع", "TL");
  const totalTL = cashCurrencyTotal(db.cashEntries,"TL");

  const breakdownAccounts = Object.fromEntries(cashCurrencies.map(currency=>[currency,[...cashPeople.map(label=>({label,field:"",person:label})),...(currency==="CAD"?[{label:"ونپکس (Access)",field:"VanpexCAD",person:""}]:[])]])) as Record<string,{label:string;field:string;person:string}[]>;
  const breakdownAmount = (entry:CashEntry,account:{field:string;person:string}) => account.person ? accountValue(entry,account.person,selectedBreakdown!) : Number(entry.VanpexCAD||0);
  const renderCardBreakdown = (currency: "USD" | "EUR" | "AED" | "CAD" | "TL") => <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/20 pt-2 text-[10px] text-slate-300">{cashPeople.map(person => <div key={person} className="flex justify-between gap-1"><span>{person}</span><span className="font-mono">{formatNumber(accountTotal(person, currency))}</span></div>)}{currency === "CAD" && totalVanpexCAD !== 0 && <div className="col-span-2 flex justify-between gap-1 text-amber-200"><span>ونپکس (رکورد واردشده از Access)</span><span className="font-mono">{formatNumber(totalVanpexCAD)}</span></div>}</div>;

  const handleSave = () => {
    const invalid = document.querySelector<HTMLInputElement>("#multi-currency-cash-root input:invalid");
    if (invalid) { invalid.reportValidity(); return; }
    onSaveCashEntry(newEntry);
    setIsAddingNew(false);
    setEditingCashId(null);
    setNewEntry({
      CashID: Date.now(),
      CashDate: new Date().toISOString().slice(0, 10),
      Note: "",
      HesamEUR: 0,
      RezaEUR: 0,
      HesamUSD: 0,
      RezaUSD: 0,
      HesamTL: 0,
      RezaTL: 0,
      HesamAED: 0,
      RezaAED: 0,
      HesamCAD: 0,
      RezaCAD: 0,
      HesamDebtEUR: 0,
      RezaDebtEUR: 0,
      HesamDebtUSD: 0,
      RezaDebtUSD: 0,
      HesamDebtTL: 0,
      RezaDebtTL: 0,
      HesamDebtAED: 0,
      RezaDebtAED: 0,
      HesamDebtCAD: 0,
      RezaDebtCAD: 0,
      ThirdPartyDebtEUR: 0,
      ThirdPartyDebtUSD: 0,
      ThirdPartyDebtTL: 0,
      ThirdPartyDebtAED: 0,
      ThirdPartyDebtCAD: 0,
      OfficeEUR: 0,
      OfficeUSD: 0,
      ArovinAED: 0,
      BerakemEUR: 0,
      BerakemUSD: 0,
      VanpexCAD: 0,
      TaleUSD: 0,
      TaleEUR: 0,
      TaleCAD: 0,
      TaleTR: 0,
      TaleAED: 0,
    });
  };

  const handleEditEntry = (entry: CashEntry) => {
    setNewEntry({ ...entry });
    setEditingCashId(entry.CashID);
    setIsAddingNew(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const handleExportCSV = () => {
    const rows = db.cashEntries.map(c=>({"شناسه":c.CashID,"تاریخ":c.CashDate,"شرح و توضیحات":c.Note,...Object.fromEntries(cashCurrencies.flatMap(currency=>cashPeople.map(person=>[`${person} ${currency}`,accountValue(c,person,currency)]))),"ونپکس CAD":c.VanpexCAD||0}));
    exportToCSV("Arca_Cash_Treasury.csv", rows);
  };

  const partners = db.cashPartners || [];
  const visibleCashEntries = db.cashEntries
    .filter((entry) => {
      const query = cashSearch.trim().toLowerCase();
      const matchesSearch = !query || [entry.CashID, entry.CashDate, entry.Note]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesCurrency = selectedCurrencyTab === "ALL" || cashPeople.some((person) => accountValue(entry, person, selectedCurrencyTab) !== 0);
      return matchesSearch && matchesCurrency;
    })
    .sort((a, b) => dateSort === "desc"
      ? b.CashDate.localeCompare(a.CashDate)
      : a.CashDate.localeCompare(b.CashDate));

  return (
    <div id="multi-currency-cash-root" className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Wallet className="text-emerald-600" size={16} />
              <span>{t("treasury_management")} (CashF / CashT)</span>
            </h2>
          </div>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">{t("treasury_desc")}</p></InlineHelp>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => directory.open()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition-all"
          >
            <Users size={14} />
            <span>{t("add_person")}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-all"
          >
            <Download size={14} />
            <span>{t("export_excel")}</span>
          </button>

          <button
            onClick={() => {
              setEditingCashId(null);
              setIsAddingNew(!isAddingNew);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all"
          >
            <Plus size={14} />
              <span>{isAddingNew ? t("cancel") : t("new_cash_entry")}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Partner / Persons Chips Bar */}
      <details className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs text-xs">
        <summary className="cursor-pointer font-bold text-slate-700">
          <span className="inline-flex items-center gap-2">
            <Users size={13} className="text-indigo-600" />
            <span>{t("cash_partners_list")}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-500">{partners.length}</span>
          </span>
        </summary>
        <div className="mt-3 max-h-64 overflow-y-auto flex items-center gap-2 flex-wrap">

          {partners.map((p) => (
            <div
              key={p.id}
              className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs"
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="font-medium text-slate-800">
                {language === "fa" ? p.name : p.nameEn || p.name}
              </span>
              <span className="text-[10px] text-slate-400">({p.role || "همکار"})</span>


            </div>
          ))}
        </div>

        <button
          onClick={() => directory.open()}
          className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          <UserPlus size={13} />
          <span>{t("add_person")}</span>
        </button>
      </details>

      {/* Currency Total Summary Banners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* USD Box */}
        <div className="bg-gradient-to-br from-emerald-900 to-slate-900 text-white rounded-xl p-3.5 border border-emerald-800 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-300 text-xs font-bold mb-1">
            <span>{t("total_usd")}</span>
            <DollarSign size={16} />
          </div>
          <div className="text-lg font-black font-mono tracking-tight text-emerald-400">
            {formatCurrency(totalUSD, "$")}
          </div>
          {renderCardBreakdown("USD")}
          <button onClick={() => setSelectedBreakdown(selectedBreakdown === "USD" ? null : "USD")} className="mt-2 text-[10px] font-bold text-emerald-300 underline">{selectedBreakdown === "USD" ? "بستن ریز محاسبات" : "نمایش ریز محاسبات"}</button>
        </div>

        {/* EUR Box */}
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 text-white rounded-xl p-3.5 border border-blue-800 shadow-2xs">
          <div className="flex items-center justify-between text-blue-300 text-xs font-bold mb-1">
            <span>{t("total_eur")}</span>
            <Euro size={16} />
          </div>
          <div className="text-lg font-black font-mono tracking-tight text-blue-400">
            {formatCurrency(totalEUR, "€")}
          </div>
          {renderCardBreakdown("EUR")}
          <button onClick={() => setSelectedBreakdown(selectedBreakdown === "EUR" ? null : "EUR")} className="mt-2 text-[10px] font-bold text-blue-300 underline">{selectedBreakdown === "EUR" ? "بستن ریز محاسبات" : "نمایش ریز محاسبات"}</button>
        </div>

        {/* AED Box */}
        <div className="bg-gradient-to-br from-purple-900 to-slate-900 text-white rounded-xl p-3.5 border border-purple-800 shadow-2xs">
          <div className="flex items-center justify-between text-purple-300 text-xs font-bold mb-1">
            <span>{t("total_aed")}</span>
            <Coins size={16} />
          </div>
          <div className="text-lg font-black font-mono tracking-tight text-purple-400">
            {formatCurrency(totalAED, "AED")}
          </div>
          {renderCardBreakdown("AED")}
          <button onClick={() => setSelectedBreakdown(selectedBreakdown === "AED" ? null : "AED")} className="mt-2 text-[10px] font-bold text-purple-300 underline">{selectedBreakdown === "AED" ? "بستن ریز محاسبات" : "نمایش ریز محاسبات"}</button>
        </div>

        {/* CAD Box */}
        <div className="bg-gradient-to-br from-rose-900 to-slate-900 text-white rounded-xl p-3.5 border border-rose-800 shadow-2xs">
          <div className="flex items-center justify-between text-rose-300 text-xs font-bold mb-1">
            <span>{t("total_cad")}</span>
            <DollarSign size={16} />
          </div>
          <div className="text-lg font-black font-mono tracking-tight text-rose-400">
            {formatCurrency(totalCAD, "CAD")}
          </div>
          {renderCardBreakdown("CAD")}
          <button onClick={() => setSelectedBreakdown(selectedBreakdown === "CAD" ? null : "CAD")} className="mt-2 text-[10px] font-bold text-rose-300 underline">{selectedBreakdown === "CAD" ? "بستن ریز محاسبات" : "نمایش ریز محاسبات"}</button>
        </div>

        {/* TL Box */}
        <div className="bg-gradient-to-br from-amber-900 to-slate-900 text-white rounded-xl p-3.5 border border-amber-800 shadow-2xs">
          <div className="flex items-center justify-between text-amber-300 text-xs font-bold mb-1">
            <span>{t("total_tl")}</span>
            <Coins size={16} />
          </div>
          <div className="text-lg font-black font-mono tracking-tight text-amber-400">
            {formatCurrency(totalTL, "TRY")}
          </div>
          {renderCardBreakdown("TL")}
          <button onClick={() => setSelectedBreakdown(selectedBreakdown === "TL" ? null : "TL")} className="mt-2 text-[10px] font-bold text-amber-300 underline">{selectedBreakdown === "TL" ? "بستن ریز محاسبات" : "نمایش ریز محاسبات"}</button>
        </div>
      </div>

      {selectedBreakdown && <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-xs"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">ریز محاسبات صندوق {selectedBreakdown}</h3><InlineHelp><p className="mt-1 text-[11px] text-slate-500">هر موجودی برابر مجموع ردیف‌های دفتر روزنامه زیر است. ردیف‌های صفر نمایش داده نمی‌شوند.</p></InlineHelp></div><button onClick={()=>setSelectedBreakdown(null)} className="text-xs text-slate-500">بستن ×</button></div><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{breakdownAccounts[selectedBreakdown].map(account=>{const lines=db.cashEntries.filter(entry=>breakdownAmount(entry,account)!==0).sort((a,b)=>a.CashDate.localeCompare(b.CashDate));const sum=lines.reduce((total,entry)=>total+breakdownAmount(entry,account),0);return <div key={account.person || account.field} className="overflow-hidden rounded-lg border border-slate-200"><div className="flex justify-between bg-slate-50 p-2 text-xs font-bold"><span>{account.label}</span><span className="font-mono">{formatNumber(sum)} {selectedBreakdown}</span></div><div className="max-h-40 overflow-auto">{lines.length===0?<div className="p-3 text-center text-[11px] text-slate-400">هیچ ردیف موثری ندارد</div>:lines.map(entry=><div key={entry.CashID} className="grid grid-cols-[90px_1fr_auto] gap-2 border-t border-slate-100 p-2 text-[11px]"><span className="font-mono text-slate-500">{entry.CashDate}</span><span className="truncate text-slate-600">{entry.Note || "بدون شرح"}</span><span className="font-mono font-bold text-slate-800">{formatNumber(breakdownAmount(entry,account))}</span></div>)}</div></div>})}</div></section>}

      {/* New Transaction Form Drawer / Section */}
      {isAddingNew && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Plus size={14} className="text-emerald-600" />
              <span>{editingCashId ? (language === "fa" ? "ویرایش سند خزانه‌داری" : "Edit cash entry") : t("new_cash_entry")}</span>
            </h3>
            <button onClick={() => { setIsAddingNew(false); setEditingCashId(null); }} className="text-slate-400 hover:text-slate-600 text-xs">
              ✕ {t("close")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">{t("cash_date")}</label>
              <input
                type="date"
                value={newEntry.CashDate}
                onChange={(e) => setNewEntry({ ...newEntry, CashDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block font-medium text-slate-700 mb-1">{t("cash_note")}</label>
              <input
                type="text"
                placeholder="مثال: واریز پورسانت ارزی، تسویه صرافی دبی..."
                value={newEntry.Note}
                onChange={(e) => setNewEntry({ ...newEntry, Note: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
              />
            </div>
          </div>

          {guided && <QuickCashFields key={newEntry.CashID} entry={newEntry} onChange={setNewEntry}/>}
          <GuidedSection guided={guided} title="ثبت چندحسابی و اصلاح اسناد قدیمی">
          {/* Currency Entries Inputs */}
          <div className="grid grid-cols-1 gap-4 pt-2">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <InlineHelp><div className="mb-3 text-xs font-bold text-indigo-900">ماتریس کامل صندوق‌ها — برای هر ارز، تمام حساب‌ها را وارد کنید. مبلغ منفی برای پرداخت/خروجی است.</div></InlineHelp>
              <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr><th className="p-1.5 text-right">ارز</th>{cashPeople.map(person=><th key={person} className="p-1.5 text-center">{person}</th>)}</tr></thead><tbody>{cashCurrencies.map(currency=><tr key={currency} className="border-t border-indigo-100"><td className="p-1.5 font-mono font-bold">{currency}</td>{cashPeople.map(person=>{const key=`${person}_${currency}`;return <td key={key} className="p-1"><CashAmountInput label={`${person} ${currency}`} value={newEntry.accounts?.[key]} onChange={amount=>setNewEntry({...newEntry,accounts:{...(newEntry.accounts||{}),[key]:amount}})}/></td>})}</tr>)}</tbody></table></div>
            </div>
            {/* Legacy Access input groups are retained below for compatibility with existing imported CashF records. */}
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">فیلدهای قدیمی Access (فقط برای اصلاح رکوردهای واردشده)</summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
            {/* USD Section */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <h4 className="font-bold text-emerald-800 text-xs flex items-center gap-1">
                <DollarSign size={13} />
                <span>حساب‌های دلاری (USD)</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-600">حسام USD</label>
                  <input
                    type="number"
                    value={newEntry.HesamUSD || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, HesamUSD: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">رضا USD</label>
                  <input
                    type="number"
                    value={newEntry.RezaUSD || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, RezaUSD: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">دفتر USD</label>
                  <input
                    type="number"
                    value={newEntry.OfficeUSD || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, OfficeUSD: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">براکم USD</label>
                  <input
                    type="number"
                    value={newEntry.BerakemUSD || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, BerakemUSD: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* EUR Section */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <h4 className="font-bold text-blue-800 text-xs flex items-center gap-1">
                <Euro size={13} />
                <span>حساب‌های یورویی (EUR)</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-600">حسام EUR</label>
                  <input
                    type="number"
                    value={newEntry.HesamEUR || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, HesamEUR: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">رضا EUR</label>
                  <input
                    type="number"
                    value={newEntry.RezaEUR || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, RezaEUR: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">دفتر EUR</label>
                  <input
                    type="number"
                    value={newEntry.OfficeEUR || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, OfficeEUR: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">طالع EUR</label>
                  <input
                    type="number"
                    value={newEntry.TaleEUR || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, TaleEUR: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* AED / CAD Section */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <h4 className="font-bold text-purple-800 text-xs flex items-center gap-1">
                <Coins size={13} />
                <span>درهم امارات و سایر ارزها</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-600">آروین AED</label>
                  <input
                    type="number"
                    value={newEntry.ArovinAED || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, ArovinAED: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">حسام AED</label>
                  <input
                    type="number"
                    value={newEntry.HesamAED || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, HesamAED: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">ونپکس CAD</label>
                  <input
                    type="number"
                    value={newEntry.VanpexCAD || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, VanpexCAD: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600">حسام TL</label>
                  <input
                    type="number"
                    value={newEntry.HesamTL || ""}
                    onChange={(e) => setNewEntry({ ...newEntry, HesamTL: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div></details>
          </div>

          </GuidedSection>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => { setIsAddingNew(false); setEditingCashId(null); }}
              className="px-3.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs"
            >
              {editingCashId ? (language === "fa" ? "ذخیره تغییرات" : "Save changes") : t("save")}
            </button>
          </div>
        </div>
      )}

      {/* Cash Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-bold text-xs text-slate-900">دفتر روزنامه اسناد خزانه‌داری (Cash Ledger)</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={cashSearch}
              onChange={(e) => setCashSearch(e.target.value)}
              placeholder={language === "fa" ? "جستجو در شرح، تاریخ یا شناسه..." : "Search note, date or ID..."}
              className="w-52 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => setDateSort((current) => current === "desc" ? "asc" : "desc")}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {language === "fa" ? `تاریخ: ${dateSort === "desc" ? "جدیدترین" : "قدیمی‌ترین"}` : `Date: ${dateSort === "desc" ? "Newest" : "Oldest"}`}
            </button>
            <div className="flex rounded-md border border-slate-200 bg-white p-0.5"><button onClick={()=>setSelectedCurrencyTab("ALL")} className={`rounded px-2 py-1 text-[10px] ${selectedCurrencyTab==="ALL"?"bg-indigo-600 text-white":"text-slate-600"}`}>همه</button>{(["USD", "CAD", "EUR", "AED", "TL"] as const).map(currency=><button key={currency} onClick={()=>setSelectedCurrencyTab(currency)} className={`rounded px-2 py-1 text-[10px] ${selectedCurrencyTab===currency?"bg-indigo-600 text-white":"text-slate-600"}`}>{currency}</button>)}</div>
            <span className="text-[11px] text-slate-400 font-mono">{visibleCashEntries.length} / {db.cashEntries.length}</span>
          </div>
        </div>

        <div className="max-h-[440px] overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 shadow-xs">
              <tr>
                <th className="p-2.5">شناسه</th>
                <th className="p-2.5">تاریخ سند</th>
                <th className="p-2.5">شرح و بابت</th>
                {cashPeople.map(person=><th key={person} className="p-2.5 text-center text-indigo-700">{person}{selectedCurrencyTab !== "ALL" ? ` ${selectedCurrencyTab}` : ""}</th>)}
                <th className="p-2.5 text-center">اقدامات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCashEntries.map((entry) => (
                <tr key={entry.CashID} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5 font-mono text-[11px] text-slate-400">{entry.CashID}</td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-700">
                    {language === "fa" ? toJalaliDate(entry.CashDate) : entry.CashDate}
                  </td>
                  <td className="p-2.5 font-medium text-slate-900 max-w-xs truncate" title={entry.Note || "-"}>{entry.Note || "-"}</td>
                  {cashPeople.map(person=>{if(selectedCurrencyTab !== "ALL"){const value=accountValue(entry,person,selectedCurrencyTab); return <td key={person} className="p-2.5 text-center font-mono font-bold text-indigo-600">{value ? `${formatNumber(value)} ${selectedCurrencyTab}` : "-"}</td>;}const amounts=cashCurrencies.map(currency=>({currency,value:accountValue(entry,person,currency)})).filter(item=>item.value!==0);return <td key={person} className="p-2.5 text-center font-mono font-bold text-indigo-600">{amounts.length ? amounts.map(item=><div key={item.currency} className="whitespace-nowrap">{formatNumber(item.value)} {item.currency}</div>) : "-"}</td>})}
                  <td className="p-2.5 text-center">
                    <button
                      onClick={() => handleEditEntry(entry)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title={language === "fa" ? "ویرایش سند" : "Edit entry"}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("confirm_delete"))) {
                          onDeleteCashEntry(entry.CashID);
                        }
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title={t("delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
};
