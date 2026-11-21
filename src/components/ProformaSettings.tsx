import { InlineHelp } from "./InlineHelp";
import React from "react";
import { AppDatabase, Order, PrintTemplateConfig } from "../types";
import { ProformaPrintModal } from "./ProformaPrintModal";

export const ProformaSettings: React.FC<{ db: AppDatabase; onSaveTemplate: (config: PrintTemplateConfig) => void; onSaveOrder: (order: Order) => void }> = ({ db, onSaveTemplate }) => {
  const base = db.orders[0] || { OrderID: 0, ProformaInvoiceID: "TEMPLATE", items: [], TotalQuantity: 0, ExchangeRate: 1, InvoiceCurrency: "USD", TransactionCurrency: "USD" } as Order;
  const order: Order = { ...base, OrderID: -1, CustomClauses: [], Note: "", printTermsConfig: undefined, printFigurePresets: undefined };
  return <section id="proforma-settings" className="mx-auto my-6 w-full max-w-6xl space-y-3 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm" dir="rtl">
    <header><h2 className="text-base font-bold text-indigo-900">تنظیمات پروفورما</h2><InlineHelp><p className="mt-1 text-xs text-slate-500">قالب عمومی پروفورما؛ تغییرات را در پیش‌نمایش ببینید و سپس ذخیره کنید.</p></InlineHelp></header>
    <ProformaPrintModal settingsMode order={order} supplier={db.suppliers.find(item => item.SupplierID === order.SupplierID)} customer={db.customers.find(item => item.CustomerID === order.CustomerID)} templateEditorDb={db} documentTemplates={db.documentTemplates || []} printTemplateConfig={db.printTemplateConfig} onSaveTemplateConfig={onSaveTemplate} onClose={() => {}} />
  </section>;
};
