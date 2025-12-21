import type { MiddlewareHandler } from 'astro';
import { getCachedSettings } from './lib/data/settings';
import { initializeUser } from './lib/data/initializer';

export const onRequest: MiddlewareHandler = async (context, next) => {
  // Priority: Cookie > TEST_USER env (for E2E) > Default user (zeljko_dakic)
  const userSlug = context.cookies.get('user_slug')?.value || process.env.TEST_USER || 'zeljko_dakic';

  // Ensure user data exists
  await initializeUser(userSlug);

  (context.locals as any).currentUser = userSlug;
  (context.locals as any).settings = await getCachedSettings(userSlug);
  return next();
};

