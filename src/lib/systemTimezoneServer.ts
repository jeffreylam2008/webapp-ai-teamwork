import dbService from '@/lib/database';
import {
  DEFAULT_TIMEZONE,
  getAppTimezoneSync,
  normalizeTimezone,
  setAppTimezoneCache,
} from '@/lib/systemTimezone';

export async function ensureTimezoneColumns(): Promise<void> {
  for (const table of ['t_systems', 't_systems_default'] as const) {
    const colResult = await dbService.query<{ column_name: string }>(
      `SELECT COLUMN_NAME as column_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'timezone'`,
      [table]
    );
    if (colResult.data && colResult.data.length > 0) continue;

    await dbService.query(
      `ALTER TABLE ${table} ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT '${DEFAULT_TIMEZONE}'`
    );
  }
}

export async function refreshAppTimezoneFromDb(): Promise<string> {
  try {
    await ensureTimezoneColumns();
    const result = await dbService.query<{ timezone: string | null }>(
      'SELECT timezone FROM t_systems LIMIT 1'
    );
    const tz = normalizeTimezone(result.data?.[0]?.timezone);
    setAppTimezoneCache(tz);
    return tz;
  } catch {
    return getAppTimezoneSync();
  }
}
