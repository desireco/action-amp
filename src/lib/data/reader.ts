import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import toml from '@iarna/toml';
import { fsApi } from './api';
import { getCached } from '../cache';
import { resolveDataPath } from './path-resolver';

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
    async getProjectActions(projectDir: string, userId?: string): Promise<Action[]> {
        // projectDir is relative to data/areas, e.g. "work/website-redesign"
        // resolveDataPath handles the "data" prefix, so we pass "areas/" + projectDir
        const fullPath = fsApi.resolvePath(resolveDataPath(path.join('areas', projectDir), userId));

        try {
            const files = await fs.readdir(fullPath);
            const actionFiles = files.filter(f => f.startsWith('act-') && f.endsWith('.md'));

            const actions = await Promise.all(actionFiles.map(async (file) => {
                const content = await fs.readFile(path.join(fullPath, file), 'utf-8');
                const parsed = matter(content);

                // Ensure defaults
                const data = {
                    ...parsed.data,
                    title: parsed.data.title || 'Untitled',
                    status: parsed.data.status || 'draft',
                    priority: parsed.data.priority || 'medium',
                    created: parsed.data.created ? new Date(parsed.data.created) : undefined,
                    completed: parsed.data.completed ? new Date(parsed.data.completed) : undefined,
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

    async getProject(projectId: string, userId?: string): Promise<any | null> {
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

        const fullPath = fsApi.resolvePath(resolveDataPath(path.join('areas', relativePath), userId));

        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data: any = toml.parse(content);

            // Ensure dates are actual Date objects
            if (data.due_date && !(data.due_date instanceof Date)) {
                data.due_date = new Date(data.due_date);
            }
            if (data.created && !(data.created instanceof Date)) {
                data.created = new Date(data.created);
            }
            if (data.completed && !(data.completed instanceof Date)) {
                data.completed = new Date(data.completed);
            }

            return {
                id: projectId, // Keep original ID
                data: data
            };
        } catch (e) {
            return null;
        }
    }

    async getArea(areaId: string, userId?: string): Promise<any | null> {
        // areaId is like "work"
        const fullPath = fsApi.resolvePath(resolveDataPath(path.join('areas', areaId, 'area.toml'), userId));

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

    async getAreas(userId?: string): Promise<any[]> {
        const cacheKey = userId ? `${userId}:areas:list` : 'areas:list';
        return getCached<any[]>(cacheKey, async () => {
            const areasDir = fsApi.resolvePath(resolveDataPath('areas', userId));
            try {
                const entries = await fs.readdir(areasDir, { withFileTypes: true });
                const areaDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

                const areas = await Promise.all(areaDirs.map(async (slug) => {
                    const area = await this.getArea(slug, userId);
                    return area;
                }));

                return areas.filter(a => a !== null);
            } catch (e) {
                console.error('Error reading areas:', e);
                return [];
            }
        }, { ttlMs: 5000 });
    }

    async getAllProjects(userId?: string): Promise<any[]> {
        const cacheKey = userId ? `${userId}:projects:list` : 'projects:list';
        return getCached<any[]>(cacheKey, async () => {
            const areas = await this.getAreas(userId);
            const projects = await Promise.all(areas.map(async (area) => {
                const areaPath = fsApi.resolvePath(resolveDataPath(path.join('areas', area.id), userId));
                try {
                    const entries = await fs.readdir(areaPath, { withFileTypes: true });
                    const projectDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

                    const areaProjects = await Promise.all(projectDirs.map(async (slug) => {
                        const projectId = `${area.id}/${slug}/project.toml`;
                        return this.getProject(projectId, userId);
                    }));

                    return areaProjects.filter(p => p !== null);
                } catch (e) {
                    return [];
                }
            }));

            return projects.flat();
        }, { ttlMs: 5000 });
    }

    async getAllActions(userId?: string): Promise<Action[]> {
        const cacheKey = userId ? `${userId}:actions:all` : 'actions:all';
        return getCached<Action[]>(cacheKey, async () => {
            const projects = await this.getAllProjects(userId);
            const allActions = await Promise.all(projects.map(async (p) => {
                const projectDir = p.id.replace(/\/project\.toml$/, '');
                return this.getProjectActions(projectDir, userId);
            }));
            return allActions.flat();
        }, { ttlMs: 5000 });
    }

    async getInboxItems(userId?: string): Promise<any[]> {
        const cacheKey = userId ? `${userId}:inbox:list` : 'inbox:list';
        return getCached<any[]>(cacheKey, async () => {
            try {
                const dir = fsApi.resolvePath(resolveDataPath('inbox', userId));
                try {
                    await fs.access(dir);
                } catch {
                    return [];
                }

                const files = await fs.readdir(dir);
                const mdFiles = files.filter(f => f.endsWith('.md'));

                const items = await Promise.all(mdFiles.map(async (file) => {
                    try {
                        const content = await fs.readFile(path.join(dir, file), 'utf-8');
                        const parsed = matter(content);
                        return {
                            id: file.replace(/\.md$/, ''),
                            data: {
                                ...parsed.data,
                                title: parsed.data.title || (parsed.content.split('\n')[0] || '').trim(),
                                captured: parsed.data.captured ? new Date(parsed.data.captured) : new Date(),
                                type: parsed.data.type || undefined,
                            },
                            body: parsed.content
                        };
                    } catch (e) {
                        console.error(`Failed to read inbox item ${file}:`, e);
                        return null;
                    }
                }));

                return items.filter(item => item !== null);
            } catch (error) {
                console.error('Error reading inbox items:', error);
                return [];
            }
        }, { ttlMs: 1 });
    }

    async getReviews(userId?: string): Promise<any[]> {
        const cacheKey = userId ? `${userId}:reviews:list` : 'reviews:list';
        return getCached<any[]>(cacheKey, async () => {
            try {
                const reviewsDir = fsApi.resolvePath(resolveDataPath('reviews', userId));
                try {
                    await fs.access(reviewsDir);
                } catch {
                    return [];
                }

                const entries = await fs.readdir(reviewsDir, { withFileTypes: true });
                const typeDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

                const allReviews = await Promise.all(typeDirs.map(async (type) => {
                    const typeDir = path.join(reviewsDir, type);
                    const files = await fs.readdir(typeDir);
                    const mdFiles = files.filter(f => f.endsWith('.md'));

                    return Promise.all(mdFiles.map(async (file) => {
                        try {
                            const content = await fs.readFile(path.join(typeDir, file), 'utf-8');
                            const parsed = matter(content);
                            return {
                                id: `${type}/${file}`,
                                data: {
                                    type: parsed.data.type || type,
                                    date: parsed.data.date,
                                    ...parsed.data
                                } as any,
                                body: parsed.content
                            };
                        } catch (e) {
                            return null;
                        }
                    }));
                }));

                return allReviews.flat().filter(r => r !== null);
            } catch (error) {
                console.error('Error reading reviews:', error);
                return [];
            }
        }, { ttlMs: 5000 });
    }
}

export const dataReader = new DataReader();
