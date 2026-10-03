import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { syncSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { PREFIX_REF, effectivePrefixRef, bindEqualsStoredPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';
import {
  assertTransCodeInShopScope,
  getShopScopeFromAuth,
  shopScopeRequiredResponse,
} from '@/lib/shopScope';

/**
 * POST /api/transactions/confirm-sales-order
 * Body: { transCode: string }
 *
 * Confirms a draft Sales Order (sets is_settle = 1) and keeps warehouse reservation
 * (t_warehouse_stage holds). Physical stock is deducted when the delivery note is created.
 */
export async function POST(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const scopeShop = getShopScopeFromAuth(auth.user);
  if (!scopeShop) return shopScopeRequiredResponse();

  let body: { transCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const transCode = String(body.transCode || '').trim();
  if (!transCode) {
    return NextResponse.json({ success: false, error: 'transCode is required' }, { status: 400 });
  }

  try {
    const scopeErr = await assertTransCodeInShopScope(transCode, scopeShop);
    if (scopeErr) return scopeErr;

    const hdr = await dbService.query<{
      prefix: string | null;
      prefix_ref: string | null;
      is_void: number | null;
      is_settle: number | null;
      wh_code: string | null;
      shop_code: string | null;
    }>(
      'SELECT prefix, prefix_ref, is_void, is_settle, wh_code, shop_code FROM t_transaction_h WHERE trans_code = ? AND shop_code = ? LIMIT 1',
      [transCode, scopeShop]
    );

    const row = hdr.data?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: 'Sales order not found' }, { status: 404 });
    }

    if (effectivePrefixRef(row.prefix_ref, row.prefix) !== PREFIX_REF.SO) {
      return NextResponse.json({ success: false, error: 'Not a sales order transaction' }, { status: 400 });
    }

    if (Number(row.is_void ?? 0) === 1) {
      return NextResponse.json({ success: false, error: 'Cannot confirm a void sales order' }, { status: 400 });
    }

    if (Number(row.is_settle ?? 0) === 1) {
      return NextResponse.json({ success: true, message: 'Sales order already confirmed', transCode });
    }

    const stockShop =
      String(row.wh_code ?? '')
        .trim()
        .slice(0, 10) ||
      String(row.shop_code ?? '')
        .trim()
        .slice(0, 10);
    if (!stockShop) {
      return NextResponse.json(
        { success: false, error: 'Sales order is missing shop or warehouse code for stock reservation' },
        { status: 400 }
      );
    }

    const lines = await dbService.query<{ item_code: string; qty: number }>(
      'SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?',
      [transCode]
    );
    const detailQtyByItem = new Map<string, number>();
    for (const line of lines.data || []) {
      const ic = String(line.item_code || '').trim();
      const q = Number(line.qty || 0);
      if (!ic || !Number.isFinite(q) || q <= 0) continue;
      detailQtyByItem.set(ic, (detailQtyByItem.get(ic) || 0) + q);
    }

    await dbService.withTransaction(async () => {
      await dbService.query(
        `UPDATE t_transaction_h SET is_settle = 1, modify_date = NOW()
         WHERE trans_code = ? AND ${sqlEqualsStoredPrefixRef()} AND shop_code = ?`,
        [transCode, ...bindEqualsStoredPrefixRef(PREFIX_REF.SO), scopeShop]
      );
      await syncSalesOrderWarehouseStageHold({
        transCode,
        shopCode: stockShop,
        effectivePrefix: PREFIX_REF.SO,
        effectiveIsVoid: 0,
        effectiveIsSettle: 1,
        detailQtyByItem,
      });
    });

    void logTransactionAction({
      request,
      action: 'CONFIRM',
      transCode,
      prefix: PREFIX_REF.SO,
    });

    return NextResponse.json({
      success: true,
      message: 'Sales order confirmed',
      transCode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[confirm-sales-order]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
