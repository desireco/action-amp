import { dataWriter } from './writer';
import { fsApi } from './api';
import { resolveDataPath } from './path-resolver';

export async function initializeUser(userId: string) {
    // Check if user has any areas defined
    const areasPath = resolveDataPath('areas', userId);
    if (await fsApi.exists(areasPath, userId)) {
        // Assume user is already initialized if areas folder exists
        return;
    }

    console.log(`[Initializer] Initializing new user: ${userId}`);

    try {
        // 1. Create Default Areas
        const lifeArea = await dataWriter.createArea(
            'Life',
            'sun',
            'yellow',
            'Personal life and well-being',
            userId
        );

        const workArea = await dataWriter.createArea(
            'Work',
            'briefcase',
            'blue',
            'Professional work and career',
            userId
        );

        // 2. Create General Projects
        const lifeGeneral = await dataWriter.createProject(
            'General',
            lifeArea.slug,
            'General tasks and maintenance for Life',
            userId
        );

        const workGeneral = await dataWriter.createProject(
            'General',
            workArea.slug,
            'General tasks and maintenance for Work',
            userId
        );

        // 3. Create Demo Actions
        // Inbox item
        await dataWriter.createInboxItem(
            'Check out Action Amplifier',
            'Explore the features of this productivity tool. Try moving this to a project!',
            'action',
            userId
        );

        // Project actions
        const welcomeAction = await dataWriter.createInboxItem(
            'Complete your first review',
            'Go to the Reviews tab and start a Daily Review.',
            'action',
            userId
        );

        // Move welcome action to Life/General to show a project task
        // We use the internal ID relative path move logic or simluated via writer
        // dataWriter.assignInboxItemToProject expects inboxItemId and projectDir relative to data root (via resolver)
        // Projects are in "areas/life/general"
        const projectDir = `areas/${lifeArea.slug}/${lifeGeneral.slug}`;
        await dataWriter.assignInboxItemToProject(welcomeAction.id, projectDir, userId);

        console.log(`[Initializer] User ${userId} initialized successfully.`);

    } catch (error) {
        console.error(`[Initializer] Failed to initialize user ${userId}:`, error);
    }
}
