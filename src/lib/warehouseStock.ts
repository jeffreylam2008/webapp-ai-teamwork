import dbService from '@/lib/database';

/**
 * Apply signed quantity deltas to t_warehouse.qty (positive = increase, negative = decrease).
 * Ensures a warehouse row exists per item (same pattern as GRN receipt updates).
 */
export async function applyWarehouseQtyDeltas(shopCode: string, deltas: Map<string, number>): Promise<void> {
  const shop = String(shopCode || '').trim();
  if (!shop) throw new Error('shop_code or wh_code is required for warehouse stock update');
  for (const [itemCode, delta] of deltas) {
    if (!itemCode || delta === 0 || !Number.isFinite(delta)) continue;
    await dbService.query(
      `INSERT INTO t_warehouse (item_code, qty, type, shop_code, create_date, modify_date)
       SELECT ?, 0, 'in', ?, NOW(), NOW()
       FROM (SELECT 1) x
       WHERE NOT EXISTS (SELECT 1 FROM t_warehouse WHERE item_code = ?)`,
      [itemCode, shop, itemCode]
    );
    await dbService.query('UPDATE t_warehouse SET qty = qty + ?, modify_date = NOW() WHERE item_code = ?', [
      delta,
      itemCode,
    ]);
  }
}
