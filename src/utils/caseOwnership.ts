import type { AppDatabase, Order } from '../types';
import { getOwnAccountRealization } from './orderAccounting';

export type CaseOwnershipFilter = 'ALL' | 'OWN' | 'CUSTOMER' | 'PENDING' | 'REALIZED';

export function matchesCaseOwnership(db: AppDatabase, order: Order, filter: CaseOwnershipFilter) {
  const own = order.TradeOwnership === 'own_account';
  if (filter === 'OWN') return own;
  if (filter === 'CUSTOMER') return !own;
  if (filter === 'PENDING') return own && getOwnAccountRealization(db, order).awaitingRealization;
  if (filter === 'REALIZED') return own && getOwnAccountRealization(db, order).recognized;
  return true;
}
