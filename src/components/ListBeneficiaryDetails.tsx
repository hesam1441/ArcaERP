import { InlineHelp } from "./InlineHelp";
import React, { useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Download, X } from 'lucide-react';
import { AppDatabase } from '../types';
import { getAccountingListProjection } from '../utils/accountingListProjection';
import { formatCurrency } from '../utils/formatters';

export function ListBeneficiaryDetails({ db, view, beneficiaryKey, listName, onClose }: {
  db: AppDatabase; view: ReturnType<typeof getAccountingListProjection>; beneficiaryKey: string;
  listName: string; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const buttons = closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  const owner = view.beneficiaries.find(item => item.key === beneficiaryKey);
  if (!owner) return null;
  const rows = view.rows.filter(row => row.financial.nativeStatus === 'ready').flatMap(row => {
    const share = row.shares.get(beneficiaryKey);
    if (!share || (Math.abs(share.amount) < .005 && Math.abs(share.paid) < .005)) return [];
    const group = db.financialGroups?.find(item => item.id === row.order.ConsolidatedGroupId);
    const cases = group ? view.orders.filter(order => group.orderIds.includes(order.OrderID)).map(order => order.ProformaInvoiceID).join('، ') : row.order.ProformaInvoiceID;
    const rate = row.financial.reportable ? row.financial.profitRate! : null;
    return [{ cases: cases || row.order.ProformaInvoiceID, label: row.order.ProformaInvoiceID,
      currency: row.financial.profitCurrency, amount: share.amount,
      amountUSD: rate === null ? null : share.amount * rate,
      paidUSD: rate === null ? null : share.paid * rate,
      remainingUSD: rate === null ? null : share.remaining * rate }];
  });
  const money = (amount: number | null) => amount === null ? 'نرخ ارز ناقص' : formatCurrency(amount, 'USD');
  const exportExcel = () => {
    const book = XLSX.utils.book_new();
    const data = rows.map(row => ({ 'شماره پرونده‌ها': row.cases, 'پرونده / گروه': row.label,
      'صاحب سهم': owner.name, 'سهم به ارز اصلی': row.amount, 'ارز': row.currency,
      'سهم USD': row.amountUSD ?? '', 'پرداخت‌شده USD': row.paidUSD ?? '', 'مانده USD': row.remainingUSD ?? '' }));
    data.push({ 'شماره پرونده‌ها': 'جمع کل', 'پرونده / گروه': listName, 'صاحب سهم': owner.name,
      'سهم به ارز اصلی': 0, 'ارز': '', 'سهم USD': owner.amountUSD,
      'پرداخت‌شده USD': owner.paidUSD, 'مانده USD': owner.remainingUSD });
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'BeneficiaryCases');
    XLSX.writeFile(book, `${listName}_${owner.name}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="beneficiary-details-title" dir="rtl" className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-5 shadow-xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div><h3 id="beneficiary-details-title" className="font-bold">پرونده‌های سهم {owner.name}</h3><p className="mt-1 text-xs text-slate-500">{listName}</p></div>
        <div className="flex gap-2"><button type="button" onClick={exportExcel} className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-sm text-white"><Download size={16}/>خروجی Excel این صاحب سهم</button><button ref={closeRef} type="button" aria-label="بستن جزئیات صاحب سهم" onClick={onClose} className="rounded border p-2"><X size={18}/></button></div>
      </header>
      {owner.missingFX && <InlineHelp><p className="my-2 text-xs text-amber-800">جمع دلاری فقط شامل پرونده‌های دارای نرخ معتبر است.</p></InlineHelp>}
      <div className="mt-3 overflow-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead><tr><th className="p-2">شماره پرونده / گروه</th><th className="p-2">سهم به ارز اصلی</th><th className="p-2">سهم USD</th><th className="p-2">پرداخت‌شده USD</th><th className="p-2">مانده USD</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t"><td className="p-2"><b dir="ltr">{row.label}</b>{row.cases !== row.label && <small className="mt-1 block">پرونده‌های گروه: {row.cases}</small>}</td><td className="p-2" dir="ltr">{formatCurrency(row.amount, row.currency)}</td><td className="p-2">{money(row.amountUSD)}</td><td className="p-2">{money(row.paidUSD)}</td><td className="p-2">{money(row.remainingUSD)}</td></tr>)}</tbody>
        <tfoot className="border-t-2 bg-indigo-50 font-bold"><tr><td className="p-2">جمع کل</td><td/><td className="p-2">{money(owner.amountUSD)}</td><td className="p-2">{money(owner.paidUSD)}</td><td className="p-2">{money(owner.remainingUSD)}</td></tr></tfoot>
      </table></div>
    </section>
  </div>;
}
