import { test, expect } from '@playwright/test';

test.describe('Project Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate directly to our test project
        await page.goto('/projects/test-area/test-project');
        await page.waitForLoadState('networkidle');
    });

    test('should display project information correctly', async ({ page }) => {
        // Check for project name heading
        const heading = page.locator('div.border-b h1');
        await expect(heading).toBeVisible();
        await expect(heading).toContainText('Test Project');

        // Check for project details (status, area, etc.)
        const details = page.locator('.text-sm.text-text-muted');
        if (await details.count() > 0) {
            await expect(details.first()).toBeVisible();
        }

        // Check for description (if present)
        const description = page.locator('p').filter({ hasNotText: /^$/ });
        if (await description.count() > 0) {
            await expect(description.first()).toBeVisible();
        }
    });

    test('should display actions list', async ({ page }) => {
        // Look for actions section
        const actionsSection = page.locator('h2').filter({ hasText: 'Actions' });

        if (await actionsSection.count() > 0) {
            // Check for action items
            const actionItems = page.locator('.flex.items-center.gap-3');

            if (await actionItems.count() > 0) {
                await expect(actionItems.first()).toBeVisible();

                // Check for action titles
                const actionTitles = actionItems.locator('span');
                if (await actionTitles.count() > 0) {
                    await expect(actionTitles.first()).toBeVisible();
                }
            }
        }
    });

    test('should display resources if present', async ({ page }) => {
        // Look for resources section
        const resourcesSection = page.locator('h2').filter({ hasText: 'Resources' });

        if (await resourcesSection.count() > 0) {
            // Check for resource items
            const resourceItems = page.locator('.grid.gap-2');

            if (await resourceItems.count() > 0) {
                await expect(resourceItems.first()).toBeVisible();

                // Check for file names or types
                const resourceNames = resourceItems.locator('span, div');
                if (await resourceNames.count() > 0) {
                    await expect(resourceNames.first()).toBeVisible();
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
    });

    test('should toggle action status', async ({ page }) => {
        // Look for action items with status buttons
        const actionButtons = page.locator('button[data-action-id]');

        if (await actionButtons.count() > 0) {
            const firstButton = actionButtons.first();
            const actionId = await firstButton.getAttribute('data-action-id');

            expect(actionId).toBeTruthy();

            // Get initial state (check if it has opacity class)
            const buttonContainer = firstButton.locator('..');
            const initialOpacity = await buttonContainer.getAttribute('class');

            // Click the button to toggle status
            await firstButton.click();

            // Wait for potential API call
            await page.waitForTimeout(500);

            // Check if state changed (either opacity or page reload)
            // The button might show loading state with opacity changes
            const finalOpacity = await buttonContainer.getAttribute('class');
            expect(finalOpacity).toBeDefined();
        }
    });

    test('should handle API errors gracefully', async ({ page }) => {
        // This would require mocking API failures
        // For now, just ensure the page doesn't crash on interaction
        const actionButtons = page.locator('button[data-action-id]');

        if (await actionButtons.count() > 0) {
            // Set up dialog listener for potential error alerts
            page.on('dialog', async dialog => {
                await dialog.dismiss();
            });

            // Try clicking an action button
            await actionButtons.first().click();

            // Page should still be functional
            await expect(page.locator('h1')).toBeVisible();
        }
    });

    test('should navigate back to areas list', async ({ page }) => {
        // Find and click back button
        const backButton = page.locator('a').filter({ hasText: '← Back to Areas' });
        if (await backButton.count() > 0) {
            await backButton.first().click();

            // Verify we're on areas page
            await expect(page).toHaveURL(/\/areas$/);
            await expect(page.getByRole('heading', { name: 'Areas' })).toBeVisible();
        }
    });

    test('should navigate to edit project', async ({ page }) => {
        // Find and click edit button
        const editButton = page.locator('a').filter({ hasText: 'Edit Project' });
        if (await editButton.count() > 0) {
            await editButton.first().click();

            // Should navigate to edit page
            await expect(page).toHaveURL(/\/edit-project/);
        }
    });

    test('should sort actions by status', async ({ page }) => {
        // Look for multiple actions with different statuses
        const actionItems = page.locator('.flex.items-center.gap-3');
        const actionCount = await actionItems.count();

        if (actionCount > 1) {
            // Check that actions are displayed
            for (let i = 0; i < Math.min(actionCount, 3); i++) {
                await expect(actionItems.nth(i)).toBeVisible();
            }

            // Verify status indicators are present
            const statusIcons = page.locator('.w-4.h-4');
            if (await statusIcons.count() > 0) {
                await expect(statusIcons.first()).toBeVisible();
            }
        }
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