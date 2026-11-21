import { InlineHelp } from "./InlineHelp";
import { ProgressiveFields } from "./ProgressiveFields";
import React, { useState, useMemo, useDeferredValue } from "react";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  Tag,
  Shield,
  FileSpreadsheet,
  Download,
  Save,
  X,
  Layers,
  Sparkles,
  Calculator,
} from "lucide-react";
import { Product, AppDatabase, Inquiry, PriceEntry, ProductTdsDocument } from "../types";
import { formatCurrency, formatNumber } from "../utils/formatters";
import { exportToCSV } from "../services/storageService";
import { TdsDocumentModal } from "./TdsDocumentModal";
import { AttachmentManager } from "./AttachmentManager";

interface ProductsCatalogViewProps {
  guided?: boolean;
  db: AppDatabase;
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: number) => void;
  onSaveInquiry: (inquiry: Inquiry) => void;
  onSavePrice: (entry: PriceEntry) => void;
  onOpenQuickAddProformaWithProduct: (product: Product) => void;
}

export const ProductsCatalogView: React.FC<ProductsCatalogViewProps> = ({
  guided = false,
  db,
  onSaveProduct,
  onDeleteProduct,
  onSaveInquiry,
  onSavePrice,
  onOpenQuickAddProformaWithProduct,
}) => {
  const [activeTab, setActiveTab] = useState<"CATALOG" | "INQUIRIES" | "SUPPLIER_PRICES" | "PRICE_ESTIMATOR">("CATALOG");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Product Editor Modal
  const [editorError,setEditorError]=useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [tdsProduct, setTdsProduct] = useState<Product | null>(null);
  const [editingTdsDocument, setEditingTdsDocument] = useState<ProductTdsDocument | undefined>();
  const [documentKind, setDocumentKind] = useState<"TDS" | "MSDS">("TDS");
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [inquiryDraft, setInquiryDraft] = useState<Inquiry>({ InquiryID: 0, InquiryDate: today, CustomerName: "", ProductName: "", QuantityMT: 0, TargetPrice: 0, Currency: "USD", Status: "جدید", Note: "" });
  const [priceDraft, setPriceDraft] = useState<PriceEntry>({ PriceID: 0, Product: "", Supplier: "", Manufacturer: "", PriceDate: today, PriceFOB: 0, PriceUnit: "USD / MT", Freight: 0, CFR_CPT_NET: 0, DeliveryTerm: "FOB", Shipment_in: "", Customer: "", Offer: 0, Note: "" });

  // Retained temporarily for compatibility with existing saved view state; the
  // calculator is now exposed only from the management dashboard.
  const [estProduct, setEstProduct] = useState<Product>(db.products[0] || {} as Product);
  const [estFobPrice, setEstFobPrice] = useState(1150);
  const [estContainerFreight, setEstContainerFreight] = useState(1800);
  const [estContainerCapacity, setEstContainerCapacity] = useState(24.75);
  const [estTargetMargin, setEstTargetMargin] = useState(60);
  const freightPerMT = estContainerCapacity > 0 ? estContainerFreight / estContainerCapacity : 0;
  const calculatedCFR = estFobPrice + freightPerMT;
  const calculatedSellPrice = calculatedCFR + estTargetMargin;


  const deferredSearch = useDeferredValue(searchQuery);
  const normalizedSearch = deferredSearch.trim().toLocaleLowerCase();
  const filteredProducts = useMemo(()=>db.products
    .map((product) => {
      if (!normalizedSearch) return { product, rank: 0 };
      const name = (product.ProductName || "").toLocaleLowerCase();
      const chemical = (product.ChemicalName || "").toLocaleLowerCase();
      const hsCode = (product.HSCODE || "").toLocaleLowerCase();
      const terms = normalizedSearch.split(/\s+/).filter(Boolean);
      const searchable = `${name} ${chemical} ${hsCode}`;
      if (!terms.every((term) => searchable.includes(term))) return null;
      const rank = name === normalizedSearch ? 0 : name.startsWith(normalizedSearch) ? 1 : name.split(/\s+/).includes(normalizedSearch) ? 2 : chemical === normalizedSearch ? 3 : chemical.startsWith(normalizedSearch) ? 4 : 5;
      return { product, rank };
    })
    .filter((item): item is { product: Product; rank: number } => Boolean(item))
    .sort((a, b) => a.rank - b.rank || a.product.ProductName.localeCompare(b.product.ProductName))
    .map((item) => item.product),[db.products,normalizedSearch]);
  const filteredPrices = useMemo(()=>(db.priceList || []).filter((price) => {
    const value = deferredSearch.toLowerCase();
    return [price.Product, price.Supplier, price.Manufacturer, String(price.PriceFOB), String(price.CFR_CPT_NET)].some((item) => (item || "").toLowerCase().includes(value));
  }).sort((a, b) => (b.PriceDate || "").localeCompare(a.PriceDate || "")),[db.priceList,deferredSearch]);

  const openInquiryForm = () => {
    const nextId = Math.max(0, ...db.inquiries.map((item) => item.InquiryID || 0)) + 1;
    setInquiryDraft({ InquiryID: nextId, InquiryNo: `INQ-${new Date().getFullYear()}-${String(nextId).padStart(3, "0")}`, InquiryDate: today, CustomerName: "", ProductName: "", QuantityMT: 0, TargetPrice: 0, Currency: "USD", Status: "جدید", Note: "" });
    setShowInquiryForm(true);
  };
  const openPriceForm = () => {
    const nextId = Math.max(0, ...(db.priceList || []).map((item) => item.PriceID || 0)) + 1;
    setPriceDraft({ PriceID: nextId, Product: "", Supplier: "", Manufacturer: "", PriceDate: today, PriceFOB: 0, PriceUnit: "USD / MT", Freight: 0, CFR_CPT_NET: 0, DeliveryTerm: "FOB", Shipment_in: "", Customer: "", Offer: 0, Note: "" });
    setShowPriceForm(true);
  };

  const handleCreateProduct = () => {
    setEditorError("");
    const newId = Math.max(...db.products.map((p) => p.ProductID), 10000) + 1;
    setEditingProduct({
      ProductID: newId,
      ProductName: "",
      ChemicalName: "",
      HSCODE: "29051100",
      Application: "صنایع پتروشیمی و پلیمری",
      PackingDetail: "کیسه ۲۵ کیلوگرمی / پالت",
      Standard: "Prime Export Grade",
      ExportGrade: "Export Grade",
      Density: "0.89 g/cm³",
      StorageTemp: "Ambient / Dry",
      SafetyNotes: "Keep away from direct heat",
      DefaultUnitPrice: 1200,
      ...(guided?{HSCODE:"",Application:"",PackingDetail:"",Standard:"",ExportGrade:"",Density:"",StorageTemp:"",SafetyNotes:"",DefaultUnitPrice:0}:{}),
    });
    setIsNewProduct(true);
  };

  const handleSaveModal = () => {
    if (!editingProduct || !editingProduct.ProductName.trim()) {
      if(guided)setEditorError("نام کالا را وارد کنید.");else alert("لطفاً نام کالا را وارد کنید.");
      return;
    }
    if(guided&&editingProduct.DefaultUnitPrice!=null&&(!Number.isFinite(editingProduct.DefaultUnitPrice)||editingProduct.DefaultUnitPrice<0)){setEditorError("قیمت پایه باید عددی معتبر و غیرمنفی باشد.");return;}
    setEditorError("");
    onSaveProduct(editingProduct);
    setEditingProduct(null);
    setIsNewProduct(false);
  };

  const handleExportCSV = () => {
    const rows = filteredProducts.map((p) => ({
      "کد کالا": p.ProductID,
      "نام کالا": p.ProductName,
      "نام شیمیایی": p.ChemicalName,
      "کد تعرفه گمرکی (HS CODE)": p.HSCODE,
      "نوع بسته‌بندی": p.PackingDetail,
      "کاربرد": p.Application,
      "استاندارد کیفی": p.Standard,
      "قیمت پایه": p.DefaultUnitPrice,
    }));
    exportToCSV("Arca_Products_Catalog.csv", rows);
  };
  const downloadTds = (product: Product, document: ProductTdsDocument) => {
    const supplier = db.suppliers.find((item) => item.SupplierID === document.supplierId);
    const pages = document.pages.map((page) => page.editableHtml !== undefined ? `<section>${page.editableHtml}</section>` : page.mimeType.startsWith("image/") ? `<img src="${page.data}" style="max-width:100%"/>` : `<p>Attached file: ${page.name}</p>`).join("<hr/>");
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>TDS_${document.name}</title></head><body><h1 style="text-align:center;font-size:25px">${document.name}</h1><p style="text-align:center">${supplier?.SupplierName || product.ProductName}</p>${pages}</body></html>`;
    const link = window.document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));
    link.download = `TDS_${document.name.replace(/[\\/:*?"<>|]/g, "-")}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div id="products-catalog-root" className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Package className="text-emerald-600" size={22} />
            <span>{guided?"کالاها و قیمت‌ها":"کاتالوگ کالاها، کد تعرفه و استعلام قیمت (ProductT & InquiryF)"}</span>
          </h1>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            تعریف اقلام پتروشیمی و شیمیایی، کدهای بین‌المللی HS Code، مشخصات بسته‌بندی و برآورد CFR
          </p></InlineHelp>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
          >
            <Download size={15} />
            <span>خروجی کاتالوگ</span>
          </button>

          <button
            onClick={handleCreateProduct}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all active:scale-98"
          >
            <Plus size={16} />
            <span>تعریف کالای جدید</span>
          </button>
          <button onClick={openPriceForm} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all active:scale-98">
            <Tag size={16} /><span>ثبت قیمت تأمین‌کننده</span>
          </button>
          <button onClick={openInquiryForm} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all active:scale-98">
            <Plus size={16} /><span>استعلام مشتری</span>
          </button>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium max-w-fit">
          <button
            onClick={() => setActiveTab("CATALOG")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeTab === "CATALOG"
                ? "bg-white text-emerald-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package size={15} />
            <span>کاتالوگ محصولات ({db.products.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("INQUIRIES")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeTab === "INQUIRIES"
                ? "bg-white text-blue-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers size={15} />
            <span>استعلام‌های قیمت ({db.inquiries.length})</span>
          </button>
          <button onClick={() => setActiveTab("SUPPLIER_PRICES")} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${activeTab === "SUPPLIER_PRICES" ? "bg-white text-indigo-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}>
            <Tag size={15} /><span>آخرین قیمت تأمین‌کنندگان ({(db.priceList || []).length})</span>
          </button>
        </div>

        {(activeTab === "CATALOG" || activeTab === "SUPPLIER_PRICES") && (
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={activeTab === "SUPPLIER_PRICES" ? "جستجو بر اساس کالا، تأمین‌کننده یا قیمت..." : "جستجوی کالا، فرمول، کد تعرفه..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Tab 1: Products Grid */}
      {activeTab === "CATALOG" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.ProductID}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors">
                      {product.ProductName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">{product.ChemicalName}</div>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                    HS: {product.HSCODE || "N/A"}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">بسته‌بندی:</span>
                    <span className="font-medium text-slate-800">{product.PackingDetail || "استاندارد"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">کاربرد:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[170px]">{product.Application || "پتروشیمی"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">استاندارد:</span>
                    <span className="font-mono text-slate-700">{product.Standard || "Prime Grade"}</span>
                  </div>
                </div>
                {(product.tdsDocuments || []).length > 0 && <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2 text-xs"><div className="mb-1 font-bold text-indigo-800">مدارک TDS</div>{product.tdsDocuments?.map((document) => <div key={document.id} className="flex items-center justify-between gap-2 border-t border-indigo-100 py-1 first:border-0"><span className="min-w-0 truncate text-slate-700">{document.name}</span><span className="flex shrink-0 gap-1"><button onClick={() => { setDocumentKind("TDS"); setTdsProduct(product); setEditingTdsDocument(document); }} className="rounded bg-white px-1.5 py-0.5 text-indigo-700">بازکردن</button><button onClick={() => downloadTds(product, document)} className="rounded bg-white px-1.5 py-0.5 text-emerald-700">دانلود</button></span></div>)}</div>}
                {(product.msdsDocuments || []).length > 0 && <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2 text-xs"><div className="mb-1 font-bold text-amber-800">مدارک MSDS</div>{product.msdsDocuments?.map((document) => <div key={document.id} className="flex items-center justify-between gap-2 border-t border-amber-100 py-1 first:border-0"><span className="min-w-0 truncate text-slate-700">{document.name}</span><span className="flex shrink-0 gap-1"><button onClick={() => { setDocumentKind("MSDS"); setTdsProduct(product); setEditingTdsDocument(document); }} className="rounded bg-white px-1.5 py-0.5 text-amber-700">بازکردن</button><button onClick={() => downloadTds(product, document)} className="rounded bg-white px-1.5 py-0.5 text-emerald-700">دانلود</button></span></div>)}</div>}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="flex gap-1"><button onClick={() => { setDocumentKind("TDS"); setTdsProduct(product); setEditingTdsDocument(undefined); }} className="rounded-lg bg-indigo-50 px-2 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white">TDS by supplier ({product.tdsDocuments?.length || 0})</button><button onClick={() => { setDocumentKind("MSDS"); setTdsProduct(product); setEditingTdsDocument(undefined); }} className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-600 hover:text-white">MSDS ({product.msdsDocuments?.length || 0})</button></span>
                <button
                  onClick={() => onOpenQuickAddProformaWithProduct(product)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-xs font-bold transition-all"
                >
                  <FileSpreadsheet size={13} />
                  <span>صدور پروفرما با این کالا</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {setEditorError("");setIsNewProduct(false);setEditingProduct(JSON.parse(JSON.stringify(product)));}}
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                    title="ویرایش کالا"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`آیا از حذف کالای "${product.ProductName}" اطمینان دارید؟`)) {
                        onDeleteProduct(product.ProductID);
                      }
                    }}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                    title="حذف کالا"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && <div className="col-span-full rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">کالایی با نام یا کد دقیق/مرتبط پیدا نشد.</div>}
        </div>
      )}

      {/* Tab 2: Inquiries List (InquiryF) */}
      {activeTab === "INQUIRIES" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div><h3 className="font-bold text-slate-800 text-xs">استعلام‌های دریافتی از مشتریان</h3><InlineHelp><p className="mt-1 text-[11px] text-slate-500">در نسخهٔ بعدی، ارسال نامهٔ بدون نام مشتری فقط پس از تأیید شما فعال می‌شود.</p></InlineHelp></div>
            <button onClick={openInquiryForm} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">ثبت استعلام جدید</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">شماره استعلام</th>
                  <th className="p-3">تاریخ</th>
                  <th className="p-3">نام مشتری</th>
                  <th className="p-3">کالای درخواستی</th>
                  <th className="p-3">تناژ درخواستی</th>
                  <th className="p-3">قیمت هدف خریدار</th>
                  <th className="p-3">وضعیت پاسخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.inquiries.map((inq) => (
                  <tr key={inq.InquiryID} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-700">{inq.InquiryNo}</td>
                    <td className="p-3 font-mono text-slate-600">{inq.InquiryDate}</td>
                    <td className="p-3 font-medium text-slate-900">{inq.CustomerName}</td>
                    <td className="p-3 font-semibold text-slate-800">{inq.ProductName}</td>
                    <td className="p-3 font-mono">{formatNumber(inq.QuantityMT)} MT</td>
                    <td className="p-3 font-mono font-bold text-emerald-700">{inq.TargetPrice} $ / MT</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {inq.Status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "SUPPLIER_PRICES" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between"><div><h3 className="font-bold text-slate-800 text-xs">آخرین قیمت‌های اعلامی تأمین‌کنندگان</h3><InlineHelp><p className="mt-1 text-[11px] text-slate-500">قیمت‌ها با تاریخ اعلام ثبت می‌شوند تا روند و آخرین نرخ هر کالا قابل بررسی باشد.</p></InlineHelp></div><button onClick={openPriceForm} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">ثبت قیمت جدید</button></div>
          <div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead className="bg-slate-50 text-slate-600 border-b"><tr><th className="p-3">تاریخ اعلام</th><th className="p-3">کالا</th><th className="p-3">تأمین‌کننده</th><th className="p-3">تولیدکننده</th><th className="p-3">FOB</th><th className="p-3">CFR/CPT</th><th className="p-3">شرط تحویل</th><th className="p-3">یادداشت</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredPrices.map((price) => <tr key={price.PriceID} className="hover:bg-indigo-50/50"><td className="p-3 font-mono">{price.PriceDate}</td><td className="p-3 font-semibold">{price.Product}</td><td className="p-3">{price.Supplier}</td><td className="p-3">{price.Manufacturer || "—"}</td><td className="p-3 font-mono text-emerald-700">{formatCurrency(price.PriceFOB, "$")}</td><td className="p-3 font-mono">{formatCurrency(price.CFR_CPT_NET, "$")}</td><td className="p-3">{price.DeliveryTerm}</td><td className="p-3 max-w-[220px] truncate">{price.Note || "—"}</td></tr>)}{filteredPrices.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">هنوز قیمتی مطابق جستجو ثبت نشده است.</td></tr>}</tbody></table></div>
        </div>
      )}

      {/* Tab 3: Fast Price Estimator & Calculator */}
      {activeTab === "PRICE_ESTIMATOR" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Calculator className="text-purple-600" size={20} />
              <span>محاسبه سریع قیمت تمام شده CFR و مارجین فروش (FOB to CFR)</span>
            </h3>
            <InlineHelp><p className="text-xs text-slate-500">
              فرمول استاندارد محاسبه کرایه هر تن بر اساس ظرفیت کانتینر ۲۰ یا ۴۰ فوت و محاسبه قیمت نهایی تحویل بندر مقصد
            </p></InlineHelp>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">انتخاب کالا از کاتالوگ</label>
                <select
                  value={estProduct.ProductID}
                  onChange={(e) => {
                    const prod = db.products.find((p) => p.ProductID === Number(e.target.value));
                    if (prod) {
                      setEstProduct(prod);
                      if (prod.DefaultUnitPrice) setEstFobPrice(prod.DefaultUnitPrice);
                    }
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                >
                  {db.products.map((p) => (
                    <option key={p.ProductID} value={p.ProductID}>
                      {p.ProductName} ({p.ChemicalName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">قیمت خرید فوب در مبدا (FOB Price - $/MT)</label>
                <input
                  type="number"
                  value={estFobPrice}
                  onChange={(e) => setEstFobPrice(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-blue-700"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">کرایه حمل دریایی هر کانتینر (Ocean Freight - $)</label>
                <input
                  type="number"
                  value={estContainerFreight}
                  onChange={(e) => setEstContainerFreight(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">گنجایش بار در هر کانتینر (MT)</label>
                <input
                  type="number"
                  step="0.01"
                  value={estContainerCapacity}
                  onChange={(e) => setEstContainerCapacity(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">مارجین و سود بازرگانی مدنظر ($ / MT)</label>
                <input
                  type="number"
                  value={estTargetMargin}
                  onChange={(e) => setEstTargetMargin(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-emerald-700"
                />
              </div>
              <div className="sm:col-span-2"><AttachmentManager productMode attachments={editingProduct.attachments} onChange={(attachments) => setEditingProduct({ ...editingProduct, attachments })}/></div>
            </div>
          </div>

          {/* Results Summary Box */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-bold text-indigo-300">خلاصه بهای تمام شده و پیشنهاد قیمت</div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>سهم کرایه حمل در هر تن:</span>
                  <span className="font-mono font-bold text-white">{freightPerMT.toFixed(2)}$ / MT</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>بهای تمام شده CFR Net:</span>
                  <span className="font-mono font-bold text-white">{calculatedCFR.toFixed(2)}$ / MT</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>مارجین سود خالص:</span>
                  <span className="font-mono font-bold text-emerald-400">+{estTargetMargin}$ / MT</span>
                </div>
              </div>

              <div className="p-4 bg-blue-500/15 border border-blue-500/30 rounded-xl space-y-1 mt-4">
                <div className="text-[10px] text-blue-300 font-bold uppercase">قیمت فروش پیشنهادی در پیش‌فاکتور (CFR)</div>
                <div className="text-2xl font-black font-mono text-emerald-400">
                  {calculatedSellPrice.toFixed(2)}$ <span className="text-xs font-normal text-slate-300">/ MT</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onOpenQuickAddProformaWithProduct(estProduct)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold transition-all shadow-md active:scale-98"
            >
              صدور پیش‌فاکتور با این نرخ
            </button>
          </div>
        </div>
      )}

      {showPriceForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => { event.preventDefault(); if (!priceDraft.Product.trim() || !priceDraft.Supplier.trim()) return; onSavePrice({ ...priceDraft, CFR_CPT_NET: priceDraft.CFR_CPT_NET || priceDraft.PriceFOB + priceDraft.Freight }); setShowPriceForm(false); }} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b pb-3"><div><h3 className="font-bold text-slate-900">ثبت قیمت اعلامی تأمین‌کننده</h3><InlineHelp><p className="text-xs text-slate-500">هر قیمت با تاریخ اعلام برای مقایسه روند و آخرین نرخ نگهداری می‌شود.</p></InlineHelp></div><button type="button" onClick={() => setShowPriceForm(false)} className="p-2 text-slate-500"><X size={18}/></button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">{[["کالا", "Product", "text"], ["تأمین‌کننده", "Supplier", "text"], ["تولیدکننده", "Manufacturer", "text"], ["تاریخ اعلام", "PriceDate", "date"], ["قیمت FOB", "PriceFOB", "number"], ["کرایه هر تن", "Freight", "number"], ["CFR/CPT (در صورت اعلام)", "CFR_CPT_NET", "number"], ["شرط تحویل", "DeliveryTerm", "text"]].map(([label, key, type]) => <label key={key} className="space-y-1"><span className="font-semibold text-slate-600">{label}</span>{key === "Product" ? <select required value={priceDraft.Product} onChange={(e) => setPriceDraft({ ...priceDraft, Product: e.target.value })} className="w-full rounded-lg border p-2"><option value="">انتخاب کالا</option>{db.products.map((product) => <option key={product.ProductID} value={product.ProductName}>{product.ProductName}</option>)}</select> : key === "Supplier" ? <select required value={priceDraft.Supplier} onChange={(e) => setPriceDraft({ ...priceDraft, Supplier: e.target.value })} className="w-full rounded-lg border p-2"><option value="">انتخاب تأمین‌کننده</option>{db.suppliers.map((supplier) => <option key={supplier.SupplierID} value={supplier.SupplierName}>{supplier.SupplierName}</option>)}</select> : <input required={key === "PriceDate"} type={type} value={(priceDraft as any)[key] ?? ""} onChange={(e) => setPriceDraft({ ...priceDraft, [key]: type === "number" ? Number(e.target.value) : e.target.value })} className="w-full rounded-lg border p-2"/>}</label>)}</div><label className="block text-xs font-semibold text-slate-600">یادداشت<textarea value={priceDraft.Note} onChange={(e) => setPriceDraft({ ...priceDraft, Note: e.target.value })} className="mt-1 w-full rounded-lg border p-2 font-normal" rows={2}/></label><button className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white">ذخیره قیمت</button></form></div>}

      {showInquiryForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => { event.preventDefault(); if (!inquiryDraft.CustomerName?.trim() || !inquiryDraft.ProductName?.trim()) return; onSaveInquiry(inquiryDraft); setShowInquiryForm(false); }} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b pb-3"><div><h3 className="font-bold text-slate-900">ثبت استعلام مشتری</h3><InlineHelp><p className="text-xs text-slate-500">نام مشتری فقط در پرونده داخلی نگهداری می‌شود و در نامه استعلام تأمین‌کننده نمایش داده نخواهد شد.</p></InlineHelp></div><button type="button" onClick={() => setShowInquiryForm(false)} className="p-2 text-slate-500"><X size={18}/></button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs"><label className="space-y-1"><span>مشتری</span><select required value={inquiryDraft.CustomerName} onChange={(e) => setInquiryDraft({ ...inquiryDraft, CustomerName: e.target.value })} className="w-full rounded-lg border p-2"><option value="">انتخاب مشتری</option>{db.customers.map((customer) => <option key={customer.CustomerID} value={customer.CustomerName}>{customer.CustomerName}</option>)}</select></label><label className="space-y-1"><span>کالای درخواستی</span><select required value={inquiryDraft.ProductName} onChange={(e) => setInquiryDraft({ ...inquiryDraft, ProductName: e.target.value })} className="w-full rounded-lg border p-2"><option value="">انتخاب کالا</option>{db.products.map((product) => <option key={product.ProductID} value={product.ProductName}>{product.ProductName}</option>)}</select></label><label className="space-y-1"><span>تاریخ</span><input type="date" value={inquiryDraft.InquiryDate} onChange={(e) => setInquiryDraft({ ...inquiryDraft, InquiryDate: e.target.value })} className="w-full rounded-lg border p-2"/></label><label className="space-y-1"><span>تناژ (MT)</span><input type="number" min="0" value={inquiryDraft.QuantityMT} onChange={(e) => setInquiryDraft({ ...inquiryDraft, QuantityMT: Number(e.target.value) })} className="w-full rounded-lg border p-2"/></label><label className="space-y-1"><span>قیمت هدف</span><input type="number" min="0" value={inquiryDraft.TargetPrice} onChange={(e) => setInquiryDraft({ ...inquiryDraft, TargetPrice: Number(e.target.value) })} className="w-full rounded-lg border p-2"/></label><label className="space-y-1"><span>شرط تحویل</span><input value={inquiryDraft.DeliveryTerm || ""} onChange={(e) => setInquiryDraft({ ...inquiryDraft, DeliveryTerm: e.target.value })} className="w-full rounded-lg border p-2" placeholder="FOB / CIF / CFR"/></label></div><label className="block text-xs">یادداشت داخلی<textarea value={inquiryDraft.Note} onChange={(e) => setInquiryDraft({ ...inquiryDraft, Note: e.target.value })} className="mt-1 w-full rounded-lg border p-2" rows={2}/></label><button className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white">ثبت استعلام</button></form></div>}

      {/* Product Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="ویرایش کالا" className="bg-white rounded-2xl w-full max-w-2xl max-h-[94dvh] shadow-2xl border border-slate-200 overflow-y-auto space-y-4 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Package className="text-emerald-600" size={18} />
                <span>{isNewProduct ? (guided?"تعریف کالای جدید":"تعریف کالای جدید در کاتالوگ (ProductT)") : `ویرایش کالا: ${editingProduct.ProductName}`}</span>
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <ProgressiveFields guided={guided} core={[0,2,3,6]} extraTitle="مشخصات علمی، گرید و کاربرد کالا">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">نام تجاری کالا (ProductName)</label>
                <input
                  type="text"
                  value={editingProduct.ProductName}
                  onChange={(e) => setEditingProduct({ ...editingProduct, ProductName: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  placeholder="مثال: مونو اتیلن گلایکول (MEG)"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">نام علمی / فرمول شیمیایی (ChemicalName)</label>
                <input
                  type="text"
                  value={editingProduct.ChemicalName || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, ChemicalName: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  placeholder="e.g. Monoethylene Glycol / C2H6O2"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">کد تعرفه بین‌المللی گمرک (HSCODE)</label>
                <input
                  type="text"
                  value={editingProduct.HSCODE || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, HSCODE: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold"
                  placeholder="e.g. 29053100"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">نوع بسته‌بندی استاندارد (PackingDetail)</label>
                <input
                  type="text"
                  value={editingProduct.PackingDetail || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, PackingDetail: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                  placeholder="e.g. Bulk in ISO Tank / 220KG Steel Drum"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">استاندارد کیفی (Standard / Grade)</label>
                <input
                  type="text"
                  value={editingProduct.Standard || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, Standard: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">گرید صادراتی (Export Grade)</label>
                <input type="text" value={editingProduct.ExportGrade || ""} onChange={(e) => setEditingProduct({ ...editingProduct, ExportGrade: e.target.value })} className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200" placeholder="مثال: Export Grade" />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">قیمت پایه فروش ($ / MT)</label>
                <input
                  type="number"
                  value={editingProduct.DefaultUnitPrice || 0}
                  onChange={(e) => setEditingProduct({ ...editingProduct, DefaultUnitPrice: Number(e.target.value) })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">دانسیته / جرم حجمی (Density)</label>
                <input
                  type="text"
                  value={editingProduct.Density || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, Density: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">کاربرد و مشخصات فنی (Application)</label>
                <textarea
                  rows={2}
                  value={editingProduct.Application || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, Application: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                  placeholder="کاربرد در صنایع پلیمری، پلی استر، ضدیخ..."
                />
              </div>
            </ProgressiveFields>

            {guided&&editorError&&<p role="alert" className="text-xs text-rose-700">{editorError}</p>}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              {!isNewProduct && <button onClick={() => { setTdsProduct(editingProduct); setEditingTdsDocument(undefined); }} className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold">TDS by supplier ({editingProduct.tdsDocuments?.length || 0})</button>}
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveModal}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30"
              >
                <Save size={15} />
                <span>ذخیره کالا</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {tdsProduct && <TdsDocumentModal key={`${documentKind}-${editingTdsDocument?.id || "new"}`} product={tdsProduct} suppliers={db.suppliers} initialDocument={editingTdsDocument} documentKind={documentKind} onSave={(document) => {
        const field = documentKind === "TDS" ? "tdsDocuments" : "msdsDocuments";
        const updated = { ...tdsProduct, [field]: [...(tdsProduct[field] || []).filter((item) => item.id !== document.id), document] };
        setTdsProduct(updated);
        if (editingProduct?.ProductID === updated.ProductID) setEditingProduct(updated);
        onSaveProduct(updated);
      }} onClose={() => { setTdsProduct(null); setEditingTdsDocument(undefined); }}/>} 
    </div>
  );
};
