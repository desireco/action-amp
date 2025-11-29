import { fsApi } from './api';
import { getCached, invalidate } from '../cache';

const SETTINGS_PATH = 'data/config/settings.txt';

export interface AppSettings {
    default_area?: string;
    review_time_daily?: string;
    review_time_weekly?: string;
    next_action_context?: string;
    archive_completed_after_days?: number;
    inbox_auto_triage?: boolean;
    [key: string]: any;
}

export async function getSettings(): Promise<AppSettings> {
    if (!(await fsApi.exists(SETTINGS_PATH))) {
        return {};
    }

    const content = await fsApi.readFile(SETTINGS_PATH);
    const settings: AppSettings = {};

    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const [key, ...valueParts] = trimmed.split(':');
        if (key && valueParts.length > 0) {
            const value = valueParts.join(':').trim();

            // Parse booleans and numbers
            if (value === 'true') settings[key.trim()] = true;
            else if (value === 'false') settings[key.trim()] = false;
            else if (!isNaN(Number(value))) settings[key.trim()] = Number(value);
            else settings[key.trim()] = value;
        }
    });

    return settings;
}

export function getCachedSettings(ttlMs: number = 15000): Promise<AppSettings> {
    return getCached<AppSettings>('settings', getSettings, { ttlMs, staleWhileRevalidate: true });
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const currentSettings = await getSettings();
    const newSettings = { ...currentSettings, ...updates };

    let content = '# Action Amplifier Settings\n';
    for (const [key, value] of Object.entries(newSettings)) {
        content += `${key}: ${value}\n`;
    }

    await fsApi.writeFile(SETTINGS_PATH, content);
}
