import { InlineHelp } from "./InlineHelp";
import { ReferenceWorkflow } from "./ReferenceWorkflow";
import { workbenchTransactionLabels } from "../utils/accountingWorkbench";
import { getCentralCaseLedger, getCaseCashMovement, isCaseCashOutgoing, isCaseCashIncoming, transactionAmountInOrderCurrency } from "../utils/orderAccounting";
import { getCaseFinancials } from "../utils/caseFinancials";
import { usePartyDirectory } from "./PartyDirectory";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { AppDatabase, CashPartner, FileAttachment, Language, OrderTransaction } from "../types";
import { formatNumber } from "../utils/formatters";
import { convertedTransactionAmount, getOrderCurrency, getOrderProfitToInvoiceMultiplier, getOrderPaymentSummary } from "../utils/orderAccounting";
import { getCaseShareRecipients } from "../utils/caseProfitEngine";
import { Bot, Download, Eye, FileSpreadsheet, FileText, Pencil, Sparkles, Trash2, Upload, X } from "lucide-react";
import { sendChatMessageToAI } from "../services/geminiService";

import { ownedCompanies } from "../utils/partnerIdentity";
import { getPartyDirectory } from "../utils/partyDirectory";
import { PaymentFundingPanel } from "./PaymentFundingPanel";
import { getFundingClaims, isExternallyFundedPayment, validatePaymentFunding } from "../utils/paymentFunding";

interface Props {
  guided?: boolean;
  onDirty?: (dirty:boolean)=>void;
  onSaveParty?: (party: CashPartner) => void;
  db: AppDatabase;
  language: Language;
  onSaveTransaction: (transaction: OrderTransaction) => void;
  onSaveTransactions?: (transactions: OrderTransaction[]) => void;
  onDeleteTransaction?: (transactionId: number) => void;
  fixedOrderId?: number;
}

type EntryKind = "stakeholder_fund_contribution" | "capital_repayment" | "own_sale_receipt" | "own_sale_refund" | "company_loan_receipt" | "funding_repayment" | "customer_receipt" | "supplier_payment" | "order_expense" | "partner_settlement" | "case_transfer" | "credit_allocation" | "temporary_credit_allocation" | "temporary_credit_repayment" | "stakeholder_case_loan_repayment" | "customer_refund" | "arca_loan_repayment";
const today = () => new Date().toISOString().slice(0, 10);
const nextId = (items: OrderTransaction[]) => Math.max(0, ...items.map((item) => item.TransactionID)) + 1;

export const OrderPaymentLedger: React.FC<Props> = ({ guided = false, onDirty, db, language, onSaveParty, onSaveTransaction, onSaveTransactions, onDeleteTransaction, fixedOrderId }) => {
  const [referenceStep,setReferenceStep] = useState("entry");
  const capitalDirectory = usePartyDirectory();
  const fa = language === "fa";
  const t = (faText: string, enText: string) => fa ? faText : enText;
  const [orderId, setOrderId] = useState(db.orders[0]?.OrderID || 0);
  const [capitalPartyId, setCapitalPartyId] = useState("");
  const [kind, setKind] = useState<EntryKind>(db.orders.find((item) => item.OrderID === fixedOrderId)?.TradeOwnership === "own_account" ? "supplier_payment" : "customer_receipt");
  const [amount, setAmount] = useState(0);
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [rate, setRate] = useState(1);
  const [sourceOrderId, setSourceOrderId] = useState(0);
  const [linkedTransactionId, setLinkedTransactionId] = useState(0);
  const [date, setDate] = useState(today());
  const [slip, setSlip] = useState("");
  const [account, setAccount] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [fundingSource, setFundingSource] = useState<"buyer_funds" | "arcatav" | "other">("buyer_funds");
  const [fundingPartyId, setFundingPartyId] = useState("");
  const [fundingOpen, setFundingOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const fundingPayment = ["company_loan_receipt", "supplier_payment", "order_expense", "partner_settlement", "customer_refund"].includes(kind);
  const fundingParty = db.cashPartners.find((party) => party.id === fundingPartyId);
  const fundingClaims = getFundingClaims(db, true).filter((claim) => claim.order.OrderID === (fixedOrderId || orderId));
  const selectedFundingClaim = fundingClaims.find((claim) => claim.payment.TransactionID === linkedTransactionId);
  const chooseFundingSource = (value: string) => {
    const company = ownedCompanies.find((item) => item.id === value);
    if (company) { setFundingSource("other"); setFundingPartyId(company.id); return; }
    if (value === "owner_funds") { setFundingSource("other"); setFundingPartyId(order?.EconomicOwnerPartyId || ""); return; }
    if (value !== "arcatav") { setFundingSource(value as "buyer_funds" | "other"); return; }
    const existing = getPartyDirectory(db).find((party) => /^(آرکاتاو|ارکاتاو|arcatav)$/i.test(party.name.trim()));
    const party: CashPartner = existing ? { ...existing, isFundingSource: true, fundingCompany: "Arcatav" } : { id: crypto.randomUUID(), name: "آرکاتاو", entityType: "company", isFundingSource: true, fundingCompany: "Arcatav" };
    if (onSaveParty) { onSaveParty(party); setFundingPartyId(party.id); }
    setFundingSource("other"); setFundingOpen(!onSaveParty);
  };
  const [note, setNote] = useState("");
  const [receipts, setReceipts] = useState<FileAttachment[]>([]);
  const [fundTargetOrderId, setFundTargetOrderId] = useState(0);
  const [fundTargetQuery, setFundTargetQuery] = useState("");
  const [fundTargetOpen, setFundTargetOpen] = useState(false);
  const [fundTransferAmount, setFundTransferAmount] = useState(0);
  const [fundContributions, setFundContributions] = useState<Record<string, number>>({});
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiFollowup, setAiFollowup] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ kind: EntryKind; amount: number; currency: string; date: string; description: string; counterparty: string }>>([]);

  const effectiveOrderId = fixedOrderId || orderId;
  const order = db.orders.find((item) => item.OrderID === effectiveOrderId) || db.orders[0];
  const ownAccount = order?.TradeOwnership === "own_account";
  useEffect(() => {
    if (ownAccount && ["customer_receipt", "customer_refund", "credit_allocation", "temporary_credit_allocation", "temporary_credit_repayment", "case_transfer"].includes(kind) && editingTransactionId === null) setKind("supplier_payment");
    if (kind === "company_loan_receipt") { setFundingSource("other"); if (fundingPartyId === order?.EconomicOwnerPartyId) setFundingPartyId(""); }
    else if (ownAccount && editingTransactionId === null && !fundingPartyId) { setFundingSource("other"); setFundingPartyId(order?.EconomicOwnerPartyId || ""); }
  }, [ownAccount, kind, editingTransactionId, order?.EconomicOwnerPartyId, fundingPartyId]);
  const summary = order ? getOrderPaymentSummary(db, order) : null;
  const centralLedger = order ? getCentralCaseLedger(db, order) : null;
  const orderCurrency = getOrderCurrency(order);
  const creditSources = useMemo(() => {
    if (!order) return [];
    return db.orders.filter((item) => item.CustomerID === order.CustomerID && item.OrderID !== order.OrderID)
      .map((item) => ({ order: item, summary: getOrderPaymentSummary(db, item) }))
      .filter((item) => item.summary.availableCredit > 0.005);
  }, [db, order]);
  // اعتبار مشتری متعلق به خود مشتری است، نه فقط یک پرونده. مبالغ هر ارز جدا
  // نگه داشته می‌شوند تا ناخواسته با هم جمع نشوند.
  const customerCreditByCurrency = useMemo(() => {
    if (!order?.CustomerID) return [] as Array<[string, number]>;
    const balances: Record<string, number> = {};
    db.orders.filter((item) => item.CustomerID === order.CustomerID).forEach((item) => {
      const currency = getOrderCurrency(item);
      balances[currency] = (balances[currency] || 0) + getOrderPaymentSummary(db, item).availableCredit;
    });
    return Object.entries(balances).filter(([, value]) => Math.abs(value) > 0.005);
  }, [db, order]);
  const temporarySources = useMemo(() => {
    if (!order) return [];
    return db.orders.filter((item) => item.CustomerID !== order.CustomerID)
      .map((item) => ({ order: item, summary: getOrderPaymentSummary(db, item) }))
      .filter((item) => item.summary.availableCredit > 0.005);
  }, [db, order]);
  const transferSources = useMemo(() => {
    if (!order) return [];
    return db.orders.filter((item) => item.OrderID !== order.OrderID)
      .map((item) => ({ order: item, summary: getOrderPaymentSummary(db, item) }))
      .filter((item) => item.summary.availableCredit > 0.005);
  }, [db, order]);
  const outstandingAdvances = useMemo(() => {
    if (!order) return [];
    return (db.orderTransactions || []).filter((item) => item.TransactionType === "temporary_credit_allocation" && item.OrderID === order.OrderID).map((allocation) => {
      const repaid = (db.orderTransactions || []).filter((item) => item.TransactionType === "temporary_credit_repayment" && item.LinkedTransactionID === allocation.TransactionID)
        .reduce((sum, item) => sum + (Number(item.SourceAmount) || convertedTransactionAmount(item)), 0);
      return { allocation, outstanding: Math.max(0, (Number(allocation.SourceAmount) || Number(allocation.Amount) || 0) - repaid), sourceOrder: db.orders.find((item) => item.OrderID === allocation.SourceOrderID) };
    }).filter((item) => item.outstanding > 0.005);
  }, [db, order]);
  const outstandingStakeholderLoans = useMemo(() => {
    if (!order) return [] as Array<{ loan: OrderTransaction; outstanding: number; sourceOrder?: typeof db.orders[number] }>;
    return (db.orderTransactions || []).filter((item) => item.TransactionType === "stakeholder_case_loan" && item.OrderID === order.OrderID).map((loan) => {
      const repaid = (db.orderTransactions || []).filter((item) => item.TransactionType === "stakeholder_case_loan_repayment" && item.LinkedTransactionID === loan.TransactionID)
        .reduce((sum, item) => sum + convertedTransactionAmount(item), 0);
      return { loan, outstanding: Math.max(0, convertedTransactionAmount(loan) - repaid), sourceOrder: db.orders.find((item) => item.OrderID === loan.SourceOrderID) };
    }).filter((item) => item.outstanding > .005);
  }, [db, order]);
  const sourceList = kind === "case_transfer" ? transferSources : kind === "temporary_credit_allocation" ? temporarySources : creditSources;
  const source = sourceList.find((item) => item.order.OrderID === sourceOrderId) || sourceList[0];
  const selectedAdvance = outstandingAdvances.find((item) => item.allocation.TransactionID === linkedTransactionId) || outstandingAdvances[0];
  const selectedStakeholderLoan = outstandingStakeholderLoans.find((item) => item.loan.TransactionID === linkedTransactionId) || outstandingStakeholderLoans[0];
  const converted = amount * (rate || 0);
  const fundOwners = useMemo(() => {
    if (!order) return [] as Array<{ id: string; name: string; role: string; share: number }>;
    return getCaseFinancials(db, order).shares
      .map((share) => ({ id: share.id, name: share.name, role: share.role || t("ذی‌نفع", "Beneficiary"), share: Number(share.amount || 0) * getOrderProfitToInvoiceMultiplier(order) }))
      .filter((share) => share.name && share.share > 0.005);
  }, [order, db.suppliers, db.issuerCompanyShares, db.orderTransactions]);
  const fundEntries = useMemo(() => (db.orderTransactions || []).filter((item) => item.TransactionType === "stakeholder_fund_contribution" && item.OrderID === order?.OrderID), [db.orderTransactions, order?.OrderID]);
  // A transfer is recorded once for the case fund and once per contributor as a
  // receivable. This keeps the money movement and each stakeholder's claim in
  // sync without turning a contribution into a second profit share.
  const stakeholderLoansOut = useMemo(() => (db.orderTransactions || []).filter((item) => item.TransactionType === "stakeholder_case_loan" && item.SourceOrderID === order?.OrderID), [db.orderTransactions, order?.OrderID]);
  const stakeholderLoanRepayments = useMemo(() => (db.orderTransactions || []).filter((item) => item.TransactionType === "stakeholder_case_loan_repayment" && item.SourceOrderID === order?.OrderID), [db.orderTransactions, order?.OrderID]);
  const fundTransferredOut = centralLedger?.caseFundSent || 0;
  const fundTransferredIn = centralLedger?.caseFundReceived || 0;
  const fundContributed = centralLedger?.stakeholderFundContributions || 0;
  const caseFundBalance = centralLedger?.caseFundBalance || 0;
  const ownerEntries = (entries: OrderTransaction[], owner: { id: string; name: string }) => entries.filter((item) => item.PartnerId === owner.id || (!item.PartnerId && item.Counterparty === owner.name));
  const contributedFor = (owner: { id: string; name: string }) => ownerEntries(fundEntries, owner).reduce((sum, item) => sum + Number(item.ConvertedAmount ?? item.Amount ?? 0), 0);
  const loanedFor = (owner: { id: string; name: string }) => ownerEntries(stakeholderLoansOut, owner).reduce((sum, item) => sum + Number(item.ConvertedAmount ?? item.Amount ?? 0), 0);
  const repaidFor = (owner: { id: string; name: string }) => ownerEntries(stakeholderLoanRepayments, owner).reduce((sum, item) => sum + Number(item.ConvertedAmount ?? item.Amount ?? 0), 0);
  const fundTarget = db.orders.find((item) => item.OrderID === fundTargetOrderId);
  const fundTargetCandidates = useMemo(() => {
    const query = fundTargetQuery.trim().toLowerCase();
    return db.orders
      .filter((item) => item.OrderID !== order?.OrderID && getOrderCurrency(item) === orderCurrency)
      .filter((item) => !query || `${item.ProformaInvoiceID} ${item.CustomerName} ${item.ProductName || ""}`.toLowerCase().includes(query))
      .slice(0, 12);
  }, [db.orders, fundTargetQuery, order?.OrderID, orderCurrency]);
  const chooseFundTarget = (target: typeof db.orders[number]) => {
    setFundTargetOrderId(target.OrderID);
    setFundTargetQuery(target.ProformaInvoiceID);
    setFundTargetOpen(false);
  };
  const saveFundTransfer = () => {
    if (!order || !fundTarget || fundTransferAmount <= 0) return alert(t("پروندهٔ مقصد و مبلغ انتقال را انتخاب کنید.", "Select a target case and transfer amount."));
    if (getOrderCurrency(fundTarget) !== orderCurrency) return alert(t("انتقال صندوق فقط میان پرونده‌های هم‌ارز ثبت می‌شود.", "Case-fund transfers require matching case currencies."));
    const additions = fundOwners.map((owner) => ({ owner, amount: Number(fundContributions[owner.id] || 0) })).filter((item) => item.amount > 0.005);
    if (additions.some((item) => item.amount > Math.max(0, item.owner.share - contributedFor(item.owner)) + 0.005)) return alert(t("مبلغ دریافت از یک صاحب سهم از ماندهٔ سهم او بیشتر است.", "A contributor amount exceeds their remaining share."));
    const addedTotal = additions.reduce((sum, item) => sum + item.amount, 0);
    if (caseFundBalance + addedTotal + 0.005 < fundTransferAmount) return alert(t("ابتدا مبلغ موردنیاز را از صاحبان سهم به صندوق پرونده وارد کنید.", "First collect enough money from the stakeholders into this case fund."));
    const loanAllocations: Array<{ owner: typeof fundOwners[number]; amount: number }> = [];
    let remainingToAllocate = fundTransferAmount;
    fundOwners.forEach((owner) => {
      const attributableFund = Math.max(0, contributedFor(owner) + Number(fundContributions[owner.id] || 0) - loanedFor(owner) + repaidFor(owner));
      const amount = Math.min(attributableFund, remainingToAllocate);
      if (amount > 0.005) loanAllocations.push({ owner, amount });
      remainingToAllocate -= amount;
    });
    if (remainingToAllocate > 0.005) return alert(t("برای ثبت دقیق طلب اشخاص، مبلغ انتقال باید از واریزهای دارای صاحب سهم تأمین شود.", "To keep stakeholder claims accurate, the transfer must be covered by attributed stakeholder contributions."));
    const start = nextId(db.orderTransactions || []);
    const journalId = `case-fund-${order.OrderID}-${fundTarget.OrderID}-${Date.now()}`;
    const postings: OrderTransaction[] = additions.map((item, index) => ({ TransactionID: start + index, JournalID: journalId, OrderID: order.OrderID, Amount: item.amount, Exchange_Rate: 1, ConvertedAmount: item.amount, PaymentCurrency: orderCurrency, ProformaCurrency: orderCurrency, PaytDate: date, TransactionType: "stakeholder_fund_contribution", PartnerId: item.owner.id, Counterparty: item.owner.name, Description: t("واریز صاحب سهم به صندوق پرونده", "Stakeholder contribution to case fund"), Note: t("تأمین وجه برای انتقال بین پرونده‌ها", "Funding for an inter-case transfer") }));
    const transferId = start + additions.length + loanAllocations.length;
    postings.push(...loanAllocations.map((item, index) => ({ TransactionID: start + additions.length + index, JournalID: journalId, OrderID: fundTarget.OrderID, SourceOrderID: order.OrderID, Amount: item.amount, Exchange_Rate: 1, ConvertedAmount: item.amount, PaymentCurrency: orderCurrency, ProformaCurrency: orderCurrency, PaytDate: date, TransactionType: "stakeholder_case_loan" as const, PartnerId: item.owner.id, FundTransferID: transferId, Counterparty: item.owner.name, Description: t("قرض از سهم ذی‌نفع به پرونده", "Stakeholder share loan to case"), Note: t(`طلب ${item.owner.name} از پرونده ${fundTarget.ProformaInvoiceID}؛ تأمین‌شده از ${order.ProformaInvoiceID}`, `${item.owner.name}'s receivable from ${fundTarget.ProformaInvoiceID}; funded by ${order.ProformaInvoiceID}`) })));
    postings.push({ TransactionID: transferId, JournalID: journalId, OrderID: fundTarget.OrderID, SourceOrderID: order.OrderID, SourceAmount: fundTransferAmount, Amount: fundTransferAmount, Exchange_Rate: 1, ConvertedAmount: fundTransferAmount, PaymentCurrency: orderCurrency, ProformaCurrency: orderCurrency, PaytDate: date, TransactionType: "case_fund_transfer", Counterparty: fundTarget.ProformaInvoiceID, Description: t("انتقال از صندوق پرونده", "Transfer from case fund"), Note: t(`از صندوق پرونده ${order.ProformaInvoiceID}`, `From case fund ${order.ProformaInvoiceID}`) });
    if (onSaveTransactions) onSaveTransactions(postings); else postings.forEach(onSaveTransaction);
    setFundTargetOrderId(0); setFundTargetQuery(""); setFundTransferAmount(0); setFundContributions({});
  };
  const parseFinancialRows = (matrix: unknown[][]) => {
    const [header = [], ...data] = matrix as any[][];
    const names = header.map((x) => String(x || "").toLocaleLowerCase());
    const find = (...keys: string[]) => names.findIndex((name) => keys.some((key) => name.includes(key)));
    const amountAt = find("amount", "مبلغ", "value"); const typeAt = find("type", "نوع", "operation", "عملیات"); const dateAt = find("date", "تاریخ"); const descAt = find("description", "شرح", "note", "یادداشت"); const partyAt = find("party", "طرف", "customer", "supplier", "مشتری", "تأمین"); const currencyAt = find("currency", "ارز");
    const next = data.map((row) => { const text = String(row[typeAt] || "").toLocaleLowerCase(); const kind: EntryKind = text.includes("expense") || text.includes("هزینه") ? "order_expense" : text.includes("supplier") || text.includes("تأمین") || text.includes("پرداخت") ? "supplier_payment" : text.includes("settle") || text.includes("تسویه") ? "partner_settlement" : "customer_receipt"; return { kind, amount: Number(String(row[amountAt] ?? "").replace(/[^0-9.-]/g, "")) || 0, currency: String(row[currencyAt] || orderCurrency).toUpperCase(), date: String(row[dateAt] || today()).slice(0, 10), description: String(row[descAt] || "ثبت‌شده از فایل Excel"), counterparty: String(row[partyAt] || "") }; }).filter((row) => row.amount > 0);
    setImportRows(next); if (!next.length) setAiReply(t("ستون مبلغ یا ردیف قابل ثبت در فایل پیدا نشد. ستون «مبلغ» را بررسی کنید.", "No usable amount column was found."));
  };
  const importFileForAI = async (file?: File) => { if (!file) return; const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }); const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][]; parseFinancialRows(matrix); const extractedText = wb.SheetNames.map((sheet) => `--- ${sheet} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[sheet])}`).join("\n").slice(0, 24000); setAiText(extractedText); };
  const analyzeWithAI = async () => { if (!aiText.trim() || !order) return; setAiBusy(true); try { const result = await sendChatMessageToAI(`فایل یا جدول مالی زیر مربوط به پرونده ${order.ProformaInvoiceID} است. تمام ردیف‌های قابل ثبت را تحلیل کن و با actionType=ADD_ORDER_TRANSACTIONS فهرست ساختاریافته پیشنهاد بده تا پیش‌نمایش با تحلیل دقیقاً یکسان باشد.`, db, [], "professional", db.currentUser?.role || "", { name: "financial-import.xlsx", mimeType: "application/vnd.ms-excel", extractedText: aiText.slice(0, 24000) }); setAiReply(result.reply); const action: any = result.action; const suggested = action?.type === "ADD_ORDER_TRANSACTIONS" ? (action.payload?.transactions || action.payload || []) : []; if (Array.isArray(suggested) && suggested.length) setImportRows(suggested.map((item: any) => ({ kind: ["customer_receipt", "supplier_payment", "order_expense", "partner_settlement"].includes(item.type) ? item.type : "customer_receipt", amount: Number(item.amount) || 0, currency: String(item.currency || orderCurrency).toUpperCase(), date: String(item.date || today()).slice(0, 10), description: String(item.description || "ثبت پیشنهادی دستیار"), counterparty: String(item.counterparty || "") })).filter((item: any) => item.amount > 0)); } finally { setAiBusy(false); } };
  const sendFollowupToAI = async () => { if (!aiFollowup.trim() || !order) return; const userAnswer = aiFollowup; const confirmsPosting = /(?:تأیید|تاييد|ثبت کن|ثبت شود|اعمال کن|انجام بده)/i.test(userAnswer); setAiBusy(true); try { const result = await sendChatMessageToAI(`این پاسخ کاربر دربارهٔ تحلیل مالی پرونده ${order.ProformaInvoiceID} است: «${userAnswer}». تحلیل قبلی: «${aiReply}». اگر تأیید برای ثبت عملیات است، کاربر را به دکمه «تأیید و ثبت در پرونده» راهنمایی کن؛ اگر ابهام دارد، فقط سؤال یا اصلاح لازم را کوتاه بگو.`, db, [], "professional", db.currentUser?.role || "", { name: "financial-import.xlsx", mimeType: "application/vnd.ms-excel", extractedText: aiText.slice(0, 24000) }); setAiReply(result.reply); setAiFollowup(""); if (confirmsPosting && importRows.length) { applyImportedRows(); } else if (confirmsPosting) { setAiReply("برای ثبت، ابتدا «ساخت پیش‌نمایش» را بزنید تا ردیف‌های Excel قابل ثبت شوند؛ سپس دوباره تأیید کنید."); } } finally { setAiBusy(false); } };
  const applyImportedRows = () => {
    if (!order) return;
    if (importRows.some((row) => row.currency !== orderCurrency)) { setAiReply("ردیف‌های دارای ارز متفاوت را با نرخ تبدیل در فرم ثبت کنید؛ ثبت گروهی فقط برای ارز پرونده مجاز است."); return; }
    if (importRows.some((row) => row.kind !== "customer_receipt") && (fundingSource === "other" && !fundingParty)) { setAiReply("ابتدا در فرم پرداخت، منبع مشخص را انتخاب کنید. منبع انتخاب‌شده برای تمام پرداخت‌های این ورودی استفاده می‌شود."); return; }
    const start = nextId(db.orderTransactions || []);
    const entries: OrderTransaction[] = importRows.map((row, index) => ({ TransactionID: start + index, OrderID: order.OrderID, Amount: row.amount, Exchange_Rate: 1, ConvertedAmount: row.amount, PaymentCurrency: orderCurrency, ProformaCurrency: orderCurrency, PaytDate: row.date || today(), Description: row.description, Counterparty: row.counterparty, TransactionType: row.kind, FundingSource: row.kind === "customer_receipt" ? "buyer_funds" : fundingSource, FundingPartyId: row.kind !== "customer_receipt" && fundingSource === "other" ? fundingPartyId : undefined, FundingPartyName: row.kind !== "customer_receipt" && fundingSource === "other" ? fundingParty?.name : undefined, Slip: "Excel import", Note: "ثبت از ورودی دستیار هوشمند" }));
    const error = validatePaymentFunding({ ...db, orderTransactions: [...(db.orderTransactions || []), ...entries] });
    if (error) { setAiReply(error); return; }
    if (onSaveTransactions) onSaveTransactions(entries); else entries.forEach(onSaveTransaction);
    setImportRows([]); setAiImportOpen(false);
  };

  useEffect(()=>{onDirty?.(amount!==0||!!description||!!note||!!slip||!!counterparty||receipts.length>0||editingTransactionId!==null);},[amount,description,note,slip,counterparty,receipts,editingTransactionId,onDirty]);
  const save = () => {
    setFormError("");
    if (fundingPayment && fundingSource === "other" && !fundingParty) return setFormError(t("منبع مشخصی از اشخاص و شرکت‌ها انتخاب کنید.", "Select a funding party."));
    if (kind === "funding_repayment" && (!selectedFundingClaim || paymentCurrency !== selectedFundingClaim.currency || amount > selectedFundingClaim.outstanding + (editingTransactionId ? Number(db.orderTransactions?.find((entry) => entry.TransactionID === editingTransactionId)?.Amount || 0) : 0) + 0.005)) return setFormError(t("سند تأمین وجه را انتخاب کنید؛ ارز باید با اصل بدهی یکسان و مبلغ حداکثر برابر مانده باشد.", "Select a funding entry; use its original currency and do not exceed its balance."));
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) return setFormError(t("مبلغ و نرخ معتبر وارد کنید.", "Enter a valid amount and rate."));
    if (!order || amount <= 0 || rate <= 0) return alert(t("مبلغ و نرخ تبدیل باید بیشتر از صفر باشد.", "Amount and conversion rate must be greater than zero."));
    if (kind === "credit_allocation" || kind === "temporary_credit_allocation" || kind === "case_transfer") {
      if (!source) return alert(t("برای این مشتری اعتبار قابل تخصیص وجود ندارد.", "This customer has no available credit to allocate."));
      if (amount > source.summary.availableCredit + 0.005) return alert(t("مبلغ تخصیص از اعتبار قابل استفاده بیشتر است.", "Allocation exceeds the available credit."));
    }
    if (kind === "temporary_credit_repayment") {
      if (!selectedAdvance) return alert(t("بدهی امانی بازی برای این پرونده وجود ندارد.", "This order has no outstanding temporary funding."));
      if (converted > selectedAdvance.outstanding + 0.005) return alert(t("مبلغ بازپرداخت از مانده بدهی امانی بیشتر است.", "Repayment exceeds the outstanding temporary funding."));
    }
    if (kind === "stakeholder_case_loan_repayment") {
      if (!selectedStakeholderLoan) return alert(t("بدهی بازی به صاحبان سهم برای این پرونده وجود ندارد.", "This order has no outstanding stakeholder loan."));
      if (converted > selectedStakeholderLoan.outstanding + 0.005) return alert(t("مبلغ بازپرداخت از مانده بدهی به صاحب سهم بیشتر است.", "Repayment exceeds the stakeholder loan balance."));
    }
    if (kind === "customer_refund" && summary && converted > summary.availableCredit + 0.005) {
      return alert(t("مبلغ عودت از اعتبار قابل استفاده مشتری بیشتر است.", "Refund exceeds the customer's available credit."));
    }
    const resolvedKind: OrderTransaction["TransactionType"] = kind === "case_transfer"
      ? (source?.order.CustomerID === order.CustomerID ? "credit_allocation" : "temporary_credit_allocation")
      : kind;
    const isAllocation = resolvedKind === "credit_allocation" || resolvedKind === "temporary_credit_allocation";
    const origin = isAllocation ? source?.order : kind === "temporary_credit_repayment" ? selectedAdvance?.sourceOrder : kind === "stakeholder_case_loan_repayment" ? selectedStakeholderLoan?.sourceOrder : order;
    const entry: OrderTransaction = {
      ...(editingTransactionId ? db.orderTransactions?.find((item) => item.TransactionID === editingTransactionId) : {}),
      TransactionID: editingTransactionId || nextId(db.orderTransactions || []),
      OrderID: order.OrderID,
      ...(["stakeholder_fund_contribution", "capital_repayment", ...(ownAccount ? ["partner_settlement"] : [])].includes(kind) ? { PartnerId: capitalPartyId } : {}),
      Amount: amount,
      Exchange_Rate: rate,
      ConvertedAmount: converted,
      PaymentCurrency: isAllocation ? getOrderCurrency(origin) : paymentCurrency,
      ProformaCurrency: kind === "temporary_credit_repayment" || kind === "stakeholder_case_loan_repayment" ? getOrderCurrency(origin) : orderCurrency,
      PaytDate: date,
      Slip: slip,
      Note: note,
      CompanyAccount: account,
      Counterparty: ["stakeholder_fund_contribution", "capital_repayment", ...(ownAccount ? ["partner_settlement"] : [])].includes(kind) ? db.cashPartners.find(p => p.id === capitalPartyId)?.name : kind === "company_loan_receipt" ? fundingParty?.name : kind === "funding_repayment" ? selectedFundingClaim?.name : counterparty || (kind === "customer_receipt" ? order.CustomerName || "" : kind === "stakeholder_case_loan_repayment" ? selectedStakeholderLoan?.loan.Counterparty || "" : ""),
      Description: description,
      FundingSource: fundingPayment ? fundingSource : "buyer_funds",
      FundingPartyId: kind === "funding_repayment" ? selectedFundingClaim?.payment.FundingPartyId : fundingPayment && fundingSource === "other" ? fundingPartyId : undefined,
      FundingPartyName: kind === "funding_repayment" ? selectedFundingClaim?.name : fundingPayment && fundingSource === "other" ? fundingParty?.name : undefined,
      IsFundingRepayment: kind === "funding_repayment" || undefined,
      TransactionType: resolvedKind,
      SourceOrderID: isAllocation || kind === "temporary_credit_repayment" || kind === "stakeholder_case_loan_repayment" ? origin?.OrderID : undefined,
      SourceAmount: isAllocation ? amount : kind === "temporary_credit_repayment" || kind === "stakeholder_case_loan_repayment" ? converted : undefined,
      LinkedTransactionID: kind === "funding_repayment" ? selectedFundingClaim?.payment.TransactionID : kind === "temporary_credit_repayment" ? selectedAdvance?.allocation.TransactionID : kind === "stakeholder_case_loan_repayment" ? selectedStakeholderLoan?.loan.TransactionID : undefined,
      PartnerId: kind === "stakeholder_case_loan_repayment" ? selectedStakeholderLoan?.loan.PartnerId : undefined,
      receiptAttachments: receipts,
    };
    const fundingError = validatePaymentFunding({ ...db, orderTransactions: [...(db.orderTransactions || []).filter((item) => item.TransactionID !== entry.TransactionID), entry] });
    if (fundingError) return setFormError(fundingError);
    onSaveTransaction(entry);
    setAmount(0); setSlip(""); setNote(""); setDescription(""); setCounterparty(""); setReceipts([]); setEditingTransactionId(null); if(guided)setReferenceStep("history");
  };

  const editEntry = (item: OrderTransaction) => {
    setCapitalPartyId(item.PartnerId || "");
    setFormError(""); setFundingOpen(false);
    setFundingPartyId(item.FundingPartyId || "");
    setEditingTransactionId(item.TransactionID);
    setKind((item.TransactionType || "customer_receipt") as EntryKind);
    setAmount(Number(item.Amount) || 0); setPaymentCurrency(item.PaymentCurrency || orderCurrency); setRate(Number(item.Exchange_Rate) || 1);
    setDate(item.PaytDate || today()); setSlip(item.Slip || ""); setAccount(item.CompanyAccount || ""); setNote(item.Note || "");
    setDescription(item.Description || ""); setCounterparty(item.Counterparty || ""); setFundingSource(item.FundingSource || "buyer_funds"); setReceipts(item.receiptAttachments || []);
    setSourceOrderId(item.SourceOrderID || 0); setLinkedTransactionId(item.LinkedTransactionID || 0);
  };
  const cancelEdit = () => { setFormError(""); setFundingOpen(false); setEditingTransactionId(null); setAmount(0); setSlip(""); setNote(""); setDescription(""); setCounterparty(""); setReceipts([]); };

  const addReceipts = (files?: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.some((file) => file.size > 8 * 1024 * 1024)) return alert(t("حداکثر حجم هر رسید ۸ مگابایت است.", "Each receipt must be 8 MB or smaller."));
    Promise.all(selected.map((file, index) => new Promise<FileAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ id: `receipt-${Date.now()}-${index}`, name: file.name, category: "financial", mimeType: file.type || "application/octet-stream", data: String(reader.result), uploadedAt: new Date().toISOString() });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }))).then((items) => setReceipts((current) => [...current, ...items])).catch(() => alert(t("خواندن فایل رسید ناموفق بود.", "Could not read the receipt file.")));
  };
  const download = (attachment: FileAttachment) => { const link = document.createElement("a"); link.href = attachment.data; link.download = attachment.name; link.click(); };
  const preview = (attachment: FileAttachment) => { const win = window.open(); if (win) win.location.href = attachment.data; };
  const removeSavedReceipt = (transaction: OrderTransaction, attachmentId: string) => onSaveTransaction({ ...transaction, receiptAttachments: (transaction.receiptAttachments || []).filter((item) => item.id !== attachmentId) });

  const related = [...(centralLedger?.relatedEntries || [])].sort((a, b) => (b.PaytDate || "").localeCompare(a.PaytDate || "") || b.TransactionID - a.TransactionID);
  const isOperationalOutgoing = isCaseCashOutgoing;
  const operationalEntries = related;
  const totalReceived = centralLedger?.caseCashIn || 0;
  const totalPaid = centralLedger?.caseCashOut || 0;
  const arcatavFunded = operationalEntries.filter(item => isOperationalOutgoing(item) && item.FundingSource === "arcatav").reduce((sum, item) => sum + transactionAmountInOrderCurrency(order!, item), 0);
  const arcatavRepaid = operationalEntries.filter(item => item.TransactionType === "arca_loan_repayment").reduce((sum, item) => sum + transactionAmountInOrderCurrency(order!, item), 0);
  const arcatavReceivable = Math.max(0, arcatavFunded - arcatavRepaid);
  const externalFunding = centralLedger?.externalFunding || 0;
  const cashBalance = centralLedger?.caseCashBalance || 0;
  const runningBalances = new Map<number, number>();
  [...operationalEntries].sort((a, b) => (a.PaytDate || "").localeCompare(b.PaytDate || "") || a.TransactionID - b.TransactionID).reduce((balance, item) => {
    const movement = getCaseCashMovement(db, order!, item);
    const next = balance + movement.incoming - movement.outgoing;
    runningBalances.set(item.TransactionID, next);
    return next;
  }, 0);
  const statusLabel = summary?.status === "debtor" ? t("بدهکار", "Outstanding") : summary?.status === "temporary_debt" ? (summary.fundingDebt > 0.005 ? t("بدهی به منبع تأمین وجه", "Funding source liability") : t("بدهی امانی", "Temporary funding due")) : summary?.status === "creditor" ? t("طلبکار", "Customer credit") : t("تسویه", "Settled");
  const statusClass = summary?.status === "debtor" ? "text-rose-700 bg-rose-50" : summary?.status === "temporary_debt" ? "text-amber-700 bg-amber-50" : summary?.status === "creditor" ? "text-blue-700 bg-blue-50" : "text-emerald-700 bg-emerald-50";
  const inputClass = "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs focus:border-indigo-500 focus:outline-none";
  const hasValue = (value: number) => Math.abs(value) > 0.005;
  const exportLedgerExcel = () => {
    if (!order) return;
    const rows = related.map((item) => {
      const movement = getCaseCashMovement(db, order, item);
      return {
        "شماره پروفورما": order.ProformaInvoiceID,
        "تاریخ": item.PaytDate || "",
        "نوع عملیات": item.TransactionType || "customer_receipt",
        "شرح": item.Description || "",
        "طرف حساب": item.Counterparty || "",
        "مبلغ اصلی": item.SourceAmount || item.Amount || 0,
        "ارز پرداخت": item.PaymentCurrency || orderCurrency,
        "نرخ تسعیر": item.Exchange_Rate || 1,
        "معادل ورودی": movement.incoming,
        "معادل خروجی": movement.outgoing,
        "منبع پرداخت": item.FundingPartyName || item.FundingSource || "",
        "شناسه منبع": item.FundingPartyId || "",
        "سند مرتبط": item.LinkedTransactionID || "",
        "حساب": item.CompanyAccount || "",
        "شماره رسید": item.Slip || "",
        "یادداشت": item.Note || "",
      };
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Ledger");
    const caseFileName = `${order.ProformaInvoiceID || order.OrderID}_${order.CustomerName || order.SupplierName || "case"}`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    XLSX.writeFile(workbook, `ARCA_Ledger_${caseFileName}.xlsx`);
  };

  useEffect(() => {
    if (editingTransactionId === null) return;
    const dialog = editDialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input:not([type=file])")?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [editingTransactionId]);

  const transactionForm = (
    <div data-reference-entry className="grid grid-cols-2 gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
        <div className="col-span-2 flex items-center justify-between"><div><h2 className="text-xs font-bold">{editingTransactionId ? t("ویرایش عملیات مالی", "Edit financial entry") : t("ثبت سریع دریافت و پرداخت", "Quick receipt & payment")}</h2><InlineHelp><p className="mt-0.5 text-[10px] text-slate-500">{t("نوع عملیات را انتخاب کنید، مبلغ و شرح را وارد کنید؛ نتیجه فوراً در مانده پرونده دیده می‌شود.", "Choose the operation, enter amount and description; the case balance updates immediately.")}</p></InlineHelp></div>{editingTransactionId && <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600"><X size={13}/>{t("انصراف", "Cancel")}</button>}</div>
        <div className="col-span-2 grid grid-cols-2 gap-1 sm:grid-cols-5">{([ ["customer_receipt", "دریافت از مشتری", "bg-emerald-600"], ["supplier_payment", "پرداخت به تأمین‌کننده", "bg-rose-600"], ["order_expense", "هزینه پرونده", "bg-amber-600"], ["partner_settlement", "تسویه با شخص", "bg-indigo-600"], ["case_transfer", "انتقال از پرونده", "bg-blue-600"] ] as const).filter(([value]) => !ownAccount || (value !== "customer_receipt" && value !== "case_transfer")).map(([value, label, color]) => <button type="button" key={value} onClick={() => { setKind(value); setSourceOrderId(0); }} className={`rounded-md px-2 py-2 text-[10px] font-bold transition ${kind === value ? `${color} text-white` : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>
        {ownAccount && ["stakeholder_fund_contribution", "capital_repayment", ...(ownAccount ? ["partner_settlement"] : [])].includes(kind) && <label className="block text-xs">صاحب سرمایه<select aria-label="صاحب سرمایه" value={capitalPartyId} onChange={e => setCapitalPartyId(e.target.value)} className={inputClass}><option value="">انتخاب از اشخاص و شرکت‌ها</option>{db.cashPartners.filter(p => !p.isCustomer && p.category !== "customer").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" onClick={() => capitalDirectory.open(p => setCapitalPartyId(p.id))} className="mt-1 rounded border px-2 py-1 text-indigo-700">تعریف شریک</button></label>}
        <label className="block text-xs font-semibold text-slate-600">{t("نوع سند", "Entry type")}<select value={kind} onChange={(e) => { setKind(e.target.value as EntryKind); setSourceOrderId(0); setLinkedTransactionId(0); }} className={`${inputClass} mt-1`}>{ownAccount && <><option value="stakeholder_fund_contribution">آورده سرمایه مالک / شریک</option><option value="capital_repayment">بازپرداخت اصل سرمایه</option><option value="own_sale_receipt">وصول فروش پروندهٔ ملکی</option><option value="own_sale_refund">برگشت وجه فروش پروندهٔ ملکی</option></>}<option value="company_loan_receipt">{t("دریافت قرض از شرکت به پرونده", "Receive company loan into case")}</option><option disabled={ownAccount} value="customer_receipt">{t("دریافت از خریدار", "Receipt from buyer")}</option><option value="supplier_payment">{t("پرداخت به فروشنده", "Payment to supplier")}</option><option value="order_expense">{t("هزینه پرونده، بانک، حمل یا راننده", "Order, bank, logistics or driver cost")}</option><option value="partner_settlement">{t("پرداخت یا تسویه با شخص", "Person/partner settlement")}</option><option disabled={ownAccount} value="case_transfer">{t("انتقال از پرونده", "Transfer from another order")}</option><option value="funding_repayment">{t("بازپرداخت به منبع تأمین وجه", "Repay funding source")}</option><option value="arca_loan_repayment">{t("بازپرداخت قرض به آرکاتاو", "Repay Arcatav loan")}</option><option value="stakeholder_case_loan_repayment">{t("بازپرداخت قرض به صاحب سهم", "Repay stakeholder case loan")}</option><option disabled={ownAccount} value="customer_refund">{t("عودت وجه به مشتری", "Customer refund")}</option><option disabled={ownAccount} value="credit_allocation">{t("استفاده از اضافه‌پرداخت همین مشتری", "Apply this customer's existing credit")}</option><option disabled={ownAccount} value="temporary_credit_allocation">{t("تأمین امانی از اعتبار مشتری دیگر", "Temporary funding from another customer")}</option><option disabled={ownAccount} value="temporary_credit_repayment">{t("بازپرداخت تأمین امانی", "Repay temporary customer funding")}</option></select></label>
        {(kind === "credit_allocation" || kind === "temporary_credit_allocation" || kind === "case_transfer") ? <label className="block text-xs font-semibold text-slate-600">{kind === "case_transfer" ? t("پرونده مبدأ", "Source order") : kind === "temporary_credit_allocation" ? t("مشتری و پرونده تأمین‌کننده امانت", "Funding customer and source order") : t("منبع اعتبار", "Credit source")}<select value={source?.order.OrderID || 0} onChange={(e) => setSourceOrderId(Number(e.target.value))} className={`${inputClass} mt-1`}><option value={0}>{t("انتخاب کنید", "Select")}</option>{sourceList.map((item) => <option key={item.order.OrderID} value={item.order.OrderID}>{item.order.CustomerName} — {item.order.ProformaInvoiceID} — {formatNumber(item.summary.availableCredit)} {getOrderCurrency(item.order)}</option>)}</select></label> : kind === "temporary_credit_repayment" ? <label className="block text-xs font-semibold text-slate-600">{t("بدهی امانی مورد بازپرداخت", "Temporary funding to repay")}<select value={selectedAdvance?.allocation.TransactionID || 0} onChange={(e) => setLinkedTransactionId(Number(e.target.value))} className={`${inputClass} mt-1`}><option value={0}>{t("انتخاب کنید", "Select")}</option>{outstandingAdvances.map((item) => <option key={item.allocation.TransactionID} value={item.allocation.TransactionID}>{item.sourceOrder?.CustomerName} — {item.sourceOrder?.ProformaInvoiceID} — {formatNumber(item.outstanding)} {getOrderCurrency(item.sourceOrder)}</option>)}</select></label> : kind === "stakeholder_case_loan_repayment" ? <label className="block text-xs font-semibold text-slate-600">{t("قرض صاحب سهم برای بازپرداخت", "Stakeholder loan to repay")}<select value={selectedStakeholderLoan?.loan.TransactionID || 0} onChange={(e) => setLinkedTransactionId(Number(e.target.value))} className={`${inputClass} mt-1`}><option value={0}>{t("انتخاب کنید", "Select")}</option>{outstandingStakeholderLoans.map((item) => <option key={item.loan.TransactionID} value={item.loan.TransactionID}>{item.loan.Counterparty} — {item.sourceOrder?.ProformaInvoiceID} — {formatNumber(item.outstanding)} {orderCurrency}</option>)}</select></label> : <label className="block text-xs font-semibold text-slate-600">{t("ارز پرداخت", "Payment currency")}<select value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value)} className={`${inputClass} mt-1`}><option>USD</option><option>EUR</option><option>AED</option><option>TRY</option><option>CAD</option><option>IRR</option></select></label>}
        {kind === "temporary_credit_repayment" && <label className="block text-xs font-semibold text-slate-600">{t("ارز مبلغ بازپرداخت‌شده", "Repayment currency")}<select value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value)} className={`${inputClass} mt-1`}><option>USD</option><option>EUR</option><option>AED</option><option>TRY</option><option>CAD</option><option>IRR</option></select></label>}
        <div className="col-span-2 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">{kind === "credit_allocation" || kind === "temporary_credit_allocation" || kind === "case_transfer" ? t("مبلغ از اعتبار مبدأ", "Source credit amount") : t("مبلغ پرداخت", "Payment amount")}<input type="number" min="0" step="any" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className={`${inputClass} mt-1`}/></label><label className="text-xs font-semibold text-slate-600">{t(`نرخ تبدیل به ${kind === "temporary_credit_repayment" ? getOrderCurrency(selectedAdvance?.sourceOrder) : orderCurrency}`, `Rate to ${kind === "temporary_credit_repayment" ? getOrderCurrency(selectedAdvance?.sourceOrder) : orderCurrency}`)}<input type="number" min="0" step="any" value={rate || ""} onChange={(e) => setRate(Number(e.target.value))} className={`${inputClass} mt-1`}/></label></div>
        <div className="col-span-2 flex items-center justify-between gap-2 rounded-md border border-indigo-100 bg-white px-2 py-1.5 text-[10px]"><span>{kind === "temporary_credit_repayment" ? t("معادل بازگشتی", "Restored equivalent") : t("معادل پروفورما", "Proforma equivalent")}</span><b className="font-mono text-indigo-700">{formatNumber(converted)} {kind === "temporary_credit_repayment" ? getOrderCurrency(selectedAdvance?.sourceOrder) : orderCurrency}</b></div>
        <label className="block text-xs text-slate-600">{t("شرح عملیات", "Description")}<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("مثال: هزینه انتقال ترکیه–دبی", "e.g. Turkey–Dubai transaction costs")} className={`${inputClass} mt-1`}/></label>
        <label className="block text-xs text-slate-600">{t("طرف حساب / دریافت‌کننده", "Counterparty / payee")}<input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={kind === "customer_receipt" ? order?.CustomerName : t("مثال: Al Rehman یا Angar Logistics", "e.g. Al Rehman or Angar Logistics")} className={`${inputClass} mt-1`}/></label>
        {kind === "company_loan_receipt" && <InlineHelp><p className="col-span-2 rounded bg-violet-50 p-2 text-xs leading-6 text-violet-800">این ثبت برای واریز پول شرکت به پرونده است. پرداخت بعدی را از موجودی پرونده ثبت کنید. اگر شرکت مستقیماً به فروشنده پرداخت کرده، فقط سند «پرداخت به فروشنده» را با منبع همان شرکت ثبت کنید تا قرض دوباره شمرده نشود.</p></InlineHelp>}
        {kind === "funding_repayment" && <label className="col-span-2 text-xs">سند تأمین وجه برای بازپرداخت<select value={linkedTransactionId} onChange={(e) => { const id = Number(e.target.value); setLinkedTransactionId(id); const claim = fundingClaims.find((c) => c.payment.TransactionID === id); if (claim) { setPaymentCurrency(claim.currency); setRate(claim.payment.Exchange_Rate); } }} className={inputClass}><option value={0}>انتخاب سند</option>{fundingClaims.filter((c) => c.outstanding > 0.005 || c.payment.TransactionID === linkedTransactionId).map((c) => <option key={c.payment.TransactionID} value={c.payment.TransactionID}>{c.name} · #{c.payment.TransactionID} · {formatNumber(c.outstanding)} {c.currency}</option>)}</select></label>}
        {fundingPayment && <label className="block text-xs font-semibold text-slate-600">{t("منبع پرداخت", "Funding source")}<select value={fundingSource === "other" && ownedCompanies.some((company) => company.id === fundingPartyId) ? fundingPartyId : fundingSource} onChange={(e) => chooseFundingSource(e.target.value as "buyer_funds" | "arcatav" | "other" | "owner_funds")} className={`${inputClass} mt-1`}>{ownedCompanies.filter((company) => !(kind === "company_loan_receipt" && ownAccount && company.id === order?.EconomicOwnerPartyId)).map((company) => <option key={company.id} value={company.id}>{ownAccount && company.id === order?.EconomicOwnerPartyId ? "پرداخت از موجودی مالک" : "تأمین از موجودی شرکت"} — {company.name} / {company.nameEn}</option>)}<option disabled={kind === "company_loan_receipt"} value="buyer_funds">{ownAccount ? t("از موجودی پرونده", "From case funds") : t("از وجه دریافتی خریدار", "From buyer funds")}</option>{fundingSource === "arcatav" && <option value="arcatav">{t("آرکاتاو — ثبت قدیمی", "Arcatav — legacy entry")}</option>}<option value="other">{t("شخص / شرکت تأمین‌کننده", "Funding person / company")}</option></select></label>}
        {fundingPayment && fundingSource === "other" && ownAccount && fundingPartyId && kind !== "company_loan_receipt" && <p className="col-span-2 rounded bg-indigo-50 p-2 text-xs text-indigo-800">{fundingPartyId === order?.EconomicOwnerPartyId ? "تأمین از منابع خود مالک؛ بدون دریافت مشتری و بدون قرض به خود." : `پرداخت ${fundingParty?.name || "شرکت تأمین‌کننده"} بابت پروندهٔ ${db.cashPartners.find((party) => party.id === order?.EconomicOwnerPartyId)?.name || "مالک"}؛ به‌عنوان بدهی مالک به منبع پرداخت محاسبه می‌شود.`}</p>}
        {fundingPayment && fundingSource === "other" && <div className="col-span-2 space-y-2"><select aria-label="شخص یا شرکت تأمین‌کننده" value={fundingPartyId} onChange={(e) => setFundingPartyId(e.target.value)} className={inputClass}><option value="">انتخاب منبع مشخص</option>{db.cashPartners.filter((party) => ((party.isFundingSource && !db.hiddenPartyIds?.includes(party.id)) || party.id === fundingPartyId) && !(kind === "company_loan_receipt" && ownAccount && party.id === order?.EconomicOwnerPartyId)).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select><button type="button" onClick={() => setFundingOpen(!fundingOpen)} className="text-indigo-700 underline">تعریف منبع / مشاهده مانده منابع</button>{fundingOpen && <PaymentFundingPanel db={db} onSaveParty={onSaveParty} onSelect={setFundingPartyId}/>}</div>}
        {formError && <p role="alert" className="col-span-2 rounded bg-rose-50 p-2 text-rose-700">{formError}</p>}
        <div className="col-span-2 grid grid-cols-2 gap-2"><label className="text-xs text-slate-600">{t("تاریخ پرداخت", "Payment date")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mt-1`}/></label><label className="text-xs text-slate-600">{t("شماره رسید", "Receipt reference")}<input value={slip} onChange={(e) => setSlip(e.target.value)} className={`${inputClass} mt-1`}/></label></div>
        <label className="block text-xs text-slate-600">{t("حساب دریافت/پرداخت", "Receiving/payment account")}<input value={account} onChange={(e) => setAccount(e.target.value)} className={`${inputClass} mt-1`}/></label>
        <label className="block text-xs text-slate-600">{t("یادداشت", "Note")}<input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1`}/></label>
        <div className="col-span-2 rounded-lg border border-dashed border-indigo-200 bg-white p-2">
          <div className="flex items-center justify-between gap-2"><div><b className="text-xs text-slate-700">{t("رسیدهای پرداخت", "Payment receipts")}</b><InlineHelp><p className="text-[10px] text-slate-400">{t("تصویر یا PDF؛ ذخیره دائمی همراه سند", "Image or PDF; permanently stored with the entry")}</p></InlineHelp></div><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700"><Upload size={13}/>{t("آپلود", "Upload")}<input multiple type="file" accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={(e) => { addReceipts(e.target.files); e.target.value = ""; }}/></label></div>
          <div className="mt-2 space-y-1">{receipts.map((item) => <div key={item.id} className="flex items-center gap-2 rounded border bg-slate-50 p-2 text-[10px]"><FileText size={13} className="text-indigo-500"/><span className="min-w-0 flex-1 truncate">{item.name}</span><button type="button" onClick={() => preview(item)} title={t("نمایش", "Preview")}><Eye size={13}/></button><button type="button" onClick={() => setReceipts((current) => current.filter((file) => file.id !== item.id))} className="text-rose-600" title={t("حذف", "Remove")}><Trash2 size={13}/></button></div>)}</div>
        </div>
        <button onClick={save} className="col-span-2 w-full rounded-md bg-indigo-600 py-2 text-xs font-bold text-white">{editingTransactionId ? t("ذخیره تغییرات سند انتخاب‌شده", "Save selected entry") : t("ثبت سند", "Post entry")}</button>
      </div>
  );

  return <div className="space-y-3">
    {guided&&<ReferenceWorkflow title="گردش وجه پرونده" description="برای هر دریافت، پرداخت یا هزینه یک سند ثبت کنید. اسناد قبلی و ابزارهای انتقال در بخش جدا هستند." value={referenceStep} onChange={setReferenceStep} steps={[{id:'entry',title:'ثبت عملیات',hint:'نوع سند، مبلغ، ارز و شرح'},{id:'history',title:'اسناد ثبت‌شده',hint:'مشاهده، ویرایش، رسید و خروجی اکسل'},{id:'advanced',title:'مانده‌ها و انتقال وجه',hint:'اعتبار مشتری، صندوق و ورود گروهی Excel'}]}/>}
    <div hidden={guided&&referenceStep!=='advanced'} className="rounded-xl border border-slate-200 bg-white p-3">
      {fixedOrderId ? <div className="flex items-baseline justify-between gap-3"><span className="text-[10px] font-semibold text-slate-500">{t("دفتر پرونده", "Order ledger")}</span><div className="truncate text-sm font-bold text-indigo-800">{order?.ProformaInvoiceID} — {order?.CustomerName}</div></div> : <><label className="block text-xs font-semibold text-slate-600">{t("پرونده / پیش‌فاکتور", "Order / proforma")}</label><select value={order?.OrderID || 0} onChange={(e) => { setOrderId(Number(e.target.value)); setSourceOrderId(0); }} className={`${inputClass} mt-1`}>{db.orders.map((item) => <option key={item.OrderID} value={item.OrderID}>{item.ProformaInvoiceID} — {item.CustomerName}</option>)}</select></>}
      {summary && <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {ownAccount && <div className="col-span-full rounded-lg bg-violet-50 p-2 text-xs text-violet-800">پرونده به حساب: <b>{db.cashPartners.find((party) => party.id === order?.EconomicOwnerPartyId)?.name || "مالک مشخص نشده"}</b> · خریدار درج‌شده روی سند: {order?.CustomerName} · این پرونده طلبی از خریدار سند ایجاد نمی‌کند.</div>}
        {hasValue(summary.ownerFunding) && <Metric label={t("پرداخت از منابع خود مالک", "Paid from owner funds")} value={summary.ownerFunding} currency={orderCurrency} tone="blue"/>}
        {hasValue(summary.companyLoanReceipts) && <Metric label={t("قرض دریافتی از شرکت‌ها", "Company loans received")} value={summary.companyLoanReceipts} currency={orderCurrency} tone="amber"/>}
        {hasValue(summary.invoiceTotal) && <Metric label={t("مبلغ پروفورما", "Proforma total")} value={summary.invoiceTotal} currency={orderCurrency}/>}
        {hasValue(summary.applied) && <Metric label={t("وجه تأمین‌شدهٔ پرونده", "Case funding applied")} value={summary.applied} currency={orderCurrency}/>}
        {hasValue(summary.outstanding) && <Metric label={ownAccount ? t("کسری موجودی پرونده", "Case funding shortfall") : t("ماندهٔ تأمین وجه پروفورما", "Proforma funding outstanding")} value={summary.outstanding} currency={orderCurrency} tone="rose"/>}
        {hasValue(summary.customerOutstanding) && <Metric label={t("ماندهٔ طلب از مشتری", "Customer receivable")} value={summary.customerOutstanding} currency={orderCurrency} tone="amber"/>}
        {hasValue(summary.availableCredit) && <Metric label={t("اعتبار قابل استفاده مشتری", "Available customer credit")} value={summary.availableCredit} currency={orderCurrency} tone="blue"/>}
        {hasValue(summary.caseFundReceived) && <Metric label={t("تأمین وجه از پرونده‌ها", "Funding received from cases")} value={summary.caseFundReceived} currency={orderCurrency} tone="blue"/>}
        {hasValue(summary.caseCashBalance) && <Metric label={t("موجودی قابل مصرف پرونده", "Usable case balance")} value={summary.caseCashBalance} currency={orderCurrency} tone={summary.caseCashBalance < 0 ? "rose" : "blue"}/>} 
        {hasValue(summary.stakeholderLoanDebt) && <Metric label={t("بدهی به صاحبان سهم", "Due to stakeholders")} value={summary.stakeholderLoanDebt} currency={orderCurrency} tone="amber"/>}
        {fundingClaims.filter((claim) => claim.outstanding > 0.005).map((claim) => <div key={claim.payment.TransactionID}><Metric label={`بدهی به ${claim.name} · سند ${claim.payment.TransactionID}`} value={claim.outstanding} currency={claim.currency} tone="amber"/></div>)}
        {hasValue(summary.temporaryDebt) && <Metric label={t("بدهی امانی باز", "Temporary funding due")} value={summary.temporaryDebt} currency={orderCurrency} tone="amber"/>}
        <div className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${statusClass}`}><span className="text-[10px] opacity-70">{t("وضعیت حساب", "Account status")}</span><b className="text-sm">{statusLabel}</b></div>
      </div>}
      {summary && hasValue(summary.availableCredit) && <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-[10px] text-blue-900">
        <b>{t("نحوه محاسبه اعتبار:", "Credit calculation:")}</b>{" "}
        {t("دریافت و اعتبار اعمال‌شده", "Payments and applied credit")} ({formatNumber(summary.applied)}) − {t("مبلغ پروفورما", "Proforma total")} ({formatNumber(summary.invoiceTotal)}) − {t("اعتبار منتقل/عودت‌شده", "Allocated/refunded credit")} ({formatNumber(summary.allocatedOut + summary.refunded)}) + {t("امانت بازگشته", "Restored temporary funding")} ({formatNumber(summary.temporaryRestored)}) = <b>{formatNumber(summary.availableCredit)} {orderCurrency}</b>
      </div>}
      {customerCreditByCurrency.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2.5 py-2 text-[10px] text-indigo-900">
        <b>{t("اعتبار سراسری مشتری برای خریدهای بعدی:", "Customer credit for future orders:")}</b>
        {customerCreditByCurrency.map(([currency, value]) => <span key={currency} className="rounded bg-white px-1.5 py-0.5 font-mono font-bold">{formatNumber(value)} {currency}</span>)}
        <span className="text-indigo-700">{t("برای مصرف آن در این پرونده، از نوع سند «استفاده از اضافه‌پرداخت همین مشتری» استفاده کنید.", "Use “Apply this customer's existing credit” to apply it to this order.")}</span>
      </div>}
      <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xs font-bold text-violet-950">{t("صندوق پرونده و انتقال بین پرونده‌ای", "Case fund and inter-case transfer")}</h2><InlineHelp><p className="mt-1 text-[10px] text-violet-800">{t("ابتدا دریافت از هر صاحب سهم در صندوق همین پرونده ثبت می‌شود؛ سپس فقط از ماندهٔ صندوق به پروندهٔ مقصد انتقال داده می‌شود.", "Contributions are recorded in this case fund first; only the fund balance can then be transferred to another case.")}</p></InlineHelp></div><div className="grid grid-cols-3 gap-1 text-[10px]"><span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">{t("دریافت", "In")}: <b className="font-mono">+{formatNumber(fundContributed)}</b></span><span className="rounded bg-rose-50 px-2 py-1 text-rose-700">{t("انتقال", "Out")}: <b className="font-mono">−{formatNumber(fundTransferredOut)}</b></span><span className="rounded bg-violet-700 px-2 py-1 text-white">{t("مانده", "Balance")}: <b className="font-mono">{formatNumber(caseFundBalance)} {orderCurrency}</b></span></div></div>
        {fundOwners.length || caseFundBalance > 0.005 ? <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr]"><div className="overflow-x-auto rounded-lg border border-violet-100 bg-white"><div className="min-w-[620px]"><div className="grid grid-cols-[minmax(9rem,1fr)_minmax(5rem,auto)_minmax(5rem,auto)_minmax(5rem,auto)_7rem] items-center gap-2 bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-900"><span>{t("صاحب سهم", "Stakeholder")}</span><span className="text-center">{t("سهم به ارز پرونده", "Share in case currency")} ({getOrderCurrency(order)})</span><span className="text-center text-emerald-700">{t("دریافت صندوق", "Fund receipt")}</span><span className="text-center text-rose-700">{t("قرض به پرونده", "Loan to case")}</span><span className="text-center">{t("واریز جدید", "New contribution")}</span></div>{fundOwners.map((owner) => { const contributed = contributedFor(owner); const loaned = Math.max(0, loanedFor(owner) - repaidFor(owner)); const available = Math.max(0, owner.share - contributed); return <div key={owner.id} className="grid grid-cols-[minmax(9rem,1fr)_minmax(5rem,auto)_minmax(5rem,auto)_minmax(5rem,auto)_7rem] items-center gap-2 border-t px-3 py-2 text-[11px]"><span className="min-w-0"><b className="block truncate">{owner.name}</b><small className="block truncate text-slate-400">{owner.role}</small><small className="block text-slate-400">{t("مانده قابل‌واریز", "Available to fund")}: {formatNumber(available)}</small></span><span className="text-center font-mono text-slate-700">{formatNumber(owner.share)}</span><span className={contributed > .005 ? "text-center font-mono font-bold text-emerald-700" : "text-center font-mono text-slate-400"}>{contributed > .005 ? `+${formatNumber(contributed)}` : "—"}</span><span className={loaned > .005 ? "text-center font-mono font-bold text-rose-700" : "text-center font-mono text-slate-400"}>{loaned > .005 ? `−${formatNumber(loaned)}` : "—"}</span><input type="number" min="0" max={available} step="any" value={fundContributions[owner.id] || ""} onChange={(e) => setFundContributions((current) => ({ ...current, [owner.id]: Number(e.target.value) || 0 }))} className="w-full rounded border border-violet-200 p-1 text-center font-mono"/></div>; })}{!fundOwners.length && <p className="p-3 text-center text-[11px] text-slate-500">{t("این صندوق از انتقال قبلی موجودی دارد.", "This fund has a balance from an earlier transfer.")}</p>}</div></div><div className="space-y-2 rounded-lg border border-violet-100 bg-white p-2.5"><label className="block text-[11px] font-bold text-slate-700">{t("پروندهٔ مقصد", "Target case")}<div className="relative mt-1"><input value={fundTargetQuery} onFocus={() => setFundTargetOpen(true)} onChange={(e) => { setFundTargetQuery(e.target.value); setFundTargetOrderId(0); setFundTargetOpen(true); }} placeholder={t("شماره پروفرما یا نام مشتری را تایپ کنید…", "Type a proforma number or customer name…")} className={inputClass} autoComplete="off"/>{fundTargetOpen && <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-violet-200 bg-white py-1 shadow-lg">{fundTargetCandidates.length ? fundTargetCandidates.map((item) => <button key={item.OrderID} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseFundTarget(item)} className="flex w-full flex-col px-3 py-2 text-right text-[11px] hover:bg-violet-50"><b className="font-mono text-violet-800">{item.ProformaInvoiceID}</b><span className="truncate text-slate-500">{item.CustomerName} · {item.ProductName || "—"}</span></button>) : <p className="px-3 py-2 text-[11px] text-slate-500">{t("پرونده هم‌ارزی پیدا نشد.", "No matching case found.")}</p>}</div>}</div>{fundTarget && <p className="mt-1 text-[10px] text-emerald-700">{t("پرونده انتخاب‌شده", "Selected case")}: <b className="font-mono">{fundTarget.ProformaInvoiceID}</b></p>}</label><label className="block text-[11px] font-bold text-slate-700">{t("مبلغ انتقال از صندوق", "Transfer amount from fund")}<input type="number" min="0" step="any" value={fundTransferAmount || ""} onChange={(e) => setFundTransferAmount(Number(e.target.value) || 0)} className={`${inputClass} mt-1`}/></label><div className="rounded bg-emerald-50 p-2 text-[10px] text-emerald-700">{t("واریز جدید صاحبان سهم", "New stakeholder contributions")}: <b className="font-mono">+{formatNumber(Object.values(fundContributions).reduce<number>((sum, value) => sum + Number(value || 0), 0))} {orderCurrency}</b></div><button type="button" onClick={saveFundTransfer} className="w-full rounded bg-violet-700 px-3 py-2 text-xs font-bold text-white">{t("ثبت دریافت‌ها و انتقال صندوق", "Post contributions and fund transfer")}</button></div></div> : <p className="mt-2 rounded-lg bg-white p-2 text-center text-[11px] text-slate-500">{t("برای استفاده از صندوق، ابتدا برای این پرونده صاحبان سهم را در بخش «سود و پورسانت» تعریف کنید.", "Define the case stakeholders in the profit-and-commission section first.")}</p>}
      </section>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setAiImportOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100"><Bot size={15}/>دستیار هوشمند Excel</button><span className="self-center text-[10px] text-slate-500">کپی جدول یا بارگذاری Excel؛ ثبت نهایی فقط پس از تأیید شما انجام می‌شود.</span></div>
      {aiImportOpen && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3"><div className="flex items-center gap-2"><Sparkles size={15} className="text-violet-600"/><b className="text-xs text-violet-950">ورود هوشمند عملیات مالی برای همین پرونده</b></div><InlineHelp><p className="mt-1 text-[10px] text-violet-800">فایل Excel/CSV را اضافه کنید یا محدوده‌ای را از Excel کپی کنید. ابتدا پیش‌نمایش می‌بینید و سپس ثبت را تأیید می‌کنید.</p></InlineHelp><div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]"><textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="جدول کپی‌شده از Excel را اینجا Paste کنید؛ ستون‌های پیشنهادی: تاریخ، نوع، مبلغ، ارز، شرح، طرف حساب" className="min-h-24 rounded-lg border border-violet-200 bg-white p-2 text-xs outline-none focus:border-violet-500"/><div className="flex flex-col gap-2"><label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-violet-700 shadow-sm"><FileSpreadsheet size={14}/>افزودن Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { importFileForAI(e.target.files?.[0]); e.target.value = ""; }}/></label><button type="button" onClick={() => parseFinancialRows(aiText.trim().split(/\r?\n/).map((line) => line.split(aiText.includes("\t") ? "\t" : ",")))} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700">ساخت پیش‌نمایش</button><button type="button" disabled={!aiText.trim() || aiBusy || !navigator.onLine} onClick={analyzeWithAI} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{aiBusy ? "در حال تحلیل…" : "تحلیل با AI"}</button></div></div>{aiReply && <div className="mt-2 rounded-lg bg-white p-2 text-xs leading-6 text-slate-700 whitespace-pre-wrap">{aiReply}</div>}{aiReply && <div className="mt-2 flex gap-2"><input value={aiFollowup} onChange={(e) => setAiFollowup(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendFollowupToAI(); }} placeholder="پاسخ شما به دستیار؛ مثال: تأیید است، ثبت کن / فقط هزینه‌ها را ثبت کن" className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs outline-none focus:border-violet-500"/><button type="button" disabled={!aiFollowup.trim() || aiBusy || !navigator.onLine} onClick={sendFollowupToAI} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">ارسال</button></div>}<div className="mt-3 rounded-lg border border-violet-100 bg-white p-3"><div className="flex items-center justify-between gap-3"><b className="text-xs">پیش‌نمایش عملیات قابل ثبت: {importRows.length} ردیف</b><button onClick={applyImportedRows} disabled={!importRows.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">تأیید و ثبت در پرونده</button></div>{!importRows.length && <p className="mt-1 text-[10px] text-slate-500">برای فعال‌شدن دکمه، فایل را اضافه یا جدول را Paste کنید و «ساخت پیش‌نمایش» را بزنید.</p>}{importRows.length > 0 && <div className="mt-2 max-h-32 overflow-auto text-[11px]">{importRows.map((row, index) => <div key={index} className="flex justify-between border-t py-1.5"><span>{row.kind === "customer_receipt" ? "دریافت" : row.kind === "order_expense" ? "هزینه" : row.kind === "supplier_payment" ? "پرداخت" : "تسویه"} · {row.description}</span><b className="font-mono">{formatNumber(row.amount)} {row.currency}</b></div>)}</div>}</div></div>}
    </div>

    <div className={`grid gap-3 ${guided?"":"lg:grid-cols-3"}`}>
      {editingTransactionId !== null ? createPortal(
        <dialog ref={editDialogRef} aria-labelledby="payment-entry-edit-title" onCancel={(event) => { event.preventDefault(); cancelEdit(); }} onKeyDown={(event) => event.stopPropagation()} className="m-auto max-h-[90dvh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-indigo-200 bg-white p-4 text-slate-800 shadow-2xl backdrop:bg-slate-950/60">
          <div dir={fa ? "rtl" : "ltr"}>
            <h2 id="payment-entry-edit-title" className="mb-3 font-bold text-indigo-800">{t("ویرایش سند", "Edit entry")} #{editingTransactionId} · {order?.ProformaInvoiceID}</h2>
            {transactionForm}
          </div>
        </dialog>, document.body
      ) : <div hidden={guided&&referenceStep!=="entry"}>{transactionForm}</div>}

      <div hidden={guided&&referenceStep!=="history"} className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${guided?"":"lg:col-span-2"}`}>
        <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2"><div><b className="text-xs">{t("گردش حساب پرونده", "Order account activity")}</b><span className="mr-2 text-[10px] text-slate-500">{t("هر پرداخت با ارز و نرخ همان تاریخ ثبت می‌شود.", "Each payment keeps its original currency and rate.")}</span></div><button type="button" onClick={exportLedgerExcel} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet size={13}/>{t("خروجی Excel", "Export Excel")}</button></div>
        <table className="w-full min-w-[1120px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">{t("تاریخ", "Date")}</th><th>{t("شرح / طرف حساب", "Description / counterparty")}</th><th>{t("نوع", "Type")}</th><th>{t("مبلغ اصلی", "Original")}</th><th>{t("معادل ورودی", "In")}</th><th>{t("معادل خروجی", "Out")}</th><th>{t("مانده", "Balance")}</th><th>{t("منبع / حساب", "Source / account")}</th><th>{t("مرجع", "Reference")}</th><th>{t("عملیات", "Actions")}</th></tr></thead><tbody>{related.map((item) => {
          const outgoing = item.SourceOrderID === order?.OrderID;
          const restoration = item.TransactionType === "temporary_credit_repayment" && outgoing;
          const debit = (outgoing && item.TransactionType !== "temporary_credit_repayment") || item.TransactionType === "customer_refund";
          const label = item.TransactionType?.startsWith("commission_") ? workbenchTransactionLabels[item.TransactionType] : item.TransactionType === "company_loan_receipt" ? t("دریافت قرض از شرکت", "Company loan received") : item.IsFundingRepayment ? t("بازپرداخت به منبع", "Funding repayment") : item.TransactionType === "stakeholder_fund_contribution" ? t("واریز صاحب سهم به صندوق", "Stakeholder contribution to fund") : item.TransactionType === "stakeholder_case_loan" ? t("قرض از سهم ذی‌نفع به پرونده", "Stakeholder loan to case") : item.TransactionType === "stakeholder_case_loan_repayment" ? t("بازپرداخت قرض به ذی‌نفع", "Repayment of stakeholder loan") : item.TransactionType === "case_fund_transfer" ? (outgoing ? t("انتقال از صندوق پرونده", "Transfer out of case fund") : t("دریافت از صندوق پرونده", "Received from case fund")) : item.TransactionType === "supplier_payment" ? t("پرداخت فروشنده", "Supplier payment") : item.TransactionType === "order_expense" ? t("هزینه پرونده", "Order expense") : item.TransactionType === "partner_settlement" ? t("تسویه شخص", "Person settlement") : item.TransactionType === "arca_loan_repayment" ? t("بازپرداخت قرض به آرکاتاو", "Repay Arcatav loan") : item.TransactionType === "credit_allocation" ? (outgoing ? t("انتقال اعتبار به پرونده", "Credit allocated out") : t("اعتبار دریافتی از پرونده", "Credit applied in")) : item.TransactionType === "temporary_credit_allocation" ? (outgoing ? t("تأمین امانی برای مشتری دیگر", "Temporary funding provided") : t("تأمین امانی دریافتی", "Temporary funding received")) : item.TransactionType === "temporary_credit_repayment" ? (restoration ? t("بازگشت امانت به اعتبار", "Temporary funding restored") : t("بازپرداخت امانت دریافت‌شده", "Temporary funding repaid")) : item.TransactionType === "customer_refund" ? t("عودت به مشتری", "Customer refund") : t("دریافت مشتری", "Customer receipt");
          const relatedOrder = item.SourceOrderID ? db.orders.find((x) => x.OrderID === (outgoing ? item.OrderID : item.SourceOrderID)) : undefined;
          const movement = getCaseCashMovement(db, order!, item);
          const operationalOut = movement.outgoing > 0;
          const operationalIn = movement.incoming > 0;
          const equivalent = transactionAmountInOrderCurrency(order!, item);
          const sourceLabel = item.FundingPartyId ? db.cashPartners.find((p) => p.id === item.FundingPartyId)?.name || item.FundingPartyName || item.FundingPartyId : item.FundingSource === "arcatav" ? t("آرکاتاو", "Arcatav") : item.FundingSource === "buyer_funds" ? t("وجه خریدار", "Buyer funds") : item.FundingSource === "other" ? t("سایر", "Other") : relatedOrder?.ProformaInvoiceID || "-";
          return <React.Fragment key={item.TransactionID}><tr className="border-t align-top"><td className="p-3 font-mono">{item.PaytDate || "-"}</td><td><b className="block text-slate-700">{item.Description || label}</b><span className="text-[10px] text-slate-500">{item.Counterparty || "-"}{item.Note ? ` — ${item.Note}` : ""}</span></td><td className={operationalOut || debit ? "text-rose-700" : "text-emerald-700"}>{label}</td><td className="font-mono">{formatNumber(item.SourceAmount || item.Amount)} {item.PaymentCurrency || orderCurrency}<span className="block text-[10px] text-slate-400">× {formatNumber(item.Exchange_Rate || 1)}</span></td><td className="font-mono font-bold text-emerald-700">{operationalIn ? formatNumber(movement.incoming) : "-"}</td><td className="font-mono font-bold text-rose-700">{operationalOut ? formatNumber(movement.outgoing) : "-"}</td><td className={`font-mono font-bold ${(runningBalances.get(item.TransactionID) || 0) < 0 ? "text-rose-700" : "text-slate-700"}`}>{runningBalances.has(item.TransactionID) ? formatNumber(runningBalances.get(item.TransactionID) || 0) : "-"}</td><td>{sourceLabel}<span className="block text-[10px] text-slate-400">{item.CompanyAccount || "-"}</span></td><td className="font-mono">{item.Slip || "-"}</td><td><div className="flex gap-1">{item.IsDerivedLegacyPosting ? <span className="text-[10px] text-indigo-600" title={item.Note}>ویرایش از سند اصلی</span> : <button type="button" onClick={() => editEntry(item)} className="rounded bg-indigo-50 p-1.5 text-indigo-700" title={t("ویرایش", "Edit")}><Pencil size={13}/></button>}{!item.IsDerivedLegacyPosting && onDeleteTransaction && <button type="button" onClick={() => { if (window.confirm(t("این سند حسابداری حذف شود؟", "Delete this accounting entry?"))) onDeleteTransaction(item.TransactionID); }} className="rounded bg-rose-50 p-1.5 text-rose-700" title={t("حذف", "Delete")}><Trash2 size={13}/></button>}</div></td></tr>{(item.receiptAttachments || []).length > 0 && <tr className="bg-slate-50/70"><td colSpan={10} className="px-3 pb-3"><div className="flex flex-wrap gap-2">{(item.receiptAttachments || []).map((attachment) => <div key={attachment.id} className="flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-[10px]"><FileText size={13} className="text-indigo-500"/><span className="max-w-40 truncate">{attachment.name}</span><button onClick={() => preview(attachment)} className="text-indigo-600" title={t("نمایش", "Preview")}><Eye size={13}/></button><button onClick={() => download(attachment)} className="text-slate-600" title={t("دانلود", "Download")}><Download size={13}/></button><button onClick={() => removeSavedReceipt(item, attachment.id)} className="text-rose-600" title={t("حذف از دیتابیس", "Delete from database")}><Trash2 size={13}/></button></div>)}</div></td></tr>}</React.Fragment>;
        })}</tbody></table>
        {related.length === 0 && <p className="p-8 text-center text-xs text-slate-400">{t("هنوز سندی برای این پرونده ثبت نشده است.", "No ledger entries have been posted for this order.")}</p>}
      </div>
    </div>
  </div>;
};

const Metric = ({ label, value, currency, tone = "slate" }: { label: string; value: number; currency: string; tone?: "slate" | "rose" | "blue" | "amber" }) => <div className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${tone === "rose" ? "bg-rose-50 text-rose-800" : tone === "blue" ? "bg-blue-50 text-blue-800" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-800"}`}><span className="truncate text-[10px] opacity-70">{label}</span><b className="shrink-0 font-mono text-xs">{formatNumber(value)} {currency}</b></div>;
