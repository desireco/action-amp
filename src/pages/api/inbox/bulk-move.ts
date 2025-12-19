import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createAPIRoute, parseRequestBody, createSuccessResponse } from '../../../lib/api-handler';
import { ValidationError, DataError } from '../../../lib/errors';

export const POST: APIRoute = createAPIRoute(async ({ request }) => {
    const { itemIds, projectId } = await parseRequestBody(request);

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        throw new ValidationError('itemIds array is required');
    }

    if (!projectId) {
        throw new ValidationError('projectId is required');
    }

    // projectId comes from content collection, e.g., "work/website-redesign/project.toml"
    // We need the directory path: "data/areas/work/website-redesign"
    const projectDir = `data/areas/${projectId.replace('/project.toml', '')}`;

    // Ensure project directory exists
    try {
        await fs.mkdir(path.join(process.cwd(), projectDir), { recursive: true });
    } catch (error) {
        throw new DataError('Failed to create project directory', 'DIR_CREATE_ERROR', { projectDir });
    }

    const movedItems: string[] = [];
    const errors: string[] = [];
    let nextActionNum = 1;

    // Find the next available action number
    try {
        const existingFiles = await fs.readdir(path.join(process.cwd(), projectDir));
        const actionFiles = existingFiles.filter(f => f.startsWith('act-') && f.endsWith('.md'));
        if (actionFiles.length > 0) {
            const numbers = actionFiles.map(f => {
                const match = f.match(/act-(\d+)/);
                return match ? parseInt(match[1]) : 0;
            });
            nextActionNum = Math.max(...numbers) + 1;
        }
    } catch (error) {
        // Directory doesn't exist, start with 1
    }

    // Move each inbox item to the project as an action
    for (const itemId of itemIds) {
        try {
            const inboxPath = path.join(process.cwd(), 'data', 'inbox', `${itemId}.md`);
            const content = await fs.readFile(inboxPath, 'utf-8');
            const parsed = matter(content);

            // Create action content
            const actionData = {
                title: parsed.data.title || 'Untitled Action',
                status: 'draft',
                priority: parsed.data.priority || 'medium',
                captured: parsed.data.captured || new Date().toISOString(),
                type: parsed.data.type || 'note',
                description: parsed.data.description || ''
            };

            const actionContent = matter.stringify(parsed.content || '', actionData, {
                delimiters: '---',
                lineWidth: 120
            });

            // Create action file
            const actionFileName = `act-${String(nextActionNum).padStart(3, '0')}-${itemId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.md`;
            const actionPath = path.join(process.cwd(), projectDir, actionFileName);
            await fs.writeFile(actionPath, actionContent, 'utf-8');

            // Delete the original inbox item
            await fs.unlink(inboxPath);

            movedItems.push(itemId);
            nextActionNum++;
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                throw new DataError(`Inbox item ${itemId} not found`, 'ITEM_NOT_FOUND', { itemId });
            }
            throw new DataError(`Failed to move inbox item ${itemId}`, 'MOVE_ERROR', { itemId, error });
        }
    }

    if (errors.length > 0) {
        // If we have partial failures, we still return success but with errors
        return new Response(JSON.stringify({
            success: true,
            movedCount: movedItems.length,
            movedItems,
            errors,
            message: `${errors.length > 0 ? `${errors.length} items failed to move` : 'All items moved successfully'}`
        }), {
            status: errors.length > 0 ? 207 : 200, // Multi-Status if partial failures
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return createSuccessResponse({
        movedCount: movedItems.length,
        movedItems,
        message: `Successfully moved ${movedItems.length} item${movedItems.length === 1 ? '' : 's'}`
    });
});