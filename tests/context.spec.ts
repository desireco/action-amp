import { test, expect } from '@playwright/test';

test.describe('Context Switching and Project Navigation', () => {
    test('should allow setting context and navigating to projects', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });

        // 1. Navigate to Areas page
        await page.goto('/areas');

        // 2. Check which context is active (if any)
        // We look for the "Focus" badge.
        // The badge is inside a card.

        // Let's just look for the buttons.
        // If "Set Context" is visible for Work, then Work is NOT focused.
        // If "Set Context" is NOT visible (or button is hidden/different), then it IS focused.

        // We want to click a "Set Context" button. Any one will do.
        // Let's pick the first visible one.

        const setContextBtn = page.locator('button[data-set-context]').first();
        await expect(setContextBtn).toBeVisible();

        // Get the context slug from the button
        const contextSlug = await setContextBtn.getAttribute('data-set-context');
        console.log(`Switching to context: ${contextSlug}`);

        // Click it
        await setContextBtn.click();

        // Verify loading state on THAT button
        // The button text changes to Refocusing...
        // We can check for the text change on the same locator? 
        // No, the locator is based on attribute `data-set-context`. 
        // Does the attribute remain? Yes, I didn't remove it in the code.

        // Wait for reload
        await page.waitForLoadState('networkidle');

        // 3. Verify Context is set
        // The button should now be gone or hidden?
        // In my code: {!isContext && <button ...>}
        // So the button should NOT be in the DOM anymore for this context.

        const oldBtn = page.locator(`button[data-set-context="${contextSlug}"]`);
        await expect(oldBtn).not.toBeVisible();

        // Verify "Focus" badge appears in the card that corresponds to this context
        // We can find the card by text? Or maybe we can't easily link slug to card text without more knowledge.
        // But we can check that *some* card has "Focus".
        await expect(page.locator('span', { hasText: 'Focus' })).toBeVisible();

        // 4. Verify Sidebar shows context
        const sidebar = page.locator('aside');
        await expect(sidebar.locator('text=Current Context')).toBeVisible();

        // The sidebar text should match the Area Name.
        // We don't know the Area Name for sure from the slug (work -> Work, personal -> Personal).
        // But we can check if the sidebar contains the slug (case insensitive) as a heuristic.
        if (contextSlug) {
            const slugRegex = new RegExp(contextSlug, 'i');
            await expect(sidebar.locator('text=Current Context').locator('..')).toContainText(slugRegex);
        }

        // 5. Verify Projects in Sidebar
        // We need to find a project link in the sidebar.
        // We can just pick the first project link under "Projects".
        // The "Projects" item has subitems.

        // Find the Projects nav item
        const projectsNav = sidebar.locator('nav').locator('div', { hasText: 'Projects' });
        // It should have sub-links.
        const projectLink = projectsNav.locator('xpath=..').locator('a[href^="/projects/"]').first();

        // If there are no projects in this context, we can't test navigation.
        // But our sample data usually has projects.
        if (await projectLink.isVisible()) {
            const freshProjectLink = sidebar.locator('a[href^="/projects/"]').first();
            const rawProjectName = await freshProjectLink.textContent();
            const projectName = rawProjectName?.trim() || '';
            console.log(`Navigating to project: ${projectName}`);

            await freshProjectLink.click({ force: true });
            await page.waitForLoadState('networkidle');

            // 6. Verify URL and Title
            await expect(page).toHaveURL(/\/projects\/.*/);
            if (projectName) {
                await expect(page.locator('main h1')).toBeVisible();
            }

            // 7. Verify Highlight
            const currentPath = new URL(page.url()).pathname;
            const activeProjectLink = page.locator(`aside nav a[href="${currentPath}"]`);
            await expect(activeProjectLink).toHaveClass(/text-primary/);
        } else {
            console.log('No projects found in this context, skipping project navigation test');
        }
    });

    test('clicking Current Context navigates to Areas page', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });

        // Ensure a context is set so the sidebar shows Current Context
        await page.goto('/areas');
        const setContextBtn = page.locator('button[data-set-context]').first();
        if (await setContextBtn.isVisible()) {
            await setContextBtn.click();
            await page.waitForLoadState('networkidle');
        }

        // The Current Context block should now be present and clickable
        const currentContextBlock = page.getByText('Current Context').first();
        await expect(currentContextBlock).toBeVisible();

        // Click within the block (wrapped in a link) and verify navigation
        await currentContextBlock.click();
        await expect(page).toHaveURL(/\/areas$/);
        await expect(page.getByRole('heading', { name: 'Areas of Focus' })).toBeVisible();
    });

    test('Set Context button should update settings and show Focus', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/areas');

        // Pick the first available Set Context button
        const btn = page.locator('button[data-set-context]').first();
        await expect(btn).toBeVisible();
        const targetSlug = await btn.getAttribute('data-set-context');

        // Observe the API call to /api/settings
        const responsePromise = page.waitForResponse(r => r.url().includes('/api/settings') && r.request().method() === 'POST');

        // Click button
        await btn.click();

        // Ensure API succeeded
        const res = await responsePromise;
        expect(res.ok()).toBeTruthy();

        // Wait for reload to apply context
        await page.waitForLoadState('networkidle');

        // The button for the same slug should no longer be visible (context is set)
        if (targetSlug) {
            await expect(page.locator(`button[data-set-context="${targetSlug}"]`)).toHaveCount(0);
        }

        // Verify Focus badge appears somewhere
        await expect(page.locator('span', { hasText: 'Focus' })).toBeVisible();

        // Verify sidebar shows Current Context
        const sidebar = page.locator('aside');
        await expect(sidebar.locator('text=Current Context')).toBeVisible();
    });
});
