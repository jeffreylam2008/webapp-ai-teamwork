import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { PREFIX_REF, bindEqualsStoredPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';
import { getAuthenticatedPermissionKeys } from '@/lib/transactionPermissionAuth';
import { assertTransCodeInShopScope, shopScopeRequiredResponse } from '@/lib/shopScope';

/**
 * GET /api/transactions/po-received/[poCode]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poCode: string }> }
) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;
    if (!authResult.shopCode) return shopScopeRequiredResponse();

    const { poCode } = await params;
    if (!poCode) {
      return NextResponse.json(
        { success: false, error: 'PO code is required' },
        { status: 400 }
      );
    }

    const scopeErr = await assertTransCodeInShopScope(poCode, authResult.shopCode);
    if (scopeErr) return scopeErr;

    const grnHeaders = await dbService.query<{ trans_code: string }>(
      `SELECT trans_code FROM t_transaction_h h
       WHERE ${sqlEqualsStoredPrefixRef('h')}
         AND refer_code = ?
         AND h.shop_code = ?
         AND (is_void = 0 OR is_void IS NULL)
       ORDER BY create_date ASC`,
      [...bindEqualsStoredPrefixRef(PREFIX_REF.GRN), poCode, authResult.shopCode]
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
