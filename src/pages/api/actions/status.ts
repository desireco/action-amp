import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { path, status } = await request.json();

        if (!path || !status) {
            return new Response(JSON.stringify({ error: 'Path and status are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Ensure path is safe - basic check
        if (path.includes('..')) {
            return new Response(JSON.stringify({ error: 'Invalid path' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Assume path is relative to data/ directory if it doesn't start with data/
        const filePath = path.startsWith('data/') ? path : `data/${path}`;

        await dataWriter.updateActionStatus(filePath, status);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating status:', error);
        return new Response(JSON.stringify({ error: 'Failed to update status' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
