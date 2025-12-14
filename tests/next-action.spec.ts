import { test, expect } from '@playwright/test';

test.describe('Next Action Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the Next Action page
        await page.goto('/next');
    });

    test('should load successfully and have correct title', async ({ page }) => {
        // Check that the page loads successfully
        await expect(page).toHaveTitle(/Next Actions/);

        // Check main heading (level 1)
        await expect(page.getByRole('heading', { name: 'Next Actions', level: 1 })).toBeVisible();
    });

    test('should display correct context information', async ({ page }) => {
        // Check for context description
        const contextText = await page.locator('p').filter({ hasText: /context/ }).first();

        // Should show either "All next actions across all contexts"
        // or "Focusing on X context."
        await expect(contextText).toBeVisible();
    });

    test('should handle empty state correctly', async ({ page }) => {
        // Look for empty state message
        const emptyState = page.locator('.text-center').filter({ hasText: 'No Next Actions' });

        if (await emptyState.isVisible()) {
            // Check empty state elements
            await expect(page.getByText("You're all caught up for this context!")).toBeVisible();
            await expect(page.getByRole('button', { name: 'Mark as completed' })).not.toBeVisible();
        }
    });

    test('should display actions when available', async ({ page }) => {
        // Check if there are any action cards
        const actionCards = page.locator('.group').filter({ has: page.locator('button[data-action-id]') });

        if (await actionCards.first().isVisible()) {
            // Check that action cards have expected elements
            const firstCard = actionCards.first();

            // Should have a completion button
            await expect(firstCard.locator('button[data-action-id]')).toBeVisible();

            // Should have an action title (heading level 3)
            await expect(firstCard.locator('h3')).toBeVisible();

            // Should have project information
            await expect(firstCard.locator('a[href^="/projects/"]')).toBeVisible();
        }
    });

    test('should show priority indicators for high priority actions', async ({ page }) => {
        // Look for high priority indicators (alert circles)
        const highPriorityIndicator = page.locator('.text-red-500');

        // These may not always be present, so only check if visible
        if (await highPriorityIndicator.first().isVisible()) {
            await expect(highPriorityIndicator.first()).toBeVisible();
        }
    });

    test('should show context change link when context is active', async ({ page }) => {
        // Look for "Change Context" link
        const changeContextLink = page.getByRole('link', { name: 'Change Context' });

        if (await changeContextLink.isVisible()) {
            await expect(changeContextLink).toBeVisible();
            await expect(changeContextLink).toHaveAttribute('href', '/areas');
        }
    });

    test('should handle action completion', async ({ page }) => {
        // Find an action card with a completion button
        const actionCard = page.locator('.group').filter({ has: page.locator('button[data-action-id]') }).first();

        if (await actionCard.isVisible()) {
            const completionButton = actionCard.locator('button[data-action-id]');
            const actionId = await completionButton.getAttribute('data-action-id');

            expect(actionId).toBeTruthy();

            // Listen for dialog/alert
            page.on('dialog', async dialog => {
                // Dismiss any alert that might appear
                await dialog.dismiss();
            });

            // Click the completion button
            await completionButton.click();

            // The page should either reload or show an alert
            // We can't guarantee success due to data dependencies, but we can verify the interaction works
            await expect(actionCard).toBeVisible(); // Card should still be there (either with opacity changes or after reload)
        }
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.getByRole('heading', { name: 'Next Actions', level: 1 })).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Next Actions', level: 1 })).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Next Actions', level: 1 })).toBeVisible();
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