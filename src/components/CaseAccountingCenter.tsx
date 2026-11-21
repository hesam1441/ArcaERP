import { InlineHelp } from "./InlineHelp";
import { getCaseFinancials } from "../utils/caseFinancials";
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Landmark, Search, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { AppDatabase, CashPartner, Language, OrderTransaction } from "../types";
import { formatNumber } from "../utils/formatters";
import { calculateProfitBreakdown } from "../utils/profitCalculations";
import { calculateUnifiedProfit, getCaseShareRecipients } from "../utils/caseProfitEngine";
import { convertedTransactionAmount, getCentralCaseLedger, getOrderCommercialTotal, getOrderCurrency, getOrderProfitToInvoiceMultiplier, transactionAmountInOrderCurrency, getOrderQuantityMT } from "../utils/orderAccounting";
import { OrderPaymentLedger } from "./OrderPaymentLedger";

interface Props {
  onSaveParty?: (party: CashPartner) => void;
  db: AppDatabase;
  language: Language;
  onSaveTransaction: (transaction: OrderTransaction) => void;
  onSaveTransactions?: (transactions: OrderTransaction[]) => void;
  onDeleteTransaction: (transactionId: number) => void;
  initialOrderId?: number | null;
}

export const CaseAccountingCenter: React.FC<Props> = ({ db, language, onSaveParty, onSaveTransaction, onSaveTransactions, onDeleteTransaction, initialOrderId }) => {
  const t = (fa: string, en: string) => language === "fa" ? fa : en;
  const [orderId, setOrderId] = useState(initialOrderId || db.orders[0]?.OrderID || 0);
  const [filters, setFilters] = useState({ pi: "", product: "", issuer: "", buyer: "" });
  const filteredOrders = useMemo(() => db.orders.filter((item) => {
    const includes = (value: unknown, query: string) => !query || String(value || "").toLowerCase().includes(query.toLowerCase());
    const issuerName = db.issuerCompanyShares?.find((company) => company.id === item.IssuerCompanyId)?.name || item.SupplierName;
    const productText = (item.items || []).map((line) => [line.ProductName, line.ChemicalName, line.ProductDescription].join(" ")).join(" ");
    return includes(item.ProformaInvoiceID, filters.pi) && includes(productText, filters.product) && includes(issuerName, filters.issuer) && includes(item.CustomerName, filters.buyer);
  }), [db.orders, db.issuerCompanyShares, filters]);
  useEffect(() => {
    if (filteredOrders.length && !filteredOrders.some((item) => item.OrderID === orderId)) setOrderId(filteredOrders[0].OrderID);
  }, [filteredOrders, orderId]);
  useEffect(() => {
    if (initialOrderId && db.orders.some((item) => item.OrderID === initialOrderId)) setOrderId(initialOrderId);
  }, [initialOrderId, db.orders]);
  const order = db.orders.find((item) => item.OrderID === orderId) || db.orders[0];
  const currency = getOrderCurrency(order);
  if (!order) return <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">{t("پرونده‌ای برای حسابداری وجود ندارد.", "No order is available for accounting.")}</div>;

  const centralLedger = getCentralCaseLedger(db, order);
  const transactions = centralLedger.relatedEntries;

  const financial = getCaseFinancials(db, order);
  const profit = financial.profit;
  const invoiceTotal = getOrderCommercialTotal(order);
  const profitRate = getOrderProfitToInvoiceMultiplier(order);
  const unified = calculateUnifiedProfit(order, db.suppliers.find(supplier => supplier.SupplierID === order.SupplierID), db.issuerCompanyShares, db);
  const purchaseCost = unified?.actuals ? unified.actuals.purchase * profitRate : getOrderQuantityMT(order) * Number(order.CostPrice || order.CFRNet || order.NetFob || 0) * profitRate;
  const recordedExpenses = transactions.filter((item) => item.OrderID === order.OrderID && item.TransactionType === "order_expense").reduce((sum, item) => sum + transactionAmountInOrderCurrency(order, item), 0);
  const accountingProfit = profit.totalCaseProfit * profitRate;
  const shares = financial.shares.map(share => ({ ...share, amount: share.amount * profitRate }));
  const allocatedShares = shares.reduce((sum, item) => sum + item.amount, 0);
  const stakeholderBalances = shares.map((share) => {
    const contribution = (db.orderTransactions || []).filter((entry) => entry.TransactionType === "stakeholder_fund_contribution" && entry.OrderID === order.OrderID && entry.PartnerId === share.id).reduce((sum, entry) => sum + convertedTransactionAmount(entry), 0);
    const loaned = (db.orderTransactions || []).filter((entry) => entry.TransactionType === "stakeholder_case_loan" && entry.SourceOrderID === order.OrderID && entry.PartnerId === share.id).reduce((sum, entry) => sum + convertedTransactionAmount(entry), 0);
    const repaid = (db.orderTransactions || []).filter((entry) => entry.TransactionType === "stakeholder_case_loan_repayment" && entry.SourceOrderID === order.OrderID && entry.PartnerId === share.id).reduce((sum, entry) => sum + convertedTransactionAmount(entry), 0);
    const debtReceived = (db.orderTransactions || []).filter((entry) => entry.TransactionType === "stakeholder_case_loan" && entry.OrderID === order.OrderID && entry.PartnerId === share.id).reduce((sum, entry) => sum + convertedTransactionAmount(entry), 0);
    return { ...share, contribution, loaned, repaid, receivable: loaned - repaid, debtReceived, available: Math.max(0, share.amount - contribution) };
  });

  const exportExcel = () => {
    const summaryRows = [
      { Item: t("شماره پروفورما", "Proforma"), Value: order.ProformaInvoiceID, Currency: "" },
      { Item: t("مشتری", "Customer"), Value: order.CustomerName, Currency: "" },
      { Item: t("فروشنده", "Supplier"), Value: order.SupplierName, Currency: "" },
      { Item: "نوع مالکیت", Value: order.TradeOwnership === "own_account" ? "به حساب خودم" : "مشتری", Currency: "" },
      { Item: "مالک اقتصادی", Value: db.cashPartners.find((party) => party.id === order.EconomicOwnerPartyId)?.name || "", Currency: "" },
      { Item: "قرض دریافتی از شرکت‌ها", Value: centralLedger.companyLoanReceipts, Currency: currency },
      { Item: "مانده بدهی به منابع تأمین وجه", Value: centralLedger.fundingDebt, Currency: currency },
      { Item: t("مبلغ پروفورما", "Proforma total"), Value: invoiceTotal, Currency: currency },
      { Item: t("بهای خرید", "Purchase cost"), Value: purchaseCost, Currency: currency },
      { Item: t("سود محاسباتی پرونده", "Calculated case profit"), Value: profit.totalCaseProfit * profitRate, Currency: currency },
      { Item: t("هزینه‌های ثبت‌شده", "Posted expenses"), Value: recordedExpenses, Currency: currency },
      { Item: t("سود/زیان حسابداری", "Accounting profit/loss"), Value: accountingProfit, Currency: currency },
      { Item: t("جمع سهم‌های تعریف‌شده", "Defined shares"), Value: allocatedShares, Currency: currency },
      { Item: t("موجودی قابل مصرف پرونده", "Usable case balance"), Value: centralLedger.caseCashBalance, Currency: currency },
      { Item: t("مانده صندوق پرونده", "Case fund balance"), Value: centralLedger.caseFundBalance, Currency: currency },
      { Item: t("طلب صاحبان سهم", "Stakeholder receivable"), Value: centralLedger.stakeholderReceivable, Currency: currency },
      { Item: t("بدهی به صاحبان سهم", "Stakeholder debt"), Value: centralLedger.stakeholderDebt, Currency: currency },
    ];
    const transactionRows = transactions.sort((a, b) => (a.PaytDate || "").localeCompare(b.PaytDate || "")).map((item) => ({
      Date: item.PaytDate, Type: item.TransactionType || "customer_receipt", Description: item.Description || "", Counterparty: item.Counterparty || "", Amount: item.Amount,
      Currency: item.PaymentCurrency || currency, Rate: item.Exchange_Rate || 1, Equivalent: convertedTransactionAmount(item), FundingSource: db.cashPartners.find((party) => party.id === item.FundingPartyId)?.name || item.FundingPartyName || item.FundingSource || "", FundingPartyID: item.FundingPartyId || "", LinkedTransactionID: item.LinkedTransactionID || "", Account: item.CompanyAccount || "", Reference: item.Slip || "", Note: item.Note || "",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "Ledger");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stakeholderBalances.map((item) => ({ Name: item.name, Role: item.role, ActualShare: item.amount, FundContribution: item.contribution, CaseLoanReceivable: item.receivable, CaseLoanDebt: item.debtReceived, AvailableShare: item.available, Currency: currency }))), "Shares");
    const caseFileName = `${order.ProformaInvoiceID || order.OrderID}_${order.CustomerName || order.SupplierName || "case"}`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    XLSX.writeFile(workbook, `Accounting_${caseFileName}.xlsx`);
  };

  const card = (label: string, value: number, icon: React.ReactNode, tone: string) => <div className={`rounded-xl border p-3 ${tone}`}><div className="flex items-center justify-between text-[11px]"><span>{label}</span>{icon}</div><b className="mt-2 block font-mono text-base">{formatNumber(value)} {currency}</b></div>;

  return <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-[11px] font-bold text-slate-600">{t("شماره پروفورما", "Proforma no.")}<span className="relative mt-1 block"><Search size={14} className="absolute right-2 top-2 text-slate-400"/><input value={filters.pi} onChange={(event) => setFilters({ ...filters, pi: event.target.value })} className="w-full rounded-lg border bg-white py-1.5 pr-7 pl-2 text-xs" placeholder="AR-..."/></span></label>
        <label className="text-[11px] font-bold text-slate-600">{t("نوع ماده / کالا", "Material / product")}<input value={filters.product} onChange={(event) => setFilters({ ...filters, product: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-1.5 text-xs" placeholder={t("نام ماده", "Product name")}/></label>
        <label className="text-[11px] font-bold text-slate-600">{t("صادرکننده", "Issuer")}<input value={filters.issuer} onChange={(event) => setFilters({ ...filters, issuer: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-1.5 text-xs" placeholder={t("نام شرکت", "Company")}/></label>
        <label className="text-[11px] font-bold text-slate-600">{t("خریدار", "Buyer")}<input value={filters.buyer} onChange={(event) => setFilters({ ...filters, buyer: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-1.5 text-xs" placeholder={t("نام خریدار", "Buyer name")}/></label>
        {(filters.pi || filters.product || filters.issuer || filters.buyer) && <button type="button" onClick={() => setFilters({ pi: "", product: "", issuer: "", buyer: "" })} className="sm:col-span-2 xl:col-span-4 inline-flex items-center justify-end gap-1 text-[11px] font-bold text-slate-500"><X size={13}/>{t("پاک‌کردن فیلترها", "Clear filters")} — {filteredOrders.length} {t("پرونده", "orders")}</button>}
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex-1 text-xs font-bold text-slate-600">{t("انتخاب پرونده / پروفورما", "Select order / proforma")}<select value={order.OrderID} onChange={(event) => setOrderId(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">{filteredOrders.map((item) => <option key={item.OrderID} value={item.OrderID}>{item.ProformaInvoiceID} — {item.CustomerName} — {db.issuerCompanyShares?.find((company) => company.id === item.IssuerCompanyId)?.name || item.SupplierName}</option>)}</select>{filteredOrders.length === 0 && <span className="mt-1 block text-[10px] text-rose-600">{t("پرونده‌ای با این فیلترها پیدا نشد.", "No order matches these filters.")}</span>}</label>
        <button onClick={exportExcel} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white"><Download size={15}/>{t("خروجی اکسل کامل پرونده", "Export full case workbook")}</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
        {card(t("مبلغ پروفورما", "Proforma total"), invoiceTotal, <Landmark size={15}/>, "border-blue-100 bg-blue-50 text-blue-800")}
        {card(t("بهای خرید استخراج‌شده", "Calculated purchase cost"), purchaseCost, <TrendingDown size={15}/>, "border-amber-100 bg-amber-50 text-amber-800")}
        {card(t("سود محاسباتی پرونده", "Calculated case profit"), profit.totalCaseProfit * profitRate, <TrendingUp size={15}/>, "border-indigo-100 bg-indigo-50 text-indigo-800")}
        {card(t("هزینه‌های ثبت‌شده", "Posted expenses"), recordedExpenses, <TrendingDown size={15}/>, "border-rose-100 bg-rose-50 text-rose-800")}
        {card(t("سود/زیان پس از هزینه‌ها", "Profit/loss after expenses"), accountingProfit, <TrendingUp size={15}/>, accountingProfit < 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-100 bg-emerald-50 text-emerald-800")}
        {card(t("موجودی قابل مصرف پرونده", "Usable case balance"), centralLedger.caseCashBalance, <Landmark size={15}/>, centralLedger.caseCashBalance < 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-cyan-100 bg-cyan-50 text-cyan-800")}
        {card(t("مانده صندوق پرونده", "Case fund balance"), centralLedger.caseFundBalance, <Landmark size={15}/>, "border-violet-100 bg-violet-50 text-violet-800")}
        {card(t("طلب صاحبان سهم", "Stakeholder receivable"), centralLedger.stakeholderReceivable, <Users size={15}/>, "border-amber-100 bg-amber-50 text-amber-800")}
        {card(t("بدهی به صاحبان سهم", "Stakeholder debt"), centralLedger.stakeholderDebt, <Users size={15}/>, "border-rose-100 bg-rose-50 text-rose-800")}
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between"><div><h3 className="flex items-center gap-2 text-sm font-bold"><Users size={16} className="text-indigo-600"/>{t("سهم‌های تعریف‌شده پرونده", "Defined case shares")}</h3><InlineHelp><p className="text-[10px] text-slate-500">{t("این مقادیر مستقیماً از تعریف سود و پورسانت همان پروفورما خوانده می‌شوند.", "Values are read directly from this proforma's profit and commission setup.")}</p></InlineHelp></div><b className="font-mono text-sm text-indigo-700">{formatNumber(allocatedShares)} {currency}</b></div>
      {stakeholderBalances.length ? <div className="overflow-x-auto"><table className="min-w-full text-right text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">{t("صاحب سهم", "Stakeholder")}</th><th>{t("سهم واقعی", "Actual share")}</th><th>{t("واریز به صندوق", "Fund contribution")}</th><th>{t("طلبِ قرض پرونده‌ها", "Case-loan receivable")}</th><th>{t("بدهی دریافتی پرونده", "Case debt received")}</th><th>{t("مانده قابل دریافت", "Available share")}</th></tr></thead><tbody>{stakeholderBalances.map((item) => <tr key={item.id} className="border-t"><td className="p-2"><b>{item.name}</b><small className="mr-1 text-slate-400">{item.role}</small></td><td className="font-mono">{formatNumber(item.amount)}</td><td className="font-mono text-violet-700">{formatNumber(item.contribution)}</td><td className="font-mono text-amber-700">{formatNumber(item.receivable)}</td><td className="font-mono text-rose-700">{formatNumber(item.debtReceived)}</td><td className="font-mono font-bold text-emerald-700">{formatNumber(item.available)} {currency}</td></tr>)}</tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-400">{t("هنوز سهمی در پروفورما تعریف نشده است.", "No shares have been defined for this proforma.")}</p>}
    </div>

    <OrderPaymentLedger key={`central-ledger-${order.OrderID}`} db={db} language={language} fixedOrderId={order.OrderID} onSaveParty={onSaveParty} onSaveTransaction={onSaveTransaction} onSaveTransactions={onSaveTransactions} onDeleteTransaction={onDeleteTransaction}/>
  </div>;
};
