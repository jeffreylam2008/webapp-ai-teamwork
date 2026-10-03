import dbService from '@/lib/database';

let ensured = false;

/**
 * Drops unused t_warehouse.type when the column still exists.
 * Stock direction is implied by qty deltas; reservations use t_warehouse_stage.type.
 */
export async function ensureWarehouseNoTypeColumn(): Promise<void> {
  if (ensured) return;

  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_warehouse'
       AND COLUMN_NAME = 'type'`
  );
  const exists = (colResult.data || []).length > 0;

  if (exists) {
    await dbService.query('ALTER TABLE t_warehouse DROP COLUMN `type`');
  }

  ensured = true;
}
