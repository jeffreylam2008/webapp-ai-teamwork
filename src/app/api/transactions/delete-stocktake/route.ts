import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import {
  assertDbPrefixPermission,
  forbiddenResponse,
  getAuthenticatedPermissionKeys,
} from '@/lib/transactionPermissionAuth';

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
    if (!assertDbPrefixPermission(authResult.keys, 'ST', 'delete')) {
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

    await dbService.query('START TRANSACTION');

    try {
      // Load header to verify it's a Stocktake (ST) and get shop_code
      const headerResult = await dbService.query<{
        prefix?: string;
        shop_code?: string;
      }>(
        'SELECT prefix, shop_code FROM t_transaction_h WHERE trans_code = ?',
        [transCode]
      );

      const header = headerResult.data?.[0];
      if (!header) {
        throw new Error(`Transaction ${transCode} not found`);
      }
      if (String(header.prefix).toUpperCase() !== 'ST') {
        throw new Error(`Transaction ${transCode} is not a Stocktake (ST)`);
      }

      const shopCode = header.shop_code || '';

      // Load details to compute per-item qty
      const detailsResult = await dbService.query<{
        item_code: string;
        qty: number;
      }>(
        'SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?',
        [transCode]
      );

      const qtyPerItem: Record<string, number> = {};
      for (const row of detailsResult.data || []) {
        const code = row.item_code || '';
        if (!code) continue;
        qtyPerItem[code] = (qtyPerItem[code] || 0) + Number(row.qty || 0);
      }

      // Reverse warehouse stock: ST creation already applied qty; deleting should subtract the same qty
      const itemCodes = Object.keys(qtyPerItem);
      for (const itemCode of itemCodes) {
        const qty = qtyPerItem[itemCode] || 0;
        if (qty === 0) continue;

        // Ensure row exists in t_warehouse
        await dbService.query(
          `INSERT INTO t_warehouse (item_code, qty, type, shop_code, create_date, modify_date)
           SELECT ?, 0, 'in', ?, NOW(), NOW()
           FROM (SELECT 1) x
           WHERE NOT EXISTS (SELECT 1 FROM t_warehouse WHERE item_code = ?)`,
          [itemCode, shopCode, itemCode]
        );

        // Reverse the quantity
        await dbService.query(
          'UPDATE t_warehouse SET qty = qty - ?, modify_date = NOW() WHERE item_code = ?',
          [qty, itemCode]
        );
      }

      // Delete details and header
      await dbService.query('DELETE FROM t_transaction_d WHERE trans_code = ?', [transCode]);
      await dbService.query('DELETE FROM t_transaction_h WHERE trans_code = ?', [transCode]);

      await dbService.query('COMMIT');
      void logTransactionAction({
        request,
        action: 'DELETE',
        transCode,
        prefix: 'ST',
      });

      return NextResponse.json({
        success: true,
        message: `Stocktake ${transCode} deleted and warehouse stock reversed.`,
      });
    } catch (inner) {
      await dbService.query('ROLLBACK');
      if (inner instanceof Error) {
        return NextResponse.json(
          { success: false, error: inner.message },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Failed to delete stocktake' },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

