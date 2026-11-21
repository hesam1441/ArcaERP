/** Read-only presentation contract. This is never a second database. */
export type CurrencyCode = string;
export type DataViewState = 'ready' | 'loading' | 'error';
export interface CaseOrderItem {
 id:string;code:string;productName:string;packaging:string;quantity:number;unit:string;
 unitPrice:number;currency:string;priceUnitLabel:string;totalAmount:number;note?:string;
}
export interface CommercialCase {
 id:string;caseNumber:string;date:string;isActive:boolean;ownership:'customer'|'own_account';
 economicOwner:string;status:'open'|'in_transit'|'customs'|'settling'|'closed';
 customerName:string;customerShortName:string;sellerName:string;sellerShortName:string;
 agentName?:string;currency:string;totalAmount:number;fxRateToRial:number;totalWeightMt:number;
 incoterm:string;originPort:string;destinationPort:string;departureDate:string;arrivalDate:string;
 nextAction:string;notes:string;shippingSummary?:string;items:CaseOrderItem[];
}
export interface CasesListFilterState {
 searchQuery:string;activeFilter:'all'|'active'|'inactive';
 ownershipFilter:'all'|'customer'|'own_account';scrollTop:number;page?:number;
}
export interface CaseSummaryDraft { departureDate:string;arrivalDate:string;nextAction:string;notes:string; }
