import { InlineHelp } from "./InlineHelp";
import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Ship,
  Clock,
  FileSpreadsheet,
  AlertCircle,
  Users,
  CheckCircle2,
  Trash2,
  Filter,
  ArrowUpRight,
  Anchor,
} from "lucide-react";
import { CalendarEvent, AppDatabase, Language, Order } from "../types";
import { getTranslation } from "../i18n/translations";
import { toJalaliDate } from "../utils/formatters";

interface CommercialCalendarViewProps {
  db: AppDatabase;
  language: Language;
  onSaveCalendarEvent: (event: CalendarEvent) => void;
  onDeleteCalendarEvent: (eventId: string) => void;
  onSelectOrder?: (orderId: number) => void;
}

export const CommercialCalendarView: React.FC<CommercialCalendarViewProps> = ({
  db,
  language,
  onSaveCalendarEvent,
  onDeleteCalendarEvent,
  onSelectOrder,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [filterType, setFilterType] = useState<string>("ALL");
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);

  const t = (key: any) => getTranslation(language, key);

  // Form State for new event
  const [newEvent, setNewEvent] = useState<CalendarEvent>({
    id: "cal_" + Date.now(),
    title: "",
    date: new Date().toISOString().slice(0, 10),
    type: "custom",
    priority: "medium",
  });

  // Synthesize events from Orders automatically (ETD, ETA, PIDate) + explicit calendarEvents
  const allEvents = useMemo(() => {
    const events: CalendarEvent[] = [...(db.calendarEvents || [])];

    // Auto-generate from Orders
    db.orders.forEach((order) => {
      if (order.ETD) {
        events.push({
          id: `auto_etd_${order.OrderID}`,
          title: `حرکت و بارگیری (ETD): ${order.ProformaInvoiceID} - ${order.CustomerName}`,
          titleEn: `Vessel Sailing (ETD): ${order.ProformaInvoiceID} - ${order.CustomerName}`,
          date: order.ETD,
          type: "etd",
          priority: "high",
          relatedOrderId: order.OrderID,
          proformaInvoiceId: order.ProformaInvoiceID,
          customerName: order.CustomerName,
          description: `بندر بارگیری: ${order.PortOfLoading || "نامشخص"} ➔ مقصد: ${order.PortOfDischarge || "بندرعباس"}`,
        });
      }

      if (order.ETA) {
        events.push({
          id: `auto_eta_${order.OrderID}`,
          title: `رسیدن محموله (ETA): ${order.ProformaInvoiceID} - ${order.CustomerName}`,
          titleEn: `Cargo Arrival (ETA): ${order.ProformaInvoiceID} - ${order.CustomerName}`,
          date: order.ETA,
          type: "eta",
          priority: "high",
          relatedOrderId: order.OrderID,
          proformaInvoiceId: order.ProformaInvoiceID,
          customerName: order.CustomerName,
          description: `بارنامه (B/L): ${order.BLNo || "اعلام نشده"} | کانتینر: ${order.ContainerNo || "—"} | کامیون: ${order.TruckNo || "—"}`,
        });
      }
    });

    return events;
  }, [db.calendarEvents, db.orders]);

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today.toISOString().slice(0, 10));
  };

  // Calendar Grid Days
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNamesEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthNamesFa = [
    "ژانویه / دی-بهمن", "فوریه / بهمن-اسفند", "مارس / اسفند-فروردین", "آوریل / فروردین-اردیبهشت",
    "می / اردیبهشت-خرداد", "ژوئن / خرداد-تیر", "جولای / تیر-مرداد", "اوت / مرداد-شهریور",
    "سپتامبر / شهریور-مهر", "اکتبر / مهر-آبان", "نوامبر / آبان-آذر", "دسامبر / آذر-دی"
  ];

  const daysList = useMemo(() => {
    const list = [];
    for (let i = 0; i < firstDay; i++) {
      list.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      list.push({ dayNumber: d, dateStr });
    }
    return list;
  }, [year, month, firstDay, daysInMonth]);

  // Filtered Events for selected date and list
  const selectedDayEvents = allEvents.filter((ev) => ev.date === selectedDate);

  const filteredEvents = allEvents.filter((ev) => {
    if (filterType !== "ALL" && ev.type !== filterType) return false;
    return true;
  });

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title.trim()) return;

    onSaveCalendarEvent(newEvent);
    setIsNewEventModalOpen(false);
    setNewEvent({
      id: "cal_" + Date.now(),
      title: "",
      date: selectedDate,
      type: "custom",
      priority: "medium",
    });
  };

  return (
    <div id="commercial-calendar-view" className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800">{t("calendar_title")}</h2>
          </div>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">{t("calendar_desc")}</p></InlineHelp>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
          >
            {t("today_tasks")} / امروز
          </button>

          <button
            onClick={() => {
              setNewEvent({ ...newEvent, date: selectedDate });
              setIsNewEventModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Plus size={14} />
            <span>{t("add_calendar_event")}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Month Calendar & Day Schedule Details */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Monthly Interactive Grid */}
        <div className="lg:col-span-2 min-w-0 bg-white border border-slate-200 rounded-xl shadow-2xs p-4 space-y-4">
          {/* Month Header Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={language === "fa" ? nextMonth : prevMonth}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
              >
                <ChevronRight size={18} />
              </button>
              <h3 className="font-bold text-sm text-slate-900 font-mono">
                {language === "fa" ? monthNamesFa[month] : monthNamesEn[month]} {year}
              </h3>
              <button
                onClick={language === "fa" ? prevMonth : nextMonth}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
              >
                <ChevronLeft size={18} />
              </button>
            </div>

            {/* Event Type Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md py-1 px-2 text-xs text-slate-700 outline-none"
              >
                <option value="ALL">{t("all")} رویدادها</option>
                <option value="etd">{t("type_etd")}</option>
                <option value="eta">{t("type_eta")}</option>
                <option value="meeting">{t("type_meeting")}</option>
                <option value="custom">{t("type_custom")}</option>
              </select>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 py-1">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {daysList.map((item, idx) => {
              if (!item) {
                return <div key={`empty_${idx}`} className="h-16 sm:h-20 bg-slate-50/50 rounded-lg" />;
              }

              const dayEvents = filteredEvents.filter((e) => e.date === item.dateStr);
              const isSelected = item.dateStr === selectedDate;
              const isToday = item.dateStr === new Date().toISOString().slice(0, 10);

              return (
                <div
                  key={item.dateStr}
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`h-16 sm:h-20 p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                      : isToday
                      ? "border-amber-400 bg-amber-50/30"
                      : "border-slate-100 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full text-[11px] ${
                        isToday
                          ? "bg-amber-500 text-white"
                          : isSelected
                          ? "bg-indigo-600 text-white"
                          : "text-slate-700"
                      }`}
                    >
                      {item.dayNumber}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                  </div>

                  {/* Tiny Event Pills */}
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[9px] px-1 py-0.5 rounded-xs truncate font-medium ${
                          ev.type === "etd"
                            ? "bg-blue-100 text-blue-800"
                            : ev.type === "eta"
                            ? "bg-emerald-100 text-emerald-800"
                            : ev.type === "meeting"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {ev.type === "etd" ? "🚢 " : ev.type === "eta" ? "⚓ " : "📅 "}
                        {language === "fa" ? ev.title : ev.titleEn || ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[8px] text-slate-400 font-mono">
                        +{dayEvents.length - 2} دیگر
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Selected Date Schedule & Events */}
        <div className="min-w-0 bg-white border border-slate-200 rounded-xl shadow-2xs p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <CalendarIcon size={14} className="text-indigo-600" />
                  <span>برنامه‌ها و رویدادهای تاریخ انتخابی</span>
                </h4>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {selectedDate} {language === "fa" && `(${toJalaliDate(selectedDate)})`}
                </p>
              </div>
              <button
                onClick={() => {
                  setNewEvent({ ...newEvent, date: selectedDate });
                  setIsNewEventModalOpen(true);
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
              >
                <Plus size={13} />
                <span>افزودن</span>
              </button>
            </div>

            {/* List of day events */}
            <div className="space-y-2.5 mt-3 max-h-[380px] overflow-y-auto pr-0.5">
              {selectedDayEvents.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <Clock size={28} className="mx-auto text-slate-300 mb-2" />
                  <p>{t("no_events_day")}</p>
                </div>
              ) : (
                selectedDayEvents.map((ev) => {
                  const isEtd = ev.type === "etd";
                  const isEta = ev.type === "eta";
                  const isMeeting = ev.type === "meeting";

                  return (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-lg border text-xs space-y-1.5 transition-all ${
                        isEtd
                          ? "bg-blue-50/50 border-blue-200"
                          : isEta
                          ? "bg-emerald-50/50 border-emerald-200"
                          : isMeeting
                          ? "bg-purple-50/50 border-purple-200"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          {isEtd && <Ship size={14} className="text-blue-600" />}
                          {isEta && <Anchor size={14} className="text-emerald-600" />}
                          {isMeeting && <Users size={14} className="text-purple-600" />}
                          <span>{language === "fa" ? ev.title : ev.titleEn || ev.title}</span>
                        </div>

                        {/* Delete button if manual */}
                        {!ev.id.startsWith("auto_") && (
                          <button
                            onClick={() => onDeleteCalendarEvent(ev.id)}
                            className="text-slate-400 hover:text-rose-600 text-xs"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {ev.description}
                        </p>
                      )}

                      {ev.proformaInvoiceId && ev.relatedOrderId && (
                        <div className="pt-1.5 flex items-center justify-between text-[11px] border-t border-slate-200/60">
                          <span className="font-mono text-indigo-700 font-bold">
                            {ev.proformaInvoiceId}
                          </span>
                          <button
                            onClick={() => onSelectOrder && onSelectOrder(ev.relatedOrderId!)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 text-[10px]"
                          >
                            <span>مشاهده پیش‌فاکتور</span>
                            <ArrowUpRight size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Legend Footer */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 flex items-center justify-around">
            <span className="flex items-center gap-1 text-blue-700 font-medium">🚢 ETD بارگیری</span>
            <span className="flex items-center gap-1 text-emerald-700 font-medium">⚓ ETA رسیدن</span>
            <span className="flex items-center gap-1 text-purple-700 font-medium">👥 جلسه تجاری</span>
          </div>
        </div>
      </div>

      {/* New Calendar Event Modal */}
      {isNewEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90dvh] overflow-y-auto animate-scale-in">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} className="text-indigo-400" />
                <h3 className="text-xs font-bold">{t("add_calendar_event")}</h3>
              </div>
              <button
                onClick={() => setIsNewEventModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t("event_title")} *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: جلسه مذاکره با شرکت..."
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("event_date")}</label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("event_type")}</label>
                  <select
                    value={newEvent.type}
                    onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  >
                    <option value="meeting">{t("type_meeting")}</option>
                    <option value="etd">{t("type_etd")}</option>
                    <option value="eta">{t("type_eta")}</option>
                    <option value="payment_due">{t("type_payment_due")}</option>
                    <option value="custom">{t("type_custom")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">توضیحات و جزئیات</label>
                <textarea
                  rows={2}
                  value={newEvent.description || ""}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="مکان جلسه، شماره پیگیری، هماهنگی با مدیر..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewEventModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-2xs"
                >
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
