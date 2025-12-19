import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Dashboard Project Cache', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should reflect new project creation in dashboard after cache invalidation', async ({ page }) => {
        // Navigate to dashboard
        await page.goto('/dashboard');

        // Get initial project count
        const initialProjectCount = await page.locator('.grid > div:nth-child(3) .text-4xl').textContent();
        const initialCount = parseInt(initialProjectCount || '0', 10);

        // Navigate to create project page
        await page.goto('/new-project');

        // Fill in the project details
        const projectName = 'New Test Project ' + Date.now();
        await page.fill('input[name="name"]', projectName);
        await page.selectOption('select[name="area"]', { label: 'Work' });
        await page.fill('textarea[name="description"]', 'This is a test project created by Playwright.');

        // Listen for the API response
        const responsePromise = page.waitForResponse(response =>
            response.url().includes('/api/projects') && response.status() === 201
        );

        // Submit the form
        await page.click('button[type="submit"]');

        // Wait for the API response
        const response = await responsePromise;
        expect(response.status()).toBe(201);

        // Register file for cleanup
        const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const projectPath = `data/areas/work/${slug}/project.toml`;
        const projectDir = `data/areas/work/${slug}`;
        
        cleaner.addFile(projectPath);
        cleaner.addDir(projectDir);

        // Wait for redirect
        await page.waitForTimeout(500);

        // Navigate back to dashboard
        await page.goto('/dashboard');

        // Wait for dashboard to load
        await page.waitForTimeout(1000);

        // Get new project count
        const newProjectCount = await page.locator('.grid > div:nth-child(3) .text-4xl').textContent();
        const newCount = parseInt(newProjectCount || '0', 10);

        // Verify project count increased
        expect(newCount).toBe(initialCount + 1);
    });

    test('should reflect project deletion in dashboard after cache invalidation', async ({ page }) => {
        // First, create a project to delete
        const projectName = 'Test Project ' + Date.now();
        const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const projectPath = `data/areas/work/${slug}/project.toml`;
        const projectDir = `data/areas/work/${slug}`;
        
        // Create project via API
        const response = await page.request.post('/api/projects', {
            data: {
                name: projectName,
                area: 'Work',
                description: 'Test project for deletion'
            }
        });

        expect(response.status()).toBe(201);
        
        cleaner.addFile(projectPath);
        cleaner.addDir(projectDir);

        // Navigate to dashboard
        await page.goto('/dashboard');

        // Get initial project count
        const initialProjectCount = await page.locator('.grid > div:nth-child(3) .text-4xl').textContent();
        const initialCount = parseInt(initialProjectCount || '0', 10);

        // Navigate to projects page
        await page.goto('/projects');

        // Find and click the project to delete
        await page.getByText(projectName).click();

        // Find and click the delete button
        const deleteButton = page.locator('#delete-button');
        await expect(deleteButton).toBeVisible();
        
        // Confirm deletion
        page.on('dialog', dialog => dialog.accept());
        await deleteButton.click();

        // Wait for deletion and cache refresh
        await page.waitForTimeout(2000);

        // Navigate back to dashboard
        await page.goto('/dashboard');

        // Wait for dashboard to load
        await page.waitForTimeout(1000);

        // Get new project count
        const newProjectCount = await page.locator('.grid > div:nth-child(3) .text-4xl').textContent();
        const newCount = parseInt(newProjectCount || '0', 10);

        // Verify project count decreased
        expect(newCount).toBe(initialCount - 1);
    });
});