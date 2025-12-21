import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Inbox Feature', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        // await cleaner.cleanup();
    });

    test('should display inbox list', async ({ page }) => {
        await page.goto('/inbox');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

        // Expect sample item to be present
        // Use test-inbox-1 which exists in test data
        await expect(page.getByText('Test Inbox Action')).toBeVisible();

        // Expect Search link and input in sidebar
        await expect(page.locator('a[href="/search"]')).toBeVisible();
        await expect(page.locator('#nav-search')).toBeVisible();
    });

    test('should navigate to item detail', async ({ page, request }) => {
        // Create a new item to ensure it exists and tests the dynamic fallback
        const title = `Detail Test ${Date.now()}`;
        const response = await request.post('/api/inbox', { data: { title } });
        expect(response.ok()).toBeTruthy();
        const item = await response.json();

        // Register for cleanup
        if (item.id) {
            cleaner.addFile(`data/inbox/${item.id}.md`);
        }

        // Wait for server to pick up the new file
        await page.waitForTimeout(2000);

        await page.goto('/inbox?t=' + Date.now());

        // Navigate to detail page
        await page.goto(`/inbox/${item.id}`);

        // Verify URL
        await expect(page).toHaveURL(new RegExp(`/inbox/${item.id}`));

        // Verify detail page
        const heading = page.getByRole('heading', { name: title });
        await expect(heading).toBeVisible();
        // URL should contain the ID (we don't know the exact ID, but we can check it's not 404)
        await expect(page).not.toHaveURL(/\/404/);
    });

    test('should delete single inbox item and refresh list', async ({ page, request }) => {
        // Create a new item to delete
        const title = `Delete Test ${Date.now()}`;
        const response = await request.post('/api/inbox', { data: { title } });
        expect(response.ok()).toBeTruthy();
        const item = await response.json();

        // Register for cleanup in case test fails
        if (item.id) {
            cleaner.addFile(`data/inbox/${item.id}.md`);
        }

        // Wait for server to pick up the new file
        await page.waitForTimeout(1000);

        await page.goto('/inbox');

        // Verify item is initially visible
        await expect(page.getByText(title, { exact: true })).toBeVisible();

        // Navigate to detail page
        await page.goto(`/inbox/${item.id}`);

        // Find and click the delete button
        const deleteButton = page.locator('#delete-button');
        await expect(deleteButton).toBeVisible();

        // Confirm deletion
        page.on('dialog', dialog => dialog.accept());
        await deleteButton.click();

        // Should return to inbox list (with cache-busting timestamp)
        await expect(page).toHaveURL(/\/inbox(\?t=\d+)?/);

        // Wait longer for cache to refresh and page to reload
        await page.waitForTimeout(2000);

        // Verify item is no longer visible (use exact match)
        await expect(page.getByText(title, { exact: true })).not.toBeVisible();
    });

    test('should bulk delete inbox items and refresh cache', async ({ page, request }) => {
        // Create multiple items to delete
        const items = [];
        for (let i = 0; i < 3; i++) {
            const title = `Bulk Delete Test ${Date.now()}-${i}`;
            const response = await request.post('/api/inbox', { data: { title } });
            expect(response.ok()).toBeTruthy();
            const item = await response.json();
            items.push(item);

            // Register for cleanup in case test fails
            if (item.id) {
                cleaner.addFile(`data/inbox/${item.id}.md`);
            }
        }

        // Wait for server to pick up the new files
        await page.waitForTimeout(1000);

        await page.goto('/inbox');

        // Verify items are initially visible
        for (const item of items) {
            await expect(page.getByText(item.title)).toBeVisible();
        }

        // Select all items for bulk deletion
        for (const item of items) {
            const itemElement = page.locator(`[data-id="${item.id}"]`);
            const checkbox = itemElement.locator('input[type="checkbox"]');
            await checkbox.check();
        }

        // Click bulk delete button
        const bulkDeleteButton = page.locator('#bulk-delete');
        await expect(bulkDeleteButton).toBeVisible();

        // Confirm deletion
        page.on('dialog', dialog => dialog.accept());
        await bulkDeleteButton.click();

        // Wait for deletion and cache refresh
        await page.waitForTimeout(1000);

        // Verify all items are no longer visible
        for (const item of items) {
            await expect(page.getByText(item.title)).not.toBeVisible();
        }
    });
    test('debug environment', async ({ request }) => {
        const response = await request.get('/api/debug-user');
        const data = await response.json();
        console.log('DEBUG ENVIRONMENT:', JSON.stringify(data, null, 2));
    });
});
