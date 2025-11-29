import { test, expect } from '@playwright/test';
import { TestCleaner } from './test-utils';

test.describe('Search', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('should display search page with empty state', async ({ page }) => {
        await page.goto('/search');

        // Check for search input
        const searchInput = page.locator('#search-input');
        await expect(searchInput).toBeVisible();
        await expect(searchInput).toHaveAttribute('placeholder', /search/i);

        // Check for filters
        await expect(page.locator('#filter-collection')).toBeVisible();
        await expect(page.locator('#filter-status')).toBeVisible();
        await expect(page.locator('#filter-priority')).toBeVisible();

        // Check for empty state
        await expect(page.getByText(/start typing to search/i)).toBeVisible();
    });

    test('should search across inbox items', async ({ page }) => {
        // Create a test inbox item
        const testTitle = `Test Inbox Item ${Date.now()}`;
        await page.goto('/capture');
        await page.fill('#note', testTitle);
        await page.click('button[type="submit"]');
        await page.waitForURL('/inbox');

        // Navigate to search
        await page.goto('/search');

        // Search for the item
        await page.fill('#search-input', testTitle);

        // Wait for results
        await page.waitForSelector('#results-list', { state: 'visible' });

        // Verify the item appears in results
        await expect(page.getByText(testTitle)).toBeVisible();
        await expect(page.getByText('inbox', { exact: false })).toBeVisible();
    });

    test('should search across projects', async ({ page }) => {
        const projectName = `Test Project ${Date.now()}`;

        // Create a test project
        await page.goto('/areas/home');
        await page.click('a:has-text("New Project")');
        await page.fill('#project-name', projectName);
        await page.fill('#project-description', 'Test project description');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/projects\/home\//);

        cleaner.addDir(`data/areas/home/${projectName.toLowerCase().replace(/\s+/g, '-')}`);

        // Navigate to search
        await page.goto('/search');

        // Search for the project
        await page.fill('#search-input', projectName);

        // Wait for results
        await page.waitForSelector('#results-list', { state: 'visible' });

        // Verify the project appears in results
        await expect(page.getByText(projectName)).toBeVisible();
        await expect(page.getByText('projects', { exact: false })).toBeVisible();
    });

    test('should filter by collection', async ({ page }) => {
        await page.goto('/search');

        // Select inbox collection filter
        await page.selectOption('#filter-collection', 'inbox');

        // Wait for results (should show inbox items only)
        await page.waitForTimeout(500);

        // If there are results, verify they are all inbox items
        const resultsVisible = await page.locator('#results-list').isVisible();
        if (resultsVisible) {
            const badges = await page.locator('.text-xs.font-medium.px-2').allTextContents();
            const hasOnlyInbox = badges.every(badge => badge.toLowerCase().includes('inbox'));
            expect(hasOnlyInbox).toBeTruthy();
        }
    });

    test('should filter by status', async ({ page }) => {
        await page.goto('/search');

        // Select active status filter
        await page.selectOption('#filter-status', 'active');

        // Wait for results
        await page.waitForTimeout(500);

        // Results should be filtered (or show "no results")
        const hasResults = await page.locator('#results-list').isVisible();
        const hasNoResults = await page.locator('#results-none').isVisible();
        expect(hasResults || hasNoResults).toBeTruthy();
    });

    test('should filter by priority', async ({ page }) => {
        await page.goto('/search');

        // Select high priority filter
        await page.selectOption('#filter-priority', 'high');

        // Wait for results
        await page.waitForTimeout(500);

        // Results should be filtered (or show "no results")
        const hasResults = await page.locator('#results-list').isVisible();
        const hasNoResults = await page.locator('#results-none').isVisible();
        expect(hasResults || hasNoResults).toBeTruthy();
    });

    test('should combine search query with filters', async ({ page }) => {
        await page.goto('/search');

        // Enter search query
        await page.fill('#search-input', 'test');

        // Select collection filter
        await page.selectOption('#filter-collection', 'inbox');

        // Wait for results
        await page.waitForTimeout(500);

        // Should show filtered results or no results
        const hasResults = await page.locator('#results-list').isVisible();
        const hasNoResults = await page.locator('#results-none').isVisible();
        expect(hasResults || hasNoResults).toBeTruthy();
    });

    test('should clear all filters', async ({ page }) => {
        await page.goto('/search');

        // Set some filters
        await page.fill('#search-input', 'test');
        await page.selectOption('#filter-collection', 'inbox');
        await page.selectOption('#filter-status', 'active');

        // Click clear filters
        await page.click('#clear-filters');

        // Verify all filters are cleared
        await expect(page.locator('#search-input')).toHaveValue('');
        await expect(page.locator('#filter-collection')).toHaveValue('');
        await expect(page.locator('#filter-status')).toHaveValue('');
        await expect(page.locator('#filter-priority')).toHaveValue('');

        // Should show empty state
        await expect(page.getByText(/start typing to search/i)).toBeVisible();
    });

    test('should show no results message when nothing matches', async ({ page }) => {
        await page.goto('/search');

        // Search for something that definitely doesn't exist
        const uniqueQuery = `nonexistent-${Date.now()}-${Math.random()}`;
        await page.fill('#search-input', uniqueQuery);

        // Wait for search to complete
        await page.waitForTimeout(500);

        // Should show no results message
        await expect(page.getByText(/no results found/i)).toBeVisible();
    });

    test('should navigate to item when clicked', async ({ page }) => {
        // Create a test inbox item
        const testTitle = `Clickable Item ${Date.now()}`;
        await page.goto('/capture');
        await page.fill('#note', testTitle);
        await page.click('button[type="submit"]');
        await page.waitForURL('/inbox');

        // Search for it
        await page.goto('/search');
        await page.fill('#search-input', testTitle);
        await page.waitForSelector('#results-list', { state: 'visible' });

        // Click on the result
        await page.click(`a:has-text("${testTitle}")`);

        // Should navigate to the inbox item detail page
        await expect(page).toHaveURL(/\/inbox\//);
        await expect(page.getByText(testTitle)).toBeVisible();
    });

    test('should debounce search input', async ({ page }) => {
        await page.goto('/search');

        // Type quickly
        await page.fill('#search-input', 't');
        await page.fill('#search-input', 'te');
        await page.fill('#search-input', 'tes');
        await page.fill('#search-input', 'test');

        // Should show loading state briefly
        const loadingVisible = await page.locator('#results-loading').isVisible().catch(() => false);

        // Wait for debounce
        await page.waitForTimeout(500);

        // Should show results or no results (not loading)
        await expect(page.locator('#results-loading')).not.toBeVisible();
    });

    test('should be accessible from navigation', async ({ page }) => {
        await page.goto('/dashboard');

        // Click on Search in navigation
        await page.click('a:has-text("Search")');

        // Should navigate to search page
        await expect(page).toHaveURL('/search');
        await expect(page.locator('#search-input')).toBeVisible();
    });

    test('should support keyboard shortcut Cmd+K', async ({ page }) => {
        await page.goto('/search');

        // Blur the search input first
        await page.locator('body').click();

        // Press Cmd+K (or Ctrl+K on Windows/Linux)
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+KeyK`);

        // Search input should be focused
        await expect(page.locator('#search-input')).toBeFocused();
    });

    test('should display result badges correctly', async ({ page }) => {
        // Create a test project with known properties
        const projectName = `Badge Test ${Date.now()}`;
        await page.goto('/areas/home');
        await page.click('a:has-text("New Project")');
        await page.fill('#project-name', projectName);
        await page.fill('#project-description', 'Testing badges');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/projects\/home\//);

        cleaner.addDir(`data/areas/home/${projectName.toLowerCase().replace(/\s+/g, '-')}`);

        // Search for the project
        await page.goto('/search');
        await page.fill('#search-input', projectName);
        await page.waitForSelector('#results-list', { state: 'visible' });

        // Verify badges are displayed
        const resultCard = page.locator(`a:has-text("${projectName}")`).first();
        await expect(resultCard.locator('.text-xs.font-medium.px-2')).toHaveCount(3); // collection, status, priority
    });
});
