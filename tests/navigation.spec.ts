import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('should display all menu items', async ({ page }) => {
        await page.goto('/inbox');
        await page.waitForLoadState('networkidle');
        // Ensure sidebar is visible (it might be hidden on small screens, but we expect desktop size)
        await expect(page.locator('aside')).toBeVisible();

        const navItems = [
            { name: 'Capture', href: '/capture' },
            { name: 'Inbox', href: '/inbox' },
            { name: 'Projects', href: '/projects' },
            { name: 'Areas', href: '/areas' },
            { name: 'Reviews', href: '/reviews' }
        ];

        for (const item of navItems) {
            await expect(page.locator(`aside a[href="${item.href}"]`)).toBeVisible();
            await expect(page.locator(`aside a[href="${item.href}"]`)).toContainText(item.name);
        }
    });

    test('Capture menu item should navigate to Capture page', async ({ page }) => {
        await page.goto('/inbox');
        await expect(page.locator('aside')).toBeVisible();
        await page.locator('aside a[href="/capture"]').click();
        await expect(page).toHaveURL(/\/capture/);
    });
});
