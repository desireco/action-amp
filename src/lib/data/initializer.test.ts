
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeUser } from './initializer';
import { dataReader } from './reader';
import { TestCleaner } from '../../../tests/test-utils';
import { setGlobalUserIdOverride } from './path-resolver';
import { fsApi } from './api';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('User Initializer', () => {
    const cleaner = new TestCleaner();
    const newUser = 'new_test_user_' + Date.now();

    beforeEach(async () => {
        setGlobalUserIdOverride(newUser);
        cleaner.addUserDir(newUser);
    });

    afterEach(async () => {
        await cleaner.cleanup();
        setGlobalUserIdOverride(null);
    });

    it('should create default areas and projects for a new user', async () => {
        // Run initialization
        await initializeUser(newUser);

        // Verify Areas
        const areas = await dataReader.getAreas(newUser);
        expect(areas).toHaveLength(2);

        const life = areas.find(a => a.data.name === 'Life');
        const work = areas.find(a => a.data.name === 'Work');

        expect(life).toBeDefined();
        expect(work).toBeDefined();

        // Verify Projects
        const projects = await dataReader.getAllProjects(newUser);
        expect(projects.length).toBeGreaterThanOrEqual(2);

        const lifeGeneral = projects.find(p => p.data.name === 'General' && p.id.startsWith('life/'));
        const workGeneral = projects.find(p => p.data.name === 'General' && p.id.startsWith('work/'));

        expect(lifeGeneral).toBeDefined();
        expect(workGeneral).toBeDefined();
    });

    it('should create demo tasks', async () => {
        await initializeUser(newUser);

        // Verify Inbox Item
        const inboxItems = await dataReader.getInboxItems(newUser);
        expect(inboxItems.length).toBeGreaterThan(0);
        expect(inboxItems[0].data.title).toBe('Check out Action Amplifier');

        // Verify Project Actions
        const actions = await dataReader.getAllActions(newUser);
        const welcomeAction = actions.find(a => a.data.title === 'Complete your first review');
        expect(welcomeAction).toBeDefined();
    });

    it('should not overwrite existing data', async () => {
        // Initialize once
        await initializeUser(newUser);

        const filePath = fsApi.resolvePath(`areas/life/area.toml`, newUser);
        const stats1 = await fs.stat(filePath);
        const initialModTime = stats1.mtime.getTime();

        // Wait a small amount to ensure mtime would be different if written
        await new Promise(resolve => setTimeout(resolve, 100));

        // Initialize again
        await initializeUser(newUser);

        const stats2 = await fs.stat(filePath);
        const currentModTime = stats2.mtime.getTime();

        expect(currentModTime).toBe(initialModTime);
    });
});
