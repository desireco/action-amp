import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { parse as parseToml } from '@iarna/toml';
import { createAPIRoute, parseRequestBody, createSuccessResponse } from '../../../lib/api-handler';
import { ValidationError, DataError } from '../../../lib/errors';

export const POST: APIRoute = createAPIRoute(async ({ request }) => {
    const { actionIds, projectDir } = await parseRequestBody(request);

    if (!actionIds || !Array.isArray(actionIds) || !projectDir) {
        throw new ValidationError('actionIds array and projectDir are required');
    }

    // Get the full path to the project directory
    const projectPath = path.join(process.cwd(), 'data', 'areas', projectDir);

    // Read all action files
    const actionFiles: string[] = [];
    const files = await fs.readdir(projectPath);
    for (const file of files) {
        if (file.startsWith('act-') && file.endsWith('.md')) {
            actionFiles.push(file);
        }
    }

    // Create a map of action ID to filename
    const actionMap: Record<string, string> = {};
    for (const file of actionFiles) {
        const filePath = path.join(projectPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(content);
        // Use the filename without extension as ID if no ID in frontmatter
        const actionId = data.id || file.replace('.md', '');
        actionMap[actionId] = file;
    }

    // Read all actions into memory
    const actions: Record<string, any> = {};
    for (const [id, filename] of Object.entries(actionMap)) {
        const filePath = path.join(projectPath, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: body } = matter(content);
        actions[id] = { data, body };
    }

    // Reorder the actions by renaming files with numbered prefixes
    const newOrder = actionIds.filter(id => actions[id]);
    for (let i = 0; i < newOrder.length; i++) {
        const id = newOrder[i];
        const action = actions[id];
        if (action) {
            // Create new filename with numeric prefix
            const paddedNumber = String(i + 1).padStart(3, '0');
            const newFilename = `act-${paddedNumber}-${id}.md`;
            const newPath = path.join(projectPath, newFilename);

            // Write action with updated content
            const updatedContent = matter.stringify(action.body, action.data, {
                delimiters: '---',
                lineWidth: 120
            });

            await fs.writeFile(newPath, updatedContent, 'utf-8');

            // Delete old file if it has a different name
            const oldPath = path.join(projectPath, actionMap[id]);
            if (oldPath !== newPath) {
                await fs.unlink(oldPath);
            }
        }
    }

    return createSuccessResponse({ message: 'Actions reordered successfully' });
});