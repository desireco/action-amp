
export interface User {
    name: string;
    slug: string;
}

/**
 * Creates a user object with a slugified name for filesystem and URL usage.
 * @param name The full name of the user
 * @returns User object
 */
export function createUser(name: string): User {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '');

    return {
        name,
        slug
    };
}

export const DEFAULT_USER = createUser('Zeljko Dakic');
export const DEMO_USER = createUser('Demo User');
