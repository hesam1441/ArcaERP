import { InlineHelp } from "./InlineHelp";
import React, { useState } from "react";
import { AppDatabase, CashPartner } from "../types";
import { getFundingActivity } from "../utils/paymentFunding";
import { formatNumber } from "../utils/formatters";
import { getPartyDirectory } from "../utils/partyDirectory";
import { exportToCSV } from "../services/storageService";
import { normalizePartnerName } from "../utils/partnerIdentity";

export const PaymentFundingPanel = ({ db, onSaveParty, onSelect, onOpenOrder }: { db: AppDatabase; onSaveParty?: (party: CashPartner) => void; onSelect?: (id: string) => void; onOpenOrder?: (id: number) => void }) => {
  const [name, setName] = useState("");
  const [partyId, setPartyId] = useState("");
  const [company, setCompany] = useState<CashPartner["fundingCompany"] | "">("");
  const [message, setMessage] = useState("");
  const claims = getFundingActivity(db);
  const parties = getPartyDirectory(db);
  const totals = new Map<string, { owner: string; name: string; currency: string; funded: number; repaid: number; balance: number }>();
  claims.forEach((claim) => {
    const key = `${claim.payment.FundingPartyId}:${claim.order.TradeOwnership === "own_account" ? claim.order.EconomicOwnerPartyId : "business"}:${claim.currency}`;
    const owner = claim.order.TradeOwnership === "own_account" ? db.cashPartners.find((party) => party.id === claim.order.EconomicOwnerPartyId)?.name || "مالک پرونده" : "عملیات شرکت";
    const row = totals.get(key) || { owner, name: claim.name, currency: claim.currency, funded: 0, repaid: 0, balance: 0 };
    row.funded += claim.payment.Amount; row.repaid += claim.repaid; row.balance += claim.outstanding;
    totals.set(key, row);
  });
  const save = () => {
    if (!onSaveParty) return;
    const normalized = normalizePartnerName(name);
    const existing = parties.find((party) => party.id === partyId) || parties.find((party) => [party.name, party.nameEn, ...(party.aliases || [])].some((value) => value && normalizePartnerName(value) === normalized));
    if (!existing && !normalized) return setMessage("شخص یا شرکت موجود را انتخاب کنید یا نام جدید وارد کنید.");
    const party: CashPartner = existing ? { ...existing, isFundingSource: true } : { id: crypto.randomUUID(), name: name.trim(), entityType: "person", isFundingSource: true };
    if (company) { party.fundingCompany = company; party.entityType = "company"; }
    if (db.hiddenPartyIds?.includes(party.id)) return setMessage("این شخص در فهرست بایگانی است؛ ابتدا از بخش اشخاص و شرکت‌ها آن را بازیابی کنید.");
    onSaveParty(party); onSelect?.(party.id); setName(""); setPartyId(""); setMessage("منبع به فهرست مشترک اشخاص و شرکت‌ها متصل شد. تعریف منبع به‌تنهایی گردش مالی ایجاد نمی‌کند.");
  };
  return <section className="space-y-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs" dir="rtl">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-indigo-800">منابع تأمین وجه و مانده بازپرداخت</h3><button type="button" onClick={() => exportToCSV("ARCA_Funding_Claims.csv", claims.map((claim) => ({ پرونده: claim.order.ProformaInvoiceID, نوع: claim.order.TradeOwnership === "own_account" ? "به حساب خودم" : "مشتری", مالک: db.cashPartners.find((p) => p.id === claim.order.EconomicOwnerPartyId)?.name || "عملیات شرکت", خریدار_سند: claim.order.CustomerName, منبع: claim.name, شرکت: db.cashPartners.find((p) => p.id === claim.payment.FundingPartyId)?.fundingCompany || "", سند: claim.payment.TransactionID, تاریخ: claim.payment.PaytDate, ارز: claim.currency, نوع_تأمین: claim.ownerFunded ? "منابع خود مالک" : "قرض", اصل_قرض: claim.ownerFunded ? 0 : claim.payment.Amount, تأمین_مالک: claim.ownerFunded ? claim.payment.Amount : 0, بازپرداخت: claim.repaid, مانده: claim.outstanding })))} className="rounded border px-2 py-1 text-indigo-700">خروجی گزارش منابع و بدهی‌ها</button></div>
    <InlineHelp><p className="leading-6 text-slate-500">پرداخت مالک از منابع خودش، تأمین داخلی پرونده است و قرض ایجاد نمی‌کند. تأمین از شرکت یا شخص دیگر، طلب منبع از مالک پرونده است. بازپرداخت به سند اصلی متصل و مانده ارزها جداست.</p></InlineHelp>
    {onSaveParty && <div className="flex flex-wrap gap-2"><select aria-label="شخص یا شرکت موجود" value={partyId} onChange={(e) => setPartyId(e.target.value)} className="min-w-40 rounded border p-2"><option value="">انتخاب از اشخاص و شرکت‌ها</option>{parties.filter((p) => !db.hiddenPartyIds?.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input aria-label="نام منبع جدید" disabled={Boolean(partyId)} value={name} onChange={(e) => setName(e.target.value)} placeholder="یا نام شخص / شرکت جدید" className="rounded border p-2"/><select aria-label="اتصال منبع به دفتر شرکت" value={company} onChange={(e) => setCompany(e.target.value as typeof company)} className="rounded border p-2"><option value="">منبع مستقل</option><option value="Arcatav">آرکاتاو</option><option value="Berakem">براکم</option><option value="Arovin">آروین</option></select><button type="button" onClick={save} className="rounded bg-indigo-600 px-3 py-2 font-bold text-white">افزودن منبع مشترک</button></div>}
    {message && <p role="status" className="text-indigo-700">{message}</p>}
    <InlineHelp><p className="text-slate-400">جمع گزارش فقط شامل پرونده‌های کامل و غیرصوری است؛ سابقهٔ سایر پرونده‌ها در دفتر همان پرونده باقی می‌ماند.</p></InlineHelp>
    <div className="overflow-auto"><table className="w-full text-right"><thead><tr><th className="p-2">منبع</th><th>ارز</th><th>تأمین وجه</th><th>بازپرداخت</th><th>بدهکار / مالک</th><th>بدهی به منبع</th></tr></thead><tbody>{[...totals].map(([key, row]) => <tr key={key} className="border-t"><td className="p-2">{row.name}</td><td>{row.currency}</td><td>{formatNumber(row.funded)}</td><td>{formatNumber(row.repaid)}</td><td>{row.owner}</td><td className="font-bold text-rose-700">{formatNumber(row.balance)}</td></tr>)}</tbody></table></div>
    <div className="max-h-64 overflow-auto"><table className="w-full text-right"><thead><tr><th className="p-2">پرونده / تاریخ</th><th>منبع ← دریافت‌کننده</th><th>شرح / مرجع سند</th><th>مانده</th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.payment.TransactionID} className="border-t"><td className="p-2"><button type="button" disabled={!onOpenOrder} onClick={() => onOpenOrder?.(claim.order.OrderID)} className="text-indigo-700">{claim.order.ProformaInvoiceID}</button><div>{claim.payment.PaytDate}</div></td><td>{claim.name} ← {claim.payment.Counterparty || "—"}<b className="block">{claim.ownerFunded ? "منابع خود مالک؛ بدون قرض" : "قرض / تأمین از شخص دیگر"}</b><div className="text-violet-700">{claim.order.TradeOwnership === "own_account" ? `مالک: ${db.cashPartners.find((p) => p.id === claim.order.EconomicOwnerPartyId)?.name || "—"} · خریدار سند: ${claim.order.CustomerName}` : "پرونده مشتری"}</div></td><td>{claim.payment.Description || "—"}<div>#{claim.payment.TransactionID} · {claim.payment.Slip || "—"}</div>{claim.repayments.map((entry) => <div key={entry.TransactionID}>بازپرداخت #{entry.TransactionID} · {entry.PaytDate} · {formatNumber(entry.Amount)} {claim.currency}</div>)}</td><td>{formatNumber(claim.outstanding)} {claim.currency}</td></tr>)}</tbody></table></div>
    {!claims.length && <p className="text-slate-400">هنوز پرداختی با منبع مشخص ثبت نشده است.</p>}
    {(db.orderTransactions || []).some((entry) => (entry.FundingSource === "other" || entry.FundingSource === "arcatav") && !entry.FundingPartyId && ["supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(entry.TransactionType || "")) && <p className="rounded bg-amber-50 p-2 text-amber-800">پرداخت‌های قدیمی بدون اتصال به حساب مشترک در جمع منابع بالا نیستند؛ شخص یا شرکت تأمین‌کنندهٔ آن‌ها را از طریق ویرایش سند مشخص کنید. اسناد بازپرداخت قدیمی نیز باید با اصل بدهی تطبیق داده شوند.</p>}
  </section>;
};
