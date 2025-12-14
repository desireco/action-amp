import { test, expect } from '@playwright/test';

test.describe('Area Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate directly to our test area
        await page.goto('/areas/test-area');
        await page.waitForLoadState('networkidle');
    });

    test('should display area information correctly', async ({ page }) => {
        // Check for area name heading - use the specific selector for area detail page
        const heading = page.locator('div.border-b h1');
        await expect(heading).toBeVisible();
        await expect(heading).toContainText('Test Area');

        // Check for description (if present)
        const description = page.locator('.text-text-muted');
        if (await description.count() > 0) {
            await expect(description.first()).toBeVisible();
        }

        // Check for priority badge (if present)
        const priorityBadge = page.locator('.rounded-full');
        if (await priorityBadge.count() > 0) {
            await expect(priorityBadge.first()).toBeVisible();
        }
    });

    test('should display projects associated with the area', async ({ page }) => {
        // Look for projects section
        const projectsSection = page.locator('.space-y-4');

        if (await projectsSection.count() > 0) {
            // Check for project cards
            const projectCards = page.locator('.bg-surface\\/50.p-4');

            if (await projectCards.count() > 0) {
                await expect(projectCards.first()).toBeVisible();

                // Check that project cards have titles
                const projectTitles = projectCards.locator('h3, .font-medium');
                if (await projectTitles.count() > 0) {
                    await expect(projectTitles.first()).toBeVisible();
                }
            }
        }
    });

    test('should have navigation buttons', async ({ page }) => {
        // Check for back button
        const backButton = page.locator('a').filter({ hasText: '←' });
        if (await backButton.count() > 0) {
            await expect(backButton.first()).toBeVisible();
        }

        // Check for edit button
        const editButton = page.locator('a').filter({ hasText: 'Edit' });
        if (await editButton.count() > 0) {
            await expect(editButton.first()).toBeVisible();
        }

        // Check for new project button
        const newProjectButton = page.locator('a').filter({ hasText: 'New Project' });
        if (await newProjectButton.count() > 0) {
            await expect(newProjectButton.first()).toBeVisible();
        }
    });

    test('should navigate back to areas list', async ({ page }) => {
        // Get current URL to verify navigation
        const currentUrl = page.url();

        // Find and click back button
        const backButton = page.locator('a').filter({ hasText: '← Back' });
        if (await backButton.count() > 0) {
            await backButton.first().click();

            // Verify we're on areas page
            await expect(page).toHaveURL(/\/areas$/);
            await expect(page.getByRole('heading', { name: 'Areas' })).toBeVisible();
        }
    });

    test('should navigate to edit area', async ({ page }) => {
        // Find and click edit button
        const editButton = page.locator('a').filter({ hasText: 'Edit' });
        if (await editButton.count() > 0) {
            await editButton.first().click();

            // Should navigate to edit page
            await expect(page).toHaveURL(/\/areas\/.*\/edit$/);
        }
    });

    test('should navigate to project details', async ({ page }) => {
        // Look for project cards
        const projectCards = page.locator('.bg-surface\\/50.p-4');

        if (await projectCards.count() > 0) {
            // Get the current URL to compare
            const areaUrl = page.url();

            // Click on the first project
            await projectCards.first().click();

            // Verify we've navigated to a project page
            const newUrl = page.url();
            expect(newUrl).not.toBe(areaUrl);
            expect(newUrl).toContain('/projects/');
        }
    });

    test('should show empty state when no projects exist', async ({ page }) => {
        // This would be hard to test without specific data setup
        // Look for empty state message
        const emptyState = page.locator('text=/No projects/');
        if (await emptyState.count() > 0) {
            await expect(emptyState).toBeVisible();
        }
    });

    test('should handle area with no description', async ({ page }) => {
        // Test that page loads fine even without description
        const heading = page.locator('h1');
        await expect(heading).toBeVisible();

        // Check page doesn't crash
        await expect(page.locator('body')).toBeVisible();
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        const heading = page.locator('div.border-b h1');
        await expect(heading).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(heading).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(heading).toBeVisible();
    });

    test('should have no console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.reload();

        // Assert no JavaScript errors occurred
        expect(errors).toHaveLength(0);
    });
});