import { InlineHelp } from "./InlineHelp";
import { ProgressiveFields } from "./ProgressiveFields";
import React, { useState, useRef, useMemo, useDeferredValue } from "react";
import { usePartyDirectory } from "./PartyDirectory";
import {
  Users,
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  FileSpreadsheet,
  Download,
  Building,
  Save,
  X,
  CreditCard,
  Image as ImageIcon,
  Upload,
  Check,
  Sparkles,
} from "lucide-react";
import { Customer, Supplier, AppDatabase, Order } from "../types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { exportToCSV } from "../services/storageService";
import { getOrderCommercialTotal, getOrderQuantityMT, getOrderCurrency } from "../utils/orderAccounting";
import { getCustomerList } from "../utils/partnerLists";

interface CustomersSuppliersViewProps {
  guided?: boolean;
  db: AppDatabase;
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: number) => void;
  onSaveSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (supplierId: number) => void;
  onQuickNewProformaForCustomer: (customerId: number) => void;
}

export const CustomersSuppliersView: React.FC<CustomersSuppliersViewProps> = ({
  guided = false,
  db,
  onSaveCustomer,
  onDeleteCustomer,
  onSaveSupplier,
  onDeleteSupplier,
  onQuickNewProformaForCustomer,
}) => {
  const directory = usePartyDirectory();
  const [activeSubTab, setActiveSubTab] = useState<"CUSTOMERS" | "SUPPLIERS">("CUSTOMERS");
  const [searchQuery, setSearchQuery] = useState("");

  // Customer Editor State
  const [editorError,setEditorError]=useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // Supplier Editor State
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isNewSupplier, setIsNewSupplier] = useState(false);

  const search = useDeferredValue(searchQuery).toLowerCase();
  const customerList = useMemo(()=>getCustomerList(db.customers, db.suppliers),[db.customers,db.suppliers]);
  const orderStatistics = useMemo(()=>{
    const customers=new Map<number,{count:number;quantity:number;total:number;currencies:Record<string,number>}>();
    const suppliers=new Map<number,number>();
    for(const order of db.orders){
      const row=customers.get(order.CustomerID)||{count:0,quantity:0,total:0,currencies:{}};
      const amount=getOrderCommercialTotal(order),currency=getOrderCurrency(order);
      row.count++;row.quantity+=getOrderQuantityMT(order);row.total+=amount;row.currencies[currency]=(row.currencies[currency]||0)+amount;
      customers.set(order.CustomerID,row);suppliers.set(order.SupplierID,(suppliers.get(order.SupplierID)||0)+1);
    }
    return {customers,suppliers};
  },[db.orders]);
  const filteredCustomers = customerList.filter((c) =>
    (c.CustomerName || "").toLowerCase().includes(search) ||
    (c.CommercialID || "").toLowerCase().includes(search) ||
    (c.City || "").toLowerCase().includes(search)
  );

  const filteredSuppliers = db.suppliers.filter((s) =>
    (s.SupplierName || "").toLowerCase().includes(search) ||
    (s.Country || "").toLowerCase().includes(search) ||
    (s.TaxT || "").toLowerCase().includes(search)
  );

  const handleCreateCustomer = () => {
    setEditorError("");
    if(guided){setEditingCustomer({CustomerID:Math.max(100,...db.customers.map(c=>c.CustomerID))+1,CustomerName:""});setIsNewCustomer(true);return;}
    directory.open(p => {
      const existing = db.customers.find(c => c.CustomerName === p.name);
      if (!existing) onSaveCustomer({ CustomerID: Math.max(100, ...db.customers.map(c => c.CustomerID)) + 1, CustomerName: p.name });
    });
  };

  const handleCreateSupplier = () => {
    setEditorError("");
    if(guided){setEditingSupplier({SupplierID:Math.max(0,...db.suppliers.map(c=>c.SupplierID))+1,SupplierName:"",Address:"",Tel:"",Email:"",Bank:"",Signatory:""});setIsNewSupplier(true);return;}
    directory.open(p => {
      const existing = db.suppliers.find(c => c.SupplierName === p.name);
      if (!existing) onSaveSupplier({ SupplierID: Math.max(0, ...db.suppliers.map(c => c.SupplierID)) + 1, SupplierName: p.name, Address: '', Tel: '', Email: '', Bank: '', Signatory: '' });
    });
  };

  const handleSaveCustomerModal = () => {
    if (!editingCustomer || !editingCustomer.CustomerName.trim()) {
      if(guided)setEditorError("نام مشتری را وارد کنید.");else alert("لطفاً نام مشتری را وارد کنید.");
      return;
    }
    if(guided&&db.customers.some(c=>c.CustomerID!==editingCustomer.CustomerID&&c.CustomerName.trim().toLowerCase()===editingCustomer.CustomerName.trim().toLowerCase())){setEditorError("این مشتری وجود دارد؛ نام موجود را از فهرست انتخاب و ویرایش کنید.");return;}
    setEditorError("");
    onSaveCustomer(editingCustomer);
    setEditingCustomer(null);
    setIsNewCustomer(false);
  };

  const handleSaveSupplierModal = () => {
    if (!editingSupplier || !editingSupplier.SupplierName.trim()) {
      if(guided)setEditorError("نام تأمین‌کننده را وارد کنید.");else alert("لطفاً نام شرکت تأمین‌کننده را وارد کنید.");
      return;
    }
    if(guided&&db.suppliers.some(c=>c.SupplierID!==editingSupplier.SupplierID&&c.SupplierName.trim().toLowerCase()===editingSupplier.SupplierName.trim().toLowerCase())){setEditorError("این تأمین‌کننده وجود دارد؛ نام موجود را از فهرست انتخاب و ویرایش کنید.");return;}
    setEditorError("");
    onSaveSupplier(editingSupplier);
    setEditingSupplier(null);
    setIsNewSupplier(false);
  };

  const handleExportCSV = () => {
    if (activeSubTab === "CUSTOMERS") {
      const rows = filteredCustomers.map((c) => ({
        "شناسه": c.CustomerID,
        "نام مشتری": c.CustomerName,
        "شناسه ملی / ثبت": c.CommercialID,
        "شهر": c.City,
        "تلفن": c.Tel,
        "ایمیل": c.Email,
        "زمینه فعالیت": c.Activity,
      }));
      exportToCSV("Arca_Customers.csv", rows);
    } else {
      const rows = filteredSuppliers.map((s) => ({
        "شناسه": s.SupplierID,
        "نام کمپانی": s.SupplierName,
        "کشور": s.Country,
        "تلفن": s.Tel,
        "ایمیل": s.Email,
        "کد مالیاتی TRN": s.TaxT,
        "شناسه صدور PI": s.ProformaPrefix,
        "امضادار مجاز": s.Signatory,
      }));
      exportToCSV("Arca_Suppliers.csv", rows);
    }
  };

  return (
    <div id="customers-suppliers-root" className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" size={22} />
            <span>{guided?"مشتریان و تأمین‌کنندگان":"مدیریت مشتریان و تأمین‌کنندگان خارجی (CustomerT & SupplierT)"}</span>
          </h1>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            دفترچه جامع اطلاعات خریداران، کد اقتصادی، شماره شبا، تأمین‌کنندگان بین‌المللی و حساب‌های بانکی
          </p></InlineHelp>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
          >
            <Download size={15} />
            <span>خروجی اکسل</span>
          </button>

          {activeSubTab === "CUSTOMERS" ? (
            <button
              onClick={handleCreateCustomer}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all active:scale-98"
            >
              <Plus size={16} />
              <span>تعریف مشتری جدید</span>
            </button>
          ) : (
            <button
              onClick={handleCreateSupplier}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 transition-all active:scale-98"
            >
              <Plus size={16} />
              <span>تعریف تأمین‌کننده خارجی</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium max-w-fit">
          <button
            onClick={() => setActiveSubTab("CUSTOMERS")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeSubTab === "CUSTOMERS"
                ? "bg-white text-blue-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users size={15} />
            <span>خریداران و مشتریان ({customerList.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab("SUPPLIERS")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeSubTab === "SUPPLIERS"
                ? "bg-white text-amber-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 size={15} />
            <span>تأمین‌کنندگان و وندورها ({db.suppliers.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={activeSubTab === "CUSTOMERS" ? "جستجوی مشتری، شناسه، شهر..." : "جستجوی تأمین‌کننده، کشور..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Customers List View */}
      {activeSubTab === "CUSTOMERS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((cust) => {
            const stats=orderStatistics.customers.get(cust.CustomerID)||{count:0,quantity:0,total:0,currencies:{}};
            const totalPurchasedMT=stats.quantity,totalSpent=stats.total;

            return (
              <div
                key={cust.CustomerID}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm leading-snug">{cust.CustomerName}</div>
                      <div className="text-[11px] text-blue-600 font-medium">{cust.Activity || "خریدار بازرگانی"}</div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      #{cust.CustomerID}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 pt-1">
                    {cust.CommercialID && (
                      <div className="text-[11px] font-mono text-slate-500">
                        شناسه ملی/اقتصادی: <span className="text-slate-800 font-semibold">{cust.CommercialID}</span>
                      </div>
                    )}
                    {cust.Tel && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Phone size={13} className="text-slate-400" />
                        <span className="font-mono">{cust.Tel}</span>
                      </div>
                    )}
                    {cust.Address && (
                      <div className="flex items-start gap-1.5 text-[11px]">
                        <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{cust.Address}</span>
                      </div>
                    )}
                  </div>

                  {/* Customer Purchase Stats */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">تعداد سفارشات:</span>
                      <span className="font-bold text-slate-800 font-mono">{stats.count} مورد</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">حجم خرید کل:</span>
                      <span className="font-bold text-blue-700 font-mono">{formatNumber(totalPurchasedMT)} MT</span>
                    </div>
                    <div className="text-left">
                      <span className="text-slate-400 block text-[10px]">ارزش معاملات:</span>
                      <span className="font-bold text-emerald-700 font-mono">{guided?Object.entries(stats.currencies).map(([currency,amount])=><span key={currency} className="block" dir="ltr">{formatCurrency(amount,currency)}</span>):formatCurrency(totalSpent, "$")}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onQuickNewProformaForCustomer(cust.CustomerID)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-xs font-bold transition-all"
                  >
                    <FileSpreadsheet size={13} />
                    <span>صدور پروفرما</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {setEditorError("");setIsNewCustomer(false);setEditingCustomer(JSON.parse(JSON.stringify(cust)));}}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                      title="ویرایش مشخصات"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`آیا از حذف مشتری "${cust.CustomerName}" اطمینان دارید؟`)) {
                          onDeleteCustomer(cust.CustomerID);
                        }
                      }}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      title="حذف مشتری"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Suppliers List View */}
      {activeSubTab === "SUPPLIERS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supp) => {
            const supplierOrderCount=orderStatistics.suppliers.get(supp.SupplierID)||0;

            return (
              <div
                key={supp.SupplierID}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {supp.LogoT ? (
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          <img
                            src={supp.LogoT}
                            alt={supp.SupplierName}
                            className="max-h-full max-w-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-bold flex items-center justify-center text-sm shrink-0 shadow-2xs">
                          {supp.SupplierName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900 text-sm leading-snug">{supp.SupplierName}</div>
                        <div className="text-[11px] text-amber-600 font-medium">{supp.Country || "تأمین‌کننده خارجی"}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                      #{supp.SupplierID}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 pt-1">
                    {supp.TaxT && (
                      <div className="text-[11px] font-mono text-slate-500">
                        VAT / TRN: <span className="text-slate-800 font-semibold">{supp.TaxT}</span>
                      </div>
                    )}
                    {supp.ProformaPrefix && (
                      <div className="text-[11px] font-mono text-amber-700">
                        PI Prefix: <span className="font-bold">{supp.ProformaPrefix}</span>
                      </div>
                    )}
                    {supp.Tel && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Phone size={13} className="text-slate-400" />
                        <span className="font-mono">{supp.Tel}</span>
                      </div>
                    )}
                    {supp.Email && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail size={13} className="text-slate-400" />
                        <span className="font-mono">{supp.Email}</span>
                      </div>
                    )}
                    {supp.Bank && (
                      <div className="flex items-start gap-1.5 text-[11px] text-slate-500 font-mono">
                        <CreditCard size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{supp.Bank}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    {supplierOrderCount} سفارش مرتبط
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {setEditorError("");setIsNewSupplier(false);setEditingSupplier(JSON.parse(JSON.stringify(supp)));}}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                      title="ویرایش شرکت"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`آیا از حذف تأمین‌کننده "${supp.SupplierName}" اطمینان دارید؟`)) {
                          onDeleteSupplier(supp.SupplierID);
                        }
                      }}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      title="حذف تأمین‌کننده"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Editor Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="ویرایش مشتری" className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="shrink-0 p-5 flex items-center justify-between border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="text-blue-600" size={18} />
                <span>{isNewCustomer ? (guided?"تعریف مشتری جدید":"تعریف مشتری جدید (CustomerT)") : `ویرایش مشتری: ${editingCustomer.CustomerName}`}</span>
              </h3>
              <button
                onClick={() => setEditingCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5"><ProgressiveFields guided={guided} core={[0,3,4,7]} extraTitle="شناسه ثبتی، زمینه فعالیت و نشانی تکمیلی">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">نام کامل شرکت / مشتری (CustomerName)</label>
                <input
                  type="text"
                  value={editingCustomer.CustomerName}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, CustomerName: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  placeholder="مثال: شرکت صنایع پتروشیمی رازی"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">شناسه ملی / کد اقتصادی (CommercialID)</label>
                <input
                  type="text"
                  value={editingCustomer.CommercialID || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, CommercialID: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">زمینه فعالیت (Activity)</label>
                <input
                  type="text"
                  value={editingCustomer.Activity || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, Activity: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">تلفن تماس (Tel)</label>
                <input
                  type="text"
                  value={editingCustomer.Tel || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, Tel: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">ایمیل (Email)</label>
                <input
                  type="email"
                  value={editingCustomer.Email || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, Email: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">شهر (City)</label>
                <input
                  type="text"
                  value={editingCustomer.City || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, City: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">کد پستی (ZipCode)</label>
                <input
                  type="text"
                  value={editingCustomer.ZipCode || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, ZipCode: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">آدرس رسمی و کارخانه (Address)</label>
                <textarea
                  rows={2}
                  value={editingCustomer.Address || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, Address: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
            </ProgressiveFields></div>

            {guided&&editorError&&<p role="alert" className="px-5 text-xs text-rose-700">{editorError}</p>}
            <div className="shrink-0 flex justify-end gap-2 p-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveCustomerModal}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30"
              >
                <Save size={15} />
                <span>ذخیره مشتری</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Editor Modal */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div role="dialog" aria-modal="true" aria-label="ویرایش تأمین‌کننده" className="bg-white rounded-2xl w-full max-w-2xl h-[calc(100dvh-16px)] sm:h-[calc(100dvh-32px)] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="shrink-0 p-4 sm:p-5 flex items-center justify-between border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="text-amber-600" size={18} />
                <span>{isNewSupplier ? (guided?"تعریف تأمین‌کننده جدید":"تعریف تأمین‌کننده جدید (SupplierT)") : `ویرایش تأمین‌کننده: ${editingSupplier.SupplierName}`}</span>
              </h3>
              <button
                onClick={() => setEditingSupplier(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5"><ProgressiveFields guided={guided} core={[0,1,2,3,9,12]} extraTitle="حساب بانکی، امضا، مهر و تنظیمات سربرگ">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">نام شرکت تأمین‌کننده (SupplierName)</label>
                <input
                  type="text"
                  value={editingSupplier.SupplierName}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, SupplierName: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  placeholder="e.g. ARCA TAV PETROCHEMICAL CO."
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">کشور مبدأ (Country)</label>
                <input
                  type="text"
                  value={editingSupplier.Country || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, Country: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">شماره ثبت مالیاتی (TaxT / VAT / TRN)</label>
                <input
                  type="text"
                  value={editingSupplier.TaxT || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, TaxT: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">شناسه صدور پیش‌فاکتور (PI Prefix)</label>
                <input
                  type="text"
                  value={editingSupplier.ProformaPrefix || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, ProformaPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  className="w-full p-2 rounded-xl bg-amber-50 border border-amber-200 font-mono font-bold uppercase"
                  placeholder="مثال: BR"
                  maxLength={6}
                />
                <p className="mt-1 text-[10px] text-slate-500">در صدور PI، مانند BR-260826-01 استفاده می‌شود.</p>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">امضادار مجاز (Signatory)</label>
                <input
                  type="text"
                  value={editingSupplier.Signatory || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, Signatory: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2 flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 sm:flex-row sm:items-center">
                <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">{editingSupplier.SignT?.startsWith("data:image") ? <img src={editingSupplier.SignT} alt="Signature preview" className="max-h-full max-w-full object-contain"/> : <span className="text-[10px] text-slate-400">پیش‌نمایش امضا</span>}</div>
                <div className="flex-1"><div className="mb-1 text-xs font-bold text-slate-800">تصویر امضای مجاز برای {editingSupplier.Signatory || "امضادار"}</div><InlineHelp><p className="mb-2 text-[10px] text-slate-500">این تصویر در اسناد چاپی کنار نام امضادار قرار می‌گیرد.</p></InlineHelp><div className="mb-2 flex items-center gap-2 text-[10px] text-slate-600"><label>اندازه امضا در چاپ (px)<input type="number" min="40" max="450" value={editingSupplier.PrintSignatureSize ?? 160} onChange={e=>setEditingSupplier({...editingSupplier,PrintSignatureSize:Number(e.target.value)})} className="mr-1 w-16 rounded border border-indigo-200 bg-white px-1 py-1 text-center font-mono"/></label></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"><Upload size={13}/>آپلود تصویر امضا<input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=event=>setEditingSupplier({...editingSupplier,SignT:String(event.target?.result)});reader.readAsDataURL(file);}}/></label>{editingSupplier.SignT && <button type="button" onClick={()=>setEditingSupplier({...editingSupplier,SignT:undefined})} className="mr-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600">حذف</button>}</div>
              </div>

              <div className="sm:col-span-2 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:flex-row sm:items-center">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white p-2">{editingSupplier.StampT?.startsWith("data:image") ? <img src={editingSupplier.StampT} alt="Stamp preview" className="max-h-full max-w-full object-contain"/> : <span className="text-[10px] text-slate-400">پیش‌نمایش مهر</span>}</div>
                <div className="flex-1"><div className="mb-1 text-xs font-bold text-slate-800">تصویر مهر شرکت</div><InlineHelp><p className="mb-2 text-[10px] text-slate-500">مهر در فوتر اسناد چاپی در کنار امضا نمایش داده می‌شود.</p></InlineHelp><div className="mb-2 flex items-center gap-2 text-[10px] text-slate-600"><label>اندازه مهر در چاپ (px)<input type="number" min="40" max="450" value={editingSupplier.PrintStampSize ?? 140} onChange={e=>setEditingSupplier({...editingSupplier,PrintStampSize:Number(e.target.value)})} className="mr-1 w-16 rounded border border-amber-200 bg-white px-1 py-1 text-center font-mono"/></label></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"><Upload size={13}/>آپلود مهر<input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=event=>setEditingSupplier({...editingSupplier,StampT:String(event.target?.result)});reader.readAsDataURL(file);}}/></label>{editingSupplier.StampT && <button type="button" onClick={()=>setEditingSupplier({...editingSupplier,StampT:undefined})} className="mr-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600">حذف</button>}</div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">فونت نام شرکت در اسناد چاپی</label>
                <select value={editingSupplier.PrintCompanyFontFamily || "Arial"} onChange={e=>setEditingSupplier({...editingSupplier,PrintCompanyFontFamily:e.target.value})} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Calibri">Calibri</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option></select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">اندازه نام شرکت در اسناد چاپی (pt)</label>
                <input type="number" min="10" max="30" value={editingSupplier.PrintCompanyFontSize ?? 18} onChange={e=>setEditingSupplier({...editingSupplier,PrintCompanyFontSize:Number(e.target.value)})} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"/>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">تلفن تماس (Tel)</label>
                <input
                  type="text"
                  value={editingSupplier.Tel || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, Tel: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              {/* Supplier Logo & Visual Identity */}
              <div className="sm:col-span-2 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <ImageIcon size={15} className="text-amber-600" />
                    <span>لوگو و هویت بصری شرکت تأمین‌کننده (Company Logo & Stamp)</span>
                  </span>
                  <span className="text-[11px] text-amber-700">چاپ روی پروفورما، اینویس و اسناد رسمی</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Logo Preview */}
                  <div className="w-24 h-20 rounded-xl bg-white border border-slate-200 p-1.5 flex items-center justify-center relative group shrink-0 shadow-2xs">
                    {editingSupplier.LogoT ? (
                      <>
                        <img
                          src={editingSupplier.LogoT}
                          alt="Logo Preview"
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingSupplier({ ...editingSupplier, LogoT: undefined })}
                          className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
                          title="حذف لوگو"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <div className="text-center text-slate-400 text-[10px]">
                        <ImageIcon size={20} className="mx-auto mb-0.5 text-slate-300" />
                        <span>بدون لوگو</span>
                      </div>
                    )}
                  </div>

                  {/* Upload and URL input */}
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs shrink-0">
                        <Upload size={13} />
                        <span>آپلود تصویر لوگو</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (uploadEvent) => {
                                setEditingSupplier({
                                  ...editingSupplier,
                                  LogoT: uploadEvent.target?.result as string,
                                });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>

                      <input
                        type="text"
                        value={editingSupplier.LogoT || ""}
                        onChange={(e) => setEditingSupplier({ ...editingSupplier, LogoT: e.target.value })}
                        placeholder="یا آدرس اینترنتی لوگو (URL)..."
                        className="flex-1 p-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono"
                      />
                    </div>

                    {/* Logo Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span>لوگوهای آماده:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSupplier({
                            ...editingSupplier,
                            LogoT: "/demo-logo.svg",
                          })
                        }
                        className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-slate-200 text-slate-700 font-medium transition-colors"
                      >
                        لوگوی برا (Bera)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSupplier({
                            ...editingSupplier,
                            LogoT: "/demo-logo.svg",
                          })
                        }
                        className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-slate-200 text-slate-700 font-medium transition-colors"
                      >
                        لوگوی پتروشیمی (Petro)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSupplier({
                            ...editingSupplier,
                            LogoT: "/demo-logo.svg",
                          })
                        }
                        className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-slate-200 text-slate-700 font-medium transition-colors"
                      >
                        لوگوی آروین (Arovin)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">اطلاعات حساب بانکی و شبا (Bank Coordinates)</label>
                <textarea
                  rows={2}
                  value={editingSupplier.Bank || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, Bank: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px]"
                  placeholder="Bank Name, IBAN, Swift Code, Beneficiary..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">آدرس رسمی (Address)</label>
                <textarea
                  rows={2}
                  value={editingSupplier.Address || ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, Address: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
            </ProgressiveFields></div>

            {guided&&editorError&&<p role="alert" className="px-5 text-xs text-rose-700">{editorError}</p>}
            <div className="shrink-0 flex justify-end gap-2 p-3 sm:p-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => setEditingSupplier(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveSupplierModal}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30"
              >
                <Save size={15} />
                <span>ذخیره تأمین‌کننده</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
