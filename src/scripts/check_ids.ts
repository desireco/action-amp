
import { getCollection } from 'astro:content';

export async function printProjectIds() {
    const projects = await getCollection('projects');
    console.log('Project IDs:', projects.map(p => p.id));
}

printProjectIds();
