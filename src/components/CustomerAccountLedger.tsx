import { InlineHelp } from "./InlineHelp";
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Search, Users } from "lucide-react";
import { AppDatabase, Language, Order, OrderTransaction } from "../types";
import { formatNumber } from "../utils/formatters";
import { convertedTransactionAmount, transactionAmountInOrderCurrency, temporaryCreditRepaymentTargetAmount, getOrderCommercialTotal, getOrderCurrency, isExcludedFromFinancialCalculations, normalizeCurrency } from "../utils/orderAccounting";

interface Props {
  db: AppDatabase;
  language: Language;
  onOpenOrder?: (orderId: number) => void;
}

type LedgerRow = {
  key: string;
  date: string;
  orderId: number;
  proforma: string;
  description: string;
  reference: string;
  currency: string;
  debit: number;
  credit: number;
  sortOrder: number;
};

const normalizedName = (value?: string) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
const customerKeyForOrder = (order: Order) => Number(order.CustomerID) > 0 ? `id:${order.CustomerID}` : `name:${normalizedName(order.CustomerName)}`;

const transactionLabel = (item: OrderTransaction, side: "source" | "target", fa: boolean) => {
  if (item.TransactionType === "customer_receipt") return fa ? "دریافت از مشتری" : "Customer receipt";
  if (item.TransactionType === "customer_refund") return fa ? "عودت وجه به مشتری" : "Customer refund";
  if (item.TransactionType === "credit_allocation") return side === "source" ? (fa ? "انتقال اعتبار به پرونده دیگر" : "Credit allocated to another order") : (fa ? "اعتبار دریافتی از پرونده دیگر" : "Credit applied from another order");
  if (item.TransactionType === "temporary_credit_allocation") return side === "source" ? (fa ? "اعتبار امانی واگذارشده" : "Temporary credit provided") : (fa ? "اعتبار امانی دریافتی" : "Temporary credit received");
  if (item.TransactionType === "temporary_credit_repayment") return side === "source" ? (fa ? "بازگشت اعتبار امانی" : "Temporary credit restored") : (fa ? "بازپرداخت اعتبار امانی" : "Temporary credit repayment");
  return item.Description || (fa ? "سند حسابداری" : "Accounting entry");
};

export const CustomerAccountLedger: React.FC<Props> = ({ db, language, onOpenOrder }) => {
  const fa = language === "fa";
  const t = (faText: string, enText: string) => fa ? faText : enText;
  const customers = useMemo(() => {
    const entries = new Map<string, { key: string; name: string; orderCount: number }>();
    db.customers.forEach((customer) => entries.set(`id:${customer.CustomerID}`, { key: `id:${customer.CustomerID}`, name: customer.CustomerName, orderCount: 0 }));
    db.orders.forEach((order) => {
      const key = customerKeyForOrder(order);
      if (!key || key === "name:") return;
      const current = entries.get(key);
      entries.set(key, { key, name: current?.name || order.CustomerName || t("مشتری بدون نام", "Unnamed customer"), orderCount: (current?.orderCount || 0) + 1 });
    });
    return [...entries.values()].filter((item) => item.orderCount > 0).sort((a, b) => a.name.localeCompare(b.name, fa ? "fa" : "en"));
  }, [db.customers, db.orders, fa]);
  const [customerKey, setCustomerKey] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [currency, setCurrency] = useState("ALL");
  const [search, setSearch] = useState("");
  const selectedKey = customers.some((item) => item.key === customerKey) ? customerKey : customers[0]?.key || "";
  const selectedCustomer = customers.find((item) => item.key === selectedKey);
  const customerOrders = useMemo(() => db.orders.filter((order) => customerKeyForOrder(order) === selectedKey && order.TradeOwnership !== "own_account" && !isExcludedFromFinancialCalculations(order)), [db.orders, selectedKey]);
  const supplierNames = useMemo(() => [...new Set<string>(customerOrders.map((order) => String(order.SupplierName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, fa ? "fa" : "en")), [customerOrders, fa]);
  const ledgerOrders = useMemo(() => {
    const query = normalizedName(supplierQuery);
    return query ? customerOrders.filter((order) => normalizedName(order.SupplierName).includes(query)) : customerOrders;
  }, [customerOrders, supplierQuery]);
  const orderById = useMemo(() => new Map(db.orders.map((order) => [order.OrderID, order])), [db.orders]);
  const selectedOrderIds = useMemo(() => new Set(ledgerOrders.map((order) => order.OrderID)), [ledgerOrders]);

  const allRows = useMemo(() => {
    const rows: LedgerRow[] = ledgerOrders.map((order) => ({
      key: `invoice-${order.OrderID}`,
      date: order.PIDate || "",
      orderId: order.OrderID,
      proforma: order.ProformaInvoiceID || String(order.OrderID),
      description: t("صدور پروفورما", "Proforma issued"),
      reference: "",
      currency: getOrderCurrency(order),
      debit: getOrderCommercialTotal(order),
      credit: 0,
      sortOrder: 0,
    }));
    const add = (item: OrderTransaction, order: Order, side: "source" | "target", debit: number, credit: number, rowCurrency: string) => {
      if (Math.abs(debit) <= .005 && Math.abs(credit) <= .005) return;
      rows.push({
        key: `transaction-${item.TransactionID}-${side}`,
        date: item.PaytDate || "",
        orderId: order.OrderID,
        proforma: order.ProformaInvoiceID || String(order.OrderID),
        description: item.Description || transactionLabel(item, side, fa),
        reference: item.Slip || item.Note || "",
        currency: normalizeCurrency(rowCurrency),
        debit,
        credit,
        sortOrder: item.TransactionID,
      });
    };
    (db.orderTransactions || []).forEach((item) => {
      const target = orderById.get(item.OrderID);
      const source = item.SourceOrderID ? orderById.get(item.SourceOrderID) : undefined;
      const targetSelected = Boolean(target && selectedOrderIds.has(target.OrderID));
      const sourceSelected = Boolean(source && selectedOrderIds.has(source.OrderID));
      if ((!item.TransactionType || item.TransactionType === "customer_receipt") && target && targetSelected) {
        add(item, target, "target", 0, transactionAmountInOrderCurrency(target, item), getOrderCurrency(target));
      } else if (item.TransactionType === "customer_refund" && target && targetSelected) {
        add(item, target, "target", transactionAmountInOrderCurrency(target, item), 0, getOrderCurrency(target));
      } else if ((item.TransactionType === "credit_allocation" || item.TransactionType === "temporary_credit_allocation") && target) {
        if (targetSelected) add(item, target, "target", 0, transactionAmountInOrderCurrency(target, item), getOrderCurrency(target));
        if (source && sourceSelected) add(item, source, "source", Number(item.SourceAmount) || Number(item.Amount) || 0, 0, getOrderCurrency(source));
      } else if (item.TransactionType === "temporary_credit_repayment" && target) {
        const sourceAmount = Number(item.SourceAmount) || convertedTransactionAmount(item);
        const targetAmount = temporaryCreditRepaymentTargetAmount(db, item);
        if (targetSelected) add(item, target, "target", targetAmount, 0, getOrderCurrency(target));
        if (source && sourceSelected) add(item, source, "source", 0, sourceAmount, getOrderCurrency(source));
      }
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  }, [ledgerOrders, db.orderTransactions, fa, orderById, selectedOrderIds]);

  const chooseCustomerByText = (value: string) => {
    setCustomerQuery(value);
    const query = normalizedName(value);
    if (!query) return;
    const match = customers.find((item) => normalizedName(item.name) === query) || customers.find((item) => normalizedName(item.name).startsWith(query)) || customers.find((item) => normalizedName(item.name).includes(query));
    if (match && match.key !== selectedKey) {
      setCustomerKey(match.key);
      setSupplierQuery("");
      setCurrency("ALL");
    }
  };

  const currencies = useMemo(() => [...new Set(allRows.map((row) => row.currency))].sort(), [allRows]);
  const visibleRows = useMemo(() => allRows.filter((row) => (currency === "ALL" || row.currency === currency) && (!search || `${row.proforma} ${row.description} ${row.reference}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))), [allRows, currency, search]);
  const totalsByCurrency = visibleRows.reduce<Record<string, { debit: number; credit: number }>>((result, row) => {
    const current = result[row.currency] || { debit: 0, credit: 0 };
    result[row.currency] = { debit: current.debit + row.debit, credit: current.credit + row.credit };
    return result;
  }, {});
  const selectedTotals = currency === "ALL" ? undefined : totalsByCurrency[currency] || { debit: 0, credit: 0 };
  const balances = new Map<string, number>();
  const rowsWithBalance = visibleRows.map((row) => {
    const next = (balances.get(row.currency) || 0) + row.debit - row.credit;
    balances.set(row.currency, next);
    return { ...row, balance: next };
  });

  const exportExcel = () => {
    const rows = rowsWithBalance.map((row) => ({ [t("تاریخ", "Date")]: row.date, [t("پروفورما", "Proforma")]: row.proforma, [t("شرح", "Description")]: row.description, [t("مرجع", "Reference")]: row.reference, [t("بدهکار", "Debit")]: row.debit || "", [t("بستانکار", "Credit")]: row.credit || "", [t("مانده", "Balance")]: row.balance, [t("ارز", "Currency")]: row.currency }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Customer Ledger");
    XLSX.writeFile(workbook, `Customer_Ledger_${(selectedCustomer?.name || "customer").replace(/[\\/:*?"<>|]/g, "-")}_${currency}.xlsx`);
  };

  if (!customers.length) return <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">{t("هنوز مشتری دارای پرونده وجود ندارد.", "No customer with an order exists yet.")}</div>;
  return <section className="space-y-3">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><Users size={18} className="text-indigo-600"/>{t("دفتر حساب مشتری", "Customer account ledger")}</h2><InlineHelp><p className="mt-1 text-[11px] text-slate-500">{t("ریز بدهکاری، بستانکاری و مانده هر مشتری؛ هر ارز مستقل محاسبه می‌شود.", "Customer debits, credits and running balance; each currency is calculated separately.")}</p></InlineHelp></div><button onClick={exportExcel} disabled={!visibleRows.length} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"><Download size={14}/>{t("خروجی Excel", "Export Excel")}</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">{t("جستجوی مشتری", "Customer search")}<span className="relative mt-1 block"><Search size={14} className="absolute right-3 top-3 text-slate-400"/><input list="customer-ledger-customers" value={customerQuery || selectedCustomer?.name || ""} onChange={(event) => chooseCustomerByText(event.target.value)} onFocus={(event) => event.currentTarget.select()} onBlur={() => setCustomerQuery(selectedCustomer?.name || "")} placeholder={t("ابتدای نام مشتری را تایپ کنید", "Type the beginning of the customer name")} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs"/></span><datalist id="customer-ledger-customers">{customers.map((customer) => <option key={customer.key} value={customer.name}>{customer.orderCount} {t("پرونده", "orders")}</option>)}</datalist></label>
        <label className="text-xs font-bold text-slate-600">{t("جستجوی تأمین‌کننده", "Supplier search")}<span className="relative mt-1 block"><Search size={14} className="absolute right-3 top-3 text-slate-400"/><input list="customer-ledger-suppliers" value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} placeholder={t("نام تأمین‌کننده؛ خالی یعنی همه", "Supplier name; blank means all")} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs"/></span><datalist id="customer-ledger-suppliers">{supplierNames.map((name) => <option key={name} value={name}/>)}</datalist></label>
        <label className="text-xs font-bold text-slate-600">{t("فیلتر ارز", "Currency filter")}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="ALL">{t("همه ارزها (تفکیک‌شده)", "All currencies (separate)")}</option>{currencies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">{t("جستجو در دفتر", "Search ledger")}<span className="relative mt-1 block"><Search size={14} className="absolute right-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("پروفورما، شرح یا مرجع", "Proforma, description or reference")} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs"/></span></label>
      </div>
      {currency === "ALL" ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(Object.entries(totalsByCurrency) as Array<[string, { debit: number; credit: number }]>).map(([itemCurrency, values]) => <div key={itemCurrency} className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"><b className="font-mono text-indigo-900">{itemCurrency}</b><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><span className="text-rose-700">{t("بدهکار", "Debit")}<b className="block font-mono text-xs">{formatNumber(values.debit)}</b></span><span className="text-emerald-700">{t("بستانکار", "Credit")}<b className="block font-mono text-xs">{formatNumber(values.credit)}</b></span><span className="text-indigo-700">{t("مانده", "Balance")}<b className="block font-mono text-xs">{formatNumber(Math.abs(values.debit - values.credit))} {values.debit - values.credit > .005 ? t("بد", "DR") : values.debit - values.credit < -.005 ? t("بس", "CR") : ""}</b></span></div></div>)}</div> : <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-rose-50 p-3 text-rose-800"><span className="text-[10px]">{t("جمع بدهکار", "Total debit")}</span><b className="mt-1 block font-mono">{formatNumber(selectedTotals?.debit || 0)} {currency}</b></div><div className="rounded-xl bg-emerald-50 p-3 text-emerald-800"><span className="text-[10px]">{t("جمع بستانکار", "Total credit")}</span><b className="mt-1 block font-mono">{formatNumber(selectedTotals?.credit || 0)} {currency}</b></div><div className="rounded-xl bg-indigo-50 p-3 text-indigo-800"><span className="text-[10px]">{t("مانده فیلترشده", "Filtered balance")}</span><b className="mt-1 block font-mono">{formatNumber(Math.abs((selectedTotals?.debit || 0) - (selectedTotals?.credit || 0)))} {currency} {(selectedTotals?.debit || 0) - (selectedTotals?.credit || 0) > .005 ? t("بدهکار", "DR") : (selectedTotals?.debit || 0) - (selectedTotals?.credit || 0) < -.005 ? t("بستانکار", "CR") : ""}</b></div></div>}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[900px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">{t("تاریخ", "Date")}</th><th>{t("پروفورما", "Proforma")}</th><th>{t("شرح", "Description")}</th><th>{t("مرجع", "Reference")}</th><th>{t("بدهکار", "Debit")}</th><th>{t("بستانکار", "Credit")}</th><th>{t("مانده", "Balance")}</th><th>{t("ارز", "Currency")}</th></tr></thead><tbody>{rowsWithBalance.map((row) => <tr key={row.key} className="border-t hover:bg-indigo-50/40"><td className="p-3 font-mono">{row.date || "—"}</td><td><button type="button" onClick={() => onOpenOrder?.(row.orderId)} className="font-mono font-bold text-indigo-700 hover:underline">{row.proforma}</button></td><td>{row.description}</td><td className="text-slate-500">{row.reference || "—"}</td><td className="font-mono font-bold text-rose-700">{row.debit ? formatNumber(row.debit) : "—"}</td><td className="font-mono font-bold text-emerald-700">{row.credit ? formatNumber(row.credit) : "—"}</td><td className={`font-mono font-bold ${row.balance > .005 ? "text-rose-700" : row.balance < -.005 ? "text-blue-700" : "text-slate-600"}`}>{formatNumber(Math.abs(row.balance))} {row.balance > .005 ? t("بدهکار", "DR") : row.balance < -.005 ? t("بستانکار", "CR") : ""}</td><td className="font-mono">{row.currency}</td></tr>)}</tbody></table>{!rowsWithBalance.length && <p className="p-8 text-center text-xs text-slate-400">{t("گردشی مطابق فیلتر انتخاب‌شده وجود ندارد.", "No ledger activity matches the selected filter.")}</p>}</div>
  </section>;
};
