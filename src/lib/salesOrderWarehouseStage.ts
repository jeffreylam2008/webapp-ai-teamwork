import dbService from '@/lib/database';
import { sqlNow } from '@/lib/datetime';

let refColumnCached: boolean | null = null;

async function hasRefTransCodeColumn(): Promise<boolean> {
  if (refColumnCached !== null) return refColumnCached;
  const r = await dbService.query<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_warehouse_stage'
       AND COLUMN_NAME = 'ref_trans_code'`
  );
  refColumnCached = Number((r.data?.[0] as { c?: unknown })?.c ?? 0) > 0;
  return refColumnCached;
}

/** Remove draft SO stock holds for this transaction (no-op if migration not applied). */
export async function clearSalesOrderWarehouseStageHold(transCode: string): Promise<void> {
  const code = String(transCode || '').trim();
  if (!code) return;
  if (!(await hasRefTransCodeColumn())) return;
  await dbService.query('DELETE FROM t_warehouse_stage WHERE ref_trans_code = ?', [code]);
}

/**
 * Draft SO (not void, not confirmed): write t_warehouse_stage rows (type hold, negative qty)
 * so current-stock (warehouse + sum(stage)) reflects reserved quantity.
 * Confirmed / void SO: clears holds only.
 */
export async function syncSalesOrderWarehouseStageHold(params: {
  transCode: string;
  shopCode: string;
  effectivePrefix: string;
  effectiveIsVoid: number;
  /** 1 = confirmed (or legacy settled); 0 = draft */
  effectiveIsSettle: number;
  detailQtyByItem: Map<string, number>;
}): Promise<void> {
  if (!(await hasRefTransCodeColumn())) {
    console.warn('[salesOrderWarehouseStage] t_warehouse_stage.ref_trans_code missing; run scripts/migrations/warehouse_stage_so_reserve.sql');
    return;
  }

  const { transCode, shopCode, effectivePrefix, effectiveIsVoid, effectiveIsSettle, detailQtyByItem } = params;
  const code = String(transCode || '').trim();
  if (!code) return;

  if (String(effectivePrefix || '').trim().toUpperCase() !== 'SO') {
    await clearSalesOrderWarehouseStageHold(code);
    return;
  }

  await clearSalesOrderWarehouseStageHold(code);

  if (effectiveIsVoid === 1 || effectiveIsSettle === 1) return;

  const shop = String(shopCode || '').trim().slice(0, 10) || 'UNKNOWN';
  const now = sqlNow();

  for (const [itemCode, qty] of detailQtyByItem) {
    const ic = String(itemCode || '').trim();
    if (!ic || qty <= 0 || !Number.isFinite(qty)) continue;
    await dbService.query(
      `INSERT INTO t_warehouse_stage (shop_code, ref_trans_code, item_code, qty, type, create_date, modify_date)
       VALUES (?, ?, ?, ?, 'hold', ?, ?)`,
      [shop, code, ic, -Math.abs(qty), now, now]
    );
  }
}
