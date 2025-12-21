import { fsApi } from '../src/lib/data/api';
import path from 'path';
import { setGlobalUserIdOverride } from '../src/lib/data/path-resolver';
import { DEMO_USER } from '../src/lib/user';

// Set default override for all tests
setGlobalUserIdOverride(DEMO_USER.slug);

export class TestCleaner {
    private filesToDelete: Set<string> = new Set();
    private dirsToDelete: Set<string> = new Set();
    private usersToDelete: Set<string> = new Set();

    /**
     * Registers a file to be deleted during cleanup.
     * @param filePath Relative path to the file
     */
    addFile(filePath: string) {
        this.filesToDelete.add(filePath);
    }

    /**
     * Registers a directory to be deleted during cleanup.
     * @param dirPath Relative path to the directory
     */
    addDir(dirPath: string) {
        this.dirsToDelete.add(dirPath);
    }

    /**
     * Registers a user's data directory to be fully deleted.
     * @param userSlug The slug of the user
     */
    addUserDir(userSlug: string) {
        this.usersToDelete.add(path.join('data', 'users', userSlug));
    }

    /**
     * Deletes all registered files and directories.
     */
    async cleanup() {
        const fs = await import('node:fs/promises');

        // Delete files first
        for (const file of this.filesToDelete) {
            try {
                if (await fsApi.exists(file)) {
                    await fsApi.deleteFile(file);
                }
            } catch (error) { }
        }
        this.filesToDelete.clear();

        // Delete directories
        const allDirs = new Set([...this.dirsToDelete, ...this.usersToDelete]);
        for (const dir of allDirs) {
            try {
                const fullPath = path.resolve(process.cwd(), dir);
                await fs.rm(fullPath, { recursive: true, force: true });
            } catch (error) { }
        }
        this.dirsToDelete.clear();
        this.usersToDelete.clear();
    }
}
