import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

export const PUT: APIRoute = async ({ request, params, locals }) => {
    try {
        const { currentUser } = locals as any;
        const { id } = params;

        if (!id) {
            return new Response(JSON.stringify({ error: 'Area ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const formData = await request.formData();
        const name = formData.get('name') as string | null;
        const icon = formData.get('icon') as string | null;
        const color = formData.get('color') as string | null;
        const description = formData.get('description') as string | null;
        const priority = formData.get('priority') as string | null;

        const updates: any = {};
        if (name) updates.name = name;
        if (icon) updates.icon = icon;
        if (color) updates.color = color;
        if (description !== null) updates.description = description;
        if (priority) updates.priority = priority;

        await dataWriter.updateArea(id, updates, currentUser);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating area:', error);
        return new Response(JSON.stringify({
            error: 'Failed to update area',
            details: error instanceof Error ? error.message : String(error)
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
