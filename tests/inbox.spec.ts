import { test, expect } from '@playwright/test';

test.describe('Inbox Feature', () => {
    test('should display inbox list', async ({ page }) => {
        await page.goto('/inbox');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

        // Expect sample item to be present
        // We know 'Call dentist for appointment' exists in the sample data
        await expect(page.getByText('Call dentist for appointment')).toBeVisible();
    });
});
