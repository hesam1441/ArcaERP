import { InlineHelp } from "./InlineHelp";
import { GuidedSection } from "./GuidedSection";
import React, { useState } from "react";
import {
  CheckSquare,
  Square,
  Plus,
  Filter,
  Calendar as CalendarIcon,
  User,
  AlertCircle,
  Clock,
  CheckCircle2,
  Trash2,
  Edit,
  FileText,
  Tag,
  Search,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { TaskItem, AppDatabase, Language, AppUser } from "../types";
import { getTranslation } from "../i18n/translations";
import { toJalaliDate } from "../utils/formatters";

interface TasksManagerViewProps {
  guided?: boolean;
  db: AppDatabase;
  language: Language;
  onSaveTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTaskComplete: (taskId: string, resultNote?: string) => void;
  onOpenOrder?: (orderId: number) => void;
}

export const TasksManagerView: React.FC<TasksManagerViewProps> = ({
  guided = false,
  db,
  language,
  onSaveTask,
  onDeleteTask,
  onToggleTaskComplete,
  onOpenOrder,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterUser, setFilterUser] = useState<string>("ALL");
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  // Result note modal
  const [resultModalTaskId, setResultModalTaskId] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");

  const t = (key: any) => getTranslation(language, key);

  const initialNewTask: TaskItem = {
    id: "task_" + Date.now(),
    title: "",
    description: "",
    priority: "medium",
    category: "sales",
    dueDate: new Date().toISOString().slice(0, 10),
    completed: false,
    assignedToUserId: db.currentUser?.id || db.users[0]?.id,
    assignedToName: db.currentUser?.name || db.users[0]?.name,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const [formData, setFormData] = useState<TaskItem>(initialNewTask);

  const handleOpenNew = () => {
    setEditingTask(null);
    setFormData({
      id: "task_" + Date.now(),
      title: "",
      description: "",
      priority: "medium",
      category: "sales",
      dueDate: new Date().toISOString().slice(0, 10),
      completed: false,
      assignedToUserId: db.currentUser?.id || db.users[0]?.id,
      assignedToName: db.currentUser?.name || db.users[0]?.name,
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (task: TaskItem) => {
    setEditingTask(task);
    setFormData({ ...task });
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const assignedUser = db.users.find((u) => u.id === formData.assignedToUserId);
    const taskToSave: TaskItem = {
      ...formData,
      assignedToName: assignedUser ? (language === "fa" ? assignedUser.name : assignedUser.nameEn) : formData.assignedToName,
    };

    onSaveTask(taskToSave);
    setIsFormOpen(false);
  };

  const handleOpenResultModal = (task: TaskItem) => {
    setResultModalTaskId(task.id);
    setResultText(task.resultNote || "");
  };

  const handleSaveResultNote = () => {
    if (resultModalTaskId) {
      onToggleTaskComplete(resultModalTaskId, resultText);
      setResultModalTaskId(null);
      setResultText("");
    }
  };

  // Filter tasks
  const filteredTasks = (db.tasks || []).filter((task) => {
    if (!showCompleted && task.completed) return false;
    if (filterCategory !== "ALL" && task.category !== filterCategory) return false;
    if (filterPriority !== "ALL" && task.priority !== filterPriority) return false;
    if (filterUser !== "ALL" && task.assignedToUserId !== filterUser) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q) || (task.titleEn?.toLowerCase().includes(q) ?? false);
      const matchDesc = task.description?.toLowerCase().includes(q) || false;
      const matchCust = task.relatedCustomerName?.toLowerCase().includes(q) || false;
      const matchPI = task.relatedProformaId?.toLowerCase().includes(q) || false;
      if (!matchTitle && !matchDesc && !matchCust && !matchPI) return false;
    }
    return true;
  });

  const activeCount = (db.tasks || []).filter((t) => !t.completed).length;
  const completedCount = (db.tasks || []).filter((t) => t.completed).length;
  const highPriorityCount = (db.tasks || []).filter((t) => !t.completed && t.priority === "high").length;

  return (
    <div id="tasks-manager-view" className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800">{t("tasks_title")}</h2>
          </div>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">{t("tasks_desc")}</p></InlineHelp>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-200/60">
              {activeCount} {t("active")}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-medium border border-rose-200/60">
              {highPriorityCount} {t("high")}
            </span>
          </div>

          <button
            onClick={handleOpenNew}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 shadow-2xs shrink-0"
          >
            <Plus size={14} />
            <span>{t("add_task")}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <input
              type="text"
              placeholder={t("search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 pr-8 pl-3 text-xs outline-none focus:border-indigo-500"
            />
            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">{t("all")} {t("category")}</option>
            <option value="sales">{t("category_sales")}</option>
            <option value="accounting">{t("category_accounting")}</option>
            <option value="logistics">{t("category_logistics")}</option>
            <option value="procurement">{t("category_procurement")}</option>
            <option value="general">{t("category_general")}</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">{t("all")} {t("priority")}</option>
            <option value="high">{t("high")}</option>
            <option value="medium">{t("medium")}</option>
            <option value="low">{t("low")}</option>
          </select>

          {/* User Filter */}
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">{t("all")} {t("assigned_to")}</option>
            {db.users.map((u) => (
              <option key={u.id} value={u.id}>
                {language === "fa" ? u.name : u.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Toggle Show Completed */}
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
            showCompleted
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <CheckCircle2 size={13} className={showCompleted ? "text-indigo-600" : "text-slate-400"} />
          <span>{t("show_completed")} ({completedCount})</span>
        </button>
      </div>

      {/* Task Cards List */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
            <p>هیچ وظیفه و تسکی با این مشخصات یافت نشد.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isHigh = task.priority === "high";
            const isMedium = task.priority === "medium";

            return (
              <div
                key={task.id}
                className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all hover:border-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                  task.completed
                    ? "opacity-60 bg-slate-50/70 border-slate-200"
                    : isHigh
                    ? "border-rose-200/80 hover:border-rose-300"
                    : "border-slate-200"
                }`}
              >
                {/* Checkbox and Main Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => {
                      if (!task.completed) {
                        handleOpenResultModal(task);
                      } else {
                        onToggleTaskComplete(task.id);
                      }
                    }}
                    className={`mt-0.5 shrink-0 transition-transform active:scale-90 ${
                      task.completed ? "text-emerald-600" : "text-slate-400 hover:text-indigo-600"
                    }`}
                    title={task.completed ? t("completed") : t("mark_as_done")}
                  >
                    {task.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold ${
                          task.completed ? "line-through text-slate-500" : "text-slate-900"
                        }`}
                      >
                        {language === "fa" ? task.title : task.titleEn || task.title}
                      </span>

                      {/* Priority Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isHigh
                            ? "bg-rose-100 text-rose-700"
                            : isMedium
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t(task.priority)}
                      </span>

                      {/* Category Badge */}
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                        {t(`category_${task.category}` as any)}
                      </span>

                      {/* Related Proforma / Customer */}
                      {task.relatedProformaId && (
                        <button
                          onClick={() => task.relatedOrderId && onOpenOrder && onOpenOrder(task.relatedOrderId)}
                          className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-mono hover:underline"
                        >
                          PI: {task.relatedProformaId}
                        </button>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Result Note if Completed */}
                    {task.resultNote && (
                      <div className="bg-emerald-50/80 border border-emerald-200 rounded-md p-2 text-xs text-emerald-800 flex items-start gap-1.5 mt-1">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="font-bold text-[11px]">{t("task_result")}: </span>
                          <span className="text-[11px]">{task.resultNote}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: User, Due Date, Actions */}
                <div className="flex items-center gap-3 self-end md:self-center shrink-0 text-xs text-slate-500 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex items-center gap-1.5 font-medium text-slate-600">
                    <User size={13} className="text-slate-400" />
                    <span>{task.assignedToName || "بدون مسئول"}</span>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                    <Clock size={13} className="text-slate-400" />
                    <span>{language === "fa" ? toJalaliDate(task.dueDate) : task.dueDate}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenResultModal(task)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                      title={t("task_result")}
                    >
                      <MessageSquare size={14} />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(task)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                      title={t("edit")}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("confirm_delete"))) {
                          onDeleteTask(task.id);
                        }
                      }}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title={t("delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Task Create / Edit Modal Form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div role="dialog" aria-label="ویرایش کار" className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[92dvh] overflow-y-auto animate-scale-in">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-indigo-400" />
                <h3 className="text-xs font-bold">
                  {editingTask ? t("edit") : t("add_task")}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t("task_title")} *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: پیگیری ترخیص کانتینرهای بارنامه..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("priority")}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  >
                    <option value="high">{t("high")}</option>
                    <option value="medium">{t("medium")}</option>
                    <option value="low">{t("low")}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("category")}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  >
                    <option value="sales">{t("category_sales")}</option>
                    <option value="accounting">{t("category_accounting")}</option>
                    <option value="logistics">{t("category_logistics")}</option>
                    <option value="procurement">{t("category_procurement")}</option>
                    <option value="general">{t("category_general")}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("due_date")}</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  />
                </div>
              </div>

              <GuidedSection guided={guided} title="مسئول، پرونده مرتبط و شرح تکمیلی"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("assigned_to")}</label>
                  <select
                    value={formData.assignedToUserId}
                    onChange={(e) => setFormData({ ...formData, assignedToUserId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  >
                    {db.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {language === "fa" ? u.name : u.nameEn} ({t(`role_${u.role}` as any)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("related_order")}</label>
                  <select
                    value={formData.relatedOrderId || ""}
                    onChange={(e) => {
                      const ordId = Number(e.target.value);
                      const ord = db.orders.find((o) => o.OrderID === ordId);
                      setFormData({
                        ...formData,
                        relatedOrderId: ordId || undefined,
                        relatedProformaId: ord?.ProformaInvoiceID,
                        relatedCustomerName: ord?.CustomerName,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-mono"
                  >
                    <option value="">-- بدون سفارش مرتبط --</option>
                    {db.orders.map((o) => (
                      <option key={o.OrderID} value={o.OrderID}>
                        {o.ProformaInvoiceID} - {o.CustomerName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t("task_description")}</label>
                <textarea
                  rows={2}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="شرح جزئیات، اقدامات لازم و نکات مهم..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t("task_result")}</label>
                <textarea
                  rows={2}
                  value={formData.resultNote || ""}
                  onChange={(e) => setFormData({ ...formData, resultNote: e.target.value })}
                  placeholder="اعلام نتیجه نهایی و گزارش انجام کار..."
                  className="w-full bg-emerald-50/40 border border-emerald-200 rounded-md p-2 text-xs outline-none focus:border-emerald-500"
                />
              </div>

              </GuidedSection>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
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

      {/* Outcome / Result Note Modal */}
      {resultModalTaskId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-3.5 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <h3 className="text-xs font-bold">{t("task_result")}</h3>
              </div>
              <button
                onClick={() => setResultModalTaskId(null)}
                className="text-emerald-200 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                لطفاً نتیجه انجام کار، شماره پیگیری، بازخورد مشتری یا توضیحات پایانی را درج نمایید:
              </p>

              <textarea
                rows={3}
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="نتیجه: مجوز اخذ شد / ال‌سی گشایش یافت / مذاکره انجام گردید..."
                className="w-full bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs outline-none focus:border-emerald-500"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setResultModalTaskId(null)}
                  className="px-3.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleSaveResultNote}
                  className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-2xs"
                >
                  {t("save_result")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
