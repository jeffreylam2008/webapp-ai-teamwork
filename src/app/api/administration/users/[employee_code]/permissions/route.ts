import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  permissionKeysToAccessRows,
  accessRowsToPermissionKeys,
  type EmployeeAccessRow,
} from '@/lib/employeeAccess';
import { FUNCTION_PERMISSION_ROWS } from '@/config/transactionPermissions';

async function ensureEmployeeAccessTable() {
  await dbService.query(`
    CREATE TABLE IF NOT EXISTS t_employee_access (
      uid INT NOT NULL,
      employee_code VARCHAR(32) NOT NULL,
      shop_code VARCHAR(32) NOT NULL DEFAULT 'HQ01',
      \`function\` VARCHAR(32) NOT NULL,
      sub_function VARCHAR(32) NOT NULL DEFAULT '',
      a_create TINYINT(1) NOT NULL DEFAULT 0,
      a_edit TINYINT(1) NOT NULL DEFAULT 0,
      a_delete TINYINT(1) NOT NULL DEFAULT 0,
      a_view TINYINT(1) NOT NULL DEFAULT 0,
      create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (shop_code, employee_code, \`function\`)
    )
  `);
  await migrateEmployeeAccessAddShopCodeIfNeeded();
  await ensureUidAutoIncrement();
}

/** Ensure t_employee_access_default exists: role_code (references t_employee_role), function, a_create, a_edit, a_delete, a_view. No employee_code. */
async function ensureEmployeeAccessDefaultTable() {
  try {
    const cols = await dbService.query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access_default'`
    );
    const names = (cols.data || []).map((c) => c.COLUMN_NAME);
    if (names.length > 0 && names.includes('employee_code')) {
      await dbService.query(`DROP TABLE t_employee_access_default`);
    }
  } catch {
    // Table may not exist; ignore
  }
  await dbService.query(`
    CREATE TABLE IF NOT EXISTS t_employee_access_default (
      role_code INT NOT NULL,
      \`function\` VARCHAR(32) NOT NULL,
      a_create TINYINT(1) NOT NULL DEFAULT 0,
      a_edit TINYINT(1) NOT NULL DEFAULT 0,
      a_delete TINYINT(1) NOT NULL DEFAULT 0,
      a_view TINYINT(1) NOT NULL DEFAULT 0,
      create_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      modify_date DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (role_code, \`function\`)
    )
  `);
  const roleResult = await dbService.query<{ role_code: number }>(
    `SELECT DISTINCT role_code FROM t_employee WHERE role_code IS NOT NULL ORDER BY role_code`
  );
  let roleCodes = (roleResult.data || []).map((r) => r.role_code);
  if (roleCodes.length === 0) roleCodes = [1];
  for (const roleCode of roleCodes) {
    for (const row of FUNCTION_PERMISSION_ROWS) {
      await dbService.query(
        `INSERT INTO t_employee_access_default (role_code, \`function\`, a_create, a_edit, a_delete, a_view)
         VALUES (?, ?, 1, 1, 1, 1)
         ON DUPLICATE KEY UPDATE a_create = 1, a_edit = 1, a_delete = 1, a_view = 1`,
        [roleCode, row.id]
      );
    }
  }
}

/** If t_employee_access.uid is NOT NULL but not AUTO_INCREMENT, alter it so INSERT can omit uid. */
async function ensureUidAutoIncrement() {
  try {
    const check = await dbService.query<{ EXTRA: string }>(
      `SELECT EXTRA FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access' AND COLUMN_NAME = 'uid'`
    );
    if (check.data?.[0]?.EXTRA?.toLowerCase().includes('auto_increment')) return;
    await dbService.query(
      `ALTER TABLE t_employee_access MODIFY uid INT NOT NULL AUTO_INCREMENT`
    );
  } catch {
    // Column might not exist or already auto_increment; ignore
  }
}

async function migrateEmployeeAccessAddShopCodeIfNeeded() {
  try {
    const check = await dbService.query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access' AND COLUMN_NAME = 'shop_code'`
    );
    if (check.data && check.data.length > 0) return;
    await dbService.query(`ALTER TABLE t_employee_access ADD COLUMN shop_code VARCHAR(32) NOT NULL DEFAULT 'HQ01' AFTER employee_code`);
    await dbService.query(
      `UPDATE t_employee_access ea INNER JOIN t_employee e ON ea.employee_code = e.employee_code AND ea.uid = e.uid SET ea.shop_code = e.default_shopcode`
    );
    await dbService.query(`ALTER TABLE t_employee_access DROP PRIMARY KEY, ADD PRIMARY KEY (shop_code, employee_code, \`function\`)`);
  } catch {
    // Column may already exist or PK already updated; ignore
  }
}

/** Resolve uid from employee_code and shop so we target the user for the current shop (same employee_code can exist per shop). */
async function getUidByEmployeeCodeAndShop(employeeCode: string, shopCode: string): Promise<number | null> {
  if (!shopCode || !shopCode.trim()) {
    const result = await dbService.query<{ uid: number }>(
      'SELECT uid FROM t_employee WHERE employee_code = ? LIMIT 1',
      [employeeCode]
    );
    const row = result.data?.[0];
    return row != null && Number.isFinite(row.uid) ? Number(row.uid) : null;
  }
  const result = await dbService.query<{ uid: number }>(
    'SELECT uid FROM t_employee WHERE employee_code = ? AND default_shopcode = ?',
    [employeeCode, shopCode.trim()]
  );
  const row = result.data?.[0];
  return row != null && Number.isFinite(row.uid) ? Number(row.uid) : null;
}

/**
 * GET /api/administration/users/[employee_code]/permissions
 * Get permissions for a user from t_employee_access by employee_code and current shop (from token).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employee_code: string }> }
) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    await ensureEmployeeAccessTable();
    await ensureEmployeeAccessDefaultTable();

    const result = shopCode
      ? await dbService.query<EmployeeAccessRow>(
          'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
          [shopCode, employeeCode]
        )
      : await dbService.query<EmployeeAccessRow>(
          'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
          [employeeCode]
        );
    const rows = (result.data || []) as EmployeeAccessRow[];
    const permissions = accessRowsToPermissionKeys(rows);

    return NextResponse.json({ success: true, data: permissions });
  } catch (error) {
    console.error('[API] get user permissions error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/administration/users/[employee_code]/permissions
 * Set permissions for the user identified by employee_code in the URL, scoped to current shop (from token). Body: { permissions: string[] }.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ employee_code: string }> }
) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;

    const { employee_code } = await params;
    const employeeCode = typeof employee_code === 'string' ? String(employee_code).trim() : '';
    if (!employeeCode) {
      return NextResponse.json({ success: false, error: 'Employee code is required' }, { status: 400 });
    }

    const uid = await getUidByEmployeeCodeAndShop(employeeCode, shopCode || '');
    if (uid == null) {
      return NextResponse.json({ success: false, error: 'User not found for this shop' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const allowed = permissions.filter((p: unknown) => typeof p === 'string' && p.length > 0 && p.length <= 64);

    await ensureEmployeeAccessTable();
    const rows = permissionKeysToAccessRows(employeeCode, allowed);

    const effectiveShop = shopCode || 'HQ01';
    await dbService.query('DELETE FROM t_employee_access WHERE shop_code = ? AND employee_code = ?', [effectiveShop, employeeCode]);
    for (const r of rows) {
      await dbService.query(
        `INSERT INTO t_employee_access (employee_code, shop_code, \`function\`, sub_function, a_create, a_edit, a_delete, a_view)
         VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
        [r.employee_code, effectiveShop, r.function, r.a_create, r.a_edit, r.a_delete, r.a_view]
      );
    }

    return NextResponse.json({ success: true, data: allowed });
  } catch (error) {
    console.error('[API] set user permissions error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
