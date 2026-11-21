import React, { lazy, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AppDatabase, Order } from "../types";

const ProformaPrintModal = lazy(() => import("./ProformaPrintModal").then(module => ({ default: module.ProformaPrintModal })));

/** Preview the official document without navigating or replacing the workbench draft. */
export const ProformaPreviewPopup: React.FC<{ order: Order; db: AppDatabase; onClose: () => void; onUpdateOrder?: (order: Order) => void }> = ({ order, db, onClose, onUpdateOrder }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);
  const role = db.currentUser?.role;
  return createPortal(<dialog ref={dialogRef} aria-label={`پیش‌نمایش پروفورما ${order.ProformaInvoiceID}`} onCancel={event => { event.preventDefault(); onClose(); }} className="m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-slate-950/70">
    <Suspense fallback={<div className="grid h-screen place-items-center bg-slate-950/70"><div className="rounded-xl bg-white p-5 text-center text-sm" role="status"><p>در حال آماده‌سازی پیش‌نمایش پروفورما…</p><button type="button" onClick={onClose} className="mt-3 rounded border px-4 py-2 text-xs">بستن پیش‌نمایش</button></div></div>}>
      <ProformaPrintModal onUpdateOrder={onUpdateOrder} order={order} supplier={db.suppliers.find(item => item.SupplierID === order.SupplierID)} customer={db.customers.find(item => item.CustomerID === order.CustomerID)} printTemplateConfig={db.printTemplateConfig} documentTemplates={db.documentTemplates || []} templateEditorDb={db} canPrint={role === "superadmin" || Boolean(role && db.roleDocumentPrintPermissions?.[role])} onClose={onClose}/>
    </Suspense>
  </dialog>, document.body);
};
