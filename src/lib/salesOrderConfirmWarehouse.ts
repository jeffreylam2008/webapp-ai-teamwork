import dbService from '@/lib/database';
import { applyWarehouseQtyDeltas } from '@/lib/warehouseStock';
import {
  clearSalesOrderWarehouseStageHold,
  getSalesOrderWarehouseStageHoldQtyByItem,
  hasSalesOrderWarehouseStageHold,
} from '@/lib/salesOrderWarehouseStage';

const EPS = 1e-9;

/**
 * Deduct physical warehouse qty for DN line items (negative deltas).
 */
export async function deductWarehouseForDeliveryNote(
  shopCode: string,
  qtyByItem: Map<string, number>
): Promise<void> {
  const shop = String(shopCode || '').trim();
  if (!shop) throw new Error('shop_code or wh_code is required for warehouse stock update');

  for (const [itemCode, need] of qtyByItem) {
    const ic = String(itemCode || '').trim();
    const q = Number(need || 0);
    if (!ic || !Number.isFinite(q) || q <= 0) continue;
    const r = await dbService.query<{ q: number }>(
      'SELECT COALESCE(qty, 0) AS q FROM t_warehouse WHERE item_code = ? LIMIT 1',
      [ic]
    );
    const wh = Number((r.data?.[0] as { q?: unknown } | undefined)?.q ?? 0);
    if (wh + EPS < q) {
      throw new Error(`Insufficient warehouse stock for item ${ic} (required ${q}, on hand ${wh})`);
    }
  }

  const out = new Map<string, number>();
  for (const [ic, q] of qtyByItem) {
    const code = String(ic || '').trim();
    const qty = Number(q || 0);
    if (!code || !Number.isFinite(qty) || qty <= 0) continue;
    out.set(code, -Math.abs(qty));
  }
  await applyWarehouseQtyDeltas(shop, out);
}

export type FulfillDnStockResult = {
  /** True when physical warehouse was reduced for this DN. */
  deducted: boolean;
  /** True when SO stage holds were cleared. */
  clearedStage: boolean;
  /**
   * Confirmed SO had no t_warehouse_stage rows — treated as legacy confirm-time
   * deduction (do not deduct again). New confirms always write stage holds.
   */
  legacySkipped: boolean;
};

/**
 * Normal practice for DN linked to a confirmed SO:
 * 1) Find t_warehouse_stage holds for the SO (written at draft/confirm)
 * 2) Deduct that qty from t_warehouse
 * 3) Clear the SO stage holds
 *
 * If the SO has no stage rows, assume legacy confirm already deducted physical stock.
 * DN without SO reference: deduct from warehouse only.
 */
export async function fulfillDeliveryNoteWarehouseStock(params: {
  stockShop: string;
  referSoCode?: string | null;
  /** DN line qty by item (positive). */
  qtyByItem: Map<string, number>;
}): Promise<FulfillDnStockResult> {
  const stockShop = String(params.stockShop || '').trim();
  const referCode = String(params.referSoCode || '').trim();
  const qtyByItem = params.qtyByItem;

  if (!referCode) {
    await deductWarehouseForDeliveryNote(stockShop, qtyByItem);
    return { deducted: true, clearedStage: false, legacySkipped: false };
  }

  const stillReserved = await hasSalesOrderWarehouseStageHold(referCode);
  if (!stillReserved) {
    // Legacy: confirm deducted warehouse and cleared/never wrote stage.
    return { deducted: false, clearedStage: false, legacySkipped: true };
  }

  const staged = await getSalesOrderWarehouseStageHoldQtyByItem(referCode);
  // Consume staged reservation quantities (source of truth while reserved).
  const toDeduct = staged.size > 0 ? staged : qtyByItem;

  await deductWarehouseForDeliveryNote(stockShop, toDeduct);
  await clearSalesOrderWarehouseStageHold(referCode);
  return { deducted: true, clearedStage: true, legacySkipped: false };
}

/** @deprecated Prefer fulfillDeliveryNoteWarehouseStock / deductWarehouseForDeliveryNote */
export async function deductWarehouseForConfirmedSalesOrder(
  transCode: string,
  shopCode: string
): Promise<void> {
  const code = String(transCode || '').trim();
  const shop = String(shopCode || '').trim();
  if (!code || !shop) throw new Error('transCode and shop are required');

  const lines = await dbService.query<{ item_code: string; qty: number }>(
    'SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?',
    [code]
  );
  const byItem = new Map<string, number>();
  for (const row of lines.data || []) {
    const ic = String(row.item_code || '').trim();
    const q = Number(row.qty || 0);
    if (!ic || !Number.isFinite(q) || q <= 0) continue;
    byItem.set(ic, (byItem.get(ic) || 0) + q);
  }
  await deductWarehouseForDeliveryNote(shop, byItem);
}
