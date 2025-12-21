import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';

import { resolveDataPath } from '../../../lib/data/path-resolver';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { currentUser } = locals as any;
        const { inboxItemId, projectId } = await request.json();

        if (!inboxItemId || !projectId) {
            return new Response(JSON.stringify({ error: 'Inbox Item ID and Project ID are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // projectId comes from content collection, e.g., "work/website-redesign/project.toml"
        // resolveDataPath handles the nesting if currentUser is present
        const projectDir = resolveDataPath(`areas/${projectId.replace('/project.toml', '')}`, currentUser);

        await dataWriter.assignInboxItemToProject(inboxItemId, projectDir, currentUser);

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
