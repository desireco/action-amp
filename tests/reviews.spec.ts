import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const REVIEWS_DIR = path.join(process.cwd(), 'data/reviews');

test.describe('Reviews', () => {
    // We need to be careful about cleaning up data in a real env, but for local dev/test it's okay if we are careful.
    // Ideally we should mock the FS or use a separate test data dir, but the app is hardcoded to `data/`.
    // For now, we will just create a review and not delete everything, to avoid wiping user data if they run this locally.
    // Actually, the user instructions say "Code relating to the user's requests should be written in the locations listed above."
    // And we are in a "workspace".

    // Let's try to just create a review and verify it.

    test('should allow creating a daily review', async ({ page }) => {
        await page.goto('/reviews');

        // Check if we are on reviews page
        await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();

        // Click "Daily Review" button
        // The button contains an h3 with "Daily Review"
        await page.locator('button:has-text("Daily Review")').click();

        // Should redirect to the review page
        // URL should contain /reviews/daily/YYYY-MM-DD
        await expect(page).toHaveURL(/\/reviews\/daily\/\d{4}-\d{2}-\d{2}/);

        // Check content
        await expect(page.getByRole('heading', { name: 'Daily Review -' })).toBeVisible();
        await expect(page.locator('.prose').getByText('Completed Items')).toBeVisible();
    });

    test('should list past reviews', async ({ page }) => {
        // Create a review first (if not already created by previous test - but tests might run in parallel or order is not guaranteed)
        // So we create one.
        await page.goto('/reviews');

        // If we already created one today, the button might redirect to existing or error?
        // Our logic throws "already exists" but the API catches it and redirects? 
        // Wait, my API logic:
        // if (e.message.includes('already exists')) { // redirect }
        // So clicking it again is safe.

        await page.locator('button:has-text("Daily Review")').click();

        // Go back to reviews
        await page.getByRole('link', { name: '← Back to Reviews' }).click();

        // Should see the review in the list
        const reviewLink = page.locator('ul').getByText('Daily Review').first();
        await expect(reviewLink).toBeVisible();

        // Click the review to go to detail page
        await reviewLink.click();

        // Should be on detail page
        await expect(page.getByRole('heading', { name: 'Daily Review -' })).toBeVisible();
        await expect(page.locator('.prose').getByText('Completed Items')).toBeVisible();
    });
});
