import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { itemIds, projectId } = await request.json();

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return new Response(JSON.stringify({ error: 'itemIds array is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!projectId) {
            return new Response(JSON.stringify({ error: 'projectId is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // projectId comes from content collection, e.g., "work/website-redesign/project.toml"
        // We need the directory path: "data/areas/work/website-redesign"
        const projectDir = `data/areas/${projectId.replace('/project.toml', '')}`;

        // Ensure project directory exists
        try {
            await fs.mkdir(path.join(process.cwd(), projectDir), { recursive: true });
        } catch (error) {
            console.error('Error creating project directory:', error);
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
                    status: 'todo',
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
                console.error(`Failed to move inbox item ${itemId}:`, error);
                errors.push(itemId);
            }
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                error: 'Some items could not be moved',
                movedCount: movedItems.length,
                errors
            }), {
                status: 207, // Multi-Status
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            movedCount: movedItems.length,
            movedItems
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error bulk moving inbox items:', error);
        return new Response(JSON.stringify({ error: 'Failed to bulk move items' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};