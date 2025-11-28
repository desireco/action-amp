import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { fsApi } from './api';

export interface Action {
    id: string;
    data: {
        title: string;
        status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
        priority: 'high' | 'medium' | 'low';
        created?: Date | string;
        completed?: Date | string;
        [key: string]: any;
    };
    body: string;
}

export class DataReader {
    async getProjectActions(projectDir: string): Promise<Action[]> {
        // projectDir is relative to data/areas, e.g. "work/website-redesign"
        const fullPath = fsApi.resolvePath(path.join('data/areas', projectDir));

        try {
            const files = await fs.readdir(fullPath);
            const actionFiles = files.filter(f => f.startsWith('act-') && f.endsWith('.md'));

            const actions = await Promise.all(actionFiles.map(async (file) => {
                const content = await fs.readFile(path.join(fullPath, file), 'utf-8');
                const parsed = matter(content);

                // Ensure defaults
                const data = {
                    title: parsed.data.title || 'Untitled',
                    status: parsed.data.status || 'todo',
                    priority: parsed.data.priority || 'medium',
                    created: parsed.data.created,
                    completed: parsed.data.completed,
                    ...parsed.data
                };

                return {
                    id: path.join(projectDir, file),
                    data: data as Action['data'],
                    body: parsed.content
                };
            }));

            return actions;
        } catch (e) {
            console.error(`Error reading actions for ${projectDir}:`, e);
            return [];
        }
    }
}

export const dataReader = new DataReader();
