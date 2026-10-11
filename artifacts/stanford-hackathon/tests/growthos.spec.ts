import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`workspace routes render at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [path, heading] of [['/', 'Dashboard'], ['/analytics', 'Analytics'], ['/campaigns', 'Campaigns'], ['/pipelines', 'Pipelines'], ['/approvals', 'Approvals']]) {
      await page.goto(path!);
      await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
      await expect(page.getByTestId('link-brand')).toContainText('GrowthOS');
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('campaign search and channel filters use saved data', async ({ page, request }) => {
  const response = await request.get('/api/campaigns');
  expect(response.ok()).toBe(true);
  const campaigns = await response.json();
  test.skip(!campaigns.length, 'No saved campaigns to filter');
  const campaign = campaigns[0];
  await page.goto('/campaigns');
  await page.getByTestId('input-search').fill(campaign.name);
  await expect(page.getByTestId('list-campaigns')).toContainText(campaign.name);
  await page.getByTestId('select-channel-filter').selectOption(campaign.channel);
  await expect(page.getByTestId('list-campaigns')).toContainText(campaign.name);
  await page.getByTestId('input-search').fill('NoSuchCampaign-948378434');
  await expect(page.getByText('No matching campaigns', { exact: true })).toBeVisible();
});

test('campaign details show persisted brief and revision history', async ({ page, request }) => {
  const campaigns = await (await request.get('/api/campaigns')).json();
  test.skip(!campaigns.length, 'No saved campaigns to inspect');
  const campaign = campaigns[0];
  await page.goto(`/campaigns/${campaign.id}`);
  await expect(page.getByTestId('text-campaign-name')).toHaveText(campaign.name);
  await expect(page.getByTestId('input-objective')).toHaveValue(campaign.objective);
  await expect(page.getByTestId('list-revisions')).toBeVisible();
  await expect(page.getByTestId('button-save')).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('input-name')).toHaveValue(campaign.name);
});

test('invalid campaign inputs fail instead of being saved', async ({ request }) => {
  const response = await request.post('/api/campaigns', { data: { name: '', channel: 'Email', objective: '' } });
  expect(response.status()).toBe(400);
});

test('analytics distinguish planned budgets from unavailable Meta performance', async ({ request }) => {
  const response = await request.get('/api/analytics?days=7');
  expect(response.ok()).toBe(true);
  const analytics = await response.json();
  expect(analytics.periodDays).toBe(7);
  expect(analytics.trend).toHaveLength(7);
  expect(analytics.sourceStatus).toBe('not_connected');
  expect(analytics.actualSpend).toBeNull();
  expect(analytics.conversions).toBeNull();
  expect(analytics.costPerAcquisition).toBeNull();
  expect(analytics.roas).toBeNull();
  expect(analytics.byChannel.reduce((sum: number, row: { plannedBudget: number }) => sum + row.plannedBudget, 0)).toBe(analytics.plannedBudget);
  const scoped = await (await request.get('/api/analytics?days=90&channel=Paid')).json();
  expect(scoped.byChannel).toHaveLength(1);
  expect(scoped.byChannel[0].channel).toBe('Paid');
  expect(scoped.trend).toHaveLength(90);
  expect((await request.get('/api/analytics?days=28')).status()).toBe(400);
});

test('unbalanced and duplicate-channel allocation drafts are rejected', async ({ request }) => {
  const allocations = ['Paid', 'Content', 'Social', 'Email', 'SEO', 'Brand'].map(channel => ({ channel, amount: 100 }));
  const unbalanced = await request.post('/api/budget-plans', { data: { name: 'Must not save', totalBudget: 1000, allocations } });
  expect(unbalanced.status()).toBe(400);
  allocations[5]!.channel = 'Paid';
  const duplicate = await request.post('/api/budget-plans', { data: { name: 'Must not save', totalBudget: 600, allocations } });
  expect(duplicate.status()).toBe(400);
});
