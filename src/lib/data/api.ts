import fs from 'node:fs/promises';
import path from 'node:path';

export class FileSystemAPI {
    private rootDir: string;

    constructor(rootDir: string = process.cwd()) {
        this.rootDir = rootDir;
    }

    resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.rootDir, filePath);
    }

    async readFile(filePath: string): Promise<string> {
        const fullPath = this.resolvePath(filePath);
        return fs.readFile(fullPath, 'utf-8');
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    async exists(filePath: string): Promise<boolean> {
        const fullPath = this.resolvePath(filePath);
        try {
            await fs.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    async moveFile(oldPath: string, newPath: string): Promise<void> {
        const fullOldPath = this.resolvePath(oldPath);
        const fullNewPath = this.resolvePath(newPath);
        await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
        await fs.rename(fullOldPath, fullNewPath);
    }

    async deleteFile(filePath: string): Promise<void> {
        const fullPath = this.resolvePath(filePath);
        await fs.unlink(fullPath);
    }

    async listDir(dirPath: string): Promise<string[]> {
        const fullPath = this.resolvePath(dirPath);
        return fs.readdir(fullPath);
    }
}

export const fsApi = new FileSystemAPI();
