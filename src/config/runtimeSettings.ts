/**
 * Persisted runtime settings (data/settings.json) merged over process.env on boot.
 * PATCH /api/settings updates process.env, refreshes exported config, and saves JSON.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { syncConfigFromEnv } from '../utils/config';

export const SETTINGS_DATA_DIR = path.join(process.cwd(), 'data');
export const SETTINGS_FILE_PATH = path.join(SETTINGS_DATA_DIR, 'settings.json');

/** Env keys user may manage via dashboard / PATCH /api/settings */
export const MANAGED_SETTING_KEYS = [
  'BOT_ENABLED',
  'DASHBOARD_ENABLED',
  'DASHBOARD_PORT',
  'PORT',
  'BOT_TOKEN',
  'ALLOWED_CHANNEL_ID',
  'ALLOWED_CHANNEL_USERNAME',
  'ALLOW_FORWARDED_MESSAGES',
  'METAAPI_TOKEN',
  'METAAPI_ACCOUNTS',
  'METAAPI_ACCOUNT_ID',
  'FIXED_LOT_SIZE',
  'FIXED_RISK_AMOUNT',
  'RISK_REWARD_RATIO',
  'RISK_PERCENTAGE',
  'RISK_AMOUNT_USD',
  'MAX_TRADE_SIZE',
  'USE_SIGNAL_STOPS',
  'MAX_DAILY_LOSS_PERCENT',
  'MAX_DRAWDOWN_PERCENT',
  'MAX_DAILY_TRADES',
  'DEFAULT_ORDER_TYPE',
  'USE_SMART_ORDER_TYPE',
  'LIMIT_ORDER_SLIPPAGE',
  'PENDING_ORDER_EXPIRATION',
  'ENABLE_ADVANCED_ORDER_TYPES',
  'ENFORCE_1_1_RR',
  'CRYPTO_LOT_SIZE',
  'LOG_LEVEL',
  'DASHBOARD_API_KEY',
  'DASHBOARD_POLLING_INTERVAL',
  'CHECK_INTERVAL_SECONDS',
  'WEB_API_ENABLED',
  'NODE_OPTIONS',
  'UV_THREADPOOL_SIZE',
  'MAX_CONCURRENT_CONNECTIONS',
  'CONNECTION_POOL_SIZE',
  'OCR_WORKER_THREADS',
  'JWT_SECRET'
] as const;

const SECRET_KEYS = new Set([
  'BOT_TOKEN',
  'METAAPI_TOKEN',
  'DASHBOARD_API_KEY',
  'JWT_SECRET'
]);

/** Changing these typically needs a process restart to fully apply */
export const RESTART_HINT_KEYS = new Set([
  'PORT',
  'DASHBOARD_PORT',
  'NODE_OPTIONS',
  'UV_THREADPOOL_SIZE',
  'WEB_API_ENABLED',
  'DASHBOARD_ENABLED'
]);

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export function maskValue(key: string, value: string | undefined): string {
  if (!value) return '';
  if (!SECRET_KEYS.has(key)) return value;
  if (value.length <= 8) return '***';
  return `***${value.slice(-4)}`;
}

function ensureDataDir(): void {
  if (!fs.existsSync(SETTINGS_DATA_DIR)) {
    fs.mkdirSync(SETTINGS_DATA_DIR, { recursive: true });
  }
}

/** Managed keys allowed for PATCH /api/settings */
const MANAGED_SET = new Set<string>(MANAGED_SETTING_KEYS as unknown as string[]);

/**
 * Merge current process.env values for managed keys into settings.json
 */
export function savePersistedSettingsFromEnv(): void {
  try {
    ensureDataDir();
    const snapshot: Record<string, string> = {};
    for (const key of MANAGED_SETTING_KEYS) {
      const v = process.env[key];
      if (v !== undefined && v !== '') snapshot[key] = v;
    }
    const tmp = SETTINGS_FILE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tmp, SETTINGS_FILE_PATH);
    logger.info(`💾 Saved runtime settings to ${SETTINGS_FILE_PATH}`);
  } catch (e) {
    logger.error('Failed to save persisted settings:', e);
    throw e;
  }
}

export interface SettingMeta {
  key: string;
  secret: boolean;
  restartHint: boolean;
  value: string;
  masked: string;
}

export function getSettingsPayload(): {
  settings: SettingMeta[];
  persistedFile: string;
  managedKeys: readonly string[];
} {
  const settings: SettingMeta[] = [];
  for (const key of MANAGED_SETTING_KEYS) {
    const value = process.env[key] ?? '';
    const secret = isSecretKey(key);
    settings.push({
      key,
      secret,
      restartHint: RESTART_HINT_KEYS.has(key),
      value: secret ? '' : value,
      masked: maskValue(key, value)
    });
  }
  return {
    settings,
    persistedFile: SETTINGS_FILE_PATH,
    managedKeys: MANAGED_SETTING_KEYS
  };
}

function coerceEnvValue(key: string, value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Apply partial patch: updates process.env, syncs config, persists full snapshot.
 */
export function applySettingsPatch(patch: Record<string, unknown>): {
  applied: string[];
  ignored: string[];
  errors: string[];
} {
  const applied: string[] = [];
  const ignored: string[] = [];
  const errors: string[] = [];

  for (const [rawKey, rawVal] of Object.entries(patch)) {
    if (!MANAGED_SET.has(rawKey)) {
      ignored.push(rawKey);
      continue;
    }
    const coerced = coerceEnvValue(rawKey, rawVal);
    if (coerced === null) {
      delete process.env[rawKey];
      applied.push(rawKey);
      continue;
    }

    const err = validateSetting(rawKey, coerced);
    if (err) {
      errors.push(`${rawKey}: ${err}`);
      continue;
    }

    process.env[rawKey] = coerced;
    applied.push(rawKey);
  }

  syncConfigFromEnv();
  savePersistedSettingsFromEnv();

  return { applied, ignored, errors };
}

function validateSetting(key: string, value: string): string | null {
  const numKeys = new Set([
    'FIXED_LOT_SIZE',
    'FIXED_RISK_AMOUNT',
    'RISK_REWARD_RATIO',
    'RISK_PERCENTAGE',
    'MAX_TRADE_SIZE',
    'MAX_DAILY_LOSS_PERCENT',
    'MAX_DRAWDOWN_PERCENT',
    'MAX_DAILY_TRADES',
    'LIMIT_ORDER_SLIPPAGE',
    'PENDING_ORDER_EXPIRATION',
    'CRYPTO_LOT_SIZE',
    'DASHBOARD_PORT',
    'PORT',
    'DASHBOARD_POLLING_INTERVAL',
    'CHECK_INTERVAL_SECONDS',
    'MAX_CONCURRENT_CONNECTIONS',
    'CONNECTION_POOL_SIZE',
    'OCR_WORKER_THREADS'
  ]);
  if (!numKeys.has(key)) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 'must be a number';
  if (key === 'RISK_PERCENTAGE' && (n < 0.1 || n > 10)) return 'must be between 0.1 and 10';
  if (key === 'MAX_TRADE_SIZE' && (n < 0.01 || n > 100)) return 'must be between 0.01 and 100';
  if ((key === 'DASHBOARD_PORT' || key === 'PORT') && (n < 1024 || n > 65535)) return 'must be between 1024 and 65535';
  if ((key === 'FIXED_LOT_SIZE' || key === 'CRYPTO_LOT_SIZE') && (n <= 0 || n > 100)) return 'must be between 0.01 and 100';
  if (key === 'FIXED_RISK_AMOUNT' && (n <= 0 || n > 1_000_000)) return 'must be > 0';
  if (key === 'RISK_REWARD_RATIO' && (n < 0.1 || n > 20)) return 'must be between 0.1 and 20';
  return null;
}
