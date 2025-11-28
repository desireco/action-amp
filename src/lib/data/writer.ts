import matter from 'gray-matter';
import { fsApi } from './api';
import type { InboxItem, ActionItem } from './types';

export class DataWriter {
    private generateId(title: string): string {
        const keyword = title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const suffix = Math.random().toString(36).substring(2, 6);
        return `${keyword}-${suffix}`;
    }

    async createInboxItem(title: string, content: string = '', type: InboxItem['type'] = 'action'): Promise<InboxItem> {
        const id = this.generateId(title);
        const item: InboxItem = {
            id,
            title,
            captured: new Date(),
            type,
            content
        };

        const fileContent = matter.stringify(content, {
            id: item.id,
            type: item.type,
            title: item.title,
            captured: item.captured.toISOString(),
        });

        await fsApi.writeFile(`data/inbox/${id}.md`, fileContent);
        return item;
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
    }

    async moveFile(oldPath: string, newPath: string): Promise<void> {
        await fsApi.moveFile(oldPath, newPath);
    }

    async convertInboxItemToAction(inboxItemId: string, targetProjectDir: string): Promise<void> {
        const inboxPath = `data/inbox/${inboxItemId}.md`;
        const fileContent = await fsApi.readFile(inboxPath);
        const parsed = matter(fileContent);

        // Update metadata for Action
        parsed.data.status = 'todo';
        parsed.data.priority = 'medium';
        parsed.data.created = parsed.data.captured || new Date().toISOString();
        delete parsed.data.type; // Actions don't strictly need type 'action' if they are in project folder, or we can keep it. Spec doesn't explicitly require it for actions, but implies structure.
        // Actually spec says: Project Action: id, title, status, priority, created.

        const updatedContent = matter.stringify(parsed.content, parsed.data);

        // Determine new filename
        // Inbox: [id].md -> Project: act-[id].md
        // But inbox ID is already [keyword]-[suffix]. So we prepend 'act-'.
        // If inbox ID already starts with 'act-', don't prepend.
        let newFilename = inboxItemId;
        if (!newFilename.startsWith('act-')) {
            newFilename = `act-${newFilename}`;
        }
        if (!newFilename.endsWith('.md')) {
            newFilename += '.md';
        }

        const targetPath = `${targetProjectDir}/${newFilename}`;

        // Write new file first
        await fsApi.writeFile(targetPath, updatedContent);

        // Delete old file
        await fsApi.deleteFile(inboxPath);
    }
}

export const dataWriter = new DataWriter();
