import { test, expect } from '@playwright/test';

test.describe('FAQ Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the FAQ page
        await page.goto('/faq');
    });

    test('should load successfully and have correct title', async ({ page }) => {
        // Check that the page loads successfully
        await expect(page).toHaveTitle(/FAQ/);

        // Check main heading
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions', level: 1 })).toBeVisible();
    });

    test('should have back to home link', async ({ page }) => {
        // Check for back link
        const backLink = page.getByRole('link', { name: '← Back to Home' });
        await expect(backLink).toBeVisible();
        await expect(backLink).toHaveAttribute('href', '/');
    });

    test('should display FAQ cards with questions', async ({ page }) => {
        // Check for FAQ cards
        const faqCards = page.locator('.space-y-8 .p-6.bg-surface\\/50');
        await expect(faqCards).toHaveCount(3);

        // Check for specific questions
        await expect(page.getByRole('heading', { name: 'What is Action Amplifier?', level: 2 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Where is my data stored?', level: 2 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Is it free?', level: 2 })).toBeVisible();
    });

    test('should display answers for each question', async ({ page }) => {
        // Check for answers
        const cards = page.locator('.space-y-8 .p-6.bg-surface\\/50');

        // Check first card answer
        const firstCard = cards.first();
        await expect(firstCard.getByText('Action Amplifier is')).toBeVisible();
        await expect(firstCard.getByText(/local-first/)).toBeVisible();

        // Check second card answer with code element
        const secondCard = cards.nth(1);
        await expect(secondCard.getByText('All your data is stored')).toBeVisible();
        await expect(secondCard.locator('code')).toContainText('data/');

        // Check third card answer
        const thirdCard = cards.nth(2);
        await expect(thirdCard.getByText('Yes, it is an open-source project')).toBeVisible();
    });

    test('should have proper styling for code elements', async ({ page }) => {
        // Check for code element in the data storage answer
        const codeElement = page.locator('code.bg-surface-hover');
        await expect(codeElement).toBeVisible();
        await expect(codeElement).toContainText('data/');
        await expect(codeElement).toHaveClass(/px-1/);
        await expect(codeElement).toHaveClass(/py-0.5/);
        await expect(codeElement).toHaveClass(/rounded/);
    });

    test('should have proper page layout and spacing', async ({ page }) => {
        // Check for main container
        const container = page.locator('.max-w-3xl.mx-auto.p-8.min-h-screen');
        await expect(container).toBeVisible();

        // Check for spacing between cards
        await expect(page.locator('.space-y-8')).toBeVisible();

        // Check for heading margin
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions', level: 1 })).toHaveClass(/mb-8/);
    });

    test('should have consistent card styling', async ({ page }) => {
        // Check that cards have consistent styling
        const cards = page.locator('.p-6.bg-surface\\/50');

        for (let i = 0; i < await cards.count(); i++) {
            const card = cards.nth(i);
            await expect(card).toBeVisible();

            // Check for heading in each card
            const heading = card.locator('h2');
            await expect(heading).toBeVisible();
            await expect(heading).toHaveClass(/text-xl/);
            await expect(heading).toHaveClass(/mb-2/);
        }
    });

    test('should navigate back to home', async ({ page }) => {
        // Click the back to home link
        await page.getByRole('link', { name: '← Back to Home' }).click();

        // Verify we're on the home page
        await expect(page).toHaveTitle(/Action Amplifier/);
        await expect(page.getByRole('heading', { name: 'Action Amplifier' })).toBeVisible();
    });

    test('should be responsive on different viewports', async ({ page }) => {
        // Test desktop
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions', level: 1 })).toBeVisible();

        // Test tablet
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions', level: 1 })).toBeVisible();

        // Test mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.getByRole('heading', { name: 'Frequently Asked Questions', level: 1 })).toBeVisible();
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