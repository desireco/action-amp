
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataReader } from './reader';
import { dataWriter } from './writer';
import { createUser, DEMO_USER } from '../user';
import { setGlobalUserIdOverride } from './path-resolver';
import { TestCleaner } from '../../../tests/test-utils';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('User-Specific Data Access', () => {
    const cleaner = new TestCleaner();
    const testUser = createUser('Test User');

    beforeEach(async () => {
        // Ensure isolation
        setGlobalUserIdOverride(testUser.slug);
        cleaner.addUserDir(testUser.slug);
    });

    afterEach(async () => {
        await cleaner.cleanup();
        setGlobalUserIdOverride(null);
    });

    it('should store and retrieve inbox items in user-specific folder', async () => {
        const title = 'User Inbox Item';
        const content = 'Content for user inbox';

        // Create item
        const item = await dataWriter.createInboxItem(title, content, 'note', testUser.slug);

        // Check if file exists in the correct directory
        const expectedPath = path.resolve(process.cwd(), 'data', 'users', testUser.slug, 'inbox', `${item.id}.md`);
        await expect(fs.access(expectedPath)).resolves.toBeUndefined();

        // Retrieve items using reader
        const items = await dataReader.getInboxItems(testUser.slug);
        expect(items.some(i => i.id === item.id)).toBe(true);
        expect(items.find(i => i.id === item.id).data.title).toBe(title);
    });

    it('should maintain isolation between users', async () => {
        const userA = createUser('User A');
        const userB = createUser('User B');
        cleaner.addUserDir(userA.slug);
        cleaner.addUserDir(userB.slug);

        await dataWriter.createInboxItem('Item for A', 'A content', 'note', userA.slug);
        await dataWriter.createInboxItem('Item for B', 'B content', 'note', userB.slug);

        const itemsA = await dataReader.getInboxItems(userA.slug);
        console.log(`[test] User A (${userA.slug}) items:`, itemsA.map(i => i.data.title));

        const itemsB = await dataReader.getInboxItems(userB.slug);
        console.log(`[test] User B (${userB.slug}) items:`, itemsB.map(i => i.data.title));

        expect(itemsA).toHaveLength(1);
        expect(itemsA[0].data.title).toBe('Item for A');

        expect(itemsB).toHaveLength(1);
        expect(itemsB[0].data.title).toBe('Item for B');
    });
});
