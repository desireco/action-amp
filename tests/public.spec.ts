import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
    test('landing page should have marketing content', async ({ page }) => {
        await page.goto('/');

        // Expect main title
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();

        // Expect some marketing text or CTA
        await expect(page.getByText('Focus on what matters most')).toBeVisible();

        // Expect link to Dashboard/App
        await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible();
    });

    test('faq page should display questions', async ({ page }) => {
        await page.goto('/faq');

        // Expect main heading
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions' })).toBeVisible();

        // Expect a question
        await expect(page.getByText('What is Action Amplifier?')).toBeVisible();
    });
});
