import { expect, test } from '@playwright/test';

test('major routes expose usable headings, labels, focus and live regions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open your workspace' })).toBeVisible();
  await expect(page.getByLabel('Access token')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open demo workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Open demo workspace' }).click();

  await expect(page.getByRole('heading', { name: 'Your ledger' })).toBeVisible();
  await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
  await expect(page.locator('main button:focus, main a:focus, main input:focus, main select:focus')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();

  await page.getByRole('button', { name: '+ Add subscription', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Subscription name')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor' }).click();

  await page.getByRole('link', { name: 'Assistant', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity, on demand.' })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await page.getByRole('link', { name: 'Reminders', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Upcoming renewals' })).toBeVisible();
});