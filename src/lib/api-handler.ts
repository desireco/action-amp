import type { APIRoute } from 'astro';
import { ErrorHandler } from './errors';

/**
 * Wrapper for API routes that handles errors consistently
 */
export function createAPIRoute(handler: (context: Parameters<APIRoute>[0]) => Promise<Response>): APIRoute {
    return async (context) => {
        try {
            return await handler(context);
        } catch (error) {
            const { status, message, code } = ErrorHandler.handle(error);

            // Don't expose internal errors in production
            const responseMessage = status >= 500 ? 'Internal server error' : message;

            return new Response(
                JSON.stringify({
                    error: responseMessage,
                    code,
                    ...(import.meta.env.DEV && {
                        details: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined
                    })
                }),
                {
                    status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                }
            );
        }
    };
}

/**
 * Validate request JSON with error handling
 */
export async function parseRequestBody(request: Request): Promise<any> {
    try {
        const contentType = request.headers.get('content-type');

        if (!contentType?.includes('application/json')) {
            throw new Error('Content-Type must be application/json');
        }

        return await request.json();
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Invalid JSON in request body');
        }
        throw error;
    }
}

/**
 * Create success response helper
 */
export function createSuccessResponse(data: any, status = 200): Response {
    return new Response(
        JSON.stringify({ success: true, data }),
        {
            status,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        }
    );
}

/**
 * Create error response helper
 */
export function createErrorResponse(message: string, status = 400, code?: string): Response {
    return new Response(
        JSON.stringify({
            error: message,
            code,
            ...(import.meta.env.DEV && { timestamp: new Date().toISOString() })
        }),
        {
            status,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        }
    );
}