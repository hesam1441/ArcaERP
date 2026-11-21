import { AppDatabase, FinancialGroup, Order, OrderTransaction } from "../types";
import { getCentralCaseLedger, getOrderInvoiceToUSDMultiplier, getOrderProfitToUSDMultiplier, getOrderQuantityMT, transactionAmountInOrderCurrency, isExcludedFromFinancialCalculations, getCaseCashMovement, getOrderAmountInProfitCurrency } from "./orderAccounting";
import { getCaseProfitPlan, getIssuerProfitCompany } from "./caseProfitEngine";
import { rialSalesSummary, validateRialSale } from "./rialSales";

export const financialGroupForOrder = (db: AppDatabase, id: number) => db.financialGroups?.find(group => group.orderIds.includes(id));
export const groupOrderId = (id: string) => -Math.max(1, Math.abs([...id].reduce((hash,char) => ((hash << 5)-hash+char.charCodeAt(0))|0, 0)));

/** A read projection only. Original payments and invoice figures never move between member cases. */
export function financialGroupContext(db: AppDatabase, group: FinancialGroup) {
  const members = db.orders.filter(order => group.orderIds.includes(order.OrderID) && !isExcludedFromFinancialCalculations(order));
  const reference = db.orders.find(order => order.OrderID === group.referenceOrderId) || members[0];
  if (!reference || !members.length) return null;
  const id = groupOrderId(group.id);
  let missingFX = false, revenue = 0, hasSales = false;
  const entries: OrderTransaction[] = [];
  for (const member of members) {
    const rate = getOrderInvoiceToUSDMultiplier(member);
    const rows = getCentralCaseLedger(db, member).relatedEntries;
    const rial = rialSalesSummary(member);
    if (rial.enabled) { missingFX ||= rial.invalid; revenue += rial.usd; hasSales ||= rial.hasSales && !rial.invalid; }
    for (const entry of rows) {
      if (entry.SourceOrderID && group.orderIds.includes(entry.SourceOrderID) && group.orderIds.includes(entry.OrderID) && ["case_fund_transfer","stakeholder_case_loan","stakeholder_case_loan_repayment","credit_allocation","temporary_credit_allocation","temporary_credit_repayment"].includes(entry.TransactionType||"")) continue;
      if (entry.OrderID !== member.OrderID) {
        const movement = getCaseCashMovement(db, member, entry);
        if (rate === null && (movement.outgoing || movement.incoming)) missingFX = true;
        if (movement.incoming && rate !== null) entries.push({ TransactionID:entries.length+1,OrderID:id,TransactionType:"commission_advance_repayment",PaymentCurrency:"USD",Amount:movement.incoming*rate,ConvertedAmount:movement.incoming*rate,Exchange_Rate:1,PaytDate:entry.PaytDate,Description:"بازگشت وجه از خارج گروه",Note:"",JournalID:`group-source-return:${member.OrderID}:${entry.TransactionID}` });
        if (movement.outgoing && rate !== null) entries.push({ TransactionID:entries.length+1,OrderID:id,TransactionType:"partner_settlement",PaymentCurrency:"USD",Amount:movement.outgoing*rate,ConvertedAmount:movement.outgoing*rate,Exchange_Rate:1,PaytDate:entry.PaytDate,Description:"انتقال وجه به خارج گروه",Note:"",JournalID:`group-source:${member.OrderID}:${entry.TransactionID}` });
        continue;
      }
      if (rate === null) { missingFX = true; continue; }
      const amount = transactionAmountInOrderCurrency(member, entry) * rate;
      const type = entry.TransactionType || "customer_receipt";
      if (!rial.enabled && ["customer_receipt","own_sale_receipt","credit_allocation"].includes(type)) { revenue += amount; hasSales = true; }
      if (!rial.enabled && ["customer_refund","own_sale_refund"].includes(type)) revenue -= amount;
      // Retain cash and capital movements, but remove inter-case endpoints from the consolidated journal.
      entries.push({ ...entry, TransactionID: entries.length+1, OrderID:id, SourceOrderID:undefined, PaymentCurrency:"USD", ProformaCurrency:"USD", Amount:amount, ConvertedAmount:amount, Exchange_Rate:1, JournalID:`group-member:${member.OrderID}:${entry.TransactionID}` });
    }
  }
  const groupRial = rialSalesSummary(group);
  if (groupRial.enabled) { missingFX ||= groupRial.invalid; revenue += groupRial.usd; hasSales ||= groupRial.hasSales && !groupRial.invalid; }
  for (const entry of group.postings || []) {
    if (!(entry.ratePerUSD>0)) { missingFX = true; continue; }
    const amount = entry.amount / entry.ratePerUSD;
    if (!groupRial.enabled && ["customer_receipt","own_sale_receipt"].includes(entry.type)) { revenue += amount; hasSales = true; }
    if (!groupRial.enabled && ["customer_refund","own_sale_refund"].includes(entry.type)) revenue -= amount;
    entries.push({ TransactionID:entries.length+1,OrderID:id,TransactionType:entry.type,Amount:amount,ConvertedAmount:amount,PaymentCurrency:"USD",ProformaCurrency:"USD",Exchange_Rate:1,PaytDate:entry.date,Description:entry.note,Note:"",JournalID:`group-posting:${group.id}:${entry.id}` });
  }
  const supplier = db.suppliers.find(item => item.SupplierID === reference.SupplierID);
  const source = getCaseProfitPlan(reference, supplier);
  const refRate = getOrderProfitToUSDMultiplier(reference);
  if (refRate === null && !group.profitPlan) missingFX = true;
  const scale = refRate ?? 0;
  const plan = group.profitPlan || { route: reference.HasSalesAgent ? "agent" as const : "direct" as const, ...source,
    calculationQuantityMT:undefined, calculationPurchasePricePerMT:undefined, calculationSellPricePerMT:undefined, calculationFreight:undefined,
    calculationPriceToAgentPerMT: (source?.calculationPriceToAgentPerMT ?? reference.PriceToAgent ?? reference.SellPrice ?? 0)*scale,
    transactionSharePerMT: (source?.transactionSharePerMT||0)*scale,
    rules: (source?.rules||[]).map(rule=>({...rule,value:rule.method==="percent"?rule.value:rule.value*scale})),
    manualShare: source?.manualShare ? {...source.manualShare,amount:source.manualShare.amount*scale} : undefined,
    issuerShareOverride: source?.issuerShareOverride ? {...source.issuerShareOverride,value:source.issuerShareOverride.method==="percent"?source.issuerShareOverride.value:source.issuerShareOverride.value*scale} : undefined,
    accountingOverrides:undefined,
  };
  const customShares = group.customShares || (reference.customShares || []).map(share => {
    const native = getOrderAmountInProfitCurrency(reference, Number(share.amount)||0, share.currency);
    if (native === null && Math.abs(share.amount)>.005) missingFX = true;
    return { ...share, amount:(native||0)*scale, currency:"USD" };
  });
  const quantity = members.reduce((sum, member)=>sum+getOrderQuantityMT(member),0);
  const memberOffsets = members.flatMap(member => (member.commissionSettlements || []).filter(row=>row.type==="advance_offset").map(row=>{
    const amount = getOrderAmountInProfitCurrency(member, Number(row.amount)||0, row.currency);
    const rate = getOrderProfitToUSDMultiplier(member);
    if (amount===null || rate===null) missingFX=true;
    return {...row,id:`member-offset:${member.OrderID}:${row.id}`,amount:(amount||0)*(rate||0),currency:"USD"};
  }));
  const order: Order = { ...reference, OrderID:id, ProformaInvoiceID:`گروه: ${group.name}`, ConsolidatedGroupId:group.id, ConsolidatedMemberOffsets:memberOffsets, ConsolidatedSalesUSD:revenue, ConsolidatedHasSales:hasSales, ConsolidatedMissingFX:missingFX,
    PIDate:members.map(item=>item.PIDate||"").sort().at(-1)||reference.PIDate,ActiveOrder:members.some(item=>item.ActiveOrder),CustomerName:`${members.length} پروندهٔ تجمیعی`,
    AgreementCurrency:"USD",InvoiceCurrency:"USD",TransactionCurrency:"USD",ScCurrency:"USD",IsExchangeRateUsed:false,ExchangeRate:1,ExchangeRateApplied:1,TypeOfEXRate:"",
    TotalQuantity:quantity,items:[],SellPrice:quantity?revenue/quantity:0,EndCustomerPrice:quantity?revenue/quantity:0,
    RialSalesEnabled:false,rialSales:[],purchaseProforma:undefined,customShares,companyProfitShares:[],
    profitPlan:{ ...plan,profitBasis:"actual",settlementExchangeRate:1,profitToUSDExchangeRate:1,calculationQuantityMT:quantity },
    OwnAccountSaleSettled:!!group.OwnAccountSaleSettled,commissionSettlements:group.commissionSettlements||[],profitSettlementConfirmations:group.profitSettlementConfirmations||[],
  };
  return { group,members,order,db:{...db,financialGroups:[],orders:[order],orderTransactions:entries},revenueUSD:revenue,missingFX };
}

export function validateFinancialGroups(db: AppDatabase): string | null {
  for (const order of db.orders) {
    if (order.ConsolidatedGroupId) return "نمای تجمیعی نباید به‌عنوان پروفورمای مستقل ذخیره شود.";
    if (order.RialSalesEnabled) for (const row of order.rialSales||[]) { const error=validateRialSale(row); if(error)return error; }
  }
  const assigned = new Set<number>(); const ids = new Set<string>();
  for (const group of db.financialGroups || []) {
    if (!group.id || ids.has(group.id) || !group.name?.trim() || group.orderIds.length<2 || !group.orderIds.includes(group.referenceOrderId)) return "نام گروه، حداقل دو پرونده و پروندهٔ الگوی تقسیم سود را مشخص کنید.";
    ids.add(group.id);
    const members = group.orderIds.map(id=>db.orders.find(order=>order.OrderID===id));
    if (members.some(order=>!order || isExcludedFromFinancialCalculations(order))) return "اعضای گروه باید پرونده‌های واقعی موجود باشند.";
    const ref=members[0]!;const issuer=getIssuerProfitCompany(ref,db.suppliers.find(item=>item.SupplierID===ref.SupplierID));
    for (const member of members) {
      if (assigned.has(member!.OrderID)) return "هر پرونده فقط می‌تواند عضو یک گروه مالی باشد.";
      assigned.add(member!.OrderID);
      if ((member!.TradeOwnership||"customer")!==(ref.TradeOwnership||"customer") || member!.EconomicOwnerPartyId!==ref.EconomicOwnerPartyId || getIssuerProfitCompany(member!,db.suppliers.find(item=>item.SupplierID===member!.SupplierID))!==issuer) return "برای حفظ مالکیت و سهم‌ها، اعضای گروه باید صادرکننده و مالکیت اقتصادی یکسان داشته باشند.";
    }
    for (const row of group.postings || []) {
      if (!["supplier_payment","supplier_refund","order_expense","customer_receipt","customer_refund","own_sale_receipt","own_sale_refund"].includes(row.type) || (row.currency === "USD" && row.ratePerUSD !== 1) || !Number.isFinite(row.amount)||row.amount<=0||!Number.isFinite(row.ratePerUSD)||row.ratePerUSD<=0||!(row.currency||"").trim()||!row.note?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||Number.isNaN(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date) return "مبلغ، نرخ تبدیل، تاریخ و شرح سند مشترک معتبر نیست.";
    }
    for (const row of group.rialSales||[]) { const error=validateRialSale(row);if(error)return error; }
  }
  return null;
}
