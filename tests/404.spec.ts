import { test, expect } from '@playwright/test';

test.describe('404 Error Page', () => {
    test('should display 404 page when navigating to non-existent route', async ({ page }) => {
        // Navigate to a non-existent route
        const response = await page.goto('/this-page-does-not-exist');

        // Astro returns 404 for non-existent routes
        expect(response?.status()).toBe(404);

        // But still check for 404 page content
        await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible();
    });

    test('should have correct page title', async ({ page }) => {
        await page.goto('/non-existent-page');

        // Check page title
        await expect(page).toHaveTitle(/Page Not Found/);
    });

    test('should display error icon', async ({ page }) => {
        await page.goto('/another-missing-page');

        // Check for alert circle icon
        const iconContainer = page.locator('.bg-surface-hover.p-4.rounded-full');
        await expect(iconContainer).toBeVisible();

        // Check for the icon itself (AlertCircle)
        const icon = page.locator('.w-12.h-12.text-destructive');
        await expect(icon).toBeVisible();
    });

    test('should show descriptive error message', async ({ page }) => {
        await page.goto('/missing');

        // Check for error message
        await expect(page.getByText("The page you are looking for doesn't exist or has been moved.")).toBeVisible();
    });

    test('should have navigation buttons', async ({ page }) => {
        await page.goto('/404-test');

        // Check for Go Home button
        const goHomeButton = page.getByRole('link', { name: 'Go Home' });
        await expect(goHomeButton).toBeVisible();
        await expect(goHomeButton).toHaveAttribute('href', '/');

        // Check for Go Back button (it's an anchor with href, not a button)
        const goBackButton = page.locator('a[href="javascript:history.back()"]');
        await expect(goBackButton).toBeVisible();
        await expect(goBackButton).toContainText('Go Back');
    });

    test('should navigate home when Go Home is clicked', async ({ page }) => {
        await page.goto('/not-found');

        // Click Go Home button
        await page.getByRole('link', { name: 'Go Home' }).click();

        // Verify we're on the home page
        await expect(page).toHaveTitle(/Action Amplifier/);
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();
    });

    test('should go back in history when Go Back is clicked', async ({ page }) => {
        // First visit a valid page to create history
        await page.goto('/inbox');
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

        // Navigate to a non-existent page
        await page.goto('/page-does-not-exist');

        // Click Go Back button (it's actually a link with JavaScript)
        await page.locator('a[href="javascript:history.back()"]').click();

        // Should return to the previous page (inbox)
        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    });

    test('should have proper page layout and styling', async ({ page }) => {
        await page.goto('/error-test');

        // Check for centered container
        const container = page.locator('.max-w-md.mx-auto.mt-20.text-center');
        await expect(container).toBeVisible();

        // Check for card
        const card = page.locator('.p-8.flex.flex-col.items-center');
        await expect(card).toBeVisible();

        // Check spacing
        await expect(page.locator('.mb-6')).toBeVisible();
        await expect(page.locator('.mb-2').first()).toBeVisible();
        await expect(page.locator('.mb-8')).toBeVisible();
        await expect(page.locator('.flex.gap-4')).toBeVisible();
    });

    test('should handle different types of invalid routes', async ({ page }) => {
        const invalidRoutes = [
            '/invalid/route/path',
            '/missing-file.html',
            '/api/invalid-endpoint',
            '/user/profile/12345'
        ];

        for (const route of invalidRoutes) {
            await page.goto(route);

            // Should show 404 page for all invalid routes
            await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible();
        }
    });

    test('should be responsive on different viewports', async ({ page }) => {
        await page.goto('/responsive-test');

        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible();
    });

    test('should have no console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.goto('/console-error-test');
        await page.reload();

        // Assert no JavaScript errors occurred
        expect(errors).toHaveLength(0);
    });
});