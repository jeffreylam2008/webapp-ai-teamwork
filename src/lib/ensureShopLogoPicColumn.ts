import dbService from '@/lib/database';
import { columnExists } from '@/lib/schemaMigration';
import { clearSystemTablesColumnCache } from '@/lib/systemTables';

/** Ensure `t_shop.logo_pic` exists for binary shop logo storage. */
export async function ensureShopLogoPicColumn(): Promise<void> {
  if (await columnExists('t_shop', 'logo_pic')) return;
  await dbService.query(`ALTER TABLE t_shop ADD COLUMN logo_pic LONGBLOB NULL`);
  clearSystemTablesColumnCache();
}
