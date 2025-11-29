import type { APIRoute } from 'astro';
import { createReview } from '../../lib/data/reviews';

export const POST: APIRoute = async ({ request, redirect }) => {
    try {
        const formData = await request.formData();
        const type = formData.get('type') as 'daily' | 'weekly' | 'monthly' | 'quarterly';
        const dateStr = formData.get('date') as string;

        if (!type || !dateStr) {
            return new Response(JSON.stringify({ error: 'Missing type or date' }), { status: 400 });
        }

        const date = new Date(dateStr);

        try {
            await createReview(type, date);
        } catch (e: any) {
            if (e.message.includes('already exists')) {
                // If it exists, we just redirect to it.
                // We need to construct the ID.
                // ID for reviews is likely `type/date`.
            } else {
                throw e;
            }
        }

        // Redirect to the review page
        // The ID in content collection will be relative path without extension, e.g. "daily/2024-01-01"
        const id = `${type}/${dateStr}`;
        return redirect(`/reviews/${id}`);

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
