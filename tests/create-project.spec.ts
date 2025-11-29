import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Create Project Feature', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should allow creating a new project assigned to an area', async ({ page }) => {
        // Navigate to the create project page
        await page.goto('/new-project');

        // Fill in the project details
        const projectName = 'New Test Project ' + Date.now();
        await page.fill('input[name="name"]', projectName);
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

        // Register file for cleanup (predicting path to avoid Network.getResponseBody error on redirect)
        // Slug logic: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        // Area is 'Work' -> 'work' (assuming 'work' is the slug for 'Work' area)
        const projectPath = `data/areas/work/${slug}/project.toml`;
        const projectDir = `data/areas/work/${slug}`;

        cleaner.addFile(projectPath);
        cleaner.addDir(projectDir);

        // Verify the response was successful
        expect(response.status()).toBe(201);

        // Wait a moment for the redirect to start
        await page.waitForTimeout(500);

        // Verify we're being redirected (URL should change from /new-project)
        const currentUrl = page.url();
        expect(currentUrl).not.toContain('/new-project');
    });
});
