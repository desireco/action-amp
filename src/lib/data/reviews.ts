import { getCollection } from 'astro:content';
import { invalidateByPrefix } from '../cache';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const REVIEWS_DIR = path.join(DATA_DIR, 'reviews');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');

export async function getReviewTemplate(type: string): Promise<string> {
    try {
        const templatePath = path.join(TEMPLATES_DIR, `${type}.md`);
        return await fs.readFile(templatePath, 'utf-8');
    } catch (e) {
        // Fallback if template doesn't exist
        return `## Reflection\n\n## Tomorrow's Focus\n`;
    }
}

export async function getCompletedActions(startDate: Date, endDate: Date) {
    const actions = await getCollection('actions');
    return actions.filter(action => {
        if (action.data.status !== 'completed' || !action.data.completed) return false;
        const completedDate = new Date(action.data.completed);
        return completedDate >= startDate && completedDate <= endDate;
    });
}

export async function createReview(type: 'daily' | 'weekly' | 'monthly' | 'quarterly', date: Date) {
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
    const template = await getReviewTemplate(type);

    const completedSection = completedActions.map(action =>
        `- [x] ${action.data.title} (id: ${action.data.id})`
    ).join('\n');

    const frontmatter = `---
type: ${type}
date: ${dateStr}
---
`;

    const content = `${frontmatter}
# ${type.charAt(0).toUpperCase() + type.slice(1)} Review - ${dateStr}

## Completed Items
${completedSection || 'No items completed.'}

${template}
`;

    const typeDir = path.join(REVIEWS_DIR, type);
    await fs.mkdir(typeDir, { recursive: true });

    const filePath = path.join(typeDir, `${dateStr}.md`);

    // Check if exists
    try {
        await fs.access(filePath);
        // If it exists, we might want to return it or throw. 
        // For now, let's throw so the UI can handle it (e.g. redirect to existing).
        throw new Error(`Review for ${dateStr} already exists.`);
    } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
    }

    await fs.writeFile(filePath, content, 'utf-8');
    invalidateByPrefix('collection:reviews');
    return filePath;
}
