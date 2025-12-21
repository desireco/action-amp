import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

import { dataWriter } from '../../../lib/data/writer';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { currentUser } = locals as any;
        const { itemIds } = await request.json();

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return new Response(JSON.stringify({ error: 'itemIds array is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const deletedItems: string[] = [];
        const errors: string[] = [];

        // Delete each inbox item
        for (const itemId of itemIds) {
            try {
                await dataWriter.deleteInboxItem(itemId, currentUser);
                deletedItems.push(itemId);
            } catch (error) {
                console.error(`Failed to delete inbox item ${itemId}:`, error);
                errors.push(itemId);
            }
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({
                error: 'Some items could not be deleted',
                deletedCount: deletedItems.length,
                errors
            }), {
                status: 207, // Multi-Status
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            deletedCount: deletedItems.length,
            deletedItems
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error bulk deleting inbox items:', error);
        return new Response(JSON.stringify({ error: 'Failed to bulk delete items' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};