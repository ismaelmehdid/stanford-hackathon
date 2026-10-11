import { test, expect } from '@playwright/test';
import type { BudgetPlan } from '@workspace/api-client-react';
import { compareBudgetPlans, comparisonCsvRows } from '../src/lib/budget-comparison';
import { csvText } from '../src/lib/csv';

const channels = ['Paid', 'Content', 'Social', 'Email', 'SEO', 'Brand'] as const;
const plan = (id: string, name: string, amounts: number[], note = ''): BudgetPlan => ({
  id, name, note, createdAt: '2026-10-10T10:00:00.000Z',
  totalBudget: amounts.reduce((sum, amount) => sum + amount, 0),
  allocations: channels.map((channel, i) => ({ channel, amount: amounts[i]! })),
});
const baseline = plan('baseline', 'Baseline', [100, 100, 0, 0, 0, 0], 'Keep email unchanged');
const alternative = plan('alternative', 'Alternative', [100, 200, 100, 0, 0, 0], 'Try social');

test('comparison uses each total for shares and never modifies records', () => {
  const before = JSON.stringify([baseline, alternative]);
  const result = compareBudgetPlans(baseline, alternative);
  expect(result.total.amountDelta).toBe(200);
  expect(result.total.relativeChangePercent).toBe(100);
  expect(result.channels[0]).toMatchObject({
    baselineAmount: 100, alternativeAmount: 100, amountDelta: 0,
    baselineSharePercent: 50, alternativeSharePercent: 25, shareDeltaPoints: -25,
  });
  expect(result.channels[1]!.relativeChangePercent).toBe(100);
  expect(result.channels[2]!.relativeChangePercent).toBeNull();
  expect(result.channels[3]!.relativeChangePercent).toBeNull();
  expect(compareBudgetPlans(alternative, baseline).total.amountDelta).toBe(-200);
  expect(JSON.stringify([baseline, alternative])).toBe(before);
});

test('zero totals never produce infinite or fabricated shares', () => {
  const empty = plan('empty', 'Empty', [0, 0, 0, 0, 0, 0]);
  const result = compareBudgetPlans(empty, alternative);
  expect(result.total.relativeChangePercent).toBeNull();
  expect(result.channels.every(row => row.baselineSharePercent === null && row.shareDeltaPoints === null)).toBe(true);
});

test('CSV includes provenance, all channel figures, and explicit zero-baseline notes', () => {
  const rows = comparisonCsvRows(baseline, alternative);
  expect(rows).toContainEqual(['plan_id', 'baseline', 'alternative']);
  expect(rows).toContainEqual(['note', 'Keep email unchanged', 'Try social']);
  expect(rows.find(row => row[0] === 'Paid')).toEqual(['Paid', '100', '100', '0', '50', '25', '-25', '0']);
  expect(rows.find(row => row[0] === 'Social')?.at(-1)).toContain('zero baseline');
  expect(csvText(rows)).toContain('What-if planning only');
  expect(csvText([['comma,quote"\r\nnext', '=HYPERLINK("bad")', '-25']])).toBe(
    '"comma,quote""\r\nnext","\'=HYPERLINK(""bad"")",-25',
  );
});

test('empty and single saved-plan lists do not invent comparison records', async ({ page }) => {
  await page.route('**/api/budget-plans', route => route.fulfill({ json: [] }));
  await page.goto('/analytics');
  await expect(page.getByTestId('section-budget-comparison')).toContainText('two');
  await expect(page.getByTestId('button-export-comparison')).toBeDisabled();
  await page.unroute('**/api/budget-plans');
  await page.route('**/api/budget-plans', route => route.fulfill({ json: [baseline] }));
  await page.reload();
  await expect(page.getByTestId('one-plan-comparison')).toContainText('second');
  await expect(page.getByTestId('button-export-comparison')).toBeDisabled();
});

test('saved-plan comparison exports and loads only a copy, without write requests', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.method());
  });
  await page.route('**/api/budget-plans', route => route.fulfill({ json: [baseline, alternative] }));
  await page.goto('/analytics');
  const comparison = page.getByTestId('section-budget-comparison');
  await expect(comparison).toContainText('Baseline');
  await expect(comparison).toContainText('Try social');
  await expect(page.getByTestId('row-comparison-Paid')).toContainText('-25.0');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export-comparison').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('What-if planning only');
  expect(csv).toContain('baseline,alternative');
  expect(csv).toContain('Paid,100,100,0,50,25,-25,0');
  await page.getByTestId('button-swap-comparison').click();
  await expect(page.getByTestId('select-compare-baseline')).toHaveValue('alternative');
  await expect(page.getByTestId('row-comparison-Paid')).toContainText('+25.0');
  await page.getByTestId('button-compare-load-alternative').click();
  await expect(page.getByTestId('input-plan-name')).toHaveValue('Copy of Baseline');
  await page.getByTestId('input-allocation-Paid').fill('90');
  await expect(page.getByTestId('row-comparison-Paid')).toContainText('$100');
  await expect(page.getByTestId('row-budget-plan-baseline')).toContainText('$200');
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
