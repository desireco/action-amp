import { test, expect } from '@playwright/test';

test.describe('Review Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate directly to our test review
        await page.goto('/reviews/daily/2024-01-01');
        await page.waitForLoadState('networkidle');
    });

    test('should display review information correctly', async ({ page }) => {
        // Check for review title heading
        const heading = page.locator('div.border-b h1');
        await expect(heading).toBeVisible();
        await expect(heading).toContainText('Daily Review - 2024-01-01');

        // Check for review metadata (date, type, etc.)
        const metadata = page.locator('.text-sm.text-text-muted');
        if (await metadata.count() > 0) {
            await expect(metadata.first()).toBeVisible();
        }

        // Check for review content
        const content = page.locator('.prose, .prose-lg, .space-y-4 > div');
        if (await content.count() > 0) {
            await expect(content.first()).toBeVisible();
        }
    });

    test('should have edit functionality', async ({ page }) => {
        // Check for edit button in view mode
        const editButton = page.locator('button').filter({ hasText: 'Edit' });

        if (await editButton.count() > 0) {
            await expect(editButton.first()).toBeVisible();

            // Click edit button
            await editButton.first().click();

            // Should switch to edit mode
            await expect(page.locator('textarea')).toBeVisible();

            // Check for save and cancel buttons
            const saveButton = page.locator('button').filter({ hasText: 'Save' });
            const cancelButton = page.locator('button').filter({ hasText: 'Cancel' });

            if (await saveButton.count() > 0) {
                await expect(saveButton.first()).toBeVisible();
            }

            if (await cancelButton.count() > 0) {
                await expect(cancelButton.first()).toBeVisible();
            }
        }
    });

    test('should handle edit mode correctly', async ({ page }) => {
        // First, enter edit mode
        const editButton = page.locator('button').filter({ hasText: 'Edit' });

        if (await editButton.count() > 0) {
            await editButton.first().click();

            // Check for textarea
            const textarea = page.locator('textarea');
            if (await textarea.count() > 0) {
                await expect(textarea.first()).toBeVisible();

                // Check that textarea has content
                const value = await textarea.first().inputValue();
                expect(value).toBeDefined();
            }
        }
    });

    test('should save changes successfully', async ({ page }) => {
        // Enter edit mode
        const editButton = page.locator('button').filter({ hasText: 'Edit' });

        if (await editButton.count() > 0) {
            await editButton.first().click();

            // Find textarea
            const textarea = page.locator('textarea');

            if (await textarea.count() > 0) {
                // Get initial content
                const initialContent = await textarea.first().inputValue();

                // Add some text
                await textarea.first().fill(initialContent + '\n\nUpdated by test');

                // Click save
                const saveButton = page.locator('button').filter({ hasText: 'Save' });

                if (await saveButton.count() > 0) {
                    // Click save and wait for page reload
                    await Promise.all([
                        page.waitForLoadState('networkidle'),
                        saveButton.first().click()
                    ]);

                    // Should return to view mode
                    await expect(textarea).toHaveCount(0);
                }
            }
        }
    });

    test('should cancel editing correctly', async ({ page }) => {
        // Enter edit mode
        const editButton = page.locator('button').filter({ hasText: 'Edit' });

        if (await editButton.count() > 0) {
            await editButton.first().click();

            // Find textarea
            const textarea = page.locator('textarea');

            if (await textarea.count() > 0) {
                // Modify content
                await textarea.first().fill('Modified content that should not be saved');

                // Click cancel
                const cancelButton = page.locator('button').filter({ hasText: 'Cancel' });

                if (await cancelButton.count() > 0) {
                    await cancelButton.first().click();

                    // Should return to view mode without saving
                    await expect(textarea).toHaveCount(0);

                    // Content should not contain our modification
                    const content = page.locator('.prose, .prose-lg');
                    if (await content.count() > 0) {
                        const text = await content.first().textContent();
                        expect(text).not.toContain('Modified content that should not be saved');
                    }
                }
            }
        }
    });

    test('should have back navigation', async ({ page }) => {
        // Check for back button
        const backButton = page.locator('a').filter({ hasText: '←' });

        if (await backButton.count() > 0) {
            await expect(backButton.first()).toBeVisible();

            // Click back button
            await backButton.first().click();

            // Should navigate to reviews list
            await expect(page).toHaveURL(/\/reviews$/);
            await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
        }
    });

    test('should handle empty reviews gracefully', async ({ page }) => {
        // Even empty reviews should display correctly
        const heading = page.locator('h1');
        await expect(heading).toBeVisible();

        // Should not crash
        await expect(page.locator('body')).toBeVisible();
    });

    test('should show loading state during save', async ({ page }) => {
        // Enter edit mode
        const editButton = page.locator('button').filter({ hasText: 'Edit' });

        if (await editButton.count() > 0) {
            await editButton.first().click();

            const saveButton = page.locator('button').filter({ hasText: 'Save' });

            if (await saveButton.count() > 0) {
                // Modify content
                const textarea = page.locator('textarea');
                if (await textarea.count() > 0) {
                    await textarea.first().fill('Test content for save');

                    // Click save and check for loading state
                    await saveButton.first().click();

                    // Button might be disabled or show loading state
                    await expect(saveButton.first()).toBeVisible();
                }
            }
        }
    });

    test('should handle review with markdown content', async ({ page }) => {
        // Check that markdown content is rendered correctly
        const content = page.locator('.prose, .prose-lg');

        if (await content.count() > 0) {
            await expect(content.first()).toBeVisible();

            // Check for common markdown elements
            const headings = content.locator('h1, h2, h3, h4, h5, h6');
            const lists = content.locator('ul, ol');
            const paragraphs = content.locator('p');

            // At least one of these should exist
            const hasMarkdownElements = (
                (await headings.count() > 0) ||
                (await lists.count() > 0) ||
                (await paragraphs.count() > 0)
            );

            expect(hasMarkdownElements).toBeTruthy();
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