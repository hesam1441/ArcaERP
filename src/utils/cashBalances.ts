import { CashEntry } from '../types';
export const cashPeople = ["حسام", "رضا", "دفتر", "براکم", "آروین", "طالع"] as const;
export const cashCurrencies = ["USD", "CAD", "EUR", "AED", "TL"] as const;
const legacyField: Record<string, keyof CashEntry | undefined> = { "حسام_USD":"HesamUSD", "رضا_USD":"RezaUSD", "دفتر_USD":"OfficeUSD", "براکم_USD":"BerakemUSD", "طالع_USD":"TaleUSD", "حسام_EUR":"HesamEUR", "رضا_EUR":"RezaEUR", "دفتر_EUR":"OfficeEUR", "براکم_EUR":"BerakemEUR", "طالع_EUR":"TaleEUR", "حسام_AED":"HesamAED", "رضا_AED":"RezaAED", "آروین_AED":"ArovinAED", "طالع_AED":"TaleAED", "حسام_CAD":"HesamCAD", "رضا_CAD":"RezaCAD", "طالع_CAD":"TaleCAD", "حسام_TL":"HesamTL", "رضا_TL":"RezaTL", "طالع_TL":"TaleTR" };
/** An explicit matrix value, including zero, replaces its legacy field; never sum both. */
export const cashAccountAmount = (entry:CashEntry,person:string,currency:string):number => Number(entry.accounts?.[`${person}_${currency}`] ?? (legacyField[`${person}_${currency}`] ? entry[legacyField[`${person}_${currency}`]!] : 0) ?? 0);
export const cashAccountTotal = (entries:CashEntry[],person:string,currency:string) => entries.reduce((sum,entry)=>sum+cashAccountAmount(entry,person,currency),0);
export const cashCurrencyTotal = (entries:CashEntry[],currency:string) => cashPeople.reduce((sum,person)=>sum+cashAccountTotal(entries,person,currency),0)+(currency==="CAD"?entries.reduce((sum,entry)=>sum+Number(entry.VanpexCAD||0),0):0);
