import { test, expect } from '@playwright/test';

test.describe('Areas Feature', () => {
    test('should display areas list', async ({ page }) => {
        await page.goto('/areas');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Areas' })).toBeVisible();

        // Expect sample area to be present
        // We know 'Work' area exists in the sample data
        await expect(page.getByText('Work')).toBeVisible();
    });
});
