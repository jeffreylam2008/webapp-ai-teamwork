import dbService from '@/lib/database';
import { applyWarehouseQtyDeltas } from '@/lib/warehouseStock';
import {
  clearSalesOrderWarehouseStageHold,
  getSalesOrderWarehouseStageHoldQtyByItem,
} from '@/lib/salesOrderWarehouseStage';

const EPS = 1e-9;

function mapsMatch(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [itemCode, qty] of a) {
    const other = b.get(itemCode);
    if (other == null || Math.abs(other - qty) > EPS) return false;
  }
  return true;
}

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
  legacySkipped: boolean;
};

/**
 * DN stock flow:
 * 1) SO already wrote t_warehouse_stage (or we rebuild it from SO lines)
 * 2) Confirm DN items against those stage records
 * 3) Deduct confirmed qty from t_warehouse
 * 4) Delete the SO stage rows
 *
 * DN without SO reference: deduct from warehouse using DN lines only.
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

  const staged = await getSalesOrderWarehouseStageHoldQtyByItem(referCode);
  if (staged.size === 0) {
    throw new Error(
      `No warehouse stage records found for sales order ${referCode}. Confirm the sales order so items are reserved, then create the delivery note.`
    );
  }
  if (!mapsMatch(staged, qtyByItem)) {
    throw new Error(
      'Delivery note items must match the sales-order warehouse stage records (item and quantity)'
    );
  }

  await deductWarehouseForDeliveryNote(stockShop, staged);
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
