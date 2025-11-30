import type { MiddlewareHandler } from 'astro';
import { getCachedSettings } from './lib/data/settings';

export const onRequest: MiddlewareHandler = async (context, next) => {
  (context.locals as any).settings = await getCachedSettings();
  return next();
};

