import {
  getAppTimezoneSync,
  getClientAppTimezone,
  getMysqlTimezoneOffset,
} from '@/lib/systemTimezone';

export { getMysqlTimezoneOffset } from '@/lib/systemTimezone';

/**
 * Active IANA timezone (t_systems.timezone, else APP_TIMEZONE, else Asia/Hong_Kong).
 */
export function getAppTimezone(): string {
  return typeof window !== 'undefined' ? getClientAppTimezone() : getAppTimezoneSync();
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '00';
}

function parseInstant(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInAppTimezone(d: Date, locale = 'en-GB'): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const year = partValue(parts, 'year');
  const month = partValue(parts, 'month');
  const day = partValue(parts, 'day');
  let hour = partValue(parts, 'hour');
  if (hour === '24') hour = '00';

  return `${year}-${month}-${day} ${hour}:${partValue(parts, 'minute')}:${partValue(parts, 'second')}`;
}

function formatInAppTimezoneWithMs(d: Date, locale = 'en-GB'): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).formatToParts(d);

  const year = partValue(parts, 'year');
  const month = partValue(parts, 'month');
  const day = partValue(parts, 'day');
  let hour = partValue(parts, 'hour');
  if (hour === '24') hour = '00';
  const ms = partValue(parts, 'fractionalSecond') || '000';

  return `${year}-${month}-${day} ${hour}:${partValue(parts, 'minute')}:${partValue(parts, 'second')}.${ms}`;
}

/**
 * Format as `YYYY-MM-DD HH:mm:ss` in app timezone (for INSERT/UPDATE params and logs).
 */
export function formatSqlDateTime(value: unknown): string | null {
  if (value == null) return sqlNow();

  const s = String(value).trim();
  if (!s) return sqlNow();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;

  const d = parseInstant(value);
  if (!d) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.length <= 10 ? `${s} 00:00:00` : s;
    return null;
  }

  return formatInAppTimezone(d);
}

export function sqlNow(): string {
  return formatSqlDateTime(new Date())!;
}

/** Log entry timestamp in app timezone (`YYYY-MM-DD HH:mm:ss`). */
export function logTimestamp(value: Date | string = new Date()): string {
  return formatSqlDateTime(value) ?? new Date().toISOString();
}

/** Date key for daily log files in app timezone (`YYYY-MM-DD`). */
export function logDateKey(value: Date | string = new Date()): string {
  return logTimestamp(value).split(' ')[0] ?? new Date().toISOString().split('T')[0];
}

/**
 * Format a MySQL DATETIME (or ISO string) for list/detail UI in app timezone.
 * Handles legacy UTC ISO entries stored in older log files.
 */
export function formatDisplayDateTime(value: unknown, locale = 'en-GB'): string {
  if (value == null || String(value).trim() === '') return '';

  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(s)) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!m) return s;
    const [, y, mo, d, h, mi, sec, frac] = m;
    const offset = getMysqlTimezoneOffset();
    const ms = frac ? frac.padEnd(3, '0').slice(0, 3) : '000';
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}.${ms}${offset}`);
    if (Number.isNaN(dt.getTime())) return s;
    return new Intl.DateTimeFormat(locale, {
      timeZone: getAppTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false,
    }).format(dt);
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return s;
    const [, y, mo, d, h, mi, sec] = m;
    const offset = getMysqlTimezoneOffset();
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}${offset}`);
    if (Number.isNaN(dt.getTime())) return s;
    return new Intl.DateTimeFormat(locale, {
      timeZone: getAppTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(dt);
  }

  const d = parseInstant(value);
  if (!d) return s;

  return new Intl.DateTimeFormat(locale, {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}
