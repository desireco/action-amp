import { test, expect } from '@playwright/test';

test.describe('Create Project Feature', () => {
    test('should allow creating a new project assigned to an area', async ({ page }) => {
        // Navigate to the create project page
        await page.goto('/new-project');

        // Fill in the project details
        await page.fill('input[name="name"]', 'New Test Project');
        await page.selectOption('select[name="area"]', { label: 'Work' }); // Assuming 'Work' area exists
        await page.fill('textarea[name="description"]', 'This is a test project created by Playwright.');

        // Listen for the API response
        const responsePromise = page.waitForResponse(response =>
            response.url().includes('/api/projects') && response.status() === 201
        );

        // Submit the form
        await page.click('button[type="submit"]');

        // Wait for the API response
        const response = await responsePromise;

        // Verify the response was successful
        expect(response.status()).toBe(201);

        // Wait a moment for the redirect to start
        await page.waitForTimeout(500);

        // Verify we're being redirected (URL should change from /new-project)
        const currentUrl = page.url();
        expect(currentUrl).not.toContain('/new-project');
    });
});
