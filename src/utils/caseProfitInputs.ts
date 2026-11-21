import { CaseProfitPlan } from "../types";

export type CaseProfitInput = keyof NonNullable<CaseProfitPlan["accountingOverrides"]>;
const legacyKeys = {
  quantityMT: "calculationQuantityMT", purchasePricePerMT: "calculationPurchasePricePerMT",
  sellPricePerMT: "calculationSellPricePerMT", priceToAgentPerMT: "calculationPriceToAgentPerMT",
  freight: "calculationFreight",
} as const;

/** Both accounting editors write exactly the same explicit input layer. */
export function setCaseProfitInput(plan: CaseProfitPlan, key: CaseProfitInput, amount: number | undefined): CaseProfitPlan {
  const accountingOverrides = { ...plan.accountingOverrides };
  if (["purchasePricePerMT", "freight", "quantityMT"].includes(key)) delete accountingOverrides.landedCostPerMT;
  if (amount === undefined) delete accountingOverrides[key]; else accountingOverrides[key] = amount;
  const next = { ...plan, accountingOverrides };
  const legacyKey = legacyKeys[key as keyof typeof legacyKeys];
  // Once explicitly edited, an old estimate must not reappear behind a cleared input.
  if (legacyKey) delete next[legacyKey];
  return next;
}

export function getCaseProfitInput(plan: CaseProfitPlan, key: CaseProfitInput): number | undefined {
  const legacyKey = legacyKeys[key as keyof typeof legacyKeys];
  return plan.accountingOverrides?.[key] ?? (legacyKey ? plan[legacyKey] : undefined);
}
