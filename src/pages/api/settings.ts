import type { APIRoute } from 'astro';
import { updateSettings } from '../../lib/data/settings';
import { invalidate } from '../../lib/cache';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        await updateSettings(body);
        invalidate('settings');
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        return new Response(JSON.stringify({ error: 'Failed to update settings' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
