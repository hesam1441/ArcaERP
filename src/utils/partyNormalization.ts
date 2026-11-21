import { AppDatabase, CashPartner } from "../types";
import { isPetromac, ownedCompanies, ownedCompanyFor } from "./partnerIdentity";

export const partyCategoryLabels: Record<NonNullable<CashPartner["category"]>, string> = { customer: "مشتری", agent: "همکار / ایجنت", commission_recipient: "دریافت‌کننده کمیسیون", investor: "شریک سرمایه‌گذار", owned_company: "شرکت متعلق به خودم", supplier: "تأمین‌کننده" };

export function classifyParty(party: CashPartner): CashPartner {
  const company = [party.name, party.nameEn, ...(party.aliases || [])].map(ownedCompanyFor).find(Boolean);
  if (company) return { ...party, name: company.name, nameEn: company.nameEn, category: "owned_company", role: partyCategoryLabels.owned_company, entityType: "company", isCustomer: false, isFundingSource: true, fundingCompany: company.key };
  if ([party.name, party.nameEn, ...(party.aliases || [])].some(isPetromac)) return { ...party, name: "پتروماک", nameEn: "Petromac", category: "agent", role: partyCategoryLabels.agent, entityType: "company", isCustomer: false, fundingCompany: undefined };
  const category = party.category && party.category !== "owned_company" ? party.category : /agent|ایجنت|همکار|معرف/i.test(party.role || "") ? "agent" : party.isCustomer ? "customer" : party.isSupplier ? "supplier" : "commission_recipient";
  return { ...party, category, role: partyCategoryLabels[category], isCustomer: category === "customer", fundingCompany: undefined };
}

/** Only explicitly recognized companies are consolidated; monetary postings stay intact. */
export function consolidateCompanyParties(parties: CashPartner[]) {
  const result = new Map<string, CashPartner>();
  const idMap = new Map<string, string>();
  const candidates: CashPartner[] = [...parties, ...ownedCompanies.map((company) => ({ id: company.id, name: company.name, nameEn: company.nameEn }))];
  for (const raw of candidates) {
    const company = [raw.name, raw.nameEn, ...(raw.aliases || [])].map(ownedCompanyFor).find(Boolean);
    const petromac = [raw.name, raw.nameEn, ...(raw.aliases || [])].some(isPetromac);
    const id = company?.id || (petromac ? "partner:petromac" : raw.id);
    idMap.set(raw.id, id);
    (raw.mergedPartyIds || []).forEach((old) => idMap.set(old, id));
    if (!company && !petromac) { result.set(id, classifyParty(raw)); continue; }
    const prior = result.get(id);
    const { mergedPartyRecords: archived, ...snapshot } = raw;
    const archive = new Map([...(prior?.mergedPartyRecords || []), ...(archived || []), ...(raw.id !== id ? [snapshot] : [])].map((record) => [record.id, record]));
    result.set(id, classifyParty({ ...raw, ...prior, id, isSupplier: Boolean(raw.isSupplier || prior?.isSupplier), balances: prior?.balances || raw.balances, aliases: [...new Set([...(prior?.aliases || []), ...(raw.aliases || []), raw.name, raw.nameEn, company?.name, company?.nameEn, ...(petromac ? ["پتروماک", "Petromac"] : [])].filter((value): value is string => Boolean(value)))], mergedPartyIds: [...new Set([...(prior?.mergedPartyIds || []), ...(raw.mergedPartyIds || []), raw.id].filter((old) => old !== id))], mergedPartyRecords: [...archive.values()] }));
  }
  return { parties: [...result.values()], idMap };
}

export function normalizePartyDatabase(db: AppDatabase): AppDatabase {
  const { parties, idMap } = consolidateCompanyParties(db.cashPartners || []);
  const register = (id: string | undefined, name: string | undefined) => {
    const target = ownedCompanyFor(name)?.id || (isPetromac(name) ? "partner:petromac" : undefined);
    if (id && target) idMap.set(id, target);
  };
  (db.customers || []).forEach((party) => register(`customer:${party.CustomerID}`, party.CustomerName));
  (db.suppliers || []).forEach((party) => register(`supplier:${party.SupplierID}`, party.SupplierName));
  (db.issuerCompanyShares || []).forEach((party) => register(`issuer:${party.id}`, party.name));
  (db.orders || []).forEach((order) => {
    (order.companyProfitShares || []).forEach((share, index) => register(`company:${order.OrderID}:${index}`, share.companyName));
    (order.customShares || []).forEach((share) => register(share.partnerId || `share:${share.id}`, share.partnerName));
    (order.profitPlan?.rules || []).forEach((rule) => register(rule.beneficiaryId, rule.beneficiaryName));
    register(order.profitPlan?.agentId, order.profitPlan?.agentName);
  });
  for (const company of ownedCompanies) register(company.key.toLowerCase(), company.name);
  register("legacy:ArcaShare", "آرکاتاو"); register("legacy:BeraShare", "براکم"); register("legacy:Arovin", "آروین");
  const keys = new Set(["EconomicOwnerPartyId", "FundingPartyId", "PartnerId", "partnerId", "beneficiaryId", "agentId", "partyId", "ownerId"]);
  const remap = (value: any): any => Array.isArray(value) ? value.map(remap) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, keys.has(key) && typeof item === "string" ? idMap.get(item) || item : remap(item)])) : value;
  // Keep original directory snapshots for audit instead of rewriting them.
  return { ...remap({ ...db, cashPartners: [] }), cashPartners: parties, hiddenPartyIds: (db.hiddenPartyIds || []).filter((id) => !idMap.has(id) || idMap.get(id) === id && !id.startsWith("owned:")) };
}
