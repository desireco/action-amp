import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

export const POST: APIRoute = async ({ request }) => {
    try {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const icon = formData.get('icon') as string;
        const color = formData.get('color') as string;
        const description = formData.get('description') as string | null;

        if (!name || !icon || !color) {
            return new Response(JSON.stringify({ error: 'Name, icon, and color are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const result = await dataWriter.createArea(
            name,
            icon,
            color,
            description || undefined
        );

        return new Response(JSON.stringify(result), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating area:', error);
        return new Response(JSON.stringify({ error: 'Failed to create area' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
