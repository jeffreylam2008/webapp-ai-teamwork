import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import { PREFIX_REF, bindEqualsStoredPrefixRef, matchesPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';

/**
 * DELETE /api/transactions/delete-quotation
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
      is_convert: number | null;
    }>(
      `SELECT trans_code, prefix, prefix_ref, is_convert FROM t_transaction_h WHERE trans_code = ?`,
      [transCode]
    );

    const header = headerResult.data?.[0];
    if (!header) {
      return NextResponse.json({ success: false, error: 'Quotation not found' }, { status: 404 });
    }

    if (!matchesPrefixRef(header.prefix, header.prefix_ref, PREFIX_REF.QTA)) {
      return NextResponse.json(
        { success: false, error: 'Only quotation (QTA) transactions can be deleted here' },
        { status: 400 }
      );
    }

    if (Number(header.is_convert) === 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete a quotation that has been converted to a Sales Order',
        },
        { status: 400 }
      );
    }

    await dbService.query('DELETE FROM t_transaction_t WHERE trans_code = ?', [transCode]);
    await dbService.query('DELETE FROM t_transaction_d WHERE trans_code = ?', [transCode]);
    const delH = await dbService.query('DELETE FROM t_transaction_h WHERE trans_code = ?', [transCode]);

    if (!delH.affectedRows || delH.affectedRows < 1) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete quotation header' },
        { status: 500 }
      );
    }

    void logTransactionAction({
      request,
      action: 'DELETE',
      transCode,
      prefix: PREFIX_REF.QTA,
    });
    return NextResponse.json({
      success: true,
      message: `Quotation ${transCode} deleted successfully`,
    });
  } catch (error) {
    console.error('[API] delete-quotation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete quotation' },
      { status: 500 }
    );
  }
}
