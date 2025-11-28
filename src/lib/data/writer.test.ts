import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataWriter } from './writer';
import { fsApi } from './api';

vi.mock('./api', () => ({
    fsApi: {
        writeFile: vi.fn(),
        readFile: vi.fn(),
        moveFile: vi.fn(),
        deleteFile: vi.fn(),
    }
}));

describe('DataWriter', () => {
    let writer: DataWriter;

    beforeEach(() => {
        writer = new DataWriter();
        vi.clearAllMocks();
    });

    it('should create an inbox item with default type', async () => {
        const item = await writer.createInboxItem('Test Item');
        expect(item.type).toBe('action');
        expect(fsApi.writeFile).toHaveBeenCalled();
    });

    it('should create an inbox item with specified type', async () => {
        const item = await writer.createInboxItem('Test Link', 'http://example.com', 'link');
        expect(item.type).toBe('link');
        expect(fsApi.writeFile).toHaveBeenCalled();
        const callArgs = vi.mocked(fsApi.writeFile).mock.calls[0];
        expect(callArgs[1]).toContain('type: link');
    });
});
