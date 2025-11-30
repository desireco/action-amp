import { fsApi } from './api';
import { getCached, invalidate } from '../cache';
import toml from '@iarna/toml';
import { dataReader } from './reader';
import fs from 'node:fs/promises';
import path from 'node:path';

const SETTINGS_PATH_TOML = 'data/config/settings.toml';
let MEM_SETTINGS: AppSettings | null = null;
let MEM_MTIME: number | null = null;

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

export async function getSettings(): Promise<AppSettings> {
    if (await fsApi.exists(SETTINGS_PATH_TOML)) {
        console.log('[settings] read TOML');
        const content = await fsApi.readFile(SETTINGS_PATH_TOML);
        const data = toml.parse(content) as any;
        return data as AppSettings;
    }

    return {};
}

export async function getSettingsProcessCache(): Promise<AppSettings> {
    try {
        const settingsPath = path.join(process.cwd(), SETTINGS_PATH_TOML);
        let mtimeMs = 0;
        try {
            const stat = await fs.stat(settingsPath);
            mtimeMs = stat.mtimeMs;
        } catch {}

        if (MEM_SETTINGS && MEM_MTIME === mtimeMs) {
            console.log('[settings] mem hit');
            return MEM_SETTINGS;
        }

        const data = await getSettings();
        MEM_SETTINGS = data;
        MEM_MTIME = mtimeMs;
        console.log(`[settings] mem refresh mtime=${mtimeMs}`);
        return data;
    } catch (e) {
        return getSettings();
    }
}

function ttlForSettings(defaultMs: number): number {
    const fromEnv = process.env.CACHE_TTL_SETTINGS_MS;
    if (fromEnv && !isNaN(Number(fromEnv))) return Number(fromEnv);
    return defaultMs;
}

export async function getCachedSettings(ttlMs: number = 300000): Promise<AppSettings> {
    const finalTtl = ttlForSettings(ttlMs);
    console.log(`[settings] getCached ttl=${finalTtl}ms`);
    const settings = await getCached<AppSettings>('settings', getSettingsProcessCache, { ttlMs: finalTtl, staleWhileRevalidate: true });
    if (!settings.areas || !settings.projects) {
        await syncAreasProjects();
        return getSettingsProcessCache();
    }
    return settings;
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const currentSettings = await getSettings();
    const newSettings = { ...currentSettings, ...updates };

    const tomlContent = toml.stringify(newSettings as any);
    await fsApi.writeFile(SETTINGS_PATH_TOML, tomlContent);
    invalidate('settings');
}

export async function syncAreasProjects(): Promise<void> {
    const areas = await dataReader.getAreas();
    const projects = await dataReader.getAllProjects();

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

    await updateSettings({ areas: areaList, projects: projectList });
}
