import { InlineHelp } from "./InlineHelp";
import React, { useState } from "react";
import {
  Database,
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  RefreshCw,
  Layers,
  Users,
  Building2,
  Package,
  Wallet,
  FileSpreadsheet,
} from "lucide-react";
import { AppDatabase, Order, Customer, Supplier, Product, CashEntry } from "../types";
import { parseAccessDataWithAI } from "../services/geminiService";

interface AccessImportModalProps {
  currentDb: AppDatabase;
  onImportSuccess: (importedData: Partial<AppDatabase>, mode: "MERGE" | "REPLACE") => void;
  onClose: () => void;
}

export const AccessImportModal: React.FC<AccessImportModalProps> = ({
  currentDb,
  onImportSuccess,
  onClose,
}) => {
  const [inputText, setInputText] = useState("");
  const [detectedType, setDetectedType] = useState<"auto" | "OrderT" | "CustomerT" | "SupplierT" | "ProductT" | "CashT">("auto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importMode, setImportMode] = useState<"MERGE" | "REPLACE">("MERGE");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Parsed Preview
  const [parsedPreview, setParsedPreview] = useState<Partial<AppDatabase> | null>(null);

  const sampleAccessOrderData = `OrderID\tProformaInvoiceID\tCustomerName\tSupplierName\tTotalQuantity\tSellPrice\tMargin\tTransactionCurrency\tOrderStatus
101\tARCA-PI-2024-901\tشرکت صنایع شیمیایی پارس\tARCA TAV CO.\t50000\t1240\t65\tUSD\tبارگیری شده
102\tARCA-PI-2024-902\tپتروشیمی خلیج فارس\tARCA TAV CO.\t25000\t1180\t50\tUSD\tدر مسیر دریایی
103\tARCA-PI-2024-903\tپلیمر گستر جنوب\tBERA PETROCHEM\t40000\t1320\t80\tUSD\tپیش‌فاکتور صادر شده`;

  const sampleAccessCustomerData = `CustomerID\tCustomerName\tCity\tCommercialID\tTel\tActivity
201\tشرکت توسعه شیمی اروند\tاهواز\t1010382910\t061-3334455\tتولید انواع رزین و رنگ
202\tپتروشیمی اصفهان نوین\tاصفهان\t1020491028\t031-3668899\tتولید پلی اتیلن و گرانول`;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        setInputText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      setStatusMessage("لطفاً داده‌های کپی شده از دیتابیس اکسس را در کادر وارد کنید.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("دستیار هوشمند در حال تحلیل و ساختاردهی به جداول اکسس است...");

    try {
      const result = await parseAccessDataWithAI(inputText, detectedType);
      setParsedPreview(result);
      setStatusMessage(null);
    } catch (err: any) {
      console.error("Parse Error:", err);
      setStatusMessage("خطا در پردازش هوشمند اطلاعات. لطفاً ساختار داده‌ها را بررسی کنید.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyImport = () => {
    if (!parsedPreview) return;
    onImportSuccess(parsedPreview, importMode);
    onClose();
  };

  const countParsedOrders = parsedPreview?.orders?.length || 0;
  const countParsedCustomers = parsedPreview?.customers?.length || 0;
  const countParsedSuppliers = parsedPreview?.suppliers?.length || 0;
  const countParsedProducts = parsedPreview?.products?.length || 0;
  const countParsedCash = parsedPreview?.cashEntries?.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Database size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm">انتقال و ایمپورت داده‌ها از دیتابیس اکسس (Access DB Migration)</h3>
              <InlineHelp><p className="text-[11px] text-indigo-200">تبدیل هوشمند رکوردهای جداول OrderT, CustomerT, SupplierT, ProductT و CashT</p></InlineHelp>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {!parsedPreview ? (
            <div className="space-y-4">
              {/* Guidance Banner */}
              <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 space-y-2">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <Sparkles size={16} className="text-blue-600" />
                  <span>راهنمای ورود اطلاعات از برنامه اکسس:</span>
                </div>
                <InlineHelp><p className="text-[11px] leading-relaxed text-blue-800">
                  شما می‌توانید ردیف‌های جدول را از درون برنامه اکسس (یا کوئری‌ها) کپی (Ctrl+C) کرده و مستقیماً در کادر زیر پیست (Ctrl+V) کنید، یا خروجی فایل CSV / TXT اکسس را آپلود نمایید. هوش مصنوعی سامانه به صورت خودکار ستون‌ها و مقادیر را تطبیق می‌دهد.
                </p></InlineHelp>

                {/* Sample Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-slate-600 self-center">نمونه داده تستی:</span>
                  <button
                    onClick={() => setInputText(sampleAccessOrderData)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 text-blue-700 text-[11px] font-medium border border-blue-200"
                  >
                    نمونه جدول سفارشات (OrderT)
                  </button>
                  <button
                    onClick={() => setInputText(sampleAccessCustomerData)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 text-blue-700 text-[11px] font-medium border border-blue-200"
                  >
                    نمونه جدول مشتریان (CustomerT)
                  </button>
                </div>
              </div>

              {/* Data Input Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 text-xs">متن داده‌های کپی شده از اکسس یا اسکریپت SQL:</label>
                  <label className="cursor-pointer inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold text-xs">
                    <Upload size={14} />
                    <span>آپلود فایل CSV / TXT اکسس</span>
                    <input type="file" accept=".csv,.txt,.tsv,.json,.sql" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                <textarea
                  rows={9}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="داده‌های کپی شده از جداول اکسس (مانند ستون‌های OrderID, ProformaInvoiceID, CustomerName, TotalQuantity, ...) را اینجا قرار دهید..."
                  className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-300 font-mono text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-indigo-500 leading-relaxed"
                />
              </div>

              {/* Parsing Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">نوع جدول اکسس (اختیاری جهت دقت بیشتر)</label>
                  <select
                    value={detectedType}
                    onChange={(e: any) => setDetectedType(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-xs"
                  >
                    <option value="auto">تشخیص خودکار توسط AI (Auto Detect)</option>
                    <option value="OrderT">جدول سفارشات و پیش‌فاکتورها (OrderT / OrderDetailF)</option>
                    <option value="CustomerT">جدول مشتریان و خریداران (CustomerT)</option>
                    <option value="SupplierT">جدول تأمین‌کنندگان خارجی (SupplierT)</option>
                    <option value="ProductT">جدول کالاها و کد تعرفه (ProductT)</option>
                    <option value="CashT">جدول خزانه‌داری و صندوق ارزی (CashT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">حالت اعمال بر روی دیتابیس فعلی</label>
                  <select
                    value={importMode}
                    onChange={(e: any) => setImportMode(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-xs"
                  >
                    <option value="MERGE">ادغام با داده‌های موجود (Merge & Update)</option>
                    <option value="REPLACE">جایگزینی کامل دیتابیس (Replace All)</option>
                  </select>
                </div>
              </div>

              {statusMessage && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}
            </div>
          ) : (
            /* Parsed Preview Screen */
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <div>
                    <div className="font-bold text-xs">پردازش و استخراج هوشمند با موفقیت انجام شد!</div>
                    <div className="text-[11px] text-emerald-700">
                      خلاصه رکوردهای آماده برای ذخیره در سامانه:
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setParsedPreview(null)}
                  className="text-xs text-emerald-700 hover:text-emerald-900 underline font-medium"
                >
                  ویرایش مجدد ورودی
                </button>
              </div>

              {/* Extraction Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <FileSpreadsheet className="mx-auto text-blue-600 mb-1" size={18} />
                  <div className="text-[10px] text-slate-500 font-bold">سفارشات / PI</div>
                  <div className="text-lg font-black font-mono text-slate-900">{countParsedOrders}</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <Users className="mx-auto text-indigo-600 mb-1" size={18} />
                  <div className="text-[10px] text-slate-500 font-bold">مشتریان</div>
                  <div className="text-lg font-black font-mono text-slate-900">{countParsedCustomers}</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <Building2 className="mx-auto text-amber-600 mb-1" size={18} />
                  <div className="text-[10px] text-slate-500 font-bold">تأمین‌کنندگان</div>
                  <div className="text-lg font-black font-mono text-slate-900">{countParsedSuppliers}</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <Package className="mx-auto text-emerald-600 mb-1" size={18} />
                  <div className="text-[10px] text-slate-500 font-bold">کالاها</div>
                  <div className="text-lg font-black font-mono text-slate-900">{countParsedProducts}</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <Wallet className="mx-auto text-purple-600 mb-1" size={18} />
                  <div className="text-[10px] text-slate-500 font-bold">صندوق و خزانه‌داری</div>
                  <div className="text-lg font-black font-mono text-slate-900">{countParsedCash}</div>
                </div>
              </div>

              {/* Sample Parsed List */}
              {countParsedOrders > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800 text-xs">پیش‌نمایش پیش‌فاکتورها و سفارشات استخراج شده:</div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="p-2">شماره PI</th>
                          <th className="p-2">مشتری</th>
                          <th className="p-2">تأمین‌کننده</th>
                          <th className="p-2">تناژ</th>
                          <th className="p-2">قیمت فروش</th>
                          <th className="p-2">مارجین</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedPreview.orders?.map((o, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold text-blue-700">{o.ProformaInvoiceID}</td>
                            <td className="p-2">{o.CustomerName}</td>
                            <td className="p-2">{o.SupplierName}</td>
                            <td className="p-2 font-mono">{o.TotalQuantity} KG</td>
                            <td className="p-2 font-mono">{o.SellPrice} {o.TransactionCurrency}</td>
                            <td className="p-2 font-mono text-emerald-700">+{o.Margin}$</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            بستن
          </button>

          {!parsedPreview ? (
            <button
              onClick={handleParse}
              disabled={isProcessing || !inputText.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold shadow-md disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>در حال پردازش هوشمند...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>تحلیل و استخراج داده‌های اکسس</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleApplyImport}
              className="flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all active:scale-98"
            >
              <CheckCircle2 size={16} />
              <span>تأیید و ذخیره در بانک اطلاعاتی ({importMode === "MERGE" ? "ادغام" : "جایگزینی"})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
