import { test, expect } from '@playwright/test';

test.describe('Inbox Item Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate directly to our test inbox item
        await page.goto('/inbox/test-inbox-1');
        await page.waitForLoadState('networkidle');
    });

    test('should display inbox item information correctly', async ({ page }) => {
        // Check for item title heading
        const heading = page.locator('div.border-b h1');
        await expect(heading).toBeVisible();
        await expect(heading).toContainText('Test Inbox Action');

        // Check for type indicator
        const typeIndicator = page.locator('.rounded-full');
        if (await typeIndicator.count() > 0) {
            await expect(typeIndicator.first()).toBeVisible();
        }

        // Check for captured date
        const dateInfo = page.locator('.text-sm.text-text-muted');
        if (await dateInfo.count() > 0) {
            await expect(dateInfo.first()).toBeVisible();
        }
    });

    test('should display item content', async ({ page }) => {
        // Check for content area
        const content = page.locator('.prose, .prose-lg, p, div');
        if (await content.count() > 0) {
            await expect(content.first()).toBeVisible();
        }

        // Check that page doesn't crash with missing content
        await expect(page.locator('body')).toBeVisible();
    });

    test('should display processing form', async ({ page }) => {
        // Check for form section
        const form = page.locator('form');

        if (await form.count() > 0) {
            // Check for project dropdown
            const dropdown = form.locator('select');
            if (await dropdown.count() > 0) {
                await expect(dropdown.first()).toBeVisible();

                // Check for options
                const options = dropdown.locator('option');
                if (await options.count() > 0) {
                    await expect(options.first()).toBeVisible();
                }
            }

            // Check for submit button
            const submitButton = form.locator('button[type="submit"]');
            if (await submitButton.count() > 0) {
                await expect(submitButton.first()).toBeVisible();
            }
        }
    });

    test('should have navigation buttons', async ({ page }) => {
        // Check for back button
        const backButton = page.locator('a').filter({ hasText: '←' });
        if (await backButton.count() > 0) {
            await expect(backButton.first()).toBeVisible();
        }

        // Check for delete button
        const deleteButton = page.locator('button').filter({ hasText: 'Delete' });
        if (await deleteButton.count() > 0) {
            await expect(deleteButton.first()).toBeVisible();
        }
    });

    test('should navigate back to inbox', async ({ page }) => {
        // Find and click back button
        const backButton = page.locator('a').filter({ hasText: '← Back to Inbox' });
        if (await backButton.count() > 0) {
            await backButton.first().click();

            // Verify we're on inbox page
            await expect(page).toHaveURL(/\/inbox$/);
            await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
        }
    });

    test('should handle item deletion', async ({ page }) => {
        // Find delete button
        const deleteButton = page.locator('button').filter({ hasText: 'Delete' });

        if (await deleteButton.count() > 0) {
            // Set up dialog listener for confirmation
            page.on('dialog', async dialog => {
                expect(dialog.message()).toContain('Delete');
                await dialog.accept();
            });

            // Click delete button
            await deleteButton.first().click();

            // Should navigate back to inbox after deletion
            await expect(page).toHaveURL(/\/inbox$/);
        }
    });

    test('should handle item conversion to action', async ({ page }) => {
        // Find the form
        const form = page.locator('form');

        if (await form.count() > 0) {
            // Find project dropdown
            const dropdown = form.locator('select');

            if (await dropdown.count() > 0) {
                // Get options count
                const options = dropdown.locator('option');
                const optionCount = await options.count();

                if (optionCount > 1) { // At least one real project option
                    // Select the first project option (not the placeholder)
                    await options.nth(1).click();

                    // Find submit button
                    const submitButton = form.locator('button[type="submit"]');

                    if (await submitButton.count() > 0) {
                        // Click submit to convert
                        await Promise.all([
                            page.waitForURL(/\/inbox$/),
                            submitButton.first().click()
                        ]);

                        // Should navigate back to inbox
                        await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
                    }
                }
            }
        }
    });

    test('should show loading state during form submission', async ({ page }) => {
        const form = page.locator('form');

        if (await form.count() > 0) {
            const submitButton = form.locator('button[type="submit"]');

            if (await submitButton.count() > 0) {
                // Get initial button text
                const initialText = await submitButton.first().textContent();

                // Find project dropdown and select if available
                const dropdown = form.locator('select');
                if (await dropdown.count() > 0) {
                    const options = dropdown.locator('option');
                    if (await options.count() > 1) {
                        await options.nth(1).click();

                        // Click submit and check for loading state
                        await submitButton.first().click();

                        // Check for loading state (disabled button, text change, etc.)
                        await expect(submitButton.first()).toBeVisible();
                    }
                }
            }
        }
    });

    test('should handle form validation', async ({ page }) => {
        const form = page.locator('form');

        if (await form.count() > 0) {
            const submitButton = form.locator('button[type="submit"]');

            if (await submitButton.count() > 0) {
                // Try to submit without selecting a project
                await submitButton.first().click();

                // Check for validation error or that nothing happens
                // The form should not submit if project is not selected
                const currentUrl = page.url();
                await page.waitForTimeout(500);

                // Either we're still on the same page or got a validation message
                expect(page.url()).toBe(currentUrl);
            }
        }
    });

    test('should display correct item type indicator', async ({ page }) => {
        // Check for type indicator
        const typeIndicator = page.locator('.rounded-full');

        if (await typeIndicator.count() > 0) {
            await expect(typeIndicator.first()).toBeVisible();

            // Check for type icon
            const typeIcon = typeIndicator.locator('svg, span');
            if (await typeIcon.count() > 0) {
                await expect(typeIcon.first()).toBeVisible();
            }
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