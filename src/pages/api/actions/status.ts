import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';
import { createAPIRoute, parseRequestBody } from '../../../lib/api-handler';
import { ValidationError } from '../../../lib/errors';

export const POST: APIRoute = createAPIRoute(async ({ request }) => {
    const { path, status } = await parseRequestBody(request);

    if (!path || !status) {
        throw new ValidationError('Path and status are required');
    }

    // Ensure path is safe - basic check
    if (path.includes('..')) {
        throw new ValidationError('Invalid path');
    }

    // Assume path is relative to data/ directory if it doesn't start with data/
    const filePath = path.startsWith('data/') ? path : `data/${path}`;

    await dataWriter.updateActionStatus(filePath, status);

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
});
