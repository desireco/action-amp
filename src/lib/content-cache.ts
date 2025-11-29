import { getCollection } from 'astro:content';
import { getCached } from './cache';

const ttlMap: Record<string, number> = {
  inbox: 2000,
  reviews: 2000,
  projects: 5000,
  areas: 5000,
  actions: 5000,
};

export function getCachedCollection(name: string) {
  const ttlMs = ttlMap[name] ?? 5000;
  return getCached<any[]>(`collection:${name}`, () => getCollection(name as any), { ttlMs });
}

