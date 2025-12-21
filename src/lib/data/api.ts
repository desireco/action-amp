import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveDataPath } from './path-resolver';

export class FileSystemAPI {
    private rootDir: string;

    constructor(rootDir: string = process.cwd()) {
        this.rootDir = rootDir;
    }

    resolvePath(filePath: string, userId?: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        // For any relative path, assume it's a data path and needs resolution/scoping
        const effectivePath = resolveDataPath(filePath, userId);
        return path.join(this.rootDir, effectivePath);
    }

    async readFile(filePath: string, userId?: string): Promise<string> {
        const fullPath = this.resolvePath(filePath, userId);
        return fs.readFile(fullPath, 'utf-8');
    }

    async writeFile(filePath: string, content: string, userId?: string): Promise<void> {
        const fullPath = this.resolvePath(filePath, userId);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.appendFile('debug-log.txt', `[${new Date().toISOString()}] WRITE: ${filePath} (User: ${userId}) -> ${fullPath}\n`);
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    async exists(filePath: string, userId?: string): Promise<boolean> {
        const fullPath = this.resolvePath(filePath, userId);
        try {
            await fs.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    async moveFile(oldPath: string, newPath: string, userId?: string): Promise<void> {
        const fullOldPath = this.resolvePath(oldPath, userId);
        const fullNewPath = this.resolvePath(newPath, userId);
        await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
        await fs.rename(fullOldPath, fullNewPath);
    }

    async deleteFile(filePath: string, userId?: string): Promise<void> {
        const fullPath = this.resolvePath(filePath, userId);
        await fs.unlink(fullPath);
    }

    async listDir(dirPath: string, userId?: string): Promise<string[]> {
        const fullPath = this.resolvePath(dirPath, userId);
        return fs.readdir(fullPath);
    }
}

export const fsApi = new FileSystemAPI();
