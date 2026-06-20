/** Canonical IANA timezone stored in DB (t_systems_default default). */
export const DEFAULT_TIMEZONE = 'Asia/Hong_Kong';

/** Common business timezones for the system settings dropdown. */
export const SYSTEM_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
  { value: 'Asia/Taipei', label: 'Asia/Taipei' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (KST)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'America/Chicago', label: 'America/Chicago (CT)' },
  { value: 'America/Denver', label: 'America/Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
  { value: 'UTC', label: 'UTC' },
];

const TIMEZONE_ALIASES: Record<string, string> = {
  'asia/hong_kong': 'Asia/Hong_Kong',
  'hong_kong': 'Asia/Hong_Kong',
  'hkt': 'Asia/Hong_Kong',
  'asia/shanghai': 'Asia/Shanghai',
  'utc': 'UTC',
};

const ALLOWED_TIMEZONES = new Set(SYSTEM_TIMEZONE_OPTIONS.map((o) => o.value));

let cachedTimezone: string | null = null;
let cacheUntil = 0;
const CACHE_MS = 30_000;

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIMEZONE;
  const raw = value.trim();
  const alias = TIMEZONE_ALIASES[raw.toLowerCase()];
  if (alias) return alias;

  if (ALLOWED_TIMEZONES.has(raw) && isValidTimezone(raw)) return raw;

  // Accept any valid IANA name from DB even if not in dropdown
  if (isValidTimezone(raw)) return raw;

  return DEFAULT_TIMEZONE;
}

export function getAppTimezoneSync(): string {
  if (cachedTimezone && Date.now() < cacheUntil) return cachedTimezone;
  const env = process.env.APP_TIMEZONE?.trim();
  if (env) return normalizeTimezone(env);
  return DEFAULT_TIMEZONE;
}

export function setAppTimezoneCache(tz: string): void {
  cachedTimezone = normalizeTimezone(tz);
  cacheUntil = Date.now() + CACHE_MS;
}

export function clearAppTimezoneCache(): void {
  cachedTimezone = null;
  cacheUntil = 0;
}

export function getClientAppTimezone(): string {
  if (typeof window === 'undefined') return getAppTimezoneSync();
  try {
    const raw = sessionStorage.getItem('__system_timezone');
    if (raw) {
      const parsed = JSON.parse(raw) as { timezone?: string };
      if (parsed?.timezone) return normalizeTimezone(parsed.timezone);
    }
  } catch {
    /* ignore */
  }
  return getAppTimezoneSync();
}

/** MySQL session offset e.g. +08:00 — override with APP_DB_TIMEZONE_OFFSET */
export function getMysqlTimezoneOffset(date = new Date()): string {
  const env = process.env.APP_DB_TIMEZONE_OFFSET?.trim();
  if (env && /^[+-]\d{2}:\d{2}$/.test(env)) return env;

  const tz = getAppTimezoneSync();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (m) {
      const sign = m[1];
      const hh = m[2].padStart(2, '0');
      const mm = (m[3] ?? '00').padStart(2, '0');
      return `${sign}${hh}:${mm}`;
    }
  } catch {
    /* invalid TZ */
  }
  return '+08:00';
}
