/** Canonical keys keep the Persian and English spellings of the same beneficiary together. */
const aliases: Record<string, string> = {
  "lida": "petromac", "لیدا": "petromac",
  "jalali": "jalali", "جلالی": "jalali",
  "hamid": "hamid", "حمید": "hamid",
  "moradi": "moradi", "مرادی": "moradi",
  "mahsa": "mahsa", "مهسا": "mahsa",
  "arash": "arash", "آرش": "arash",
  "khusru": "khusru", "khosrow": "khusru", "خسرو": "khusru",
  "hesam": "hesam", "حسام": "hesam",
  "reza": "reza", "رضا": "reza",
  "arovin": "arovin", "آروین": "arovin",
  "berabank": "berabank", "برابانک": "berabank",
  "arca": "arca", "آرکا": "arca", "آرکاتاو": "arca",
  "bera": "bera", "برا": "bera",
};

export const ownedCompanies = [
  { key: "Arcatav" as const, id: "owned:Arcatav", name: "آرکاتاو", nameEn: "Arcatav" },
  { key: "Arovin" as const, id: "owned:Arovin", name: "آروین", nameEn: "Arovin" },
  { key: "Berakem" as const, id: "owned:Berakem", name: "براکم", nameEn: "Berakem" },
];

const clean = (value?: string | null) => (value || "").normalize("NFKC").trim().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200d]/g, " ").replace(/\s+/g, " ").toLocaleLowerCase();
export function ownedCompanyFor(value?: string | null) {
  const name = clean(value);
  if (["آرکاتاو", "ارکاتاو", "آرکا", "ارکا", "arca"].includes(name) || /^(arcatav|arca[ -]*tav)(\s+(commerce|co\.?|limited|ltd\.?))?(\s+(ltd\.?|limited))?$/.test(name)) return ownedCompanies[0];
  if (["آروین", "اروین"].includes(name) || /^arovin(?: trading)?(?:[ .]+l[ .]*l[ .]*c[ .]*)?$/.test(name)) return ownedCompanies[1];
  if (["براکم", "برا", "bera"].includes(name) || /^berakem(?: k[iı]mya t[iı]caret [iı]thalat [iı]hracat l[iı]m[iı]ted ş[iı]rket[iı])?$/.test(name.replace(/i̇/g, "i"))) return ownedCompanies[2];
  return undefined;
}

export const isPetromac = (value?: string | null) => ["petromac", "پتروماک", "پترو مک", "lida", "لیدا", "پتروماک (لیدا)"].includes(clean(value));

export function normalizePartnerName(value: string | undefined | null): string {
  const company = ownedCompanyFor(value);
  if (company) return company.key.toLowerCase();
  if (isPetromac(value)) return "petromac";
  const normalized = clean(value);
  return aliases[normalized] || normalized;
}
