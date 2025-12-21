import type { APIRoute } from 'astro';
import { dataReader } from '../../lib/data/reader';

export const GET: APIRoute = async ({ url }) => {
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const collectionFilter = url.searchParams.get('collection') || '';
    const statusFilter = url.searchParams.get('status') || '';
    const priorityFilter = url.searchParams.get('priority') || '';

    try {
        const results: any[] = [];

        // Search Inbox
        if (!collectionFilter || collectionFilter === 'inbox') {
            const inboxItems = await dataReader.getInboxItems();
            for (const item of inboxItems) {
                if (matchesFilters(item.data, query, statusFilter, priorityFilter, 'inbox')) {
                    results.push({
                        collection: 'inbox',
                        title: item.data.title,
                        description: item.data.description || '',
                        url: `/inbox/${item.id.replace(/\.md$/, '')}`,
                        status: null,
                        priority: null,
                        area: null,
                    });
                }
            }
        }

        // Search Actions
        if (!collectionFilter || collectionFilter === 'actions') {
            const actions = await dataReader.getAllActions();
            for (const action of actions) {
                if (matchesFilters(action.data, query, statusFilter, priorityFilter, 'actions')) {
                    // Extract area and project from the action ID
                    // Format: area/project/act-*.md
                    const parts = action.id.split('/');
                    const area = parts[0] || '';
                    const project = parts[1] || '';

                    results.push({
                        collection: 'actions',
                        title: action.data.title,
                        description: '',
                        url: `/projects/${area}/${project}`,
                        status: action.data.status,
                        priority: action.data.priority,
                        area: area,
                    });
                }
            }
        }

        // Search Projects
        if (!collectionFilter || collectionFilter === 'projects') {
            const projects = await dataReader.getAllProjects();
            for (const project of projects) {
                if (matchesFilters(project.data, query, statusFilter, priorityFilter, 'projects')) {
                    // Extract area and project name from ID
                    // Format: area/project/project.toml
                    const cleanId = project.id.replace(/\/project\.toml$/, '');
                    const parts = cleanId.split('/');
                    const area = parts[0] || '';

                    results.push({
                        collection: 'projects',
                        title: project.data.name,
                        description: project.data.description || '',
                        url: `/projects/${cleanId}`,
                        status: project.data.status,
                        priority: project.data.priority,
                        area: area,
                    });
                }
            }
        }

        // Search Areas
        if (!collectionFilter || collectionFilter === 'areas') {
            const areas = await dataReader.getAreas();
            for (const area of areas) {
                if (matchesFilters(area.data, query, statusFilter, priorityFilter, 'areas')) {
                    // Extract area name from ID
                    // Format: area-name (or area-name/area.toml is not how getAreas works... getAreas returns data from area.toml)
                    // dataReader.getAreas returns { id: 'work', data: ... }

                    results.push({
                        collection: 'areas',
                        title: area.data.name,
                        description: area.data.description || '',
                        url: `/areas/${area.id}`,
                        status: area.data.active ? 'active' : 'inactive',
                        priority: area.data.priority,
                        area: null,
                    });
                }
            }
        }

        // Search Reviews
        if (!collectionFilter || collectionFilter === 'reviews') {
            const reviews = await dataReader.getReviews();
            for (const review of reviews) {
                if (matchesFilters(review.data, query, statusFilter, priorityFilter, 'reviews')) {
                    // Format the review title
                    const date = new Date(review.data.date || review.id.split('/').pop()?.replace('.md', ''));
                    const formattedDate = !isNaN(date.getTime()) ? date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }) : 'Unknown Date';
                    const type = review.data.type || 'Review';
                    const title = `${type.charAt(0).toUpperCase() + type.slice(1)} Review - ${formattedDate}`;

                    results.push({
                        collection: 'reviews',
                        title: title,
                        description: '',
                        url: `/reviews/${review.id.replace(/\.md$/, '')}`,
                        status: null,
                        priority: null,
                        area: null,
                    });
                }
            }
        }

        // Sort results by relevance (exact matches first, then partial matches)
        results.sort((a, b) => {
            const aExact = a.title.toLowerCase() === query;
            const bExact = b.title.toLowerCase() === query;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            const aStarts = a.title.toLowerCase().startsWith(query);
            const bStarts = b.title.toLowerCase().startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;

            return a.title.localeCompare(b.title);
        });

        return new Response(JSON.stringify(results), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        return new Response(JSON.stringify({ error: 'Search failed' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
};

function matchesFilters(
    data: any,
    query: string,
    statusFilter: string,
    priorityFilter: string,
    collection: string
): boolean {
    // Text search
    if (query) {
        const searchableText = [
            data.title || '',
            data.name || '',
            data.description || '',
        ].join(' ').toLowerCase();

        if (!searchableText.includes(query)) {
            return false;
        }
    }

    // Status filter
    if (statusFilter) {
        const itemStatus = data.status || (data.active !== undefined ? (data.active ? 'active' : 'inactive') : null);
        if (itemStatus !== statusFilter) {
            return false;
        }
    }

    // Priority filter
    if (priorityFilter && data.priority !== priorityFilter) {
        return false;
    }

    return true;
}
