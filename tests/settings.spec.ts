import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the Settings page
        await page.goto('/settings');
    });

    test('should load successfully and have correct title', async ({ page }) => {
        // Check that the page loads successfully
        await expect(page).toHaveTitle(/Settings/);

        // Check main heading
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

        // Check for Settings icon (in the heading)
        await expect(page.locator('h1 svg.h-8.w-8.text-primary')).toBeVisible();
    });

    test('should display work in progress message', async ({ page }) => {
        // Check the work in progress notice
        await expect(page.getByText('Work in progress. This page is not ready yet.')).toBeVisible();
    });

    test('should show information card with guidance', async ({ page }) => {
        // Check that the information card is present
        const card = page.locator('.max-w-2xl .p-6');
        await expect(card).toBeVisible();

        // Check that the card contains text content
        await expect(card.getByText(/Settings/)).toBeVisible();
    });

    test('should list alternative locations for settings', async ({ page }) => {
        // Check for the list of alternative settings locations
        const listItems = page.locator('li');

        // Check for area context update guidance
        await expect(page.getByText(/Update your current context from the Areas section/)).toBeVisible();

        // Check for project/area organization guidance
        await expect(page.getByText(/Review projects and areas to adjust organization/)).toBeVisible();
    });

    test('should have proper page structure', async ({ page }) => {
        // Check that the page has a proper container
        await expect(page.locator('.max-w-2xl.mx-auto')).toBeVisible();

        // Check spacing between sections
        await expect(page.locator('.mb-4.md\\:mb-8')).toBeVisible();
        await expect(page.locator('.space-y-3')).toBeVisible();
    });

    test('should have correct text styling', async ({ page }) => {
        // Check that there is text with muted styling in the main content
        const mainContent = page.locator('.max-w-2xl');
        await expect(mainContent.locator('.text-text-muted').first()).toBeVisible();

        // Check list styling if list items exist
        const list = page.locator('.list-disc.pl-6');
        if (await list.count() > 0) {
            await expect(list.first()).toBeVisible();
        }
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
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

    test('should navigate from areas section suggestion', async ({ page }) => {
        // This test verifies that the areas link exists and is clickable
        // Note: The Settings page mentions Areas section but doesn't provide a direct link
        // This test checks that we can navigate to areas manually

        // Navigate to areas page
        await page.goto('/areas');

        // Verify areas page loads
        await expect(page.getByRole('heading', { name: 'Areas', level: 1 })).toBeVisible();
    });
});