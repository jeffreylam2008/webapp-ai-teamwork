import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';

/**
 * POST /api/transactions/void-invoice
 * Body: { transCode: string }
 *
 * Marks an invoice (INV) header as void. Settled invoices cannot be voided.
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
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    if (String(row.prefix || '').trim().toUpperCase() !== 'INV') {
      return NextResponse.json({ success: false, error: 'Not an invoice transaction' }, { status: 400 });
    }

    if (Number(row.is_void ?? 0) === 1) {
      return NextResponse.json({ success: true, message: 'Invoice is already void', transCode });
    }

    if (Number(row.is_settle ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot void a settled invoice' },
        { status: 400 }
      );
    }

    await dbService.query(
      `UPDATE t_transaction_h SET is_void = 1, modify_date = NOW()
       WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'INV'`,
      [transCode]
    );

    void logTransactionAction({
      request,
      action: 'VOID',
      transCode,
      prefix: 'INV',
    });

    return NextResponse.json({
      success: true,
      message: 'Invoice voided',
      transCode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[void-invoice]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
