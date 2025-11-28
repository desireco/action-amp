import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('API should create inbox item', async ({ request }) => {
    const title = `API Test ${Date.now()}`;
    const response = await request.post('/api/inbox', {
        data: { title }
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.title).toBe(title);
    expect(body.id).toBeTruthy();

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
