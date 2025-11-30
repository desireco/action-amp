import type { APIRoute } from 'astro';
import { syncAreasProjects } from '../../../lib/data/settings';

export const POST: APIRoute = async () => {
    try {
        await syncAreasProjects();
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: 'Failed to sync settings', details: error?.message || String(error) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
