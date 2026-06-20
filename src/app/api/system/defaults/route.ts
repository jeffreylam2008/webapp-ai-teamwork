import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { getTableColumns, normalizeBrandField } from '@/lib/systemTables';
import { DEFAULT_TIMEZONE, normalizeTimezone } from '@/lib/systemTimezone';
import { ensureTimezoneColumns } from '@/lib/systemTimezoneServer';

const FALLBACK_IDLE = 10;
const FALLBACK_QUOTATION_VALID_DAYS = 30;
const FALLBACK_PAGE_SIZE_DEFAULT = 100;
const FALLBACK_PAGE_SIZE_MAX = 500;
const ULTIMATE_FALLBACK_SYSTEM_NAME = 'System'; // only when DB/schema read fails
const FALLBACK_LANGUAGE = 'en';
const FALLBACK_TIMEZONE = DEFAULT_TIMEZONE;

async function requireAuth(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const result = await verifyToken(token);
  if (!result.success) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const };
}

function fallbackRow(systemName: string = ULTIMATE_FALLBACK_SYSTEM_NAME) {
  return {
    idle: FALLBACK_IDLE,
    quotation_valid_days: FALLBACK_QUOTATION_VALID_DAYS,
    page_size_default: FALLBACK_PAGE_SIZE_DEFAULT,
    page_size_max: FALLBACK_PAGE_SIZE_MAX,
    system_name: systemName,
    logo: null as string | null,
    shop_logo: null as string | null,
    language: FALLBACK_LANGUAGE,
    timezone: FALLBACK_TIMEZONE,
  };
}

/** Read system_name from t_systems_default row, or column default from schema, or ultimate fallback. */
async function getSystemNameFromDefaults(): Promise<string> {
  try {
    const result = await dbService.query<{ system_name: string | null }>(
      'SELECT system_name FROM t_systems_default LIMIT 1'
    );
    const raw = result.data?.[0]?.system_name;
    if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
    const defResult = await dbService.query<{ COLUMN_DEFAULT: string | null }>(
      `SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_systems_default' AND COLUMN_NAME = 'system_name'`
    );
    const colDefault = defResult.data?.[0]?.COLUMN_DEFAULT;
    if (typeof colDefault === 'string' && colDefault.trim() !== '' && colDefault !== 'NULL') {
      return colDefault.replace(/^'|'$/g, '').trim();
    }
    return ULTIMATE_FALLBACK_SYSTEM_NAME;
  } catch {
    return ULTIMATE_FALLBACK_SYSTEM_NAME;
  }
}

async function ensureSystemNameColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems_default'
       AND COLUMN_NAME = 'system_name'`
  );
  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(
      `ALTER TABLE t_systems_default ADD COLUMN system_name VARCHAR(255) DEFAULT 'ERP System'`
    );
  }
}

/**
 * GET /api/system/defaults
 * Returns default system values from t_systems_default (one row). Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await dbService.query(`
      CREATE TABLE IF NOT EXISTS t_systems_default (
        uid INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        idle INT NOT NULL DEFAULT 10,
        quotation_valid_days INT NOT NULL DEFAULT 30,
        page_size_default INT NOT NULL DEFAULT 100,
        page_size_max INT NOT NULL DEFAULT 500,
        system_name VARCHAR(255) DEFAULT 'ERP System',
        create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await ensureSystemNameColumn();
    await ensureTimezoneColumns();

    const defCols = await getTableColumns('t_systems_default');
    const defSelect = [
      'idle',
      'quotation_valid_days',
      'page_size_default',
      'page_size_max',
      'system_name',
      ...(defCols.has('logo') ? ['logo'] : []),
      ...(defCols.has('shop_logo') ? ['shop_logo'] : []),
      ...(defCols.has('language') ? ['language'] : []),
      ...(defCols.has('timezone') ? ['timezone'] : []),
    ];
    let result = await dbService.query<Record<string, unknown>>(
      `SELECT ${defSelect.join(', ')} FROM t_systems_default LIMIT 1`
    );

    let row = result.data?.[0];
    if (!row) {
      await dbService
        .query(
          `INSERT INTO t_systems_default (idle, quotation_valid_days, page_size_default, page_size_max, system_name)
           VALUES (DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT)`
        )
        .catch(() => {});
      result = await dbService.query<Record<string, unknown>>(
        `SELECT ${defSelect.join(', ')} FROM t_systems_default LIMIT 1`
      );
      row = result.data?.[0];
    }
    if (!row) {
      const system_name = await getSystemNameFromDefaults();
      return NextResponse.json({
        success: true,
        data: fallbackRow(system_name),
      });
    }

    const idle = Number.isFinite(Number(row.idle)) ? Number(row.idle) : FALLBACK_IDLE;
    const quotation_valid_days = Number.isFinite(Number(row.quotation_valid_days)) ? Number(row.quotation_valid_days) : FALLBACK_QUOTATION_VALID_DAYS;
    const page_size_default = Number.isFinite(Number(row.page_size_default)) ? Number(row.page_size_default) : FALLBACK_PAGE_SIZE_DEFAULT;
    const page_size_max = Number.isFinite(Number(row.page_size_max)) ? Number(row.page_size_max) : FALLBACK_PAGE_SIZE_MAX;
    const system_name =
      typeof row.system_name === 'string' && row.system_name.trim() !== ''
        ? row.system_name.trim()
        : await getSystemNameFromDefaults();
    const logo = defCols.has('logo') ? normalizeBrandField(row.logo) : null;
    const shop_logo = defCols.has('shop_logo') ? normalizeBrandField(row.shop_logo) : null;
    const languageRaw = defCols.has('language') ? String(row.language ?? '').trim() : '';
    const language = languageRaw === 'zh-Hant' || languageRaw === 'en' ? languageRaw : FALLBACK_LANGUAGE;
    const timezone = defCols.has('timezone')
      ? normalizeTimezone(row.timezone)
      : FALLBACK_TIMEZONE;

    return NextResponse.json({
      success: true,
      data: {
        idle: Math.min(1440, Math.max(1, idle)),
        quotation_valid_days: Math.min(3650, Math.max(1, quotation_valid_days)),
        page_size_default: Math.min(500, Math.max(1, page_size_default)),
        page_size_max: Math.min(500, Math.max(1, page_size_max)),
        system_name,
        logo,
        shop_logo,
        language,
        timezone,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
