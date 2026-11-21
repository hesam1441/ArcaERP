import { getCaseFinancials } from "./caseFinancials";
import { calculateProfitBreakdown } from "./profitCalculations";
import { getOrderQuantityMT } from "./orderAccounting";
import type { AppDatabase, Order } from "../types";
import { calculateUnifiedProfit } from "./caseProfitEngine";
import { getOrderCommercialTotal } from "./orderAccounting";

export function formatCurrency(amount: number | undefined | null, currency = "USD"): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount) + ` ${currency}`;
}

export function formatNumber(value: number | undefined | null, digits = 2): string {
  if (value === undefined || value === null || isNaN(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatEnglishNumber(value: number | undefined | null, digits = 2): string {
  if (value === undefined || value === null || isNaN(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

// Keep all displayed calendar values Gregorian (YYYY-MM-DD).
export function toJalaliDate(gregorianDateStr: string | undefined | null): string {
  if (!gregorianDateStr) return "-";
  return gregorianDateStr.slice(0, 10);
}

export function calculateOrderMetrics(order: {
  TotalQuantity?: number;
  SellPrice?: number;
  NetFob?: number;
  FreightFcl?: number;
  NumberFcl?: number;
  QtyFcl?: number;
  TargetPrice?: number;
  MarginM?: number;
  TransferedAmount?: number;
  TransferExrate?: number;
  ExchangeRate?: number;
  ManualCLA?: number;
  Freight?: number;
  Discount?: number;
  profitPlan?: Order["profitPlan"];
  HasSalesAgent?: boolean;
}, db?: AppDatabase) {
  const fullOrder = order as Order;
  const unified = calculateUnifiedProfit(fullOrder, db?.suppliers?.find(supplier => supplier.SupplierID === fullOrder.SupplierID), db?.issuerCompanyShares, db);
  const totalQty = order.TotalQuantity || 0;
  const totalQtyMT = unified?.quantityMT ?? getOrderQuantityMT(fullOrder);
  const netFob = order.NetFob || 0;
  const freightFcl = order.FreightFcl || 0;
  const sellPrice = order.SellPrice || 0;
  const exRate = order.ExchangeRate || 1;
  const transferExrate = order.TransferExrate || 1;
  const transferedAmount = order.TransferedAmount || 0;

  // CFR Net 2: (((NetFob * (TotalQuantity/1000)) + FreightFcl) / (TotalQuantity/1000))
  const cfrNet2 = unified?.landedPurchasePricePerMT ?? (totalQtyMT > 0 ? (Number(fullOrder.CostPrice || fullOrder.CFRNet || netFob) * totalQtyMT + Number(order.Freight ?? freightFcl)) / totalQtyMT : netFob);

  // Margin 3: MarginM > 0 ? MarginM : (SellPrice - CFRNet2)
  const profit = db ? getCaseFinancials(db, fullOrder).profit : calculateProfitBreakdown(fullOrder);
  const margin3 = totalQtyMT ? profit.totalCaseProfit / totalQtyMT : 0;

  // Total Margin: (TotalQuantity * Margin3) / 1000
  const totalMargin = profit.totalCaseProfit;

  // Due Payment: (SellPrice * TotalQuantity) / 1000
  const duePayment = getOrderCommercialTotal(fullOrder);

  // CommLetterQ: ManualCLA > 0 ? ManualCLA : ((TransferedAmount * TransferExrate) - (CFRNet2 * TotalQuantity / 1000)) / TransferExrate
  const commLetterQ = (order.ManualCLA && order.ManualCLA > 0)
    ? order.ManualCLA
    : transferExrate > 0
    ? (transferedAmount * transferExrate - cfrNet2 * totalQtyMT) / transferExrate
    : 0;

  // CommLetterA: TransferExrate === 1 ? CommLetterQ / ExchangeRate : CommLetterQ
  const commLetterA = transferExrate === 1 && exRate > 0 ? commLetterQ / exRate : commLetterQ;

  // Target FOB unit: ((TargetPrice * QtyFcl) - FreightFcl) / QtyFcl
  const qtyFcl = order.QtyFcl || 1;
  const targetPrice = order.TargetPrice || 0;
  const targetFobUnit = qtyFcl > 0 ? (targetPrice * qtyFcl - freightFcl) / qtyFcl : 0;

  // Total Gross Price: NumberFcl * QtyFcl * TargetPrice
  const numberFcl = order.NumberFcl || 0;
  const totalGrossPrice = numberFcl * qtyFcl * targetPrice;

  // Total Freight: FreightFcl * NumberFcl
  const totalFreight = freightFcl * numberFcl;

  return {
    totalQtyMT,
    cfrNet2,
    margin3,
    totalMargin,
    duePayment,
    commLetterQ,
    commLetterA,
    targetFobUnit,
    totalGrossPrice,
    totalFreight,
  };
}
