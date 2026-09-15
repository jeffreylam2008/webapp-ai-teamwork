import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { getAuthenticatedPermissionKeys } from '@/lib/transactionPermissionAuth';
import {
  assertTransCodeInShopScope,
  shopScopeRequiredResponse,
} from '@/lib/shopScope';

/**
 * DELETE /api/transactions/[uid]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;
    if (!authResult.shopCode) return shopScopeRequiredResponse();

    const { uid } = await params;

    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Transaction UID is required' },
        { status: 400 }
      );
    }

    const hdr = await dbService.query<{ trans_code: string | null; shop_code: string | null }>(
      'SELECT trans_code, shop_code FROM t_transaction_h WHERE uid = ? LIMIT 1',
      [uid]
    );
    const row = hdr.data?.[0];
    if (!row?.trans_code) {
      return NextResponse.json({
        success: false,
        error: 'Transaction not found or already deleted',
      });
    }

    const scopeErr = await assertTransCodeInShopScope(String(row.trans_code), authResult.shopCode);
    if (scopeErr) return scopeErr;

    const result = await dbService.query(
      'DELETE FROM t_transaction_h WHERE uid = ? AND shop_code = ?',
      [uid, authResult.shopCode]
    );

    if (result.affectedRows && result.affectedRows > 0) {
      return NextResponse.json({
        success: true,
        message: 'Transaction deleted successfully',
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Transaction not found or already deleted',
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
