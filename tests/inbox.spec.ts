import { test, expect } from '@playwright/test';

test.describe('Inbox Feature', () => {
    test('should display inbox list', async ({ page }) => {
        await page.goto('/inbox');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

        // Expect sample item to be present
        // We know 'Call dentist for appointment' exists in the sample data
        await expect(page.getByText('Call dentist for appointment')).toBeVisible();

        // Expect Quick Capture input
        await expect(page.locator('#quick-capture')).toBeVisible();
    });

    test('should navigate to item detail', async ({ page, request }) => {
        // Create a new item to ensure it exists and tests the dynamic fallback
        const title = `Detail Test ${Date.now()}`;
        await request.post('/api/inbox', { data: { title } });

        await page.goto('/inbox');

        // Click on the new item
        await page.getByText(title).click();

        // Verify detail page
        const heading = page.getByRole('heading', { name: title });
        await expect(heading).toBeVisible();
        // URL should contain the ID (we don't know the exact ID, but we can check it's not 404)
        await expect(page).not.toHaveURL(/\/404/);
    });
});
