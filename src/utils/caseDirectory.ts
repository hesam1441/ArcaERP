import type { AppDatabase, Order } from '../types';

export function caseProductNames(db: AppDatabase, order: Order): string[] {
  return [...new Set((order.items || []).map(item =>
    item.ProductName?.trim() || db.products?.find(product => product.ProductID === item.ProductID)?.ProductName?.trim()
  ).filter((name): name is string => Boolean(name)))];
}

export function shortCaseSupplier(order: Order): string {
  const name = order.SupplierName?.trim() || '';
  if (/berakem|berkem|براکم/i.test(name)) return 'Berkem';
  if (/arovin|اروین|آروین/i.test(name)) return 'Arovin';
  return name;
}

export function toggleCaseActivity(order: Order): Order {
  const active = !order.ActiveOrder;
  return { ...order, ActiveOrder: active, LifecycleStatus: active ? 'active' : 'completed',
    OrderStatus: active ? 'فعال (Active)' : 'مختومه (Completed)' };
}
