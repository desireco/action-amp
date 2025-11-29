import { test, expect } from '@playwright/test';

test.describe('Areas Feature', () => {
    test('should display areas list', async ({ page }) => {
        await page.goto('/areas');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Areas' })).toBeVisible();

        // Expect sample area to be present
        // We know 'Work' area exists in the sample data
        await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
    });
    test('should navigate to area details', async ({ page }) => {
        await page.goto('/areas');

        // Click on the 'View Area Details' link for the 'Work' area
        // We find the card containing 'Work' heading, then find the link inside it
        const card = page.locator('.bg-surface', { has: page.getByRole('heading', { name: 'Work' }) });
        await card.getByRole('link', { name: 'Details' }).click();

        // Verify URL
        await expect(page).toHaveURL(/\/areas\/work/);

        // Verify detail page content
        // Should have a level 1 heading with 'Work'
        await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    });
});
