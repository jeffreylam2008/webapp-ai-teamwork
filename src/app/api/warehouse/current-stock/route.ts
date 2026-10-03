import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

/**
 * GET /api/warehouse/current-stock?item_codes=A,B,C
 * Returns per item:
 * - warehouse_qty: physical t_warehouse.qty
 * - on_hold_qty: reserved SO holds (positive; from negative t_warehouse_stage qty)
 * - current_stock / remain_qty: warehouse_qty + staged (available after holds)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemCodesParam = searchParams.get('item_codes');
    if (!itemCodesParam || !itemCodesParam.trim()) {
      return NextResponse.json(
        { success: false, error: 'item_codes is required (comma-separated)' },
        { status: 400 }
      );
    }
    const itemCodes = itemCodesParam
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (itemCodes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const placeholders = itemCodes.map(() => '?').join(',');
    const whRows = await dbService.query<{ item_code: string; qty: number }>(
      `SELECT item_code, qty FROM t_warehouse WHERE item_code IN (${placeholders})`,
      itemCodes
    );
    const stageRows = await dbService.query<{ item_code: string; staged_qty: number }>(
      `SELECT item_code, COALESCE(SUM(qty), 0) AS staged_qty FROM t_warehouse_stage WHERE item_code IN (${placeholders}) GROUP BY item_code`,
      itemCodes
    );

    const whMap = new Map<string, number>();
    for (const r of whRows.data || []) {
      whMap.set(r.item_code, Number(r.qty || 0));
    }
    const stageMap = new Map<string, number>();
    for (const r of stageRows.data || []) {
      stageMap.set(r.item_code, Number(r.staged_qty || 0));
    }

    const data = itemCodes.map((item_code) => {
      const warehouse_qty = whMap.get(item_code) ?? 0;
      const staged_qty = stageMap.get(item_code) ?? 0;
      const on_hold_qty = Math.max(0, -staged_qty);
      const remain_qty = warehouse_qty + staged_qty;
      return {
        item_code,
        warehouse_qty,
        on_hold_qty,
        remain_qty,
        /** @deprecated prefer remain_qty — kept for stocktake callers */
        current_stock: remain_qty,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
