import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';
import { createAPIRoute, parseRequestBody } from '../../../lib/api-handler';
import { ValidationError } from '../../../lib/errors';
import { fsApi } from '../../../lib/data/api';
import matter from 'gray-matter';
import { invalidateByPrefix } from '../../../lib/cache';

export const POST: APIRoute = createAPIRoute(async ({ request }) => {
    const { path, title, content } = await parseRequestBody(request);

    if (!path || !title) {
        throw new ValidationError('Path and title are required');
    }

    // Ensure path is safe - basic check
    if (path.includes('..')) {
        throw new ValidationError('Invalid path');
    }

    // Assume path is relative to data/ directory if it doesn't start with data/
    const filePath = path.startsWith('data/') ? path : `data/${path}`;

    // Ensure it ends with .md
    const finalPath = filePath.endsWith('.md') ? filePath : `${filePath}.md`;

    try {
        // Read existing file
        const fileContent = await fsApi.readFile(finalPath);
        const parsed = matter(fileContent);

        // Update title in frontmatter
        parsed.data.title = title;

        // Update content (preserve frontmatter)
        const updatedContent = matter.stringify(content || '', parsed.data);

        // Write back to file
        await fsApi.writeFile(finalPath, updatedContent);

        // Invalidate cache
        invalidateByPrefix('collection:actions');

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error editing action:', error);
        throw new ValidationError('Failed to edit action');
    }
});