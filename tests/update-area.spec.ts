import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Edit Area Feature', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should allow editing an existing area', async ({ page }) => {
        // 1. Create a new area first to ensure we have something to edit
        const areaName = 'Area To Edit ' + Date.now();
        // Slug logic: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const areaSlug = areaName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Register for cleanup
        cleaner.addDir(`data/areas/${areaSlug}`);

        // Use the UI to create it to avoid CSRF issues
        await page.goto('/areas/new');
        await page.fill('input[name="name"]', areaName);

        // Select icon (radio button)
        await page.click('input[value="home"] + div');

        // Select color (radio button)
        await page.click('input[value="blue"] + div');

        await page.fill('textarea[name="description"]', 'Initial description');

        // Submit
        await page.click('button[type="submit"]');

        // Wait for redirect to areas list page
        await expect(page).toHaveURL(/\/areas$/);

        // 2. Navigate to the area page
        // URL: /areas/area-to-edit
        const areaUrl = `/areas/${areaSlug}`;
        await page.goto(areaUrl);

        // 3. Click the edit button
        await page.click('a[href*="/edit"]');

        // Verify we're on the edit page
        await expect(page).toHaveURL(/\/edit$/);

        // 4. Update the area details
        await page.fill('input[name="name"]', 'Area Edited');
        await page.fill('textarea[name="description"]', 'Updated description.');

        // Select a different icon (e.g., briefcase)
        // The icon selection is radio buttons, hidden with sr-only, but the label is clickable
        // We can click the label that contains the input with value="briefcase"
        await page.click('input[value="briefcase"] + div');

        // Select a different color (e.g., red)
        await page.click('input[value="red"] + div');

        // Listen for the API response
        const responsePromise = page.waitForResponse(response =>
            response.url().includes(`/api/areas/${areaSlug}`) && response.request().method() === 'PUT'
        );

        // Submit the form
        await page.click('button[type="submit"]');

        // Wait for the API response
        const response = await responsePromise;
        expect(response.status()).toBe(200);

        // Wait for redirect
        await page.waitForTimeout(1000);

        // Verify we're back on the area page
        expect(page.url()).toContain(areaUrl);

        // Verify the content is updated on the page
        // Since we switched to dataReader.getArea, this should show the new name immediately
        await expect(page.getByRole('heading', { name: 'Area Edited' })).toBeVisible();
    });
});
