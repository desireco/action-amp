import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

export const PUT: APIRoute = async ({ params, request }) => {
    const { id } = params;
    if (!id) {
        return new Response(JSON.stringify({ error: 'ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const data = await request.json();
        await dataWriter.updateInboxItem(id, data);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error(`Error updating inbox item ${id}:`, error);
        return new Response(JSON.stringify({ error: 'Failed to update item' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const DELETE: APIRoute = async ({ params }) => {
    const { id } = params;
    if (!id) {
        return new Response(JSON.stringify({ error: 'ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        await dataWriter.deleteInboxItem(id);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error(`Error deleting inbox item ${id}:`, error);
        return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
