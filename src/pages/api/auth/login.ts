import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
    // For now, we hardcode Zeljko Dakic as the default user to login
    // In a real app, this would be a form submission or OAuth callback
    const userSlug = 'zeljko_dakic';

    cookies.set('user_slug', userSlug, {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return redirect('/inbox');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
    // Also allow GET for simple "Open App" link if preferred, 
    // although POST is better for "login" actions.
    const userSlug = 'zeljko_dakic';

    cookies.set('user_slug', userSlug, {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return redirect('/inbox');
};
