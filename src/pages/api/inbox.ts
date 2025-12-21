import type { APIRoute } from 'astro';
import { dataWriter } from '../../lib/data/writer';
import { dataReader } from '../../lib/data/reader';

export const GET: APIRoute = async () => {
    try {
        const items = await dataReader.getInboxItems();
        return new Response(JSON.stringify(items), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching inbox items:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch items' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();

        if (!data.title) {
            return new Response(JSON.stringify({ error: 'Title is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const item = await dataWriter.createInboxItem(data.title, data.content, data.type);

        return new Response(JSON.stringify(item), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating inbox item:', error);
        return new Response(JSON.stringify({ error: 'Failed to create item' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
