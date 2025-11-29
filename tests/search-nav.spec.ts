import { test, expect } from '@playwright/test';

test.describe('Nav Search', () => {
  test('Clicking Search in nav opens Search page', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.locator('aside')).toBeVisible();
    await page.click('a[href="/search"]');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.locator('#search-input')).toBeVisible();
  });
});
