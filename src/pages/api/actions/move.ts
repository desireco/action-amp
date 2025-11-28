import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { inboxItemId, projectId } = await request.json();

        if (!inboxItemId || !projectId) {
            return new Response(JSON.stringify({ error: 'Inbox Item ID and Project ID are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // projectId comes from content collection, e.g., "work/website-redesign/project.toml"
        // We need the directory path: "data/areas/work/website-redesign"
        const projectDir = `data/areas/${projectId.replace('/project.toml', '')}`;

        await dataWriter.convertInboxItemToAction(inboxItemId, projectDir);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error moving item:', error);
        return new Response(JSON.stringify({ error: 'Failed to move item' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
