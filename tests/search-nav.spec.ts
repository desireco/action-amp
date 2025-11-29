import { test, expect } from '@playwright/test';

test.describe('Nav Search', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test('Enter in nav search opens Search with query', async ({ page }) => {
    await page.goto('/inbox');
    await expect(page.locator('aside')).toBeVisible();

    const term = 'dentist';
    await expect(page.locator('#nav-search')).toBeVisible();
    await page.fill('#nav-search', term);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}`));
    await expect(page.locator('#search-input')).toHaveValue(term);
  });
});
