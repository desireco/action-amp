import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

import { fsApi } from '../../../lib/data/api';
import { resolveDataPath } from '../../../lib/data/path-resolver';

export const PUT: APIRoute = async ({ request, params, locals }) => {
    try {
        const { currentUser } = locals as any;
        const { slug } = params;
        if (!slug) {
            return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });
        }

        const { content } = await request.json();
        if (!content) {
            return new Response(JSON.stringify({ error: 'Missing content' }), { status: 400 });
        }

        // Construct file path relative to data root
        const filePathPrefix = path.join("reviews", slug.endsWith('.md') ? slug : `${slug}.md`);

        // Verify file exists
        if (!(await fsApi.exists(filePathPrefix, currentUser))) {
            return new Response(JSON.stringify({ error: 'Review not found' }), { status: 404 });
        }

        // Write content
        await fsApi.writeFile(filePathPrefix, content, currentUser);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        console.error('Error updating review:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
