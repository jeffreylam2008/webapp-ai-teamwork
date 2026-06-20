import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

/**
 * GET /api/transactions/po-received/[poCode]
 * Returns received quantities per item from all GRNs linked to this PO (refer_code = poCode),
 * plus GRN count and list of GRN trans_codes for the PO.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poCode: string }> }
) {
  try {
    const { poCode } = await params;
    if (!poCode) {
      return NextResponse.json(
        { success: false, error: 'PO code is required' },
        { status: 400 }
      );
    }

    // All non-void GRN headers that reference this PO (voided GRNs do not count as received)
    const grnHeaders = await dbService.query<{ trans_code: string }>(
      `SELECT trans_code FROM t_transaction_h
       WHERE prefix = 'GRN' AND refer_code = ? AND (is_void = 0 OR is_void IS NULL)
       ORDER BY create_date ASC`,
      [poCode]
    );
    const grnCodes = (grnHeaders.data || []).map((r) => r.trans_code);
    const grnCount = grnCodes.length;

    if (grnCount === 0) {
      return NextResponse.json({
        success: true,
        receivedPerItem: {} as Record<string, number>,
        grnCount: 0,
        grnTransCodes: [],
      });
    }

    // Sum received qty per item from all GRN details (trans_code IN grnCodes)
    const placeholders = grnCodes.map(() => '?').join(',');
    const sumResult = await dbService.query<{ item_code: string; total_qty: number }>(
      `SELECT item_code, COALESCE(SUM(qty), 0) as total_qty
       FROM t_transaction_d
       WHERE trans_code IN (${placeholders})
       GROUP BY item_code`,
      grnCodes
    );

    const receivedPerItem: Record<string, number> = {};
    for (const row of sumResult.data || []) {
      receivedPerItem[row.item_code] = Number(row.total_qty || 0);
    }

    return NextResponse.json({
      success: true,
      receivedPerItem,
      grnCount,
      grnTransCodes: grnCodes,
    });
  } catch (error) {
    console.error('[API] po-received error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
