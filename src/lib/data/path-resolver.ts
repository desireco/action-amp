import path from 'node:path';

let globalUserIdOverride: string | null = null;

/**
 * Sets a global user ID override for the current process.
 * Useful for testing to ensure all data access is isolated.
 */
export function setGlobalUserIdOverride(userId: string | null) {
    globalUserIdOverride = userId;
}

export function getDataDir(userId?: string): string {
    const activeUserId = userId || globalUserIdOverride || process.env.TEST_USER || 'zeljko_dakic';
    // console.log(`[path-resolver] getDataDir: userId=${userId}, active=${activeUserId}`);
    return path.join('data', 'users', activeUserId);
}

export function resolveDataPath(relativePath: string, userId?: string): string {
    const activeUserId = userId || globalUserIdOverride || process.env.TEST_USER || 'zeljko_dakic';
    const dataDir = getDataDir(activeUserId);

    // Normalize path for check (remove leading ./)
    const normalizedPath = relativePath.startsWith('./') ? relativePath.substring(2) : relativePath;

    // console.log(`[path-resolver] resolveDataPath: relative=${relativePath}, userId=${userId}, active=${activeUserId}, normalized=${normalizedPath}`);

    // Check if the path is already scoped to ANY user (starts with data/users/)
    if (normalizedPath.startsWith('data/users/')) {
        // console.log(`[path-resolver] ...already scoped, returning ${relativePath}`);
        return relativePath;
    }

    // Remove leading "data/" if it exists to avoid duplication
    const cleanedPath = normalizedPath.startsWith('data/')
        ? normalizedPath.substring(5)
        : normalizedPath;

    const result = path.join(dataDir, cleanedPath);
    console.log(`[path-resolver] RESOLVED: ${relativePath} -> ${result} (User: ${activeUserId})`);
    return result;
}
