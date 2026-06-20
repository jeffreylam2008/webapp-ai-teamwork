import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { clearSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { rollbackQuotationIfSalesOrderFromConversion } from '@/lib/salesOrderQuotationRollback';

/**
 * POST /api/transactions/void-sales-order
 * Body: { transCode: string }
 *
 * Voids the sales order and, if it was created from a quotation, rolls back that quotation's conversion
 * (is_convert = 0, refer_code restored from the SO). Clears draft warehouse holds for the SO.
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
    }>('SELECT prefix, is_void, is_settle FROM t_transaction_h WHERE trans_code = ? LIMIT 1', [transCode]);

    const row = hdr.data?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: 'Sales order not found' }, { status: 404 });
    }

    if (String(row.prefix || '').trim().toUpperCase() !== 'SO') {
      return NextResponse.json({ success: false, error: 'Not a sales order transaction' }, { status: 400 });
    }

    if (Number(row.is_void ?? 0) === 1) {
      return NextResponse.json({ success: true, message: 'Sales order is already void', transCode });
    }

    if (Number(row.is_settle ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot void a confirmed sales order' },
        { status: 400 }
      );
    }

    await dbService.query('START TRANSACTION');
    await dbService.query(
      `UPDATE t_transaction_h SET is_void = 1, modify_date = NOW()
       WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO'`,
      [transCode]
    );
    await clearSalesOrderWarehouseStageHold(transCode);
    await rollbackQuotationIfSalesOrderFromConversion(transCode);
    await dbService.query('COMMIT');

    void logTransactionAction({
      request,
      action: 'VOID',
      transCode,
      prefix: 'SO',
    });

    return NextResponse.json({
      success: true,
      message: 'Sales order voided',
      transCode,
    });
  } catch (err) {
    try {
      await dbService.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[void-sales-order]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
