import path from 'node:path';

export function getDataDir(userId?: string): string {
    if (userId) {
        return path.join('data', 'users', userId);
    }
    return 'data';
}

export function resolveDataPath(relativePath: string, userId?: string): string {
    const dataDir = getDataDir(userId);
    // Remove leading "data/" if it exists in relativePath to avoid duplication
    // This allows calls like resolveDataPath("data/inbox", userId) to work correctly
    // by transforming it to "data/users/{id}/inbox" or just keeping "data/inbox"
    const cleanedPath = relativePath.startsWith('data/')
        ? relativePath.substring(5)
        : relativePath;

    return path.join(dataDir, cleanedPath);
}
