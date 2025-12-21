
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDataPath, getDataDir } from './path-resolver';
import path from 'node:path';

describe('Multi-User Path Resolution', () => {
    it('should return default data dir when no userId provided', () => {
        expect(getDataDir()).toBe('data');
    });

    it('should return user data dir when userId provided', () => {
        expect(getDataDir('user123')).toBe(path.join('data', 'users', 'user123'));
    });

    it('should resolve paths correctly for default user', () => {
        expect(resolveDataPath('inbox/item.md')).toBe(path.join('data', 'inbox', 'item.md'));
        expect(resolveDataPath('data/inbox/item.md')).toBe(path.join('data', 'inbox', 'item.md'));
    });

    it('should resolve paths correctly for specific user', () => {
        expect(resolveDataPath('inbox/item.md', 'user123')).toBe(path.join('data', 'users', 'user123', 'inbox', 'item.md'));
        expect(resolveDataPath('data/inbox/item.md', 'user123')).toBe(path.join('data', 'users', 'user123', 'inbox', 'item.md'));
    });
});
