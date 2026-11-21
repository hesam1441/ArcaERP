import { consolidateCompanyParties, classifyParty } from './partyNormalization';
import { AppDatabase, CashPartner } from '../types';
import { normalizePartnerName as norm } from './partnerIdentity';

/** Existing records stay intact; missing identities are presented in one shared directory. */
export function getPartyDirectory(db: AppDatabase): CashPartner[] {
  const hidden = new Set(db.hiddenPartyIds || []);
  const result = [...(db.cashPartners || [])].filter((party) => !hidden.has(party.id));
  const add = (id: string, name: string | undefined, role = '', entityType: 'person' | 'company' = 'person') => {
    if (!name?.trim() || hidden.has(id)) return;
    const index = result.findIndex(p => p.id === id || [p.name, p.nameEn, ...(p.aliases || [])].some(n => n && norm(n) === norm(name)));
    if (index >= 0) {
      if (id.startsWith('customer:')) result[index] = { ...result[index], isCustomer: true };
      if (id.startsWith('supplier:')) result[index] = { ...result[index], isSupplier: true };
      return;
    }
    result.push({ id, name: name.trim(), role, entityType, ...(id.startsWith('customer:') ? { isCustomer: true } : {}), ...(id.startsWith('supplier:') ? { isSupplier: true } : {}) });
  };
  db.customers.forEach(p => add(`customer:${p.CustomerID}`, p.CustomerName, 'مشتری', 'company'));
  db.suppliers.forEach(p => add(`supplier:${p.SupplierID}`, p.SupplierName, 'تأمین‌کننده', 'company'));
  (db.issuerCompanyShares || []).forEach(p => add(`issuer:${p.id}`, p.name, 'شرکت صادرکننده', 'company'));
  db.orders.forEach(o => {
    const legacyShares = { ArcaShare: 'آرکاتاو', BeraShare: 'برا', Hesam: 'حسام', Reza: 'رضا', Jalali: 'جلالی', Lida: 'لیدا', Hamid: 'حمید', Moradi: 'مرادی', Mahsa: 'مهسا', Arash: 'آرش', Arovin: 'آروین', Khusru: 'خسرو', Berabank: 'برابانک', Extra: 'سایر' };
    Object.entries(legacyShares).forEach(([field, name]) => { if (Number(o[field as keyof typeof o] || 0)) add(`legacy:${field}`, name, 'صاحب سهم'); });
    (o.customShares || []).forEach(p => add(p.partnerId || `share:${p.id}`, p.partnerName, p.role));
    (o.companyProfitShares || []).forEach(p => add(`company:${norm(p.companyName)}`, p.companyName, 'شرکت همکار', 'company'));
    (o.profitPlan?.rules || []).forEach(p => add(p.beneficiaryId || `beneficiary:${norm(p.beneficiaryName)}`, p.beneficiaryName, 'ذی‌نفع'));
    add(o.profitPlan?.agentId || `agent:${norm(o.profitPlan?.agentName)}`, o.profitPlan?.agentName, 'ایجنت');
  });
  return consolidateCompanyParties(result).parties;
}

export function saveDirectoryParty(db: AppDatabase, party: CashPartner): AppDatabase {
  party = classifyParty(party);
  const directory = getPartyDirectory(db);
  const old = directory.find(p => p.id === party.id);
  const names = new Set([old?.name, old?.nameEn, ...(old?.aliases || [])].filter(Boolean).map(norm));
  const matches = (name?: string) => !!name && names.has(norm(name));
  const rename = (name?: string) => matches(name) ? party.name : name;
  const saved = { ...old, ...party, name: party.name.trim(), aliases: [...new Set([...(old?.aliases || []), old?.name, old?.nameEn].filter((n): n is string => !!n && n !== party.name))] };
  const customers = db.customers.map(p => matches(p.CustomerName) ? { ...p, CustomerName: saved.name } : p);
  const suppliers = db.suppliers.map(p => ({ ...p, SupplierName: rename(p.SupplierName)!, profitProfile: p.profitProfile ? { ...p.profitProfile, rules: p.profitProfile.rules.map(r => r.beneficiaryId === party.id || matches(r.beneficiaryName) ? { ...r, beneficiaryName: saved.name } : r) } : p.profitProfile }));
  if (saved.isCustomer && !customers.some(p => norm(p.CustomerName) === norm(saved.name))) customers.push({ CustomerID: Math.max(0, ...customers.map(p => p.CustomerID)) + 1, CustomerName: saved.name });
  if (saved.isSupplier && !suppliers.some(p => norm(p.SupplierName) === norm(saved.name))) suppliers.push({ SupplierID: Math.max(0, ...suppliers.map(p => p.SupplierID)) + 1, SupplierName: saved.name, Address: '', Tel: '', Email: '', Bank: '', Signatory: '', profitProfile: undefined });
  return {
    ...db,
    cashPartners: [...directory.filter(p => p.id !== party.id), saved],
    customers, suppliers,
    issuerCompanyShares: db.issuerCompanyShares?.map(p => matches(p.name) ? { ...p, name: saved.name } : p),
    orders: db.orders.map(o => ({
      ...o, CustomerName: rename(o.CustomerName), SupplierName: rename(o.SupplierName),
      customShares: o.customShares?.map(p => p.partnerId === party.id || matches(p.partnerName) ? { ...p, partnerName: saved.name } : p),
      companyProfitShares: o.companyProfitShares?.map(p => ({ ...p, companyName: rename(p.companyName)! })),
      commissionSettlements: o.commissionSettlements?.map(p => ({ ...p, partyName: rename(p.partyName)! })),
      profitPlan: o.profitPlan ? { ...o.profitPlan,
        agentName: o.profitPlan.agentId === party.id ? saved.name : rename(o.profitPlan.agentName),
        rules: o.profitPlan.rules?.map(r => r.beneficiaryId === party.id || matches(r.beneficiaryName) ? { ...r, beneficiaryId: party.id, beneficiaryName: saved.name } : r),
      } : o.profitPlan,
    })),
    orderTransactions: db.orderTransactions?.map(t => ({ ...t, Counterparty: t.PartnerId === party.id ? saved.name : rename(t.Counterparty) })),
  };
}
