import type { AppDatabase, Order } from '../types';
import type { CommercialCase, CaseSummaryDraft, CasesListFilterState } from '../components/approved/types';
import { getOrderCommercialTotal, getOrderCurrency, getOrderProfitCurrency, getOrderQuantityMT, getOrderItemQuantityMT } from './orderAccounting';
import { shortCaseSupplier } from './caseDirectory';

export function projectApprovedCase(db:AppDatabase,order:Order):CommercialCase {
 const raw=Number(order.TotalQuantity)||0;
 const lineQuantity=(order.items||[]).reduce((sum,item)=>sum+(Number(item.Quantity)||0),0);
 const linesAreMT=raw>=1000&&lineQuantity>0&&Math.abs(lineQuantity*1000-raw)<=Math.max(1,raw*.01);
 const currency=getOrderCurrency(order),priceCurrency=getOrderProfitCurrency(order);
 return {
  id:String(order.OrderID),caseNumber:order.ProformaInvoiceID,date:order.PIDate,
  isActive:Boolean(order.ActiveOrder),ownership:order.TradeOwnership==='own_account'?'own_account':'customer',
  economicOwner:order.TradeOwnership==='own_account'?(db.cashPartners.find(p=>p.id===order.EconomicOwnerPartyId)?.name||'به حساب خودم'):'مشتری',
  status:order.ActiveOrder?'open':'closed',customerName:order.CustomerName||'—',customerShortName:order.CustomerName||'—',
  sellerName:order.SupplierName||'—',sellerShortName:shortCaseSupplier(order)||'—',agentName:order.HasSalesAgent?order.profitPlan?.agentName:undefined,
  currency,totalAmount:getOrderCommercialTotal(order),fxRateToRial:Number(order.ExchangeRateApplied||order.ExchangeRate)||1,
  totalWeightMt:getOrderQuantityMT(order),incoterm:order.TermsOfDelivery||'—',
  originPort:order.PortOfLoading||'—',destinationPort:order.PortOfDischarge||'—',
  departureDate:order.ETD||'',arrivalDate:order.ETA||'',nextAction:order.Followup||'',notes:order.Note||'',
  shippingSummary:order.TransportaionMode||'',
  items:(order.items||[]).map(item=>{
   const quantity=Number(item.Quantity)||0;
   const mt=item.QuantityUnit==='MT'||(!item.QuantityUnit&&linesAreMT)?quantity:getOrderItemQuantityMT(order,item);
   return {id:String(item.OrderDetailID),code:String(item.ProductID),productName:item.ProductName||db.products?.find(p=>p.ProductID===item.ProductID)?.ProductName||'—',
    packaging:item.NosAndKindOfPackages||item.ProductDescription||'',quantity,unit:item.QuantityUnit||(raw>=1000&&!linesAreMT?'KG':'MT'),
    unitPrice:Number(item.UnitPrice)||0,currency:priceCurrency,priceUnitLabel:`${priceCurrency} / MT`,totalAmount:mt*(Number(item.UnitPrice)||0)};
  }),
 };
}

/** Whitelist only fields supported by the current database; preserve everything else. */
export function applyApprovedSummary(order:Order,patch:CaseSummaryDraft):Order {
 return {...order,ETD:patch.departureDate,ETA:patch.arrivalDate,Followup:patch.nextAction,Note:patch.notes};
}

export function matchesApprovedCase(value:CommercialCase,filters:CasesListFilterState):boolean {
 if(filters.activeFilter==='active'&&!value.isActive)return false;
 if(filters.activeFilter==='inactive'&&value.isActive)return false;
 if(filters.ownershipFilter!=='all'&&value.ownership!==filters.ownershipFilter)return false;
 const query=filters.searchQuery.trim().toLowerCase();
 return !query||[value.caseNumber,value.customerName,value.customerShortName,value.sellerName,value.sellerShortName,value.currency,
  ...value.items.flatMap(item=>[item.code,item.productName,item.packaging])].join(' ').toLowerCase().includes(query);
}
