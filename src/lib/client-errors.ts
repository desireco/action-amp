/**
 * Client-side error handling utilities
 */

export interface ClientError {
    message: string;
    code?: string;
    status?: number;
    details?: any;
}

/**
 * Handle API errors on the client side
 */
export function handleAPIError(error: any): ClientError {
    if (error instanceof Response) {
        return {
            status: error.status,
            message: `HTTP ${error.status}: ${error.statusText}`,
            code: 'HTTP_ERROR'
        };
    }

    if (error instanceof Error) {
        return {
            message: error.message,
            code: 'CLIENT_ERROR',
            details: error.stack
        };
    }

    if (typeof error === 'object' && error !== null) {
        return {
            message: error.error || error.message || 'An error occurred',
            code: error.code,
            status: error.status,
            details: error.details
        };
    }

    return {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR'
    };
}

/**
 * Show user-friendly error message
 */
export function showUserError(error: any): string {
    const clientError = handleAPIError(error);

    // Map common error codes to user-friendly messages
    switch (clientError.code) {
        case 'VALIDATION_ERROR':
            return clientError.message;
        case 'NOT_FOUND':
            return "The item you're looking for doesn't exist";
        case 'PERMISSION_DENIED':
            return "You don't have permission to do that";
        case 'NETWORK_ERROR':
            return 'Please check your internet connection and try again';
        case 'HTTP_ERROR':
            if (clientError.status === 429) {
                return 'Too many requests. Please wait a moment and try again';
            }
            if (clientError.status === 500) {
                return 'The server had a problem. Please try again later';
            }
            return clientError.message;
        default:
            return clientError.message || 'Something went wrong. Please try again';
    }
}

/**
 * Wrapper for fetch with error handling
 */
export async function safeFetch(
    url: string,
    options?: RequestInit,
    retries = 1
): Promise<{ data?: any; error?: ClientError }> {
    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            // Try to parse error response
            let errorData: any = null;
            try {
                errorData = await response.clone().json();
            } catch {
                // If we can't parse JSON, use text
                try {
                    errorData = { error: await response.clone().text() };
                } catch {
                    errorData = { error: response.statusText };
                }
            }

            return {
                error: {
                    status: response.status,
                    message: errorData?.error || errorData?.message || `HTTP ${response.status}`,
                    code: errorData?.code || 'HTTP_ERROR',
                    details: errorData
                }
            };
        }

        const data = await response.json();
        return { data };
    } catch (error) {
        if (retries > 0 && error instanceof TypeError && error.message.includes('fetch')) {
            // Retry network errors
            await new Promise(resolve => setTimeout(resolve, 1000));
            return safeFetch(url, options, retries - 1);
        }

        return {
            error: handleAPIError(error)
        };
    }
}

/**
 * Debounced error logger
 */
const errorLogQueue = new Set<string>();
const ERROR_LOG_DEBOUNCE = 5000; // 5 seconds

export function logError(error: any, context?: string) {
    const errorString = `${context ? `[${context}] ` : ''}${JSON.stringify(error)}`;

    // Avoid logging the same error multiple times
    if (errorLogQueue.has(errorString)) {
        return;
    }

    errorLogQueue.add(errorString);

    // Log to console in development
    if (import.meta.env.DEV) {
        console.error('Client Error:', error);
    }

    // Clear from queue after debounce time
    setTimeout(() => {
        errorLogQueue.delete(errorString);
    }, ERROR_LOG_DEBOUNCE);
}