import { InlineHelp } from "./InlineHelp";
import React, { useState } from "react";
import {
  ShieldCheck,
  Download,
  Upload,
  RotateCcw,
  Clock,
  HardDrive,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { AppDatabase } from "../types";
import {
  saveDatabase,
  createManualBackup,
  getBackupSnapshots,
  restoreFromSnapshot,
  exportDatabaseJSON,
  importDatabaseJSON,
  exportAccessImportBundle,
} from "../services/storageService";
import { toJalaliDate } from "../utils/formatters";

interface BackupRestoreViewProps {
  db: AppDatabase;
  onDatabaseRestored: (newDb: AppDatabase) => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({
  db,
  onDatabaseRestored,
}) => {
  const [snapshots, setSnapshots] = useState(getBackupSnapshots());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreateSnapshot = () => {
    const label = `Manual - ${new Date().toLocaleTimeString("en-US")}`;
    createManualBackup(db, label);
    setSnapshots(getBackupSnapshots());
    setSuccessMessage("نسخه پشتیبان دستی با موفقیت در حافظه امن ذخیره شد.");
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleRestoreSnapshot = (id: string) => {
    if (window.confirm("آیا از بازگردانی این نسخه پشتیبان اطمینان دارید؟ تمام تغییرات پس از این تاریخ بازنویسی خواهد شد.")) {
      const restored = restoreFromSnapshot(id);
      if (restored) {
        onDatabaseRestored(restored);
        setSuccessMessage("بانک اطلاعاتی با موفقیت به تاریخ انتخابی بازگردانی شد.");
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    }
  };

  const handleDownloadJSON = () => {
    exportDatabaseJSON(db);
    setSuccessMessage("فایل پشتیبان کامل JSON با موفقیت دانلود شد.");
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleDownloadSource = async () => {
    const username = window.prompt("نام کاربری Super Admin را وارد کنید:");
    const password = username ? window.prompt("رمز عبور Super Admin را وارد کنید:") : null;
    if (!username || !password) return;
    const response = await fetch("/api/backup/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!response.ok) return alert("تأیید مدیر ارشد ناموفق بود.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = `arca-source-${new Date().toISOString().slice(0, 10)}.tar.gz`; link.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.orders && parsed.customers) {
          saveDatabase(parsed);
          onDatabaseRestored(parsed);
          setSuccessMessage("بانک اطلاعاتی از فایل JSON با موفقیت بازیابی شد.");
          setTimeout(() => setSuccessMessage(null), 4000);
        } else {
          alert("فرمت فایل بکاپ نامعتبر است.");
        }
      } catch (err) {
        alert("خطا در خواندن فایل پشتیبان.");
      }
    };
    reader.readAsText(file);
  };

  const handleExportAllTablesCSV = () => {
    exportAccessImportBundle(db);
    setSuccessMessage("فایل‌های سازگار با جدول‌های Access و راهنمای ورود دانلود شدند.");
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div id="backup-restore-root" className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={22} />
            <span>پشتیبان‌گیری خودکار و دستی دیتابیس (Auto Backup & Disaster Recovery)</span>
          </h1>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            حفاظت کامل از اطلاعات بازرگانی، حسابداری، سوابق معاملات و امکان بازیابی نقطه‌ای (Point-in-Time)
          </p></InlineHelp>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-xs"
          >
            <Download size={15} />
            <span>دانلود دیتابیس (JSON)</span>
          </button>

          <button
            onClick={handleDownloadSource}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs"
          >
            <Download size={15} />
            <span>دانلود سورس برنامه</span>
          </button>

          <button
            onClick={handleCreateSnapshot}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all active:scale-98"
          >
            <ShieldCheck size={16} />
            <span>ثبت نسخه پشتیبان فوری</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Backup Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>سیستم بکاپ خودکار (Auto-Backup)</span>
            <RefreshCw size={16} className="text-emerald-600 animate-spin-slow" />
          </div>
          <div className="text-xl font-bold text-emerald-700">فعال و در حال اجرا</div>
          <InlineHelp><div className="text-xs text-slate-500">
            ذخیره‌سازی پس از هر تغییر + نگه‌داری ۳۰ نقطهٔ بازیابی داخل Docker volume
          </div></InlineHelp>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>آخرین زمان ذخیره‌سازی</span>
            <Clock size={16} className="text-blue-600" />
          </div>
          <div className="text-sm font-black font-mono text-slate-800">
            {new Date(db.lastBackupDate || Date.now()).toLocaleTimeString("en-US")} - {toJalaliDate(new Date().toISOString().slice(0, 10))}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {db.orders.length} سفارش | {db.customers.length} مشتری | {db.cashEntries.length} رکورد صندوق
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span>حجم دیتابیس محلی</span>
            <HardDrive size={16} className="text-purple-600" />
          </div>
          <div className="text-xl font-black font-mono text-purple-700">
            {(JSON.stringify(db).length / 1024).toFixed(1)} KB
          </div>
          <InlineHelp><div className="text-xs text-slate-500">
            دادهٔ اصلی و نسخه‌های بازیابی داخل Docker volume دائمی ذخیره می‌شوند
          </div></InlineHelp>
        </div>
      </div>

      {/* Snapshot List & Restore Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-xs">تاریخچه اسنپ‌شات‌های پشتیبان (Local Backup Snapshots)</h3>
            <InlineHelp><p className="text-[11px] text-slate-500">امکان بازگردانی اطلاعات به هر یک از نقاط زمانی ثبت شده</p></InlineHelp>
          </div>

          <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all">
            <Upload size={14} />
            <span>بارگذاری و ریستور فایل JSON</span>
            <input type="file" accept=".json" onChange={handleUploadJSON} className="hidden" />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">عنوان نسخه پشتیبان</th>
                <th className="p-3">تاریخ و ساعت ثبت</th>
                <th className="p-3">آمار رکوردهای ذخیره شده</th>
                <th className="p-3">حجم فایل</th>
                <th className="p-3 text-center">عملیات بازگردانی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    هنوز نسخه پشتیبانی در این جلسه ثبت نشده است. دکمه «ثبت نسخه پشتیبان فوری» را بزنید.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-900 flex items-center gap-2">
                      <FileJson className="text-blue-500" size={16} />
                      <span>{snap.label}</span>
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {new Date(snap.timestamp).toLocaleString("en-US")}
                    </td>
                    <td className="p-3 text-slate-700 font-mono text-[11px]">
                      {snap.ordersCount} سفارش | {snap.customersCount} مشتری
                    </td>
                    <td className="p-3 font-mono text-slate-500">{snap.sizeKB} KB</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleRestoreSnapshot(snap.id)}
                        className="flex items-center gap-1 mx-auto px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition-all"
                      >
                        <RotateCcw size={13} />
                        <span>بازگردانی این نسخه</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Export All Section */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-xs text-indigo-950">
        <div className="font-bold">دو نسخهٔ مستقل برای نگهداری</div>
        <InlineHelp><p className="mt-1 text-indigo-800">«دانلود دیتابیس» شامل تمام اطلاعات و تنظیمات است و با همین صفحه بازگردانی می‌شود. «دانلود سورس برنامه» شامل فایل‌های لازم برای ساخت و اجرای مجدد Docker است.</p></InlineHelp>
      </div>

      {/* CSV Export All Section */}
      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex items-center justify-between">
        <div className="space-y-1">
          <div className="font-bold text-slate-800 text-xs flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-600" size={18} />
            <span>خروجی خام و جدول‌بندی شده برای اکسل / مایکروسافت اکسس</span>
          </div>
          <InlineHelp><p className="text-xs text-slate-500">
            خروجی جداگانهٔ جدول‌های اصلی Access به همراه راهنمای ورود؛ مناسب واردکردن در فایل .accdb قبلی شما
          </p></InlineHelp>
        </div>

        <button
          onClick={handleExportAllTablesCSV}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200 shadow-xs"
        >
          <Download size={15} />
          <span>خروجی قابل ورود به Access</span>
        </button>
      </div>
    </div>
  );
};
