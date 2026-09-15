import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import {
  assertDbPrefixPermission,
  forbiddenResponse,
  getAuthenticatedPermissionKeys,
} from '@/lib/transactionPermissionAuth';
import { PREFIX_REF, matchesPrefixRef } from '@/lib/prefixRef';
import { shopScopeRequiredResponse } from '@/lib/shopScope';

/**
 * DELETE /api/transactions/delete-stocktake
 * Body: { transCode: string }
 *
 * For Stocktake (ST) only:
 * - Reverse warehouse stock effect of the stocktake
 * - Delete header and details rows from t_transaction_h / t_transaction_d
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;
    if (!authResult.shopCode) return shopScopeRequiredResponse();
    if (!assertDbPrefixPermission(authResult.keys, PREFIX_REF.ST, 'delete')) {
      return forbiddenResponse('You do not have permission to delete stocktake');
    }

    const body = await request.json();
    const transCode = (body?.transCode || '').toString().trim();

    if (!transCode) {
      return NextResponse.json(
        { success: false, error: 'transCode is required' },
        { status: 400 }
      );
    }

    await dbService.withTransaction(async () => {
      const headerResult = await dbService.query<{
        prefix?: string;
        prefix_ref?: string | null;
        shop_code?: string;
      }>(
        'SELECT prefix, prefix_ref, shop_code FROM t_transaction_h WHERE trans_code = ? AND shop_code = ?',
        [transCode, authResult.shopCode]
      );

      const header = headerResult.data?.[0];
      if (!header) {
        throw new Error(`Transaction ${transCode} not found`);
      }
      if (!matchesPrefixRef(header.prefix, header.prefix_ref, PREFIX_REF.ST)) {
        throw new Error(`Transaction ${transCode} is not a Stocktake (ST)`);
      }

      const shopCode = header.shop_code || '';

      const detailsResult = await dbService.query<{
        item_code: string;
        qty: number;
      }>('SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?', [transCode]);

      const qtyPerItem: Record<string, number> = {};
      for (const row of detailsResult.data || []) {
        const code = row.item_code || '';
        if (!code) continue;
        qtyPerItem[code] = (qtyPerItem[code] || 0) + Number(row.qty || 0);
      }

      const itemCodes = Object.keys(qtyPerItem);
      for (const itemCode of itemCodes) {
        const qty = qtyPerItem[itemCode] || 0;
        if (qty === 0) continue;

        await dbService.query(
          `INSERT INTO t_warehouse (item_code, qty, type, shop_code, create_date, modify_date)
           SELECT ?, 0, 'in', ?, NOW(), NOW()
           FROM (SELECT 1) x
           WHERE NOT EXISTS (SELECT 1 FROM t_warehouse WHERE item_code = ?)`,
          [itemCode, shopCode, itemCode]
        );

        await dbService.query(
          'UPDATE t_warehouse SET qty = qty - ?, modify_date = NOW() WHERE item_code = ?',
          [qty, itemCode]
        );
      }

      await dbService.query('DELETE FROM t_transaction_d WHERE trans_code = ?', [transCode]);
      await dbService.query(
        'DELETE FROM t_transaction_h WHERE trans_code = ? AND shop_code = ?',
        [transCode, authResult.shopCode]
      );
    });

    void logTransactionAction({
      request,
      action: 'DELETE',
      transCode,
      prefix: PREFIX_REF.ST,
    });

    return NextResponse.json({
      success: true,
      message: `Stocktake ${transCode} deleted and warehouse stock reversed.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    const status =
      msg.includes('not found') || msg.includes('not a Stocktake') ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
