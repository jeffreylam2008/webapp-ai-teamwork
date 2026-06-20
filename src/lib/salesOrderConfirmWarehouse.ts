import dbService from '@/lib/database';
import { applyWarehouseQtyDeltas } from '@/lib/warehouseStock';

const EPS = 1e-9;

/**
 * Validates physical t_warehouse.qty then deducts SO line quantities (negative deltas).
 * Call after draft stage holds for this SO are cleared.
 */
export async function deductWarehouseForConfirmedSalesOrder(transCode: string, shopCode: string): Promise<void> {
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

  for (const [itemCode, need] of byItem) {
    const r = await dbService.query<{ q: number }>(
      'SELECT COALESCE(qty, 0) AS q FROM t_warehouse WHERE item_code = ? LIMIT 1',
      [itemCode]
    );
    const wh = Number((r.data?.[0] as { q?: unknown } | undefined)?.q ?? 0);
    if (wh + EPS < need) {
      throw new Error(`Insufficient warehouse stock for item ${itemCode} (required ${need}, on hand ${wh})`);
    }
  }

  const out = new Map<string, number>();
  for (const [ic, q] of byItem) {
    out.set(ic, -Math.abs(q));
  }
  await applyWarehouseQtyDeltas(shop, out);
}
