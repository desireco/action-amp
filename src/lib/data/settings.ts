import { fsApi } from './api';
import { getCached, invalidate } from '../cache';
import toml from '@iarna/toml';
import { dataReader } from './reader';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveDataPath } from './path-resolver';

const MEM_SETTINGS_MAP = new Map<string, { data: AppSettings, mtime: number }>();

export interface AppSettings {
    default_area?: string;
    review_time_daily?: string;
    review_time_weekly?: string;
    next_action_context?: string;
    archive_completed_after_days?: number;
    inbox_auto_triage?: boolean;
    areas?: { slug: string; name: string }[];
    projects?: { name: string; area: string; slug: string; permalink: string }[];
    [key: string]: any;
}

function getSettingsPath(userId?: string): string {
    return resolveDataPath('config/settings.toml', userId);
}

export async function getSettings(userId?: string): Promise<AppSettings> {
    const settingsPath = getSettingsPath(userId);
    if (await fsApi.exists(settingsPath)) {
        console.log(`[settings] read TOML for user=${userId || 'default'}`);
        const content = await fsApi.readFile(settingsPath);
        const data = toml.parse(content) as any;
        return data as AppSettings;
    }

    return {};
}

export async function getSettingsProcessCache(userId?: string): Promise<AppSettings> {
    try {
        // We need absolute path for fs.stat
        const relativeSettingsPath = getSettingsPath(userId);
        const absoluteSettingsPath = fsApi.resolvePath(relativeSettingsPath);

        let mtimeMs = 0;
        try {
            const stat = await fs.stat(absoluteSettingsPath);
            mtimeMs = stat.mtimeMs;
        } catch { }

        const cacheKey = userId || 'default';
        const cached = MEM_SETTINGS_MAP.get(cacheKey);

        if (cached && cached.mtime === mtimeMs) {
            console.log(`[settings] mem hit user=${cacheKey}`);
            return cached.data;
        }

        const data = await getSettings(userId);
        MEM_SETTINGS_MAP.set(cacheKey, { data, mtime: mtimeMs });
        console.log(`[settings] mem refresh user=${cacheKey} mtime=${mtimeMs}`);
        return data;
    } catch (e) {
        return getSettings(userId);
    }
}

function ttlForSettings(defaultMs: number): number {
    const fromEnv = process.env.CACHE_TTL_SETTINGS_MS;
    if (fromEnv && !isNaN(Number(fromEnv))) return Number(fromEnv);
    return defaultMs;
}

export async function getCachedSettings(userId?: string, ttlMs: number = 300000): Promise<AppSettings> {
    const finalTtl = ttlForSettings(ttlMs);
    const cacheKey = userId ? `${userId}:settings` : 'settings';

    // We pass a closure that captures userId so getCached can call it without args
    const fetcher = () => getSettingsProcessCache(userId);

    const settings = await getCached<AppSettings>(cacheKey, fetcher, { ttlMs: finalTtl, staleWhileRevalidate: true });

    if (!settings.areas || !settings.projects) {
        await syncAreasProjects(userId);
        return getSettingsProcessCache(userId);
    }
    return settings;
}

export async function updateSettings(updates: Partial<AppSettings>, userId?: string): Promise<void> {
    const currentSettings = await getSettings(userId);
    const newSettings = { ...currentSettings, ...updates };

    const tomlContent = toml.stringify(newSettings as any);
    await fsApi.writeFile(getSettingsPath(userId), tomlContent);

    const cacheKey = userId ? `${userId}:settings` : 'settings';
    invalidate(cacheKey);
}

export async function syncAreasProjects(userId?: string): Promise<void> {
    const areas = await dataReader.getAreas(userId);
    const projects = await dataReader.getAllProjects(userId);

    const areaList = areas
        .map((a: any) => ({ slug: a?.id, name: a?.data?.name }))
        .filter((a: any) => a.slug && a.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const projectList = projects
        .filter((p: any) => p && p.data)
        .filter((p: any) => p.data.status === 'active')
        .map((p: any) => {
            const cleanId = p.id.replace(/\/project\.toml$/, '');
            const parts = cleanId.split('/');
            const area = parts[0];
            const slug = parts[1];
            return {
                name: p.data.name,
                area,
                slug,
                permalink: `/projects/${cleanId}`,
            };
        })
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    await updateSettings({ areas: areaList, projects: projectList }, userId);
}
