import type { APIRoute } from 'astro';
import { createReview } from '../../lib/data/reviews';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
    try {
        const { currentUser } = locals as any;
        const formData = await request.formData();
        const type = formData.get('type') as 'daily' | 'weekly' | 'monthly' | 'quarterly';
        const dateStr = formData.get('date') as string;

        if (!type || !dateStr) {
            return new Response(JSON.stringify({ error: 'Missing type or date' }), { status: 400 });
        }

        const date = new Date(dateStr);

        try {
            await createReview(type, date, currentUser);
        } catch (e: any) {
            if (e.message.includes('already exists')) {
                // If it exists, we just redirect to it.
            } else {
                throw e;
            }
        }

        // Redirect to the review page
        const id = `${type}/${dateStr}`;
        return redirect(`/reviews/${id}`);

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
