import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Action Amplifier/);
});

test('has inbox count', async ({ page }) => {
  await page.goto('/');

  // Expect to see Inbox count
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
});
