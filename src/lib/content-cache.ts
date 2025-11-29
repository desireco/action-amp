import { getCollection } from 'astro:content';
import { getCached } from './cache';

function ttlFor(name: string): number {
  const envKey = `CACHE_TTL_${name.toUpperCase()}_MS`;
  const fromEnv = process.env[envKey];
  if (fromEnv && !isNaN(Number(fromEnv))) return Number(fromEnv);
  switch (name) {
    case 'inbox':
    case 'reviews':
      return 5000;
    case 'projects':
    case 'areas':
    case 'actions':
      return 30000;
    default:
      return 15000;
  }
}

export function getCachedCollection(name: string) {
  const ttlMs = ttlFor(name);
  return getCached<any[]>(`collection:${name}`, () => getCollection(name as any), { ttlMs, staleWhileRevalidate: true });
}
