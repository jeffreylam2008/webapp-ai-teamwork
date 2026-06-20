import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';

/**
 * DELETE /api/transactions/delete-po
 * Body: { transCode: string }
 *
 * Removes a purchase order (PO) and its lines/payment rows.
 * Safety rules:
 * - prefix must be PO
 * - settled PO (is_settle = 1) cannot be deleted
 * - PO with active GRN(s) referencing it cannot be deleted
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const transCode = (body?.transCode || '').toString().trim();

    if (!transCode) {
      return NextResponse.json({ success: false, error: 'transCode is required' }, { status: 400 });
    }

    const headerResult = await dbService.query<{
      trans_code: string;
      prefix: string;
      is_settle: number | null;
    }>('SELECT trans_code, prefix, is_settle FROM t_transaction_h WHERE trans_code = ?', [transCode]);

    const header = headerResult.data?.[0];
    if (!header) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    if (String(header.prefix).toUpperCase() !== 'PO') {
      return NextResponse.json(
        { success: false, error: 'Only purchase order (PO) transactions can be deleted here' },
        { status: 400 }
      );
    }

    if (Number(header.is_settle) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a settled purchase order' },
        { status: 400 }
      );
    }

    // Block deletion if there are active GRNs referencing this PO (refer_code = PO code)
    const grnCheck = await dbService.query<{ trans_code: string }>(
      `SELECT trans_code
       FROM t_transaction_h
       WHERE prefix = 'GRN' AND refer_code = ? AND (is_void IS NULL OR is_void = 0)
       LIMIT 1`,
      [transCode]
    );
    if ((grnCheck.data?.length || 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete PO with related GRN(s). Void/delete the GRN first.' },
        { status: 400 }
      );
    }

    await dbService.query('DELETE FROM t_transaction_t WHERE trans_code = ?', [transCode]);
    await dbService.query('DELETE FROM t_transaction_d WHERE trans_code = ?', [transCode]);
    const delH = await dbService.query('DELETE FROM t_transaction_h WHERE trans_code = ?', [transCode]);

    if (!delH.affectedRows || delH.affectedRows < 1) {
      return NextResponse.json({ success: false, error: 'Failed to delete PO header' }, { status: 500 });
    }

    void logTransactionAction({
      request,
      action: 'DELETE',
      transCode,
      prefix: 'PO',
    });

    return NextResponse.json({
      success: true,
      message: `Purchase order ${transCode} deleted successfully`,
    });
  } catch (error) {
    console.error('[API] delete-po error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete purchase order' }, { status: 500 });
  }
}

