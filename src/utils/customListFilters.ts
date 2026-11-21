import type { Order } from '../types';

export type ListActivityFilter = 'all' | 'active' | 'inactive';

export function filterCustomListOrders(
  orders: Order[], ids: number[], activity: ListActivityFilter,
  onlySelected: boolean, selected: number[],
): Order[] {
  const members = new Set(ids);
  const chosen = new Set(selected);
  return orders.filter(order => members.has(order.OrderID) &&
    (activity === 'all' || (activity === 'active' ? !!order.ActiveOrder : !order.ActiveOrder)) &&
    (!onlySelected || chosen.has(order.OrderID)));
}
