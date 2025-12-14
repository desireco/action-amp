/**
 * Custom error classes for better error handling
 */

export class DataError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = 'DataError';
    }
}

export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly field?: string,
        public readonly value?: any
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends Error {
    constructor(resource: string, id?: string) {
        super(`${resource}${id ? ` with ID ${id}` : ''} not found`);
        this.name = 'NotFoundError';
    }
}

export class PermissionError extends Error {
    constructor(action: string) {
        super(`Permission denied for action: ${action}`);
        this.name = 'PermissionError';
    }
}

/**
 * Error handler utility for consistent API responses
 */
export class ErrorHandler {
    static handle(error: unknown, context?: string): {
        status: number;
        message: string;
        code?: string;
    } {
        // Log error with context
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Error${context ? ` - ${context}` : ''}]`, error);

        if (error instanceof ValidationError) {
            return {
                status: 400,
                message: error.message,
                code: 'VALIDATION_ERROR'
            };
        }

        if (error instanceof NotFoundError) {
            return {
                status: 404,
                message: error.message,
                code: 'NOT_FOUND'
            };
        }

        if (error instanceof PermissionError) {
            return {
                status: 403,
                message: error.message,
                code: 'PERMISSION_DENIED'
            };
        }

        if (error instanceof DataError) {
            return {
                status: 500,
                message: error.message,
                code: error.code
            };
        }

        // Generic errors
        return {
            status: 500,
            message: 'An unexpected error occurred',
            code: 'INTERNAL_ERROR'
        };
    }

    static async withErrorHandling<T>(
        operation: () => Promise<T>,
        context?: string
    ): Promise<{ data?: T; error?: { status: number; message: string; code?: string } }> {
        try {
            const data = await operation();
            return { data };
        } catch (error) {
            return { error: this.handle(error, context) };
        }
    }
}

/**
 * Create a user-friendly error message
 */
export function createUserFriendlyMessage(error: unknown): string {
    if (error instanceof ValidationError) {
        return error.message;
    }

    if (error instanceof NotFoundError) {
        return "The requested item couldn't be found";
    }

    if (error instanceof PermissionError) {
        return "You don't have permission to perform this action";
    }

    if (error instanceof DataError) {
        // Map common error codes to user-friendly messages
        switch (error.code) {
            case 'FILE_NOT_FOUND':
                return 'The file could not be found';
            case 'INVALID_FORMAT':
                return 'The data format is invalid';
            case 'WRITE_ERROR':
                return 'Failed to save your changes';
            default:
                return error.message;
        }
    }

    return 'Something went wrong. Please try again later';
}