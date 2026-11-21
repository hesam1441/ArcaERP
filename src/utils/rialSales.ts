import { Order, RialSale } from "../types";
export function rialSalesSummary(order: Pick<Order, "RialSalesEnabled" | "rialSales">) {
  const rows = order.rialSales || [];
  const invalid = rows.some(row => !Number.isFinite(row.amount) || row.amount <= 0 || !Number.isFinite(row.ratePerUSD) || row.ratePerUSD <= 0 || !["IRR", "TOMAN"].includes(row.unit));
  const usd = invalid || !order.RialSalesEnabled ? 0 : rows.reduce((sum, row) => sum + row.amount / row.ratePerUSD, 0);
  return { enabled: !!order.RialSalesEnabled, hasSales: rows.length > 0, invalid, usd };
}
export function validateRialSale(row: RialSale) {
  if (!["IRR", "TOMAN"].includes(row.unit) || !Number.isFinite(row.amount) || row.amount <= 0 || !Number.isFinite(row.ratePerUSD) || row.ratePerUSD <= 0) return "مبلغ فروش و نرخ هر دلار باید مثبت و در یک واحد ریال یا تومان باشند.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0,10) !== row.date) return "تاریخ فروش معتبر نیست.";
  return null;
}
