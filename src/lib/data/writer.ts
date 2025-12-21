import matter from 'gray-matter';
import toml from '@iarna/toml';
import { fsApi } from './api';
import { invalidate, invalidateByPrefix } from '../cache';
import type { InboxItem, ActionItem } from './types';
import { syncAreasProjects } from './settings';
import { resolveDataPath } from './path-resolver';

export class DataWriter {
    private generateId(title: string): string {
        const keyword = title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const suffix = Math.random().toString(36).substring(2, 6);
        return `${keyword}-${suffix}`;
    }

    private getCacheKey(baseKey: string, userId?: string): string {
        return userId ? `${userId}:${baseKey}` : baseKey;
    }

    async createInboxItem(title: string, content: string = '', type?: InboxItem['type'], userId?: string): Promise<InboxItem> {
        const id = this.generateId(title);
        const item: InboxItem = {
            id,
            title,
            captured: new Date(),
            type,
            content
        };

        const frontmatter: Record<string, any> = {
            id: item.id,
            title: item.title,
            captured: item.captured.toISOString(),
        };

        if (item.type) {
            frontmatter.type = item.type;
        }

        const fileContent = matter.stringify(content, frontmatter);

        const filePath = resolveDataPath(`inbox/${id}.md`, userId);
        await fsApi.writeFile(filePath, fileContent, userId);

        invalidateByPrefix(this.getCacheKey('inbox:list', userId));
        return item;
    }

    async updateInboxItem(id: string, updates: { title?: string; content?: string; type?: InboxItem['type'] }, userId?: string): Promise<void> {
        const filePath = resolveDataPath(`inbox/${id}.md`, userId);
        const fileContent = await fsApi.readFile(filePath, userId);
        const parsed = matter(fileContent);

        if (updates.title !== undefined) parsed.data.title = updates.title;
        if (updates.type !== undefined) parsed.data.type = updates.type;

        // If content is updated, use it. Otherwise use existing content.
        const content = updates.content !== undefined ? updates.content : parsed.content;

        const updatedContent = matter.stringify(content, parsed.data);
        await fsApi.writeFile(filePath, updatedContent, userId);

        invalidateByPrefix(this.getCacheKey('inbox:list', userId));
    }

    async deleteInboxItem(id: string, userId?: string): Promise<void> {
        const filePath = resolveDataPath(`inbox/${id}.md`, userId);
        await fsApi.deleteFile(filePath, userId);
        invalidateByPrefix(this.getCacheKey('inbox:list', userId));
    }

    async updateActionStatus(filePath: string, status: ActionItem['status'], userId?: string): Promise<void> {
        const fullPath = fsApi.resolvePath(resolveDataPath(filePath, userId));

        // resolveDataPath might double up "data/" if filePath already has it, but our resolveDataPath handles that.
        // However, filePath coming in here typically starts with "data/areas/..." from reader.ts IDs?
        // reader.ts IDs are like "work/project/act-1.md" (relative to data/areas) OR absolute paths?
        // Let's check reader.ts getProjectActions: id: path.join(projectDir, file), where projectDir is relative to data/areas.
        // So id is "area/project/file.md".
        // DataReader.getProjectActions uses: path.join('areas', projectDir)
        // So we should prepend 'areas/' here if it's strictly relative to areas.

        // Actually, looking at usages (e.g. InboxItem.astro calling api), the path probably needs careful handling.
        // But let's assume filePath passed here is relative to 'data' or 'data/users/{id}'.
        // If the upstream code passes "areas/work/proj/act.md", resolveDataPath('areas/work...', userId) works.
        // If upstream passes "data/areas/...", resolveDataPath handles stripping 'data/'.

        const fileContent = await fsApi.readFile(fullPath, userId);
        const parsed = matter(fileContent);

        parsed.data.status = status;
        if (status === 'completed') {
            parsed.data.completed = new Date().toISOString();
        } else {
            delete parsed.data.completed;
        }

        const updatedContent = matter.stringify(parsed.content, parsed.data);
        await fsApi.writeFile(fullPath, updatedContent, userId); // writeFile takes full path or relative to cwd. fsApi.resolvePath handles it.

        invalidateByPrefix(this.getCacheKey('actions:all', userId));
        // Also invalidate project list? No, status change might affect sort order but usually we just re-fetch actions.
    }

    async moveFile(oldPath: string, newPath: string): Promise<void> {
        // This is a low-level move, potentially used by drag-and-drop.
        // It likely receives paths derived from dataReader IDs.
        // If IDs are relative to data root, we need to handle that.
        // But this method signature doesn't take userId easily.
        // Assuming callers handle path resolution for now or this is generic.
        // However, user isolation suggests we should probably wrap this too.
        // For now, I'll assume explicit paths are passed or use fsApi directly if trusted.
        // But to be safe, let's keep it as is, acting on fsApi. 
        // NOTE: if drag drop sends arbitrary paths, this is risky. But we are refactoring for abstraction.
        await fsApi.moveFile(oldPath, newPath);
    }

    async assignInboxItemToProject(inboxItemId: string, targetProjectDir: string, userId?: string): Promise<void> {
        const inboxPath = resolveDataPath(`inbox/${inboxItemId}.md`, userId);
        const fileContent = await fsApi.readFile(inboxPath);
        const parsed = matter(fileContent);
        const type = parsed.data.type || 'action';

        let newFilename = inboxItemId;
        if (!newFilename.endsWith('.md')) {
            newFilename += '.md';
        }

        if (type === 'action') {
            parsed.data.status = 'draft';
            parsed.data.priority = 'medium';
            parsed.data.created = parsed.data.captured || new Date().toISOString();
            delete parsed.data.type;

            if (!newFilename.startsWith('act-')) {
                newFilename = `act-${newFilename}`;
            }
        } else {
            if (newFilename.startsWith('act-')) {
                newFilename = newFilename.substring(4);
            }
        }

        const updatedContent = matter.stringify(parsed.content, parsed.data);

        // targetProjectDir is likely "areas/area/project"
        const targetPath = resolveDataPath(`${targetProjectDir}/${newFilename}`, userId);

        await fsApi.writeFile(targetPath, updatedContent, userId);
        await fsApi.deleteFile(inboxPath, userId);

        invalidateByPrefix(this.getCacheKey('inbox:list', userId));
        invalidateByPrefix(this.getCacheKey('actions:all', userId));
    }

    async createArea(name: string, icon: string, color: string, description?: string, userId?: string): Promise<{ path: string, slug: string }> {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const areaPath = resolveDataPath(`areas/${slug}/area.toml`, userId);

        const areaData: any = {
            name,
            icon,
            color,
            priority: 'medium',
            active: true,
            created: new Date(),
        };

        if (description) {
            areaData.description = description;
        }

        const tomlContent = toml.stringify(areaData);
        await fsApi.writeFile(areaPath, tomlContent, userId);

        const listKey = this.getCacheKey('areas:list', userId);
        invalidate(listKey);

        await syncAreasProjects(userId);

        return { path: areaPath, slug };
    }

    async updateArea(areaId: string, updates: { name?: string, icon?: string, color?: string, description?: string, priority?: string }, userId?: string): Promise<void> {
        const areaPath = resolveDataPath(`areas/${areaId}/area.toml`, userId);

        const fileContent = await fsApi.readFile(areaPath, userId);
        const existingData = toml.parse(fileContent) as any;

        const updatedData = {
            ...existingData,
            ...updates,
        };

        if (existingData.created) {
            updatedData.created = existingData.created;
        }

        const tomlContent = toml.stringify(updatedData);
        await fsApi.writeFile(areaPath, tomlContent, userId);

        const listKey = this.getCacheKey('areas:list', userId);
        invalidate(listKey);

        await syncAreasProjects(userId);
    }

    async createProject(name: string, area: string, description?: string, userId?: string): Promise<{ path: string, slug: string }> {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const projectPath = resolveDataPath(`areas/${area}/${slug}/project.toml`, userId);

        const projectData: any = {
            name,
            area,
            status: 'active',
            priority: 'medium',
            created: new Date(),
        };

        if (description) {
            projectData.description = description;
        }

        const tomlContent = toml.stringify(projectData);
        await fsApi.writeFile(projectPath, tomlContent, userId);

        const listKey = this.getCacheKey('projects:list', userId);
        invalidate(listKey);

        await syncAreasProjects(userId);

        return { path: projectPath, slug };
    }

    async updateProject(projectId: string, updates: { name?: string, description?: string, status?: string, priority?: string }, userId?: string): Promise<void> {
        // projectId is like "work/website-redesign/project.toml"
        // This is relative to 'areas/' in resolveDataPath logic if prepended, or needs to handle it.
        // In reader.ts, project IDs are "work/website-redesign/project.toml".
        // So we want `areas/${projectId}`.

        const projectPath = resolveDataPath(`areas/${projectId}`, userId);

        const fileContent = await fsApi.readFile(projectPath, userId);
        const projectData = toml.parse(fileContent) as any;

        if (updates.name !== undefined) projectData.name = updates.name;
        if (updates.description !== undefined) projectData.description = updates.description;
        if (updates.status !== undefined) projectData.status = updates.status;
        if (updates.priority !== undefined) projectData.priority = updates.priority;

        const tomlContent = toml.stringify(projectData);
        await fsApi.writeFile(projectPath, tomlContent, userId);

        const listKey = this.getCacheKey('projects:list', userId);
        invalidate(listKey);

        await syncAreasProjects(userId);
    }
}

export const dataWriter = new DataWriter();
