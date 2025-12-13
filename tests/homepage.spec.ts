import { test, expect } from '@playwright/test';

test.describe('Homepage Availability', () => {
    test('should be accessible and return successful status', async ({ page }) => {
        // Navigate to homepage
        const response = await page.goto('/');

        // Check that the page loads successfully (HTTP 200)
        expect(response?.status()).toBe(200);

        // Check that the page has the correct title
        await expect(page).toHaveTitle(/Action Amplifier/);

        // Check that main elements are present and visible
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();
        await expect(page.getByText('Focus on what matters most')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open App' })).toBeVisible();

        // Check that there are no critical errors in the console
        const errors: string[] = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        // Reload page to catch any runtime errors
        await page.reload();

        // Assert no JavaScript errors occurred
        expect(errors).toHaveLength(0);
    });

    test('should load quickly', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        const loadTime = Date.now() - startTime;

        // Page should load within 3 seconds
        expect(loadTime).toBeLessThan(3000);
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();
    });
});