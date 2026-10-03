import dbService from '@/lib/database';
import { sqlNow } from '@/lib/datetime';
import { PREFIX_REF, normalizeToPrefixRef, bindEqualsStoredPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';

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

/** Remove SO stock holds for this transaction (no-op if migration not applied). */
export async function clearSalesOrderWarehouseStageHold(transCode: string): Promise<void> {
  const code = String(transCode || '').trim();
  if (!code) return;
  if (!(await hasRefTransCodeColumn())) return;
  await dbService.query('DELETE FROM t_warehouse_stage WHERE ref_trans_code = ?', [code]);
}

/** True when this SO still has reservation rows in t_warehouse_stage. */
export async function hasSalesOrderWarehouseStageHold(transCode: string): Promise<boolean> {
  const code = String(transCode || '').trim();
  if (!code) return false;
  if (!(await hasRefTransCodeColumn())) return false;
  const r = await dbService.query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM t_warehouse_stage WHERE ref_trans_code = ? LIMIT 1',
    [code]
  );
  return Number((r.data?.[0] as { c?: unknown })?.c ?? 0) > 0;
}

/** Load staged hold quantities (absolute) keyed by item_code for a sales order. */
export async function getSalesOrderWarehouseStageHoldQtyByItem(
  transCode: string
): Promise<Map<string, number>> {
  const code = String(transCode || '').trim();
  const out = new Map<string, number>();
  if (!code || !(await hasRefTransCodeColumn())) return out;
  const rows = await dbService.query<{ item_code: string; qty: number | null }>(
    `SELECT item_code, qty FROM t_warehouse_stage WHERE ref_trans_code = ?`,
    [code]
  );
  for (const row of rows.data || []) {
    const ic = String(row.item_code || '').trim();
    if (!ic) continue;
    // Stage holds are stored as negative qty; expose positive reserved amount.
    const q = Math.abs(Number(row.qty ?? 0));
    if (!Number.isFinite(q) || q <= 0) continue;
    out.set(ic, (out.get(ic) || 0) + q);
  }
  return out;
}

/** True when a non-void delivery note already references this sales order. */
export async function salesOrderHasNonVoidDeliveryNote(transCode: string): Promise<boolean> {
  const code = String(transCode || '').trim();
  if (!code) return false;
  const r = await dbService.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM t_transaction_h
     WHERE ${sqlEqualsStoredPrefixRef()}
       AND refer_code = ?
       AND COALESCE(is_void, 0) = 0`,
    [...bindEqualsStoredPrefixRef(PREFIX_REF.DN), code]
  );
  return Number((r.data?.[0] as { c?: unknown })?.c ?? 0) > 0;
}

/**
 * Active SO (draft or confirmed, not void, not yet delivered): write t_warehouse_stage
 * rows (type hold, negative qty) so available stock (warehouse + sum(stage)) reflects reservation.
 *
 * Normal practice: reserve on SO, deduct physical stock only when DN is created.
 * Void SO or SO that already has a DN: clears holds only.
 */
export async function syncSalesOrderWarehouseStageHold(params: {
  transCode: string;
  shopCode: string;
  effectivePrefix: string;
  effectiveIsVoid: number;
  /** 1 = confirmed (or legacy settled); 0 = draft — both keep holds until DN */
  effectiveIsSettle: number;
  detailQtyByItem: Map<string, number>;
}): Promise<void> {
  if (!(await hasRefTransCodeColumn())) {
    console.warn(
      '[salesOrderWarehouseStage] t_warehouse_stage.ref_trans_code missing; run scripts/migrations/warehouse_stage_so_reserve.sql'
    );
    return;
  }

  const { transCode, shopCode, effectivePrefix, effectiveIsVoid, detailQtyByItem } = params;
  const code = String(transCode || '').trim();
  if (!code) return;

  if (normalizeToPrefixRef(effectivePrefix) !== PREFIX_REF.SO) {
    await clearSalesOrderWarehouseStageHold(code);
    return;
  }

  await clearSalesOrderWarehouseStageHold(code);

  if (effectiveIsVoid === 1) return;

  // After DN ships, reservation is cleared and must not be recreated.
  if (await salesOrderHasNonVoidDeliveryNote(code)) return;

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

/**
 * Ensure a confirmed (or draft) undelivered SO has stage holds matching its lines.
 * Used before DN create so reservation rows exist to consume.
 */
export async function ensureSalesOrderWarehouseStageHold(params: {
  transCode: string;
  shopCode: string;
}): Promise<void> {
  const code = String(params.transCode || '').trim();
  const shop = String(params.shopCode || '').trim();
  if (!code || !shop) return;
  if (!(await hasRefTransCodeColumn())) return;
  if (await salesOrderHasNonVoidDeliveryNote(code)) return;

  const hdr = await dbService.query<{
    prefix: string | null;
    prefix_ref: string | null;
    is_void: number | null;
    is_settle: number | null;
  }>(
    'SELECT prefix, prefix_ref, is_void, is_settle FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
    [code]
  );
  const row = hdr.data?.[0];
  if (!row) return;
  if (normalizeToPrefixRef(String(row.prefix_ref || row.prefix || '')) !== PREFIX_REF.SO) return;
  if (Number(row.is_void ?? 0) === 1) return;

  const lines = await dbService.query<{ item_code: string; qty: number | null }>(
    'SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?',
    [code]
  );
  const detailQtyByItem = new Map<string, number>();
  for (const line of lines.data || []) {
    const ic = String(line.item_code || '').trim();
    const q = Number(line.qty ?? 0);
    if (!ic || !Number.isFinite(q) || q <= 0) continue;
    detailQtyByItem.set(ic, (detailQtyByItem.get(ic) || 0) + q);
  }

  await syncSalesOrderWarehouseStageHold({
    transCode: code,
    shopCode: shop,
    effectivePrefix: PREFIX_REF.SO,
    effectiveIsVoid: 0,
    effectiveIsSettle: Number(row.is_settle ?? 0) === 1 ? 1 : 0,
    detailQtyByItem,
  });
}
