import { InlineHelp } from "./InlineHelp";
import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Key,
  Edit,
  Trash2,
  Mail,
  Phone,
  UserCheck,
  Lock,
} from "lucide-react";
import { AppUser, UserRole, AppDatabase, Language, ActiveTab, Order } from "../types";
import { getTranslation } from "../i18n/translations";
import { passwordHash } from "../utils/auth";

interface UserManagementViewProps {
  db: AppDatabase;
  language: Language;
  onSaveUser: (user: AppUser) => void;
  onDeleteUser: (userId: string) => void;
  onSwitchUser: (user: AppUser) => void;
  onSaveRolePermissions: (permissions: Partial<Record<UserRole, ActiveTab[]>>) => void;
  onSaveRoleDocumentPrintPermissions: (permissions: Partial<Record<UserRole, boolean>>) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  db,
  language,
  onSaveUser,
  onDeleteUser,
  onSwitchUser,
  onSaveRolePermissions,
  onSaveRoleDocumentPrintPermissions,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const t = (key: any) => getTranslation(language, key);

  const initialUser: AppUser = {
    id: "user_" + Date.now(),
    username: "",
    name: "",
    nameEn: "",
    email: "",
    role: "sales_rep",
    active: true,
    phone: "",
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const [formData, setFormData] = useState<AppUser>(initialUser);
  const [newPassword, setNewPassword] = useState("");
  const [permissionRole, setPermissionRole] = useState<UserRole>("sales_rep");
  const defaultPermissions: Record<UserRole, ActiveTab[]> = { superadmin: ["dashboard","proforma","accounting","company_finance","customer_accounts","correspondence","cash","calendar","tasks","customers","products","operations","logistics","users","access_import","backup","settings"], sales_manager: ["dashboard","proforma","tasks","calendar","customers","products","logistics"], accountant: ["dashboard","accounting","customer_accounts","correspondence","cash","operations","tasks"], logistics: ["dashboard","logistics","tasks","calendar"], sales_rep: ["dashboard","proforma","tasks","customers","products"], partner_office: ["partner_portal"], sales_agent: ["partner_portal"], company_finance: ["company_finance"] };
  const allTabs: { id: ActiveTab; fa: string; en: string }[] = [{id:"dashboard",fa:"داشبورد",en:"Dashboard"},{id:"proforma",fa:"پیش‌فاکتور",en:"Proforma"},{id:"accounting",fa:"حسابداری",en:"Accounting"},{id:"company_finance",fa:"دفتر مالی شرکت‌ها",en:"Company finance"},{id:"customer_accounts",fa:"حساب مشتریان",en:"Customer accounts"},{id:"correspondence",fa:"مکاتبات اداری",en:"Office correspondence"},{id:"cash",fa:"خزانه",en:"Treasury"},{id:"operations",fa:"عملیات تجاری",en:"Operations"},{id:"logistics",fa:"لجستیک",en:"Logistics"},{id:"tasks",fa:"تسک‌ها",en:"Tasks"},{id:"calendar",fa:"تقویم",en:"Calendar"},{id:"customers",fa:"مشتریان و تأمین‌کنندگان",en:"Customers & suppliers"},{id:"products",fa:"کالاها",en:"Products"},{id:"users",fa:"کاربران",en:"Users"},{id:"access_import",fa:"ورود Access",en:"Access import"},{id:"backup",fa:"پشتیبان",en:"Backup"},{id:"settings",fa:"تنظیمات",en:"Settings"}];
  const roleTabs = db.rolePermissions?.[permissionRole] || defaultPermissions[permissionRole];
  const toggleRoleTab = (tab: ActiveTab) => onSaveRolePermissions({ ...db.rolePermissions, [permissionRole]: roleTabs.includes(tab) ? roleTabs.filter((item) => item !== tab) : [...roleTabs, tab] });
  const canRolePrint = permissionRole === "superadmin" || db.roleDocumentPrintPermissions?.[permissionRole] === true;

  const handleOpenNew = () => {
    setEditingUser(null);
    setFormData({
      id: "user_" + Date.now(),
      username: "",
      name: "",
      nameEn: "",
      email: "",
      role: "sales_rep",
      active: true,
      phone: "",
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setIsModalOpen(true);
    setNewPassword("");
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormData({ ...user });
    setIsModalOpen(true);
    setNewPassword("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.username.trim()) return;
    if (formData.role === "company_finance" && !formData.companyId) return;

    onSaveUser({ ...formData, companyId: formData.role === "company_finance" ? formData.companyId : undefined, passwordHash: newPassword ? await passwordHash(newPassword) : formData.passwordHash, passwordResetRequested: false });
    setIsModalOpen(false);
  };

  const roleBadges: Record<UserRole, { bg: string; text: string; labelFa: string; labelEn: string }> = {
    superadmin: {
      bg: "bg-purple-100 border-purple-200",
      text: "text-purple-800",
      labelFa: "مدیر ارشد (Super Admin)",
      labelEn: "Super Admin",
    },
    sales_manager: {
      bg: "bg-indigo-100 border-indigo-200",
      text: "text-indigo-800",
      labelFa: "مدیر بازرگانی (Sales Manager)",
      labelEn: "Sales Manager",
    },
    accountant: {
      bg: "bg-emerald-100 border-emerald-200",
      text: "text-emerald-800",
      labelFa: "حسابدار ارشد (Senior Accountant)",
      labelEn: "Senior Accountant",
    },
    logistics: {
      bg: "bg-blue-100 border-blue-200",
      text: "text-blue-800",
      labelFa: "کارشناس لجستیک (Logistics)",
      labelEn: "Logistics Specialist",
    },
    sales_rep: {
      bg: "bg-amber-100 border-amber-200",
      text: "text-amber-800",
      labelFa: "کارشناس فروش (Sales Executive)",
      labelEn: "Sales Executive",
    },
    partner_office: {
      bg: "bg-cyan-100 border-cyan-200",
      text: "text-cyan-800",
      labelFa: "کاربر دفتر خارجی",
      labelEn: "Partner Office User",
    },
    sales_agent: { bg: "bg-violet-100 border-violet-200", text: "text-violet-800", labelFa: "ایجنت فروش", labelEn: "Sales Agent" },
    company_finance: { bg: "bg-cyan-100 border-cyan-200", text: "text-cyan-800", labelFa: "کاربر مالی شرکت زیرمجموعه", labelEn: "Subsidiary Finance User" },
  };

  return (
    <div id="user-management-view" className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-800">{t("users_title")}</h2>
          </div>
          <InlineHelp><p className="text-xs text-slate-500 mt-0.5">{t("users_desc")}</p></InlineHelp>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenNew}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <UserPlus size={14} />
            <span>{t("add_user")}</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-bold text-purple-950">{language === "fa" ? "دسترسی هر نقش" : "Role permissions"}</h3><p className="mt-1 text-[11px] text-purple-800">{language === "fa" ? "فقط مدیر ارشد می‌تواند بخش‌های مجاز هر نقش را تغییر دهد." : "Only Super Admin can change which sections each role can access."}</p></div><select value={permissionRole} onChange={(e)=>setPermissionRole(e.target.value as UserRole)} className="rounded-md border border-purple-200 bg-white p-2 text-xs">{Object.keys(roleBadges).map((role)=><option key={role} value={role}>{language === "fa" ? roleBadges[role as UserRole].labelFa : roleBadges[role as UserRole].labelEn}</option>)}</select></div>
        <div className="flex flex-wrap gap-2">{allTabs.map((tab)=><label key={tab.id} className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs ${roleTabs.includes(tab.id)?"border-purple-300 bg-white text-purple-800":"border-purple-100 bg-purple-50 text-slate-500"}`}><input className="mr-1.5 accent-purple-600" type="checkbox" checked={roleTabs.includes(tab.id)} onChange={()=>toggleRoleTab(tab.id)}/>{language === "fa" ? tab.fa : tab.en}</label>)}</div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-900"><input type="checkbox" checked={canRolePrint} disabled={permissionRole === "superadmin"} onChange={(e) => onSaveRoleDocumentPrintPermissions({ ...db.roleDocumentPrintPermissions, [permissionRole]: e.target.checked })} className="accent-purple-600" />{language === "fa" ? "اجازهٔ چاپ اسناد تجاری (PI، Invoice، Packing List و COO)" : "Allow printing commercial documents (PI, Invoice, Packing List and COO)"}</label>
      </div>

      {/* Current Logged in User Bar */}
      <div className="bg-slate-900 text-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center text-purple-300 font-bold">
            {db.currentUser?.name?.[0] || "U"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">{t("logged_in_as")}</span>
              <span className="font-bold text-white">
                {language === "fa" ? db.currentUser?.name : db.currentUser?.nameEn || db.currentUser?.name}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/40">
                {language === "fa" ? roleBadges[db.currentUser?.role || "superadmin"]?.labelFa : roleBadges[db.currentUser?.role || "superadmin"]?.labelEn}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {db.currentUser?.email} | @{db.currentUser?.username}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-purple-200">{language === "fa" ? "مدیریت کاربران و سطح دسترسی فقط برای مدیر ارشد فعال است." : "User and access management is restricted to Super Admin."}</div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {db.users.map((user) => {
          const badge = roleBadges[user.role] || roleBadges.sales_rep;
          const isCurrent = db.currentUser?.id === user.id;

          return (
            <div
              key={user.id}
              className={`bg-white border rounded-xl p-4 shadow-2xs space-y-3 transition-all ${
                isCurrent ? "border-purple-400 ring-1 ring-purple-400/30 bg-purple-50/10" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                    {user.name[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">
                      {language === "fa" ? user.name : user.nameEn || user.name}
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">@{user.username}</span>
                    {user.passwordResetRequested && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">{language === "fa" ? "درخواست بازیابی" : "Reset requested"}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(user)}
                    className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-slate-100"
                    title={t("edit")}
                  >
                    <Edit size={13} />
                  </button>
                  {db.users.length > 1 && (
                    <button
                      onClick={() => {
                        if (confirm(t("confirm_delete"))) {
                          onDeleteUser(user.id);
                        }
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title={t("delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Role & Active Status */}
              <div className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                  {language === "fa" ? badge.labelFa : badge.labelEn}
                </span>

                <span className={`flex items-center gap-1 text-[11px] ${user.active ? "text-emerald-600" : "text-slate-400"}`}>
                  {user.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span>{user.active ? t("active") : "غیرفعال"}</span>
                </span>
              </div>

              {/* Contact Info */}
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500 font-mono">
                {user.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail size={12} className="text-slate-400 shrink-0" />
                    <span>{user.email}</span>
                  </div>
                )}
                {user.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    <span>{user.phone}</span>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* User Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="p-3.5 bg-purple-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-purple-300" />
                <h3 className="text-xs font-bold">{editingUser ? t("edit") : t("add_user")}</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-purple-200 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-3 text-xs">
              {formData.role === "partner_office" && <PartnerCompanyAssignment user={formData} suppliers={db.suppliers} onChange={setFormData}/>} 
              {formData.role === "sales_agent" && <AgentAssignment user={formData} orders={db.orders} onChange={setFormData}/>} 

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("fullname")} *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: رضا مرادی"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("fullname_en")}</label>
                  <input
                    type="text"
                    placeholder="e.g. Reza Moradi"
                    value={formData.nameEn || ""}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{language === "fa" ? "رمز عبور" : "Password"} {editingUser ? `(${language === "fa" ? "برای حفظ رمز خالی بگذارید" : "leave blank to keep"})` : "*"}</label>
                <input type="password" required={!editingUser} minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none" placeholder={language === "fa" ? "حداقل ۶ کاراکتر" : "At least 6 characters"} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("username")} *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: moradi"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("role")} *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none"
                  >
                    <option value="superadmin">{t("role_superadmin")}</option>
                    <option value="sales_manager">{t("role_sales_manager")}</option>
                    <option value="accountant">{t("role_accountant")}</option>
                    <option value="logistics">{t("role_logistics")}</option>
                    <option value="sales_rep">{t("role_sales_rep")}</option>
                    <option value="partner_office">کاربر دفتر خارجی / Partner Office</option>
                    <option value="sales_agent">ایجنت فروش / Sales Agent</option>
                    <option value="company_finance">کاربر دفتر مالی شرکت / Company Finance</option>
                  </select>
                </div>
              </div>

              {formData.role === "company_finance" && <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <div className="mb-2 text-xs font-bold text-cyan-950">دفتر مستقل شرکت</div>
                <label className="block text-xs text-slate-600">شرکت<select required value={formData.companyId || ""} onChange={(e) => { const companyId = (e.target.value || undefined) as AppUser["companyId"]; setFormData({ ...formData, companyId, preferredPortalLanguage: companyId === "arovin" ? "en" : formData.preferredPortalLanguage || "en" }); }} className="mt-1 w-full rounded-md border bg-white p-2">
                  <option value="">انتخاب شرکت</option><option value="berakem">Berakem / براکم</option><option value="arovin">Arovin / اروین</option>
                </select></label>
                <label className="mt-2 block text-xs text-slate-600">زبان کاربر<select value={formData.preferredPortalLanguage || "en"} onChange={(e) => setFormData({ ...formData, preferredPortalLanguage: e.target.value as "en" | "tr" })} className="mt-1 w-full rounded-md border bg-white p-2"><option value="en">English</option>{formData.companyId === "berakem" && <option value="tr">Türkçe</option>}</select></label>
                <InlineHelp><p className="mt-2 text-[10px] leading-5 text-cyan-900">این حساب به اطلاعات مشتریان، پروفورما و حسابداری مرکزی آرکا دسترسی ندارد. تغییر شرکت، دسترسی این کاربر را به دفتر شرکت انتخاب‌شده منتقل می‌کند.</p></InlineHelp>
              </div>}

              {(formData.role === "partner_office" || formData.role === "sales_agent") && <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3"><div className="mb-2 text-xs font-bold text-cyan-950">{formData.role === "sales_agent" ? "پرونده‌های قابل نمایش ایجنت" : "محدوده دسترسی دفتر خارجی"}</div><label className="block text-xs text-slate-600">زبان پیش‌فرض<select value={formData.preferredPortalLanguage || "en"} onChange={(e) => setFormData({ ...formData, preferredPortalLanguage: e.target.value as "en" | "tr" })} className="mt-1 w-full rounded-md border p-2"><option value="en">English</option><option value="tr">Türkçe</option></select></label><div className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border bg-white p-2">{db.orders.map((order) => <label key={order.OrderID} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={(formData.accessibleOrderIds || []).includes(order.OrderID)} onChange={(e) => setFormData({ ...formData, accessibleOrderIds: e.target.checked ? [...(formData.accessibleOrderIds || []), order.OrderID] : (formData.accessibleOrderIds || []).filter((id) => id !== order.OrderID) })}/><span className="font-mono text-indigo-700">{order.ProformaInvoiceID}</span><span>{order.SupplierName} — {order.CustomerName}</span></label>)}</div><p className="mt-2 text-[10px] text-cyan-800">{formData.role === "sales_agent" ? "ایجنت فقط مدارک مجاز و صورت‌حساب قابل ارائه به خودش را از سمت سرور دریافت می‌کند." : "این کاربر فقط پرونده‌های انتخاب‌شده را دریافت می‌کند و سود داخلی یا سایر اطلاعات سیستم از سمت سرور برای او ارسال نمی‌شود."}</p></div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("email")}</label>
                  <input
                    type="email"
                    placeholder="demo@example.invalid"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t("phone")}</label>
                  <input
                    type="text"
                    placeholder="+98-912-..."
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-active-cb"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="user-active-cb" className="text-xs text-slate-700">
                  {t("active_user")}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-2xs"
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

const AgentAssignment = ({ user, orders, onChange }: { user: AppUser; orders: Order[]; onChange: (user: AppUser) => void }) => {
  const names = [...new Set(orders.flatMap((order) => [
    order.profitPlan?.agentName,
    ...(order.customShares || []).filter((share) => /agent|ایجنت/i.test(`${share.role || ""} ${share.id}`)).map((share) => share.partnerName),
  ]).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fa"));
  return <div className="rounded-xl border border-violet-200 bg-violet-50 p-3"><div className="mb-2 text-xs font-bold text-violet-950">تعیین ایجنت و دسترسی خودکار به پروفورماهای او</div><label className="block text-xs text-slate-700">نام ایجنت ثبت‌شده در پروفورما<select value={user.agentName || ""} onChange={(e) => onChange({ ...user, agentName: e.target.value, accessibleOrderIds: [] })} className="mt-1 w-full rounded-md border border-violet-200 bg-white p-2"><option value="">انتخاب ایجنت...</option>{names.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><InlineHelp><p className="mt-2 text-[10px] text-violet-800">فقط پروفورماهایی که همین نام ایجنت در آن‌ها ثبت شده‌اند، به‌صورت خودکار در پرتال فارسی او نمایش داده می‌شوند.</p></InlineHelp></div>;
};

const PartnerCompanyAssignment = ({ user, suppliers, onChange }: { user: AppUser; suppliers: AppDatabase["suppliers"]; onChange: (user: AppUser) => void }) => <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3"><div className="mb-2 text-xs font-bold text-cyan-950">تعیین شرکت دفتر خارجی</div><label className="block text-xs text-slate-700">شرکت / تأمین‌کننده<select value={user.assignedSupplierIds?.[0] || ""} onChange={(e) => onChange({ ...user, assignedSupplierIds: e.target.value ? [Number(e.target.value)] : [], accessibleOrderIds: [] })} className="mt-1 w-full rounded-md border border-cyan-200 bg-white p-2"><option value="">انتخاب شرکت...</option>{suppliers.map((supplier) => <option key={supplier.SupplierID} value={supplier.SupplierID}>{supplier.SupplierName}</option>)}</select></label><InlineHelp><p className="mt-2 text-[10px] text-cyan-800">پس از انتخاب شرکت، فقط پرونده‌های همان شرکت برای دفتر خارجی از سمت سرور ارسال می‌شود.</p></InlineHelp></div>;
