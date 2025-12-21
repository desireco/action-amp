import type { APIRoute } from 'astro';
import path from "node:path";
import fs from "node:fs/promises";
import { getDataDir, resolveDataPath } from '../../lib/data/path-resolver';
import { fsApi } from '../../lib/data/api';
import { dataReader } from '../../lib/data/reader';

export const GET: APIRoute = async ({ locals }) => {
    const { currentUser } = locals as any;
    const dataDir = getDataDir(currentUser);
    const resolvedPath = resolveDataPath('inbox', currentUser);
    const inboxDir = fsApi.resolvePath(resolvedPath);
    let files: string[] = [];
    try {
        files = await fs.readdir(inboxDir);
    } catch (e) {
        files = [`Error: ${e}`];
    }

    const inboxItems = await dataReader.getInboxItems(currentUser);

    return new Response(JSON.stringify({
        currentUser,
        envTestUser: process.env.TEST_USER,
        dataDir,
        resolvedPath,
        inboxDir,
        files,
        inboxItemsCount: inboxItems.length,
        inboxItems: inboxItems.map(i => ({ id: i.id, title: i.data.title })),
        cwd: process.cwd()
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
