import { describe, it, expect } from 'vitest';
import { DataError, ValidationError, NotFoundError, PermissionError, ErrorHandler } from './errors';

describe('Error Classes', () => {
    it('should create DataError with correct properties', () => {
        const error = new DataError('Test error', 'TEST_CODE', { detail: 'test' });
        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_CODE');
        expect(error.details).toEqual({ detail: 'test' });
        expect(error.name).toBe('DataError');
    });

    it('should create ValidationError with correct properties', () => {
        const error = new ValidationError('Invalid field', 'email', 'test@test.com');
        expect(error.message).toBe('Invalid field');
        expect(error.field).toBe('email');
        expect(error.value).toBe('test@test.com');
        expect(error.name).toBe('ValidationError');
    });

    it('should create NotFoundError with correct properties', () => {
        const error = new NotFoundError('User', '123');
        expect(error.message).toBe('User with ID 123 not found');
        expect(error.name).toBe('NotFoundError');
    });

    it('should create PermissionError with correct properties', () => {
        const error = new PermissionError('delete');
        expect(error.message).toBe('Permission denied for action: delete');
        expect(error.name).toBe('PermissionError');
    });
});

describe('ErrorHandler', () => {
    it('should handle ValidationError correctly', () => {
        const error = new ValidationError('Invalid email');
        const result = ErrorHandler.handle(error);
        expect(result.status).toBe(400);
        expect(result.message).toBe('Invalid email');
        expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should handle NotFoundError correctly', () => {
        const error = new NotFoundError('User');
        const result = ErrorHandler.handle(error);
        expect(result.status).toBe(404);
        expect(result.message).toBe('User not found');
        expect(result.code).toBe('NOT_FOUND');
    });

    it('should handle generic Error correctly', () => {
        const error = new Error('Something went wrong');
        const result = ErrorHandler.handle(error);
        expect(result.status).toBe(500);
        expect(result.message).toBe('An unexpected error occurred');
        expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('should handle withErrorHandling successfully', async () => {
        const operation = async () => ({ success: true });
        const result = await ErrorHandler.withErrorHandling(operation);
        expect(result.data).toEqual({ success: true });
        expect(result.error).toBeUndefined();
    });

    it('should handle withErrorHandling error', async () => {
        const operation = async () => {
            throw new ValidationError('Invalid data');
        };
        const result = await ErrorHandler.withErrorHandling(operation);
        expect(result.data).toBeUndefined();
        expect(result.error).toEqual({
            status: 400,
            message: 'Invalid data',
            code: 'VALIDATION_ERROR'
        });
    });
});