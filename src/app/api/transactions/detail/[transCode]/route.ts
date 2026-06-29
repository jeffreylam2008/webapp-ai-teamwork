import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import {
  assertDbPrefixPermission,
  forbiddenResponse,
  getAuthenticatedPermissionKeys,
} from '@/lib/transactionPermissionAuth';
import { ensureInvoiceSubtypeColumns } from '@/lib/ensureInvoiceSubtypeColumns';

async function ensureHeaderWhCodeColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_transaction_h'
       AND COLUMN_NAME = 'wh_code'`
  );
  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(`ALTER TABLE t_transaction_h ADD COLUMN wh_code VARCHAR(32) NULL`);
  }
}

/**
 * GET /api/transactions/detail/[transCode]
 * Returns transaction header, line details, and payment totals for invoices, quotations, and purchase orders.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ transCode: string }> }
) {
  try {
    const { transCode } = await context.params;
    if (!transCode) {
      return NextResponse.json(
        { success: false, error: 'Transaction code is required' },
        { status: 400 }
      );
    }

    await ensureHeaderWhCodeColumn();
    await ensureInvoiceSubtypeColumns();

    const headerResult = await dbService.query(
      `SELECT
        h.uid,
        h.trans_code,
        h.prefix,
        h.cust_code,
        h.supp_code,
        h.refer_code,
        h.quotation_code,
        h.total,
        h.employee_code,
        h.shop_code,
        h.wh_code,
        h.remark,
        h.is_void,
        h.is_convert,
        h.is_settle,
        h.invoice_subtype,
        h.billing_period_from,
        h.billing_period_to,
        h.create_date,
        h.modify_date,
        c.name AS customer_name,
        c.phone_1 AS customer_phone,
        c.email_1 AS customer_email,
        c.delivery_addr AS customer_delivery_addr,
        c.statement_remark AS customer_statement_remark,
        c.delivery_remark AS customer_delivery_remark,
        c.from_time AS customer_from_time,
        c.to_time AS customer_to_time,
        c.attn_1 AS customer_attn_1,
        sup.name AS supplier_name,
        s.name AS shop_name,
        s.phone AS shop_phone,
        CONCAT(IFNULL(s.address1, ''), ' ', IFNULL(s.address2, '')) AS shop_address,
        whs.name AS wh_name,
        tt.pm_code AS pm_code,
        pm.payment_method
      FROM t_transaction_h h
      LEFT JOIN t_customers c ON h.cust_code = c.cust_code
      LEFT JOIN t_suppliers sup ON h.supp_code = sup.supp_code
      LEFT JOIN t_shop s ON h.shop_code = s.shop_code
      LEFT JOIN t_shop whs ON h.wh_code = whs.shop_code
      LEFT JOIN (
        SELECT trans_code, pm_code
        FROM t_transaction_t
        WHERE trans_code = ?
        LIMIT 1
      ) tt ON h.trans_code = tt.trans_code
      LEFT JOIN t_payment_method pm ON tt.pm_code = pm.pm_code
      WHERE h.trans_code = ?`,
      [transCode, transCode]
    );

    const headerRows = headerResult.data as Record<string, unknown>[] | undefined;
    if (!headerRows || headerRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const header = headerRows[0];

    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;
    const prefix = String(header?.prefix ?? '').trim();
    if (
      prefix &&
      !assertDbPrefixPermission(authResult.keys, prefix, 'view')
    ) {
      return forbiddenResponse('You do not have permission to view this transaction');
    }

    void logTransactionAction({
      request,
      action: 'VIEW',
      transCode,
      prefix: typeof header?.prefix === 'string' ? header.prefix : undefined,
    });

    const detailsResult = await dbService.query(
      `SELECT uid, trans_code, item_code, eng_name, chi_name, qty, pstock, unit, price, discount, create_date, modify_date
       FROM t_transaction_d
       WHERE trans_code = ?
       ORDER BY uid`,
      [transCode]
    );
    const details = (detailsResult.data as Record<string, unknown>[]) || [];

    const paymentTotalsResult = await dbService.query(
      `SELECT t.uid, t.trans_code, t.pm_code, t.total AS payment_amount, pm.payment_method, t.create_date, t.modify_date
       FROM t_transaction_t t
       LEFT JOIN t_payment_method pm ON t.pm_code = pm.pm_code
       WHERE t.trans_code = ?
       ORDER BY t.uid`,
      [transCode]
    );
    const paymentTotals = (paymentTotalsResult.data as Record<string, unknown>[]) || [];

    return NextResponse.json({
      success: true,
      header,
      details,
      paymentTotals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Transaction detail error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch transaction details',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
