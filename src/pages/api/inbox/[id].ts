import type { APIRoute } from 'astro';
import { dataWriter } from '../../../lib/data/writer';
import { createAPIRoute, parseRequestBody, createSuccessResponse, createErrorResponse } from '../../../lib/api-handler';
import { NotFoundError, ValidationError } from '../../../lib/errors';

export const PUT: APIRoute = createAPIRoute(async ({ params, request, locals }) => {
    const { currentUser } = locals as any;
    const { id } = params;
    if (!id) {
        throw new ValidationError('ID is required');
    }

    const data = await parseRequestBody(request);

    try {
        await dataWriter.updateInboxItem(id, data, currentUser);
        return createSuccessResponse({ message: 'Item updated successfully' });
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            throw new NotFoundError('Inbox item', id);
        }
        throw error;
    }
});

export const DELETE: APIRoute = createAPIRoute(async ({ params, locals }) => {
    const { currentUser } = locals as any;
    const { id } = params;
    if (!id) {
        throw new ValidationError('ID is required');
    }

    try {
        await dataWriter.deleteInboxItem(id, currentUser);
        return createSuccessResponse({ message: 'Item deleted successfully' });
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            throw new NotFoundError('Inbox item', id);
        }
        throw error;
    }
});
