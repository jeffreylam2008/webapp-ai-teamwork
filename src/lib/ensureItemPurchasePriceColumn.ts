import dbService from '@/lib/database';

let ensured = false;

/**
 * Adds purchase_price to t_items when missing.
 * Used as the default unit price for purchasing (PO / GRN); sales keep using `price`.
 */
export async function ensureItemPurchasePriceColumn(): Promise<void> {
  if (ensured) return;

  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_items'
       AND COLUMN_NAME = 'purchase_price'`
  );
  const exists = (colResult.data || []).length > 0;

  if (!exists) {
    await dbService.query(
      `ALTER TABLE t_items
       ADD COLUMN purchase_price DECIMAL(18,4) NULL
       COMMENT 'Default purchase / cost unit price for PO and GRN'
       AFTER price_special`
    );
  }

  ensured = true;
}
