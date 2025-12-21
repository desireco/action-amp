import { getCollection } from 'astro:content';
import { invalidateByPrefix } from '../cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveDataPath } from './path-resolver';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function getReviewTemplate(type: string, userId?: string): Promise<string> {
    try {
        const templatePath = resolveDataPath(`templates/${type}.md`, userId);
        const fullPath = path.isAbsolute(templatePath) ? templatePath : path.join(process.cwd(), templatePath);
        return await fs.readFile(fullPath, 'utf-8');
    } catch (e) {
        // Fallback if template doesn't exist
        return `## Reflection\n\n## Tomorrow's Focus\n`;
    }
}

export async function getCompletedActions(startDate: Date, endDate: Date) {
    // Note: getCollection('actions') already respects the TEST_USER isolated collection if set in content/config.ts
    // For manual userId propagation we might need to filter manually if we're not using the isolated collection.
    // However, our current architecture relies on Content Collections being isolated by config.ts.
    const actions = await getCollection('actions');
    return actions.filter(action => {
        if (action.data.status !== 'completed' || !action.data.completed) return false;
        const completedDate = new Date(action.data.completed);
        return completedDate >= startDate && completedDate <= endDate;
    });
}

export async function createReview(type: 'daily' | 'weekly' | 'monthly' | 'quarterly', date: Date, userId?: string) {
    const dateStr = date.toISOString().split('T')[0];

    // Determine date range for completed actions
    let startDate = new Date(date);
    let endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    startDate.setHours(0, 0, 0, 0);

    if (type === 'weekly') {
        startDate.setDate(startDate.getDate() - 6);
    } else if (type === 'monthly') {
        startDate.setDate(1);
    } else if (type === 'quarterly') {
        const month = startDate.getMonth();
        const quarterStartMonth = Math.floor(month / 3) * 3;
        startDate.setMonth(quarterStartMonth);
        startDate.setDate(1);
    }

    const completedActions = await getCompletedActions(startDate, endDate);
    const template = await getReviewTemplate(type, userId);

    const completedSection = completedActions.map(action =>
        `- [x] ${action.data.title} (id: ${action.data.id})`
    ).join('\n');

    const frontmatter = `---
type: ${type}
date: "${dateStr}"
---
`;

    const content = `${frontmatter}
# ${type.charAt(0).toUpperCase() + type.slice(1)} Review - ${dateStr}

## Completed Items
${completedSection || 'No items completed.'}

${template}
`;

    const typeDirRel = `reviews/${type}`;
    const filePathRel = path.join(typeDirRel, `${dateStr}.md`);

    // Use resolveDataPath for both relative paths
    const resolvedTypeDir = resolveDataPath(typeDirRel, userId);
    const resolvedFilePath = resolveDataPath(filePathRel, userId);

    const fullTypeDir = path.isAbsolute(resolvedTypeDir) ? resolvedTypeDir : path.join(process.cwd(), resolvedTypeDir);
    const fullFilePath = path.isAbsolute(resolvedFilePath) ? resolvedFilePath : path.join(process.cwd(), resolvedFilePath);

    await fs.mkdir(fullTypeDir, { recursive: true });

    // Check if exists
    try {
        await fs.access(fullFilePath);
        // If it exists, we might want to return it or throw. 
        // For now, let's throw so the UI can handle it (e.g. redirect to existing).
        throw new Error(`Review for ${dateStr} already exists.`);
    } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
    }

    await fs.writeFile(fullFilePath, content, 'utf-8');
    invalidateByPrefix(`collection:reviews:${userId || 'global'}`);
    return fullFilePath;
}
