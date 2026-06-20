import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { clearSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { deductWarehouseForConfirmedSalesOrder } from '@/lib/salesOrderConfirmWarehouse';

/**
 * POST /api/transactions/confirm-sales-order
 * Body: { transCode: string }
 *
 * Confirms a draft Sales Order (sets is_settle = 1), clears draft warehouse holds,
 * then deducts line quantities from t_warehouse.
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
    const hdr = await dbService.query<{
      prefix: string | null;
      is_void: number | null;
      is_settle: number | null;
      wh_code: string | null;
      shop_code: string | null;
    }>(
      'SELECT prefix, is_void, is_settle, wh_code, shop_code FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
      [transCode]
    );

    const row = hdr.data?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: 'Sales order not found' }, { status: 404 });
    }

    if (String(row.prefix || '').trim().toUpperCase() !== 'SO') {
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
        { success: false, error: 'Sales order is missing shop or warehouse code for stock deduction' },
        { status: 400 }
      );
    }

    const dnCheck = await dbService.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM t_transaction_h
       WHERE UPPER(TRIM(COALESCE(prefix,''))) = 'DN'
         AND refer_code = ?
         AND COALESCE(is_void, 0) = 0`,
      [transCode]
    );
    const hasDeliveryNote = Number((dnCheck.data?.[0] as { c?: unknown })?.c ?? 0) > 0;

    await dbService.query('START TRANSACTION');
    await dbService.query(
      `UPDATE t_transaction_h SET is_settle = 1, modify_date = NOW() WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO'`,
      [transCode]
    );
    await clearSalesOrderWarehouseStageHold(transCode);
    if (!hasDeliveryNote) {
      await deductWarehouseForConfirmedSalesOrder(transCode, stockShop);
    }
    await dbService.query('COMMIT');

    void logTransactionAction({
      request,
      action: 'CONFIRM',
      transCode,
      prefix: 'SO',
    });

    return NextResponse.json({
      success: true,
      message: 'Sales order confirmed',
      transCode,
    });
  } catch (err) {
    try {
      await dbService.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[confirm-sales-order]', err);
    if (msg.startsWith('Insufficient warehouse stock')) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
