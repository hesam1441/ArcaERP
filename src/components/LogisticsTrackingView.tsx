import { InlineHelp } from "./InlineHelp";
import { ProgressiveFields } from "./ProgressiveFields";
import { ShippingReferencesEditor } from "./ShippingReferencesEditor";
import React, { useState } from "react";
import {
  Ship,
  Search,
  Filter,
  Clock,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Anchor,
  Edit,
  Save,
  X,
  Download,
} from "lucide-react";
import { Order, AppDatabase } from "../types";
import { formatNumber, toJalaliDate } from "../utils/formatters";
import { getOrderQuantityMT } from "../utils/orderAccounting";
import { exportToCSV } from "../services/storageService";
import { OrderListTools, useOrderListFilters } from "./OrderListTools";

interface LogisticsTrackingViewProps {
  guided?: boolean;
  db: AppDatabase;
  onUpdateOrderLogistics: (order: Order) => void;
}

export const LogisticsTrackingView: React.FC<LogisticsTrackingViewProps> = ({
  guided = false,
  db,
  onUpdateOrderLogistics,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingLogisticsOrder, setEditingLogisticsOrder] = useState<Order | null>(null);
  const orderListFilters = useOrderListFilters(db.orders);

  const activeShipments = orderListFilters.filteredOrders.filter((o) => {
    const matchesSearch =
      (o.ProformaInvoiceID || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.BLNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.ContainerNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.TruckNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.CustomerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.Carrier || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleSaveLogistics = () => {
    if (!editingLogisticsOrder) return;
    onUpdateOrderLogistics(editingLogisticsOrder);
    setEditingLogisticsOrder(null);
  };

  const handleExportCSV = () => {
    const rows = activeShipments.map((o) => ({
      "شماره PI": o.ProformaInvoiceID,
      "مشتری": o.CustomerName,
      "بارنامه (B/L)": o.BLNo,
      "خط کشتیرانی": o.Carrier,
      "بندر بارگیری": o.PortOfLoading,
      "بندر تخلیه": o.PortOfDischarge,
      "کانتینرها": o.ContainerNo,
      "شماره کامیون‌ها": o.TruckNo,
      "تاریخ حرکت (ETD)": o.ETD,
      "تخمین رسیدن (ETA)": o.ETA,
      "وضعیت محموله": o.OrderStatus,
      "یادداشت پیگیری": o.Followup,
    }));
    exportToCSV("Arca_Shipments_Logistics.csv", rows);
  };

  return (
    <div id="logistics-tracking-root" className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Ship className="text-blue-600" size={22} />
            <span>رهگیری لجستیک، بارنامه‌ها و کانتینرها (FollowUpF & BLTracking)</span>
          </h1>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">
            پیگیری وضعیت خطوط کشتیرانی، صدور B/L، زمان حرکت کشتی (ETD) و ورود به گمرک (ETA)
          </p></InlineHelp>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
          >
            <Download size={15} />
            <span>خروجی لیست محموله‌ها</span>
          </button>
        </div>
      </div>

      <OrderListTools {...orderListFilters} title="جست‌وجوی محموله‌ها" exportName="ARCA_Logistics_Orders" />

      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="جستجوی بارنامه (B/L)، شماره کانتینر، مشتری، خط کشتیرانی..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-3 pr-9 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 shadow-xs"
        />
      </div>

      {/* Shipments Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeShipments.map((order) => (
          <div
            key={order.OrderID}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              {/* Header Info */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="font-bold text-blue-700 font-mono text-sm">{order.ProformaInvoiceID}</div>
                  <div className="text-xs font-medium text-slate-900 mt-0.5">{order.CustomerName}</div>
                </div>

                <div className="text-left">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    <Anchor size={13} />
                    <span>{order.OrderStatus || "در مسیر دریایی"}</span>
                  </span>
                </div>
              </div>

              {/* Transit Ports & Carrier */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-xs border border-slate-100">
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">مسیر ترانزیت دریایی</div>
                  <div className="font-medium text-slate-800 flex items-center gap-1">
                    <MapPin size={13} className="text-blue-500" />
                    <span>مبدأ: {order.PortOfLoading || "Jebel Ali"}</span>
                  </div>
                  <div className="font-medium text-slate-800 flex items-center gap-1">
                    <MapPin size={13} className="text-emerald-500" />
                    <span>مقصد: {order.PortOfDischarge || "Bandar Abbas"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">خط و مشخصات بارنامه</div>
                  <div className="text-slate-700">
                    کریر: <span className="font-bold">{order.Carrier || "Ocean Carrier"}</span>
                  </div>
                  <div className="text-slate-700 font-mono text-[11px]">
                    B/L: <span className="font-bold text-blue-800">{order.BLNo || "در انتظار صدور"}</span>
                  </div>
                </div>
              </div>

              {/* Containers Info */}
              <div className="text-xs space-y-1">
                <div className="text-slate-400 text-[11px] font-bold">شماره کانتینرها (FCL):</div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 break-words">
                  {[order.ContainerNo, order.TruckNo && `Truck No.: ${order.TruckNo}`].filter(Boolean).join(" | ") || "شماره کانتینر / کامیون اعلام نشده"}
                </div>
              </div>

              {/* ETA / ETD Timestamps */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-blue-50/50 border border-blue-100 text-blue-950 font-mono">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-blue-600" />
                  <span>ETD: {order.ETD || "تعیین نشده"}</span>
                </div>
                <div className="font-bold text-blue-800">
                  ETA: {order.ETA ? `${order.ETA} (${toJalaliDate(order.ETA)})` : "در انتظار اعلام کشتی"}
                </div>
              </div>

              {/* Follow-up Note */}
              {order.Followup && (
                <div className="text-xs text-slate-600 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 leading-relaxed">
                  <span className="font-bold text-amber-900 block mb-0.5">یادداشت پیگیری:</span>
                  {order.Followup}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">
                وزن بار: {formatNumber(getOrderQuantityMT(order))} MT
              </span>

              <button
                onClick={() => setEditingLogisticsOrder(JSON.parse(JSON.stringify(order)))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs"
              >
                <Edit size={13} />
                <span>ویرایش وضعیت و بارنامه</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Logistics Modal */}
      {editingLogisticsOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-label="ویرایش حمل" className="bg-white rounded-2xl w-full max-w-xl max-h-[92dvh] shadow-2xl border border-slate-200 overflow-y-auto space-y-4 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Ship className="text-blue-600" size={18} />
                <span>ویرایش اطلاعات بارنامه و رهگیری: {editingLogisticsOrder.ProformaInvoiceID}</span>
              </h3>
              <button
                onClick={() => setEditingLogisticsOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <ProgressiveFields guided={guided} core={[0,1,3,4]} extraTitle="شرکت حمل و یادداشت‌های پیگیری">
              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">وضعیت مرحله سفارش (OrderStatus)</label>
                <select
                  value={editingLogisticsOrder.OrderStatus || "در مسیر دریایی (Sailing)"}
                  onChange={(e) => setEditingLogisticsOrder({ ...editingLogisticsOrder, OrderStatus: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                >
                  <option value="پیش‌فاکتور صادر شده (PI Issued)">پیش‌فاکتور صادر شده (PI Issued)</option>
                  <option value="در حال تولید و بسته‌بندی (In Production)">در حال تولید و بسته‌بندی (In Production)</option>
                  <option value="بارگیری شده در مبدا (Loaded)">بارگیری شده در مبدا (Loaded)</option>
                  <option value="در مسیر دریایی (Sailing)">در مسیر دریایی (Sailing)</option>
                  <option value="رسیده به گمرک مقصد (Arrived Customs)">رسیده به گمرک مقصد (Arrived Customs)</option>
                  <option value="در حال ترخیص از گمرک (Customs Clearance)">در حال ترخیص از گمرک (Customs Clearance)</option>
                  <option value="تحویل داده شده و مختومه (Delivered)">تحویل داده شده و مختومه (Delivered)</option>
                </select>
              </div>

              <div className="sm:col-span-2"><ShippingReferencesEditor order={editingLogisticsOrder} onChange={setEditingLogisticsOrder}/></div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">خط کشتیرانی / کریر (Carrier)</label>
                <input
                  type="text"
                  value={editingLogisticsOrder.Carrier || ""}
                  onChange={(e) => setEditingLogisticsOrder({ ...editingLogisticsOrder, Carrier: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">تاریخ حرکت کشتی (ETD)</label>
                <input
                  type="date"
                  value={editingLogisticsOrder.ETD || ""}
                  onChange={(e) => setEditingLogisticsOrder({ ...editingLogisticsOrder, ETD: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">تاریخ تخمینی رسیدن (ETA)</label>
                <input
                  type="date"
                  value={editingLogisticsOrder.ETA || ""}
                  onChange={(e) => setEditingLogisticsOrder({ ...editingLogisticsOrder, ETA: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">یادداشت پیگیری ترخیص و اسناد (Followup Note)</label>
                <textarea
                  rows={3}
                  value={editingLogisticsOrder.Followup || ""}
                  onChange={(e) => setEditingLogisticsOrder({ ...editingLogisticsOrder, Followup: e.target.value })}
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-200"
                  placeholder="ثبت گواهی بازرسی، قبض انبار، هماهنگی ترخیص‌کار..."
                />
              </div>
            </ProgressiveFields>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingLogisticsOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveLogistics}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30"
              >
                <Save size={15} />
                <span>ذخیره رهگیری</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
