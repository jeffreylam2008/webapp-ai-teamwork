import dbService from '@/lib/database';

/** Ensure t_employee_access exists with shop_code primary key. */
export async function ensureEmployeeAccessTable(): Promise<void> {
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

async function ensureUidAutoIncrement(): Promise<void> {
  try {
    const check = await dbService.query<{ EXTRA: string }>(
      `SELECT EXTRA FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access' AND COLUMN_NAME = 'uid'`
    );
    if (check.data?.[0]?.EXTRA?.toLowerCase().includes('auto_increment')) return;
    await dbService.query(`ALTER TABLE t_employee_access MODIFY uid INT NOT NULL AUTO_INCREMENT`);
  } catch {
    // Column might not exist or already auto_increment; ignore
  }
}

async function migrateEmployeeAccessAddShopCodeIfNeeded(): Promise<void> {
  try {
    const check = await dbService.query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_employee_access' AND COLUMN_NAME = 'shop_code'`
    );
    if (check.data && check.data.length > 0) return;
    await dbService.query(
      `ALTER TABLE t_employee_access ADD COLUMN shop_code VARCHAR(32) NOT NULL DEFAULT 'HQ01' AFTER employee_code`
    );
    await dbService.query(
      `UPDATE t_employee_access ea INNER JOIN t_employee e ON ea.employee_code = e.employee_code AND ea.uid = e.uid SET ea.shop_code = e.default_shopcode`
    );
    await dbService.query(
      `ALTER TABLE t_employee_access DROP PRIMARY KEY, ADD PRIMARY KEY (shop_code, employee_code, \`function\`)`
    );
  } catch {
    // Column may already exist or PK already updated; ignore
  }
}

/** Resolve uid from employee_code and shop. */
export async function getUidByEmployeeCodeAndShop(
  employeeCode: string,
  shopCode: string
): Promise<number | null> {
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
