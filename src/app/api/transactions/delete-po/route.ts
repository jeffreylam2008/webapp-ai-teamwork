import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import { PREFIX_REF, bindEqualsStoredPrefixRef, matchesPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';

/**
 * DELETE /api/transactions/delete-po
 * Body: { transCode: string }
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
      prefix_ref: string | null;
      is_settle: number | null;
    }>(
      'SELECT trans_code, prefix, prefix_ref, is_settle FROM t_transaction_h WHERE trans_code = ?',
      [transCode]
    );

    const header = headerResult.data?.[0];
    if (!header) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    if (!matchesPrefixRef(header.prefix, header.prefix_ref, PREFIX_REF.PO)) {
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

    const grnCheck = await dbService.query<{ trans_code: string }>(
      `SELECT trans_code
       FROM t_transaction_h h
       WHERE ${sqlEqualsStoredPrefixRef('h')}
         AND refer_code = ?
         AND (is_void IS NULL OR is_void = 0)
       LIMIT 1`,
      [...bindEqualsStoredPrefixRef(PREFIX_REF.GRN), transCode]
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
      prefix: PREFIX_REF.PO,
    });

    return NextResponse.json({
      success: true,
      message: `Purchase order ${transCode} deleted successfully`,
    });
  } catch (error) {
    console.error('[API] delete-po error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete purchase order' },
      { status: 500 }
    );
  }
}
