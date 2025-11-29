import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Inbox Feature', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should display inbox list', async ({ page }) => {
        await page.goto('/inbox');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

        // Expect sample item to be present
        // We know 'Call dentist for appointment' exists in the sample data
        await expect(page.getByText('Call dentist for appointment')).toBeVisible();

        // Expect Search link and input in sidebar
        await expect(page.locator('a[href="/search"]')).toBeVisible();
        await expect(page.locator('#nav-search')).toBeVisible();
    });

    test('should navigate to item detail', async ({ page, request }) => {
        // Create a new item to ensure it exists and tests the dynamic fallback
        const title = `Detail Test ${Date.now()}`;
        const response = await request.post('/api/inbox', { data: { title } });
        const item = await response.json();

        // Register for cleanup
        if (item.id) {
            cleaner.addFile(`data/inbox/${item.id}.md`);
        }

        // Wait for server to pick up the new file
        await page.waitForTimeout(1000);

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
