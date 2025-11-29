import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

test.describe('Create New Area', () => {
    const testAreaSlug = 'test-area-' + Date.now();
    const testAreaPath = path.join(process.cwd(), 'data', 'areas', testAreaSlug, 'area.toml');

    test.afterEach(async () => {
        // Clean up test area if it exists
        try {
            const areaDir = path.dirname(testAreaPath);
            await fs.rm(areaDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore errors if directory doesn't exist
        }
    });

    test('should display create area form with all required fields', async ({ page }) => {
        await page.goto('/areas/new');

        // Check page title
        await expect(page.locator('main h1')).toContainText('Create New Area');

        // Check form fields exist
        // Check form fields exist
        await expect(page.locator('input[name="name"]')).toBeVisible();
        await expect(page.locator('.icon-option').first()).toBeVisible();
        await expect(page.locator('.color-option').first()).toBeVisible();
        await expect(page.locator('textarea[name="description"]')).toBeVisible();

        // Check submit button
        await expect(page.locator('button[type="submit"]')).toContainText('Create Area');
    });

    test('should show all icon options', async ({ page }) => {
        await page.goto('/areas/new');

        // Check that we have the expected icons
        const iconOptions = ['home', 'briefcase', 'trending-up', 'target', 'lightbulb',
            'heart', 'book-open', 'dumbbell', 'users', 'palette', 'music', 'code'];

        for (const icon of iconOptions) {
            // Check label visibility
            await expect(page.locator(`label:has(input[name="icon"][value="${icon}"])`)).toBeVisible();
        }
    });

    test('should show all color options', async ({ page }) => {
        await page.goto('/areas/new');

        // Check that we have the expected colors
        const colorOptions = ['blue', 'purple', 'green', 'orange', 'red',
            'pink', 'yellow', 'teal', 'indigo', 'cyan'];

        for (const color of colorOptions) {
            await expect(page.locator(`label:has(input[name="color"][value="${color}"])`)).toBeVisible();
        }
    });

    test('should require name, icon, and color fields', async ({ page }) => {
        await page.goto('/areas/new');

        // Setup dialog listener
        let dialogMessage = '';
        page.on('dialog', dialog => {
            dialogMessage = dialog.message();
            dialog.dismiss();
        });

        // Try to submit without filling required fields
        await page.locator('button[type="submit"]').click();

        // HTML5 validation should prevent submission for Name
        const nameInput = page.locator('input[name="name"]');
        await expect(nameInput).toHaveAttribute('required', '');

        // For Icon and Color, we need to fill Name first to bypass HTML5 validation and trigger JS validation
        await nameInput.fill('Test Area');
        await page.locator('button[type="submit"]').click();

        // Should show alert for Icon
        // We need to wait a bit for the alert to trigger
        await page.waitForTimeout(100);
        expect(dialogMessage).toContain('Please select an icon');

        // Select Icon
        await page.locator('label:has(input[name="icon"])').first().click();
        await page.locator('button[type="submit"]').click();

        // Should show alert for Color
        await page.waitForTimeout(100);
        expect(dialogMessage).toContain('Please select a color');
    });

    test('should show preview when all required fields are filled', async ({ page }) => {
        await page.goto('/areas/new');

        // Initially preview should be hidden
        await expect(page.locator('#preview')).toHaveClass(/hidden/);

        // Fill in the form
        await page.locator('input[name="name"]').fill('Test Area');
        await page.locator('label:has(input[name="icon"][value="home"])').click();
        await page.locator('label:has(input[name="color"][value="blue"])').click();

        // Preview should now be visible
        await expect(page.locator('#preview')).not.toHaveClass(/hidden/);
        await expect(page.locator('#preview-name')).toContainText('Test Area');
    });

    test('should update preview when description is added', async ({ page }) => {
        await page.goto('/areas/new');

        // Fill in required fields
        await page.locator('input[name="name"]').fill('Test Area');
        await page.locator('label:has(input[name="icon"][value="briefcase"])').click();
        await page.locator('label:has(input[name="color"][value="purple"])').click();

        // Add description
        const description = 'This is a test area description';
        await page.locator('textarea[name="description"]').fill(description);

        // Check preview shows description
        await expect(page.locator('#preview-description')).toContainText(description);
    });

    test('should create a new area successfully', async ({ page }) => {
        await page.goto('/areas/new');

        // Fill in the form
        const areaName = 'Test Area ' + Date.now();
        await page.locator('input[name="name"]').fill(areaName);
        await page.locator('label:has(input[name="icon"][value="target"])').click();
        await page.locator('label:has(input[name="color"][value="green"])').click();
        await page.locator('textarea[name="description"]').fill('A test area for automated testing');

        // Submit the form
        await page.locator('button[type="submit"]').click();

        // Should redirect to areas page
        await expect(page).toHaveURL('/areas');

        // The new area should appear in the list
        await expect(page.locator('text=' + areaName)).toBeVisible();
    });

    test('should allow creating area without description', async ({ page }) => {
        await page.goto('/areas/new');

        // Fill in only required fields
        const areaName = 'Minimal Area ' + Date.now();
        await page.locator('input[name="name"]').fill(areaName);
        await page.locator('label:has(input[name="icon"][value="lightbulb"])').click();
        await page.locator('label:has(input[name="color"][value="yellow"])').click();

        // Submit the form
        await page.locator('button[type="submit"]').click();

        // Should redirect to areas page
        await expect(page).toHaveURL('/areas');
        await expect(page.locator('text=' + areaName)).toBeVisible();
    });

    test('should have cancel button that returns to areas page', async ({ page }) => {
        await page.goto('/areas/new');

        // Click cancel
        await page.locator('a:has-text("Cancel")').click();

        // Should navigate to areas page
        await expect(page).toHaveURL('/areas');
    });

    test('should have create area button on areas index page', async ({ page }) => {
        await page.goto('/areas');

        // Check for create button
        const createButton = page.locator('a[href="/areas/new"]');
        await expect(createButton).toBeVisible();
        await expect(createButton).toContainText('Create Area');
    });
});
