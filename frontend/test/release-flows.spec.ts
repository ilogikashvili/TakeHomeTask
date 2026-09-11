import { expect, Page, test } from '@playwright/test';

async function login(page: Page, admin = false) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open demo workspace' })).toBeVisible();
  if (admin) await page.getByRole('combobox').nth(1).selectOption('admin');
  await page.getByRole('button', { name: 'Open demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your ledger' })).toBeVisible();
  const token = await page.evaluate(() => sessionStorage.getItem('ledger-token')!);
  const headers = { authorization: `Bearer ${token}` };
  const user = await (await page.request.get('/api/auth/me', { headers })).json();
  const vendors = await (await page.request.get('/api/vendors', { headers })).json();
  return { token, headers, user, vendors };
}

test('admin bulk updates and conflicting edits preserve the newer saved value', async ({ page }) => {
  const { headers, user, vendors } = await login(page, true);
  const name = 'Release fixture ' + Date.now();
  const ids: string[] = [];
  try {
    for (const index of [1, 2]) {
      const response = await page.request.post('/api/line-items', { headers, data: { ownerId: user.ownerId, vendorId: vendors[0].id,
        name: name + ' ' + index, category: 'release-test', description: 'Browser release fixture', amount: '10.00', billingPeriod: 'MONTHLY', startDate: '2026-01-01', endDate: '2040-01-01' } });
      expect(response.status()).toBe(201); ids.push((await response.json()).id);
    }
    await page.getByLabel('Search', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(2);
    await page.getByLabel('Select all on page').check();
    await page.getByRole('button', { name: 'Apply to selected' }).click();
    await expect(page.getByText('active', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const nameInEditor = await page.getByLabel('Subscription name', { exact: true }).inputValue();
    const current = (await (await page.request.get('/api/line-items?search=' + encodeURIComponent(nameInEditor), { headers })).json()).items[0];
    expect((await page.request.patch('/api/line-items/' + current.id, { headers, data: { expectedVersion: current.version, actorId: user.ownerId, amount: '77.00' } })).status()).toBe(200);
    await page.getByLabel('Billing amount').fill('55');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('changed');
    const saved = (await (await page.request.get('/api/line-items?search=' + encodeURIComponent(nameInEditor), { headers })).json()).items[0];
    expect(saved.amount).toBe('77.00');
    await page.getByRole('button', { name: 'Close editor' }).click();
  } finally {
    const items = (await (await page.request.get('/api/line-items?search=' + encodeURIComponent(name), { headers })).json()).items;
    for (const item of items.filter((item: { id: string }) => ids.includes(item.id))) await page.request.delete(`/api/line-items/${item.id}?expectedVersion=${item.version}`, { headers });
  }
});

test('logout revokes the credential and an expired session returns to sign-in', async ({ page }) => {
  const { headers, token } = await login(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open your workspace' })).toBeVisible();
  expect((await page.request.get('/api/auth/me', { headers })).status()).toBe(401);
  await page.evaluate(value => sessionStorage.setItem('ledger-token', value), token);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open your workspace' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('ledger-token'))).toBeNull();
});

test('vendor clarification resolves only the chosen candidate', async ({ page }) => {
  const { headers, user, vendors } = await login(page);
  const vendor = vendors.find((entry) => {
    const prefix = entry.name.slice(0, -1).toLowerCase();
    return vendors.filter((candidate) => candidate.name.toLowerCase().startsWith(prefix)).length > 1;
  }) ?? vendors[0];
  const candidates = vendors.filter((candidate) => candidate.name.toLowerCase().startsWith(vendor.name.slice(0, -1).toLowerCase())).slice(0, 2);
  const fixtureName = 'Clarification fixture ' + Date.now();
  const fixtureIds: string[] = [];
  try {
    for (const candidate of candidates) {
      const response = await page.request.post('/api/line-items', { headers, data: { ownerId: user.ownerId, vendorId: candidate.id,
        name: fixtureName + ' ' + candidate.id, category: 'release-test', description: 'Browser clarification fixture', amount: '10.00', billingPeriod: 'MONTHLY', startDate: '2026-01-01', endDate: '2040-01-01' } });
      expect(response.status()).toBe(201); fixtureIds.push((await response.json()).id);
    }
    await page.getByRole('link', { name: 'Assistant', exact: false }).click();
    await page.getByLabel('Ask a question').fill('Spend for "' + vendor.name.slice(0, -1) + '"');
    await page.getByRole('button', { name: 'Send', exact: false }).click();
    await page.getByRole('button', { name: vendor.name, exact: true }).click();
    await expect(page.getByRole('link', { name: 'View matching subscriptions' })).toBeVisible();
    await page.getByRole('link', { name: 'View matching subscriptions' }).click();
    await expect(page.getByRole('combobox', { name: 'Vendor', exact: true })).toHaveValue(vendor.id);
  } finally {
    const items = (await (await page.request.get('/api/line-items?search=' + encodeURIComponent(fixtureName), { headers })).json()).items;
    for (const item of items.filter((item: { id: string }) => fixtureIds.includes(item.id))) await page.request.delete(`/api/line-items/${item.id}?expectedVersion=${item.version}`, { headers });
  }
});
