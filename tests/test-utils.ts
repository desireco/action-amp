import { fsApi } from '../src/lib/data/api';
import path from 'path';

export class TestCleaner {
    private filesToDelete: Set<string> = new Set();
    private dirsToDelete: Set<string> = new Set();

    /**
     * Registers a file to be deleted during cleanup.
     * @param filePath Relative path to the file (e.g., 'data/projects/my-project.md')
     */
    addFile(filePath: string) {
        this.filesToDelete.add(filePath);
    }

    /**
     * Registers a directory to be deleted during cleanup.
     * @param dirPath Relative path to the directory (e.g., 'data/areas/my-area')
     */
    addDir(dirPath: string) {
        this.dirsToDelete.add(dirPath);
    }

    /**
     * Deletes all registered files and directories.
     */
    async cleanup() {
        // Delete files first
        for (const file of this.filesToDelete) {
            try {
                if (await fsApi.exists(file)) {
                    await fsApi.deleteFile(file);
                    console.log(`Cleaned up test file: ${file}`);
                }
            } catch (error) {
                console.warn(`Failed to cleanup file ${file}:`, error);
            }
        }
        this.filesToDelete.clear();

        // Delete directories
        for (const dir of this.dirsToDelete) {
            try {
                // We use fsApi.deleteFile for directories too if it supports it, 
                // but fsApi.deleteFile uses fs.unlink which is for files.
                // We need a deleteDir in fsApi or use node:fs directly.
                // Let's check fsApi again. It only has deleteFile.
                // We'll use node:fs/promises directly for directories here to be safe and robust.
                const fullPath = path.resolve(process.cwd(), dir);
                const fs = await import('node:fs/promises');
                await fs.rm(fullPath, { recursive: true, force: true });
                console.log(`Cleaned up test directory: ${dir}`);
            } catch (error) {
                console.warn(`Failed to cleanup directory ${dir}:`, error);
            }
        }
        this.dirsToDelete.clear();
    }
}
