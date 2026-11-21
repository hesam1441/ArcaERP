import {ProfitSettlementConfirmation} from '../types';
export function validateProfitSettlementConfirmations(items:ProfitSettlementConfirmation[]=[]):string|null {
  const ids=new Set<string>();
  for(const item of items){
    if(!item.id||ids.has(item.id)||!item.listId||!item.listName?.trim()||!item.note?.trim()||!item.currency||!Number.isFinite(item.profitAmount)||item.receiptConfirmed!==true||!item.confirmedAt||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||Number.isNaN(Date.parse(item.date))||new Date(item.date).toISOString().slice(0,10)!==item.date||!Array.isArray(item.shares))return 'تأیید تسویه سود معتبر نیست؛ تاریخ، مرجع، ارز و مبلغ را بررسی کنید.';
    ids.add(item.id);
    const parties=new Set<string>();
    for(const share of item.shares){if(!share.partyId||!share.partyName?.trim()||parties.has(share.partyId)||![share.additionalPaid,share.advanceApplied,share.entitlement].every(Number.isFinite)||share.additionalPaid<0||share.advanceApplied<0||share.entitlement<0||share.advanceApplied>share.additionalPaid+.005)return 'مبالغ یا صاحب سهم در تأیید تسویه معتبر نیست.';parties.add(share.partyId);}
  }
  return null;
}
