import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const PUT: APIRoute = async ({ request, params }) => {
    try {
        const { slug } = params;
        if (!slug) {
            return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });
        }

        const { content } = await request.json();
        if (!content) {
            return new Response(JSON.stringify({ error: 'Missing content' }), { status: 400 });
        }

        // Construct file path
        // slug might be "daily/2024-11-28"
        const filePath = path.join(process.cwd(), "data/reviews", slug.endsWith('.md') ? slug : `${slug}.md`);

        // Verify file exists
        try {
            await fs.access(filePath);
        } catch {
            return new Response(JSON.stringify({ error: 'Review not found' }), { status: 404 });
        }

        // Write content
        await fs.writeFile(filePath, content, 'utf-8');

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        console.error('Error updating review:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
