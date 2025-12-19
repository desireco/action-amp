import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import toml from '@iarna/toml';
import { fsApi } from './api';
import { getCached } from '../cache';

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
                    status: parsed.data.status || 'draft',
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
    async getProject(projectId: string): Promise<any | null> {
        // projectId is like "work/website-redesign/project.toml" or "work/website-redesign/project"
        let relativePath = projectId;
        if (!relativePath.endsWith('.toml')) {
            if (relativePath.endsWith('/project')) {
                relativePath += '.toml';
            } else {
                // Try appending /project.toml
                relativePath = path.join(relativePath, 'project.toml');
            }
        }

        const fullPath = fsApi.resolvePath(path.join('data/areas', relativePath));

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data = toml.parse(content);
            return {
                id: projectId, // Keep original ID
                data: data
            };
        } catch (e) {
            return null;
        }
    }

    async getArea(areaId: string): Promise<any | null> {
        // areaId is like "work"
        const fullPath = fsApi.resolvePath(path.join('data/areas', areaId, 'area.toml'));

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data = toml.parse(content);
            return {
                id: areaId,
                data: data
            };
        } catch (e) {
            return null;
        }
    }
    async getAreas(): Promise<any[]> {
        return getCached<any[]>('areas:list', async () => {
            const areasDir = fsApi.resolvePath('data/areas');
            try {
                const entries = await fs.readdir(areasDir, { withFileTypes: true });
                const areaDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

                const areas = await Promise.all(areaDirs.map(async (slug) => {
                    const area = await this.getArea(slug);
                    return area;
                }));

                return areas.filter(a => a !== null);
            } catch (e) {
                console.error('Error reading areas:', e);
                return [];
            }
        }, { ttlMs: 5000 });
    }

    async getAllProjects(): Promise<any[]> {
        return getCached<any[]>('projects:list', async () => {
            const areas = await this.getAreas();
            const projects = await Promise.all(areas.map(async (area) => {
                const areaPath = fsApi.resolvePath(path.join('data/areas', area.id));
                try {
                    const entries = await fs.readdir(areaPath, { withFileTypes: true });
                    const projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

                    const areaProjects = await Promise.all(projectDirs.map(async (slug) => {
                        const projectId = `${area.id}/${slug}/project.toml`;
                        return this.getProject(projectId);
                    }));

                    return areaProjects.filter(p => p !== null);
                } catch (e) {
                    return [];
                }
            }));

            return projects.flat();
        }, { ttlMs: 5000 });
    }
}

export const dataReader = new DataReader();
