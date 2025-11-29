import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Edit Project Feature', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should allow editing an existing project', async ({ page }) => {
        // 1. Create a new project first to ensure we have something to edit
        const projectName = 'Project To Edit ' + Date.now();
        // Slug logic: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Use the API to create it directly to speed up the test
        const createResponse = await page.request.post('/api/projects', {
            data: {
                name: projectName,
                area: 'work',
                description: 'Initial description'
            }
        });
        expect(createResponse.ok()).toBeTruthy();
        const createData = await createResponse.json();

        // Register for cleanup
        if (createData.path) {
            cleaner.addFile(createData.path);
            const projectDir = createData.path.split('/').slice(0, -1).join('/');
            cleaner.addDir(projectDir);
        }

        // 2. Navigate to the project page
        // The path returned by API is the file path, we need to construct the URL
        // URL: /projects/work/project-to-edit/project.toml
        const projectUrl = `/projects/work/${projectSlug}/project.toml`;
        await page.goto(projectUrl);

        // 3. Click the edit button
        await page.click('a[href*="/edit-project"]');

        // Verify we're on the edit page
        await expect(page).toHaveURL(/\/edit-project\?project=/);

        // 4. Update the project details
        await page.fill('input[name="name"]', 'Project Edited');
        await page.fill('textarea[name="description"]', 'Updated description.');
        await page.selectOption('select[name="status"]', 'on_hold');

        // Listen for the API response
        const responsePromise = page.waitForResponse(response =>
            response.url().includes('/api/projects') && response.request().method() === 'PUT'
        );

        // Submit the form
        await page.click('button[type="submit"]');

        // Wait for the API response
        const response = await responsePromise;
        expect(response.status()).toBe(200);

        // Wait for redirect
        await page.waitForTimeout(1000);

        // Verify we're back on the project page
        expect(page.url()).toContain(projectUrl);
    });
});
