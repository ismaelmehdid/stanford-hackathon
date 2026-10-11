import type { BudgetPlan } from '@workspace/api-client-react';
import { CHANNELS, usd } from './format';

const delta = (baselineAmount: number, alternativeAmount: number) => ({
  baselineAmount,
  alternativeAmount,
  amountDelta: alternativeAmount - baselineAmount,
  relativeChangePercent: baselineAmount === 0 ? null : (alternativeAmount - baselineAmount) / baselineAmount * 100,
});
const share = (amount: number, total: number) => total === 0 ? null : amount / total * 100;

/** Read-only what-if arithmetic. No saved allocations are modified. */
export function compareBudgetPlans(baseline: BudgetPlan, alternative: BudgetPlan) {
  return {
    total: delta(baseline.totalBudget, alternative.totalBudget),
    channels: CHANNELS.map(channel => {
      const baselineAmount = baseline.allocations.find(row => row.channel === channel)?.amount ?? 0;
      const alternativeAmount = alternative.allocations.find(row => row.channel === channel)?.amount ?? 0;
      const baselineSharePercent = share(baselineAmount, baseline.totalBudget);
      const alternativeSharePercent = share(alternativeAmount, alternative.totalBudget);
      return {
        channel,
        ...delta(baselineAmount, alternativeAmount),
        baselineSharePercent,
        alternativeSharePercent,
        shareDeltaPoints: baselineSharePercent === null || alternativeSharePercent === null
          ? null : alternativeSharePercent - baselineSharePercent,
      };
    }),
  };
}

export const signedUsd = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${usd(Math.abs(value))}`;
export const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

export function comparisonCsvRows(baseline: BudgetPlan, alternative: BudgetPlan): string[][] {
  const comparison = compareBudgetPlans(baseline, alternative);
  const percent = (value: number | null) => value === null ? 'N/A — zero baseline allocation' : String(value);
  const shareValue = (value: number | null) => value === null ? 'N/A — zero total budget' : String(value);
  return [
    ['scope', 'What-if planning only. Not actual spend or measured performance. Meta Ads is not connected.'],
    ['direction', 'Alternative minus baseline. Shares use each draft’s own total budget. Share changes are percentage points.'],
    ['field', 'baseline', 'alternative'],
    ['plan_id', baseline.id, alternative.id],
    ['plan_name', baseline.name, alternative.name],
    ['created_at_utc', baseline.createdAt, alternative.createdAt],
    ['note', baseline.note ?? '', alternative.note ?? ''],
    [],
    ['channel', 'baseline_amount_usd', 'alternative_amount_usd', 'amount_delta_usd', 'baseline_share_percent', 'alternative_share_percent', 'share_delta_percentage_points', 'relative_amount_change_percent'],
    ...comparison.channels.map(row => [
      row.channel, String(row.baselineAmount), String(row.alternativeAmount), String(row.amountDelta),
      shareValue(row.baselineSharePercent), shareValue(row.alternativeSharePercent), shareValue(row.shareDeltaPoints),
      percent(row.relativeChangePercent),
    ]),
    ['total', String(comparison.total.baselineAmount), String(comparison.total.alternativeAmount),
      String(comparison.total.amountDelta), shareValue(share(baseline.totalBudget, baseline.totalBudget)),
      shareValue(share(alternative.totalBudget, alternative.totalBudget)),
      baseline.totalBudget === 0 || alternative.totalBudget === 0 ? 'N/A — zero total budget' : '0',
      percent(comparison.total.relativeChangePercent)],
  ];
}
