import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createAPIRoute, parseRequestBody, createSuccessResponse } from '../../../lib/api-handler';
import { ValidationError, DataError } from '../../../lib/errors';

import { fsApi } from '../../../lib/data/api';
import { resolveDataPath } from '../../../lib/data/path-resolver';

export const POST: APIRoute = createAPIRoute(async ({ request, locals }) => {
    const { currentUser } = locals as any;
    const { itemIds, projectId } = await parseRequestBody(request);

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        throw new ValidationError('itemIds array is required');
    }

    if (!projectId) {
        throw new ValidationError('projectId is required');
    }

    // projectId comes from content collection, e.g., "work/website-redesign/project.toml"
    // resolveDataPath handles the nesting if currentUser is present
    const projectDirPrefix = `areas/${projectId.replace('/project.toml', '')}`;

    const movedItems: string[] = [];
    const errors: string[] = [];
    let nextActionNum = 1;

    // Find the next available action number
    try {
        const existingFiles = await fsApi.listDir(projectDirPrefix, currentUser);
        const actionFiles = existingFiles.filter(f => f.startsWith('act-') && f.endsWith('.md'));
        if (actionFiles.length > 0) {
            const numbers = actionFiles.map(f => {
                const match = f.match(/act-(\d+)/);
                return match ? parseInt(match[1]) : 0;
            });
            nextActionNum = Math.max(...numbers) + 1;
        }
    } catch (error) {
        // Directory doesn't exist yet, start with 1
    }

    // Move each inbox item to the project as an action
    for (const itemId of itemIds) {
        try {
            const inboxFilePath = `inbox/${itemId}.md`;
            const content = await fsApi.readFile(inboxFilePath, currentUser);
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
                delimiters: '---'
            });

            // Create action file
            const actionFileName = `act-${String(nextActionNum).padStart(3, '0')}-${itemId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.md`;
            const actionPath = path.join(projectDirPrefix, actionFileName);

            await fsApi.writeFile(actionPath, actionContent, currentUser);

            // Delete the original inbox item
            await fsApi.deleteFile(inboxFilePath, currentUser);

            movedItems.push(itemId);
            nextActionNum++;
        } catch (error) {
            console.error(`Failed to move inbox item ${itemId}:`, error);
            errors.push(itemId);
        }
    }

    if (errors.length > 0) {
        // If we have partial failures, we still return success but with errors
        return new Response(JSON.stringify({
            success: true,
            movedCount: movedItems.length,
            movedItems,
            errors,
            message: `${errors.length} items failed to move`
        }), {
            status: 207, // Multi-Status
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return createSuccessResponse({
        movedCount: movedItems.length,
        movedItems,
        message: `Successfully moved ${movedItems.length} item${movedItems.length === 1 ? '' : 's'}`
    });
});