import { financialGroupContext } from "./financialGroups";
import { AppDatabase } from '../types';
import { getReportingFinancials, summarizeCaseFinancials } from './caseFinancials';
import { getCaseProfitCustody } from './profitCustody';
import { normalizePartnerName } from './partnerIdentity';
import { getCentralCaseLedger, getOrderCommercialTotal, getOrderCurrency, getOrderPaymentSummary, getOrderInvoiceToUSDMultiplier, isExcludedFromFinancialCalculations } from './orderAccounting';
/** Lists display the same case projections as reports; never recompute profit or distribute it a second time. */
export function getAccountingListProjection(db:AppDatabase,ids:number[]) {
  const orders=db.orders.filter(order=>ids.includes(order.OrderID));
  const summary=summarizeCaseFinancials(db,orders);
  const financials=getReportingFinancials(db,orders);
  const rows=financials.map(financial=>{
    const group=financial.order.ConsolidatedGroupId && db.financialGroups?.find(g=>g.id===financial.order.ConsolidatedGroupId);
    const context=group ? financialGroupContext(db,group) : null;
    const journalDb=context?.db||db;
    const custody=getCaseProfitCustody(db,financial.order);
    const shares=new Map<string,{name:string;amount:number;paid:number;remaining:number;advance:number}>();
    for(const share of custody.beneficiaries) {
      const key=normalizePartnerName(share.name)||share.id;
      const prior=shares.get(key)||{name:share.name,amount:0,paid:0,remaining:0,advance:0};
      prior.amount+=share.amount;prior.paid+=share.paid;prior.remaining+=share.remaining;prior.advance+=share.advance;shares.set(key,prior);
    }
    const ledger=getCentralCaseLedger(journalDb,financial.order);
    const cashShown=context ? ledger.caseCashBalance-context.members.reduce((sum,member)=>sum+getCentralCaseLedger(db,member).caseCashBalance*(getOrderInvoiceToUSDMultiplier(member)??0),0) : ledger.caseCashBalance;
    return {order:financial.order,financial,custody,shares,cashShown,payment:getOrderPaymentSummary(journalDb,financial.order),ledger};
  });
  const beneficiaries=new Map<string,{key:string;name:string;amountUSD:number;paidUSD:number;remainingUSD:number;advanceUSD:number;missingFX:boolean}>();
  for(const row of rows.filter(item=>item.financial.nativeStatus==='ready')) for(const [key,share] of row.shares) {
    if(Math.abs(share.amount)<.005 && Math.abs(share.paid)<.005)continue;
    const prior=beneficiaries.get(key)||{key,name:share.name,amountUSD:0,paidUSD:0,remainingUSD:0,advanceUSD:0,missingFX:false};
    if(!row.financial.reportable){prior.missingFX=true;beneficiaries.set(key,prior);continue;}
    const rate=row.financial.profitRate!;prior.amountUSD+=share.amount*rate;prior.paidUSD+=share.paid*rate;prior.remainingUSD+=share.remaining*rate;prior.advanceUSD+=share.advance*rate;beneficiaries.set(key,prior);
  }
  const totals:Record<string,{sales:number;received:number;outstanding:number;cash:number;profit:number}>={};
  const currencyTotal=(currency:string)=>totals[currency]??(totals[currency]={sales:0,received:0,outstanding:0,cash:0,profit:0});
  for(const order of orders.filter(order=>!isExcludedFromFinancialCalculations(order))){const payment=getOrderPaymentSummary(db,order),total=currencyTotal(getOrderCurrency(order));total.sales+=getOrderCommercialTotal(order);total.received+=payment.applied;total.outstanding+=payment.outstanding;}
  for(const row of rows){
    if(!isExcludedFromFinancialCalculations(row.order))currencyTotal(getOrderCurrency(row.order)).cash+=row.cashShown;
    if(row.financial.nativeStatus==='ready')currencyTotal(row.financial.profitCurrency).profit+=row.financial.profit.totalCaseProfit;
  }
  const bankUSD=summary.ready.reduce((sum,f)=>sum+f.usdProfit.bankShare,0);
  return {orders,rows,summary,bankUSD,beneficiaries:[...beneficiaries.values()],totals};
}
