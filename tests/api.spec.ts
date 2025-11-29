import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { TestCleaner } from './test-utils';

test.describe('API Tests', () => {
    const cleaner = new TestCleaner();

    test.afterEach(async () => {
        await cleaner.cleanup();
    });

    test('API should create inbox item', async ({ request }) => {
        const title = `API Test ${Date.now()}`;
        const response = await request.post('/api/inbox', {
            data: { title }
        });

        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.title).toBe(title);
        expect(body.id).toBeTruthy();

        // Register for cleanup
        if (body.id) {
            cleaner.addFile(`data/inbox/${body.id}.md`);
        }

        // Verify file
        const inboxDir = path.join(process.cwd(), 'data/inbox');
        const files = fs.readdirSync(inboxDir);
        const foundFile = files.find(f => {
            if (!f.endsWith('.md')) return false;
            const content = fs.readFileSync(path.join(inboxDir, f), 'utf-8');
            return content.includes(title);
        });
        expect(foundFile).toBeTruthy();
    });
});
