import { AppDatabase, Order, OrderDetail, Supplier } from "../types";
import { getOrderCommercialTotal, getOrderAgreementTotal, getOrderInvoiceConversionMultiplier, getOrderQuantityMT, getOrderCurrency, getOrderProfitCurrency } from "./orderAccounting";
import { nextProformaNumber, supplierProformaPrefix } from "./proformaNumber";
import { calculateReverseUnitPrice } from "./profitCalculations";
import { getCaseProfitPlan, projectCaseProfit } from "./caseProfitEngine";
import { validatePaymentFunding } from "./paymentFunding";

export const entryIssuerId = (supplier?: Supplier, fallback = "") => ({ BR: "bera", AR: "arovin", ARC: "arca-tav", BPI: "bullschem", CM: "chemx", EL: "elemensis" } as Record<string, string>)[supplierProformaPrefix(supplier)] || fallback;
export const entryNumber = (db: AppDatabase, order: Order) => nextProformaNumber(supplierProformaPrefix(db.suppliers.find(item => item.SupplierID === order.SupplierID)) || "ARC", order.PIDate, !!(order.IsDummy || order.ExcludeFromCalculations), db.orders);

export function newEntryOrder(db: AppDatabase, date = new Date().toISOString().slice(0, 10)): Order {
  return { OrderID: Math.max(500, ...db.orders.map(item => item.OrderID)) + 1, ProformaInvoiceID: "", PIDate: date,
    SupplierID: 0, CustomerID: 0, SupplierName: "", CustomerName: "", TradeOwnership: "customer", IssuerCompanyId: "",
    TransportaionMode: "", CountryOfOrigin: "", CountryOfDestination: "", CountryOfBeneficiary: "", PortOfLoading: "", PortOfDischarge: "", FinalPlaceOfDelivery: "", TermsOfDelivery: "", TermsOfPayment: "", TotalGrossWeight: "", TotalCube: "", PartialShipment: "Allowed", NameOfSignatory: "",
    TransactionCurrency: "USD", AgreementCurrency: "USD", InvoiceCurrency: "USD", ExchangeRate: 1, ExchangeRateApplied: 1, IsExchangeRateUsed: false, ScCurrency: "USD", Freight: 0, Discount: 0, TotalQuantity: 0, Note: "", PI_Valid_Days: 180, SC_Valid_Days: 30,
    SellPrice: 0, TargetPrice: 0, EndCustomerPrice: 0, PriceToAgent: 0, CostPrice: 0, NetFob: 0, CFRNet: 0, HasSalesAgent: false, ActiveOrder: true, BuyerPaid: false, CommissionPaid: false, ThirdPartyPaid: false, IsDummy: false, ExcludeFromCalculations: false,
    ArcaShare: 0, BeraShare: 0, Hesam: 0, Reza: 0, Jalali: 0, Lida: 0, Hamid: 0, Moradi: 0, Mahsa: 0, Arash: 0, Arovin: 0, Khusru: 0, Berabank: 0, Extra: 0, Commission: 0, TotalCommission: 0, items: [],
  } as Order;
}

/** Present legacy KG as MT while conserving commercial line amounts and all case-only data. */
export function loadEntryOrder(order: Order): Order {
  const draft = structuredClone(order);
  const totalMT = getOrderQuantityMT(order);
  const rawTotal = (order.items || []).reduce((sum, item) => sum + Number(item.Quantity || 0), 0);
  const implicitMT = Number(order.TotalQuantity) >= 1000 && Math.abs(rawTotal - totalMT) < .0001;
  draft.items = (draft.items || []).map(item => {
    const kg = item.QuantityUnit === "KG" || (!item.QuantityUnit && Number(order.TotalQuantity) >= 1000 && !implicitMT);
    const scale = kg ? 1000 : 1;
    const converted: OrderDetail = { ...item, Quantity: item.Quantity / scale, QuantityUnit: "MT", UnitPrice: item.UnitPrice * scale };
    for (const key of ["AgreedCustomerPrice", "BaseUnitPrice", "InvoiceUnitPrice", "UnitEx"] as const) if (item[key] != null) converted[key] = item[key]! * scale;
    return converted;
  });
  draft.TotalQuantity = totalMT;
  draft.AgreementCurrency = getOrderProfitCurrency(order);
  draft.InvoiceCurrency = getOrderCurrency(order);
  draft.ExchangeRateApplied = draft.AgreementCurrency === draft.InvoiceCurrency ? 1 : Number(order.ExchangeRateApplied ?? order.ExchangeRate) || 0;
  draft.IsExchangeRateUsed = draft.AgreementCurrency !== draft.InvoiceCurrency;
  return draft;
}

/** Same agreed-price and reverse-freight contract used by the main PI editor. */
export function recalculateEntry(order: Order): Order {
  const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.Quantity || 0), 0);
  const rate = getOrderInvoiceConversionMultiplier(order);
  const items = (order.items || []).map(item => {
    const price = Number(item.AgreedCustomerPrice ?? item.UnitPrice) || 0;
    const invoice = item.UseManualInvoicePrice ? Number(item.InvoiceUnitPrice ?? item.UnitEx) || 0 : price * rate;
    return { ...item, OrderID: order.OrderID, QuantityUnit: "MT" as const, AgreedCustomerPrice: price, UnitPrice: price,
      BaseUnitPrice: calculateReverseUnitPrice(price, order.Freight, quantity), FreightAllocation: quantity ? order.Freight * item.Quantity / quantity : 0,
      ExtPrice: item.Quantity * price, InvoiceUnitPrice: invoice, UnitEx: invoice, ExtEx: item.Quantity * invoice };
  });
  const agreed = items.reduce((sum, item) => sum + item.Quantity * item.AgreedCustomerPrice, 0);
  const result = { ...order, items, TotalQuantity: quantity, SellPrice: quantity ? agreed / quantity : 0, EndCustomerPrice: quantity ? agreed / quantity : 0, TargetPrice: quantity ? agreed / quantity : 0 };
  return { ...result, AgreementTotalAmount: getOrderAgreementTotal(result), ConvertedTotalAmount: getOrderCommercialTotal(result) };
}

export function prepareEntrySave(db: AppDatabase, draft: Order, isNew: boolean, autoNumber: boolean): Order {
  if (!db.suppliers.some(item => item.SupplierID === draft.SupplierID) || !db.customers.some(item => item.CustomerID === draft.CustomerID)) throw new Error("خریدار و فروشنده را از فهرست سیستم انتخاب کنید.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.PIDate) || Number.isNaN(Date.parse(draft.PIDate)) || new Date(draft.PIDate).toISOString().slice(0, 10) !== draft.PIDate) throw new Error("تاریخ پروفورما معتبر نیست.");
  if (!draft.items?.length || draft.items.some(item => !item.ProductID || !item.ProductName?.trim() || !Number.isFinite(item.Quantity) || item.Quantity <= 0 || !Number.isFinite(item.AgreedCustomerPrice ?? item.UnitPrice) || Number(item.AgreedCustomerPrice ?? item.UnitPrice) <= 0)) throw new Error("حداقل یک کالا با مقدار و قیمت مثبت وارد کنید.");
  if (![draft.AgreementCurrency, draft.InvoiceCurrency].every(currency => /^[A-Z]{3}$/.test(currency || ""))) throw new Error("کد ارز توافق و صدور باید سه حرف انگلیسی باشد.");
  if ([draft.PI_Valid_Days, draft.SC_Valid_Days].some(days => days != null && (!Number.isFinite(days) || days < 0))) throw new Error("مدت اعتبار نمی‌تواند منفی باشد.");
  if (!Number.isFinite(draft.Freight) || draft.Freight < 0 || !Number.isFinite(draft.ExchangeRateApplied) || Number(draft.ExchangeRateApplied) <= 0) throw new Error("هزینه حمل و نرخ تبدیل را بررسی کنید.");
  const supplier = db.suppliers.find(item => item.SupplierID === draft.SupplierID)!;
  let order: Order = { ...draft, OrderID: isNew ? newEntryOrder(db).OrderID : draft.OrderID,
    ProformaInvoiceID: (isNew && autoNumber ? entryNumber(db, draft) : draft.ProformaInvoiceID).trim(),
    CustomerName: db.customers.find(item => item.CustomerID === draft.CustomerID)!.CustomerName, SupplierName: supplier.SupplierName,
    IssuerCompanyId: entryIssuerId(supplier, draft.IssuerCompanyId),
  };
  if (!order.ProformaInvoiceID || db.orders.some(item => item.OrderID !== order.OrderID && item.ProformaInvoiceID.trim().toLowerCase() === order.ProformaInvoiceID.toLowerCase())) throw new Error("شماره پروفورما خالی یا تکراری است.");
  const plan = getCaseProfitPlan(order, supplier);
  order = recalculateEntry({ ...order, profitPlan: plan ? { ...plan, calculationVersion: 2 } : undefined, customShares: (order.customShares || []).filter(item => item.id !== "agent-profit-beneficiary") });
  const nextDb = { ...db, orders: [...db.orders.filter(item => item.OrderID !== order.OrderID), order] };
  const error = validatePaymentFunding(nextDb, db);
  if (error) throw new Error(error);
  return projectCaseProfit(order, supplier, db.issuerCompanyShares, nextDb);
}
