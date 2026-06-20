import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { getTableColumns, normalizeBrandField } from '@/lib/systemTables';

const ULTIMATE_FALLBACK = 'System'; // only when DB read fails

async function ensureSystemNameColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME = 'system_name'`
  );
  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(
      `ALTER TABLE t_systems ADD COLUMN system_name VARCHAR(255) DEFAULT NULL`
    );
  }
}

async function ensureLogoColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME = 'logo'`
  );
  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(
      `ALTER TABLE t_systems ADD COLUMN logo VARCHAR(512) DEFAULT NULL`
    );
  }
}

/** Read default system name from t_systems_default (one row). Returns ULTIMATE_FALLBACK if missing/fails. */
async function getDefaultSystemNameFromDb(): Promise<string> {
  try {
    const colResult = await dbService.query<{ column_name: string }>(
      `SELECT COLUMN_NAME as column_name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 't_systems_default'
         AND COLUMN_NAME = 'system_name'`
    );
    if (!colResult.data || colResult.data.length === 0) return ULTIMATE_FALLBACK;
    const result = await dbService.query<{ system_name: string | null }>(
      'SELECT system_name FROM t_systems_default LIMIT 1'
    );
    const raw = result.data?.[0]?.system_name;
    if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
    return ULTIMATE_FALLBACK;
  } catch {
    return ULTIMATE_FALLBACK;
  }
}

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

/**
 * GET /api/system/name
 * Returns system name and logo from t_systems (public, for login page and sidebar).
 */
export async function GET() {
  try {
    await ensureSystemNameColumn();
    await ensureLogoColumn();
    const cols = await getTableColumns('t_systems');
    const selectCols = ['system_name', ...(cols.has('logo') ? ['logo'] : []), ...(cols.has('shop_logo') ? ['shop_logo'] : [])];
    const result = await dbService.query<Record<string, unknown>>(
      `SELECT ${selectCols.join(', ')} FROM t_systems LIMIT 1`
    );
    const row = result.data?.[0];
    const rawName = row?.system_name;
    let system_name: string;
    if (typeof rawName === 'string' && rawName.trim() !== '') {
      system_name = rawName.trim();
    } else {
      system_name = await getDefaultSystemNameFromDb();
    }
    const logo = cols.has('logo') ? normalizeBrandField(row?.logo) : null;
    const shop_logo = cols.has('shop_logo') ? normalizeBrandField(row?.shop_logo) : null;
    return NextResponse.json({
      success: true,
      data: { system_name, logo, shop_logo },
    });
  } catch {
    const system_name = await getDefaultSystemNameFromDb();
    return NextResponse.json({
      success: true,
      data: { system_name, logo: null, shop_logo: null },
    });
  }
}

/**
 * PUT /api/system/name
 * Updates system name in t_systems. Auth required.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureSystemNameColumn();
    await ensureLogoColumn();

    const body = await request.json().catch(() => ({}));
    const system_name =
      typeof body?.system_name === 'string' ? body.system_name.trim() : null;
    const logo = typeof body?.logo === 'string' ? body.logo.trim() || null : null;
    const shop_logo =
      typeof body?.shop_logo === 'string' ? body.shop_logo.trim() || null : null;

    const cols = await getTableColumns('t_systems');
    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    const hasRow = existing.data && existing.data.length > 0;

    if (!hasRow) {
      const insertCols = ['system_name'];
      const insertVals: (string | null)[] = [system_name || null];
      if (cols.has('logo')) {
        insertCols.push('logo');
        insertVals.push(logo);
      }
      if (cols.has('shop_logo')) {
        insertCols.push('shop_logo');
        insertVals.push(shop_logo);
      }
      await dbService.query(
        `INSERT INTO t_systems (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
        insertVals
      );
    } else {
      const sets = ['system_name = ?'];
      const params: (string | null)[] = [system_name || null];
      if (cols.has('logo')) {
        sets.push('logo = ?');
        params.push(logo);
      }
      if (cols.has('shop_logo')) {
        sets.push('shop_logo = ?');
        params.push(shop_logo);
      }
      await dbService.query(`UPDATE t_systems SET ${sets.join(', ')}`, params);
    }

    const displayName =
      system_name && system_name.trim() !== ''
        ? system_name.trim()
        : await getDefaultSystemNameFromDb();
    return NextResponse.json({
      success: true,
      message: 'System name updated',
      data: {
        system_name: displayName,
        logo: cols.has('logo') ? logo : null,
        shop_logo: cols.has('shop_logo') ? shop_logo : null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
