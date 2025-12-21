import type { APIRoute } from 'astro';
import { dataWriter } from '../../lib/data/writer';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { currentUser } = locals as any;
        const data = await request.json();

        if (!data.name || !data.area) {
            return new Response(JSON.stringify({ error: 'Name and Area are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const result = await dataWriter.createProject(data.name, data.area, data.description, currentUser);

        return new Response(JSON.stringify(result), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating project:', error);
        return new Response(JSON.stringify({ error: 'Failed to create project' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const PUT: APIRoute = async ({ request, locals }) => {
    try {
        const { currentUser } = locals as any;
        const data = await request.json();

        if (!data.projectId) {
            return new Response(JSON.stringify({ error: 'Project ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        await dataWriter.updateProject(data.projectId, {
            name: data.name,
            description: data.description,
            status: data.status,
            priority: data.priority,
        }, currentUser);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating project:', error);
        return new Response(JSON.stringify({ error: 'Failed to update project' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
