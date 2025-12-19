import matter from 'gray-matter';
import toml from '@iarna/toml';
import { fsApi } from './api';
import { invalidate, invalidateByPrefix } from '../cache';
import type { InboxItem, ActionItem } from './types';
import { syncAreasProjects } from './settings';

export class DataWriter {
    private generateId(title: string): string {
        const keyword = title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const suffix = Math.random().toString(36).substring(2, 6);
        return `${keyword}-${suffix}`;
    }

    async createInboxItem(title: string, content: string = '', type?: InboxItem['type']): Promise<InboxItem> {
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

        await fsApi.writeFile(`data/inbox/${id}.md`, fileContent);
        invalidateByPrefix('collection:inbox');
        return item;
    }

    async updateInboxItem(id: string, updates: { title?: string; content?: string; type?: InboxItem['type'] }): Promise<void> {
        const filePath = `data/inbox/${id}.md`;
        const fileContent = await fsApi.readFile(filePath);
        const parsed = matter(fileContent);

        if (updates.title !== undefined) parsed.data.title = updates.title;
        if (updates.type !== undefined) parsed.data.type = updates.type;

        // If content is updated, use it. Otherwise use existing content.
        const content = updates.content !== undefined ? updates.content : parsed.content;

        const updatedContent = matter.stringify(content, parsed.data);
        await fsApi.writeFile(filePath, updatedContent);
        invalidateByPrefix('collection:inbox');
    }

    async deleteInboxItem(id: string): Promise<void> {
        const filePath = `data/inbox/${id}.md`;
        await fsApi.deleteFile(filePath);
        invalidateByPrefix('collection:inbox');
    }

    async updateActionStatus(filePath: string, status: ActionItem['status']): Promise<void> {
        const fileContent = await fsApi.readFile(filePath);
        const parsed = matter(fileContent);

        parsed.data.status = status;
        if (status === 'completed') {
            parsed.data.completed = new Date().toISOString();
        } else {
            delete parsed.data.completed;
        }

        const updatedContent = matter.stringify(parsed.content, parsed.data);
        await fsApi.writeFile(filePath, updatedContent);
        invalidateByPrefix('collection:actions');
    }

    async moveFile(oldPath: string, newPath: string): Promise<void> {
        await fsApi.moveFile(oldPath, newPath);
    }

    async assignInboxItemToProject(inboxItemId: string, targetProjectDir: string): Promise<void> {
        const inboxPath = `data/inbox/${inboxItemId}.md`;
        const fileContent = await fsApi.readFile(inboxPath);
        const parsed = matter(fileContent);
        const type = parsed.data.type || 'action'; // Default to action if undefined

        let newFilename = inboxItemId;
        if (!newFilename.endsWith('.md')) {
            newFilename += '.md';
        }

        if (type === 'action') {
            // Update metadata for Action
            parsed.data.status = 'draft';
            parsed.data.priority = 'medium';
            parsed.data.created = parsed.data.captured || new Date().toISOString();
            delete parsed.data.type;

            // Prefix with act-
            if (!newFilename.startsWith('act-')) {
                newFilename = `act-${newFilename}`;
            }
        } else {
            // For resources (note, link, idea, resource), we keep them as is, just move them.
            // We might want to keep the type in frontmatter to know what it is.
            // No status or priority needed.
            // Ensure NO act- prefix
            if (newFilename.startsWith('act-')) {
                newFilename = newFilename.substring(4);
            }
        }

        const updatedContent = matter.stringify(parsed.content, parsed.data);
        const targetPath = `${targetProjectDir}/${newFilename}`;

        // Write new file first
        await fsApi.writeFile(targetPath, updatedContent);

        // Delete old file
        await fsApi.deleteFile(inboxPath);
        invalidateByPrefix('collection:inbox');
        invalidateByPrefix('collection:actions');
    }

    async createArea(name: string, icon: string, color: string, description?: string): Promise<{ path: string, slug: string }> {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const areaPath = `data/areas/${slug}/area.toml`;

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
        await fsApi.writeFile(areaPath, tomlContent);
        invalidate('areas:list');
        invalidateByPrefix('collection:areas');
        await syncAreasProjects();
        
        return { path: areaPath, slug };
    }

    async updateArea(areaId: string, updates: { name?: string, icon?: string, color?: string, description?: string, priority?: string }): Promise<void> {
        const areaPath = `data/areas/${areaId}/area.toml`;

        // Read existing area data
        const fileContent = await fsApi.readFile(areaPath);
        const existingData = toml.parse(fileContent) as any;

        // Merge updates with existing data
        const updatedData = {
            ...existingData,
            ...updates,
        };

        // Ensure created date is preserved
        if (existingData.created) {
            updatedData.created = existingData.created;
        }

        const tomlContent = toml.stringify(updatedData);
        await fsApi.writeFile(areaPath, tomlContent);
        invalidate('areas:list');
        invalidateByPrefix('collection:areas');
        await syncAreasProjects();
    }

    async createProject(name: string, area: string, description?: string): Promise<{ path: string, slug: string }> {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const projectPath = `data/areas/${area}/${slug}/project.toml`;

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
        await fsApi.writeFile(projectPath, tomlContent);
        invalidate('projects:list');
        invalidateByPrefix('collection:projects');
        await syncAreasProjects();
        
        return { path: projectPath, slug };
    }

    async updateProject(projectId: string, updates: { name?: string, description?: string, status?: string, priority?: string }): Promise<void> {
        // projectId is like "work/website-redesign/project.toml"
        const projectPath = `data/areas/${projectId}`;

        // Read the existing project file
        const fileContent = await fsApi.readFile(projectPath);
        const projectData = toml.parse(fileContent) as any;

        // Update the fields
        if (updates.name !== undefined) {
            projectData.name = updates.name;
        }
        if (updates.description !== undefined) {
            projectData.description = updates.description;
        }
        if (updates.status !== undefined) {
            projectData.status = updates.status;
        }
        if (updates.priority !== undefined) {
            projectData.priority = updates.priority;
        }

        // Write back to file
        const tomlContent = toml.stringify(projectData);
        await fsApi.writeFile(projectPath, tomlContent);
        invalidate('projects:list');
        invalidateByPrefix('collection:projects');
        await syncAreasProjects();
    }
}

export const dataWriter = new DataWriter();
