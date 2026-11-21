import { AppDatabase, OrderTransaction } from '../types';

const labels: Record<string, string> = {
  credit_allocation: 'انتقال اعتبار', temporary_credit_allocation: 'تأمین امانی',
  temporary_credit_repayment: 'بازپرداخت امانی', case_fund_transfer: 'انتقال صندوق پرونده',
  stakeholder_case_loan: 'قرض سهم شخص / شرکت', stakeholder_case_loan_repayment: 'بازپرداخت قرض سهم',
};
export const transferLabel = (t: OrderTransaction) => labels[t.TransactionType || ''] || 'انتقال';
export const getInterCaseTransfers = (db: AppDatabase) => (db.orderTransactions || [])
  .filter(t => !!labels[t.TransactionType || ''])
  .sort((a,b) => (b.PaytDate || '').localeCompare(a.PaytDate || '') || b.TransactionID - a.TransactionID);
export function transferEndpoints(db: AppDatabase, t: OrderTransaction) {
  const repayment = t.TransactionType === 'temporary_credit_repayment' || t.TransactionType === 'stakeholder_case_loan_repayment';
  return {
    source: db.orders.find(o => o.OrderID === (repayment ? t.OrderID : t.SourceOrderID)),
    target: db.orders.find(o => o.OrderID === (repayment ? t.SourceOrderID : t.OrderID)),
  };
}
