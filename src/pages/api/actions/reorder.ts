import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { parse as parseToml } from '@iarna/toml';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { actionIds, projectDir } = await request.json();

        if (!actionIds || !Array.isArray(actionIds) || !projectDir) {
            return new Response(JSON.stringify({ error: 'actionIds array and projectDir are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get the full path to the project directory
        const projectPath = path.join(process.cwd(), 'data', 'areas', projectDir);

        // Read all action files
        const actionFiles: string[] = [];
        try {
            const files = await fs.readdir(projectPath);
            for (const file of files) {
                if (file.startsWith('act-') && file.endsWith('.md')) {
                    actionFiles.push(file);
                }
            }
        } catch (error) {
            console.error('Error reading project directory:', error);
            return new Response(JSON.stringify({ error: 'Failed to read project directory' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create a map of action ID to filename
        const actionMap: Record<string, string> = {};
        for (const file of actionFiles) {
            const filePath = path.join(projectPath, file);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const { data } = matter(content);
                // Use the filename without extension as ID if no ID in frontmatter
                const actionId = data.id || file.replace('.md', '');
                actionMap[actionId] = file;
            } catch (error) {
                console.error(`Error reading action file ${file}:`, error);
            }
        }

        // Read all actions into memory
        const actions: Record<string, any> = {};
        for (const [id, filename] of Object.entries(actionMap)) {
            const filePath = path.join(projectPath, filename);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const { data, content: body } = matter(content);
                actions[id] = { data, body, filename };
            } catch (error) {
                console.error(`Error reading action file ${filename}:`, error);
            }
        }

        // Reorder the actions by renaming files with numbered prefixes
        const newOrder = actionIds.filter(id => actions[id]);
        for (let i = 0; i < newOrder.length; i++) {
            const id = newOrder[i];
            const action = actions[id];
            if (action) {
                const newFilename = `act-${String(i + 1).padStart(3, '0')}-${action.filename.replace(/^act-\d+-/, '')}`;

                // If filename changed, rename the file
                if (newFilename !== action.filename) {
                    const oldPath = path.join(projectPath, action.filename);
                    const newPath = path.join(projectPath, newFilename);
                    await fs.rename(oldPath, newPath);

                    // Also read and rewrite with new order if needed
                    const content = await fs.readFile(newPath, 'utf-8');
                    const { data, content: body } = matter(content);

                    // Update order in frontmatter if it exists
                    if (data.order !== undefined) {
                        data.order = i + 1;
                        const newContent = matter.stringify(body, data, {
                            delimiters: '---',
                            lineWidth: 120
                        });
                        await fs.writeFile(newPath, newContent, 'utf-8');
                    }
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error reordering actions:', error);
        return new Response(JSON.stringify({ error: 'Failed to reorder actions' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};