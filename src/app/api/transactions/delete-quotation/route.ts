import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';

/**
 * DELETE /api/transactions/delete-quotation
 * Body: { transCode: string }
 *
 * Removes a quotation (QTA) and its lines/payment rows.
 * Converted quotations (is_convert = 1) cannot be deleted.
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
      is_convert: number | null;
    }>(
      `SELECT trans_code, prefix, is_convert FROM t_transaction_h WHERE trans_code = ?`,
      [transCode]
    );

    const header = headerResult.data?.[0];
    if (!header) {
      return NextResponse.json({ success: false, error: 'Quotation not found' }, { status: 404 });
    }

    if (String(header.prefix).toUpperCase() !== 'QTA') {
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
      prefix: 'QTA',
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
