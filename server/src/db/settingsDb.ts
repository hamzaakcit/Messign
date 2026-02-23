import { query } from './index.js';
import type { AppSettings } from '../types/admin.js';
import type { PasswordPolicy } from '../types/auth.js';
import { defaultPasswordPolicy } from '../types/auth.js';

const DEFAULT_KEY = 'default';

const defaultSettings: AppSettings = {
  general: {
    companyName: 'Messign',
    timezone: 'UTC',
    primaryColor: '#6366f1',
    accentColor: '#22c55e',
  },
  xp: {
    globalMultiplier: 1,
    leaderboardEnabled: true,
    dailyCap: null,
    levelUpNotifications: true,
    xpDecayEnabled: false,
    xpDecayAfterDays: 30,
  },
  notifications: {
    emailEnabled: true,
    inAppEnabled: true,
    digestFrequency: 'daily',
  },
  security: {
    requireMFA: false,
    sessionTimeoutMinutes: 60,
    ipWhitelist: [],
  },
};

function deepMerge(target: AppSettings, source: Partial<AppSettings>): AppSettings {
  const out = JSON.parse(JSON.stringify(target)) as AppSettings;
  if (source.general && typeof source.general === 'object') {
    out.general = { ...out.general, ...source.general };
  }
  if (source.xp && typeof source.xp === 'object') {
    out.xp = { ...out.xp, ...source.xp };
  }
  if (source.notifications && typeof source.notifications === 'object') {
    out.notifications = { ...out.notifications, ...source.notifications };
  }
  if (source.security && typeof source.security === 'object') {
    out.security = { ...out.security, ...source.security };
  }
  return out;
}

export async function getSettings(): Promise<AppSettings> {
  const result = await query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [DEFAULT_KEY]
  );
  const row = result.rows[0];
  if (!row?.value || typeof row.value !== 'object') return defaultSettings;
  return deepMerge(defaultSettings, row.value as Partial<AppSettings>);
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = deepMerge(current, updates);
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [DEFAULT_KEY, JSON.stringify(merged)]
  );
  return getSettings();
}

const PASSWORD_POLICY_KEY = 'password_policy';

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const result = await query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [PASSWORD_POLICY_KEY]
  );
  const row = result.rows[0];
  if (!row?.value || typeof row.value !== 'object') return { ...defaultPasswordPolicy };
  return { ...defaultPasswordPolicy, ...(row.value as Partial<PasswordPolicy>) };
}

export async function updatePasswordPolicy(updates: Partial<PasswordPolicy>): Promise<PasswordPolicy> {
  const current = await getPasswordPolicy();
  const merged = { ...current, ...updates };
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [PASSWORD_POLICY_KEY, JSON.stringify(merged)]
  );
  return getPasswordPolicy();
}
