import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the Dashboard page
        await page.goto('/dashboard');
    });

    test('should load successfully and have correct title', async ({ page }) => {
        // Check that the page loads successfully
        await expect(page).toHaveTitle(/Dashboard/);

        // Check main heading
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    });

    test('should display statistics cards', async ({ page }) => {
        // Check for statistics cards
        const statsCards = page.locator('.grid .p-6.bg-surface\\/50');
        await expect(statsCards).toHaveCount(4);

        // Check for Inbox card
        const inboxCard = statsCards.filter({ hasText: 'Inbox' });
        await expect(inboxCard.getByRole('heading', { name: 'Inbox', level: 3 })).toBeVisible();
        await expect(inboxCard.locator('.text-4xl').first()).toBeVisible();

        // Check for Areas card
        const areasCard = statsCards.filter({ hasText: 'Areas' });
        await expect(areasCard.getByRole('heading', { name: 'Areas', level: 3 })).toBeVisible();
        await expect(areasCard.locator('.text-4xl').first()).toBeVisible();

        // Check for Projects card
        const projectsCard = statsCards.filter({ hasText: 'Projects' });
        await expect(projectsCard.getByRole('heading', { name: 'Projects', level: 3 })).toBeVisible();
        await expect(projectsCard.locator('.text-4xl').first()).toBeVisible();

        // Check for Actions card
        const actionsCard = statsCards.filter({ hasText: 'Actions' });
        await expect(actionsCard.getByRole('heading', { name: 'Actions', level: 3 })).toBeVisible();
        await expect(actionsCard.locator('.text-4xl').first()).toBeVisible();
    });

    test('should display numeric counts for each category', async ({ page }) => {
        // Get all the numeric displays
        const numericCounts = page.locator('.text-4xl.font-bold.text-primary');
        await expect(numericCounts).toHaveCount(4);

        // Check that each count is a number (or zero)
        const counts = await numericCounts.allTextContents();
        for (const count of counts) {
            expect(/^\d+$/.test(count.trim())).toBeTruthy();
        }
    });

    test('should show debug data section', async ({ page }) => {
        // Check for Debug Data heading
        await expect(page.getByRole('heading', { name: 'Debug Data', level: 2 })).toBeVisible();

        // Check for the debug pre element
        const debugPre = page.locator('pre.bg-black\\/50');
        await expect(debugPre).toBeVisible();

        // Check that it has the correct styling
        await expect(debugPre).toHaveClass(/h-64/);
        await expect(debugPre).toHaveClass(/text-xs/);
        await expect(debugPre).toHaveClass(/font-mono/);
    });

    test('should display JSON data in debug section', async ({ page }) => {
        // Check that the debug section contains JSON-like content
        const debugContent = page.locator('pre');
        await expect(debugContent).toContainText('inboxItems');
        await expect(debugContent).toContainText('areas');
        await expect(debugContent).toContainText('projects');
        await expect(debugContent).toContainText('actions');
    });

    test('should have proper grid layout for statistics', async ({ page }) => {
        // Check for grid container
        const grid = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4');
        await expect(grid).toBeVisible();

        // Check grid spacing
        await expect(grid).toHaveClass(/gap-4/);
        await expect(grid).toHaveClass(/mb-8/);
    });

    test('should have proper card styling', async ({ page }) => {
        // Check that cards have proper styling
        const cards = page.locator('.p-6.bg-surface\\/50');
        await expect(cards.first()).toBeVisible();

        // Check heading styling in cards
        const cardHeadings = page.locator('.text-lg.font-medium.text-text-muted.mb-2');
        await expect(cardHeadings.first()).toBeVisible();
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

        // Check grid columns on desktop
        const gridDesktop = page.locator('.lg\\:grid-cols-4');
        await expect(gridDesktop).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

        // Check grid columns on tablet
        const gridTablet = page.locator('.md\\:grid-cols-2');
        await expect(gridTablet).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

        // Check grid columns on mobile
        const gridMobile = page.locator('.grid-cols-1');
        await expect(gridMobile).toBeVisible();
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

    test('should navigate to main sections from dashboard', async ({ page }) => {
        // While the dashboard doesn't have direct links, we can test that the sections exist
        // This test verifies the data shown corresponds to actual pages

        // Test inbox page exists
        await page.goto('/inbox');
        await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();

        // Test areas page exists
        await page.goto('/areas');
        await expect(page.getByRole('heading', { name: 'Areas', level: 1 })).toBeVisible();

        // Test projects page exists
        await page.goto('/projects');
        await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    });
});