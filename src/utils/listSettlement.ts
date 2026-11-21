import {AppDatabase, ProfitSettlementConfirmation} from '../types';
import {getAccountingListProjection} from './accountingListProjection';
import {getOwnAccountCapital,getOrderCommercialTotalUSD,transactionAmountInOrderCurrency} from './orderAccounting';
import {financialGroupContext} from './financialGroups';
/** A review of current amounts; caller must confirm historical receipt AND beneficiary delivery. */
export function reviewListSettlement(db:AppDatabase,listId:string) {
  const list=db.accountingLists?.find(l=>l.id===listId);
  if(!list)throw new Error('لیست پیدا نشد.');
  const view=getAccountingListProjection(db,list.orderIds);
  const blockers:string[]=[];
  if(!view.orders.length||view.orders.length!==new Set(list.orderIds).size)blockers.push('اعضای لیست را بررسی کنید؛ پرونده‌ای حذف شده یا لیست خالی است.');
  if(view.summary.partialGroups.length)blockers.push('همه اعضای گروه مالی باید در لیست باشند.');
  for(const row of view.rows){
    if(row.financial.status==='consolidated')continue;
    const label=row.order.ProformaInvoiceID;
    if(!row.custody.eligible){blockers.push(`${label}: ${row.financial.statusLabel}`);continue;}
    if(row.custody.beneficiaries.some(p=>p.amount<-.005))blockers.push(`${label}: سهم زیان دارد؛ تسویه زیان باید جداگانه بررسی شود.`);
    if(row.custody.beneficiaries.some(p=>p.overpaid>.005 || p.advance>p.remaining+.005))blockers.push(`${label}: اضافه‌پرداخت یا علی‌الحساب مازاد باید تعیین تکلیف شود.`);
    if(!row.order.ConsolidatedGroupId&&row.payment.customerOutstanding>.005)blockers.push(`${label}: مانده دریافت مشتری هنوز سند وصول ندارد.`);
    if(row.ledger.fundingDebt>.005||row.payment.stakeholderLoanDebt>.005||row.payment.temporaryDebt>.005)blockers.push(`${label}: بدهی تأمین وجه یا قرض هنوز تسویه نشده است.`);
    const group=row.order.ConsolidatedGroupId&&db.financialGroups?.find(g=>g.id===row.order.ConsolidatedGroupId);
    const context=group?financialGroupContext(db,group):null;
    if(context&&row.order.TradeOwnership!=="own_account"){
      const invoice=context.members.reduce((sum,member)=>sum+(getOrderCommercialTotalUSD(member)||0),0);
      const refunds=row.ledger.relatedEntries.filter(e=>["customer_refund","temporary_credit_repayment"].includes(e.TransactionType||"")).reduce((sum,e)=>sum+transactionAmountInOrderCurrency(row.order,e),0);
      if(invoice-row.ledger.customerReceipts-row.ledger.creditApplied+refunds>.005)blockers.push(`${label}: دریافت مشتریان در کل گروه هنوز کامل ثبت نشده است.`);
    }
    if(row.ledger.stakeholderReceivable>.005)blockers.push(`${label}: طلب قرض از پرونده دیگر هنوز باز است.`);
    if(getOwnAccountCapital(context?.db||db,row.order).some(p=>p.invested-p.returned>.005))blockers.push(`${label}: بازپرداخت اصل سرمایه کامل ثبت نشده است.`);
  }
  return {list,view,blockers,remainingUSD:view.beneficiaries.reduce((sum,b)=>sum+b.remainingUSD,0)};
}
/** Idempotent historical acknowledgement. Original cash journals and profit inputs stay untouched. */
export function confirmListProfitSettlement(db:AppDatabase,listId:string,date:string,note:string):AppDatabase {
  const review=reviewListSettlement(db,listId);
  if(review.blockers.length)throw new Error(review.blockers.join('\n'));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('تاریخ تسویه معتبر نیست.');
  if(!note.trim())throw new Error('شرح یا مرجع تأیید تسویه را وارد کنید.');
  const confirmedAt=new Date().toISOString();
  const confirmations=new Map<number,ProfitSettlementConfirmation>();
  for(const row of review.view.rows){
    if(row.financial.status==='consolidated')continue;
    const latest=row.order.profitSettlementConfirmations?.at(-1);
    if(latest&&Math.abs(latest.profitAmount-row.financial.profit.totalCaseProfit)<.005&&row.custody.remaining<.005&&row.custody.beneficiaries.every(p=>p.advance<.005))continue;
    confirmations.set(row.order.OrderID,{id:`list-settlement-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${row.order.OrderID}`}`,listId,listName:review.list.name,date,confirmedAt,note:note.trim(),currency:row.financial.profitCurrency,profitAmount:row.financial.profit.totalCaseProfit,receiptConfirmed:true,shares:row.custody.beneficiaries.map(p=>({partyId:p.id,partyName:p.name,additionalPaid:p.remaining,advanceApplied:Math.min(Math.max(0,p.advance),p.remaining),entitlement:p.amount}))});
  }
  const orders=db.orders.map(order=>review.list.orderIds.includes(order.OrderID)?{...order,ActiveOrder:false,LifecycleStatus:'completed' as const,OrderStatus:'مختومه — تسویه سود تأیید شده',CommissionPaid:true,...(confirmations.has(order.OrderID)?{profitSettlementConfirmations:[...(order.profitSettlementConfirmations||[]),confirmations.get(order.OrderID)!]}:{})}:order);
  const groups=(db.financialGroups||[]).map(group=>{const row=review.view.rows.find(r=>r.order.ConsolidatedGroupId===group.id);const confirmation=row&&confirmations.get(row.order.OrderID);return confirmation?{...group,profitSettlementConfirmations:[...(group.profitSettlementConfirmations||[]),confirmation]}:group;});
  return {...db,orders,financialGroups:groups,accountingLists:db.accountingLists?.map(list=>list.id===listId?{...list,updatedAt:confirmedAt}:list)};
}
