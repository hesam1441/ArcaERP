import { CaseProfitPlan } from '../types';

/** Select the existing two-pool formula; keep prices, percentages and costs.
 * A previously fixed manual settlement is removed so ratios govern the result.
 * The caller commits this draft through the normal case save flow. */
export function prepareTwoStageProfit(plan?: CaseProfitPlan): CaseProfitPlan {
  return {
    ...plan,
    route: 'agent',
    actualDistribution: 'two_pools',
    // Both quoted inputs are net; freight is added once to each price tier.
    purchaseIncludesFreight: false,
    agentQuoteIncludesFreight: false,
    manualShare: undefined,
    calculationVersion: 2,
  };
}
