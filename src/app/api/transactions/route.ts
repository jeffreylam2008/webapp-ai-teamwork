import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTransactionAction } from '@/lib/audit';
import {
  filterDbPrefixesByView,
  getAuthenticatedPermissionKeys,
} from '@/lib/transactionPermissionAuth';
import { ensureInvoiceSubtypeColumns } from '@/lib/ensureInvoiceSubtypeColumns';

/**
 * GET /api/transactions?prefix=INV|QTA|PO|...&page=1&pageSize=20&start_date=&end_date=&search=
 * List transactions by prefix(es) with pagination and optional date range and search.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;

    const { searchParams } = new URL(request.url);
    const prefixParam = searchParams.get('prefix') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const search = searchParams.get('search') || '';
    const referCode = searchParams.get('refer_code') || '';
    const isSettleParam = searchParams.get('is_settle');
    const isVoidParam = searchParams.get('is_void');
    const invoiceSubtypeParam = searchParams.get('invoice_subtype') || '';

    await ensureInvoiceSubtypeColumns();

    const requestedPrefixes = prefixParam
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);

    if (requestedPrefixes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one prefix is required (e.g. prefix=INV or prefix=PO,QTA)' },
        { status: 400 }
      );
    }

    const prefixes = filterDbPrefixesByView(authResult.keys, requestedPrefixes);
    if (prefixes.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: {
          current: page,
          pageSize,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const placeholders = prefixes.map(() => '?').join(',');
    const params: (string | number)[] = [...prefixes];

    let whereClause = `UPPER(TRIM(COALESCE(h.prefix, ''))) IN (${placeholders})`;
    const countParams: (string | number)[] = [...prefixes];

    if (startDate) {
      whereClause += ' AND DATE(h.create_date) >= ?';
      params.push(startDate);
      countParams.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND DATE(h.create_date) <= ?';
      params.push(endDate);
      countParams.push(endDate);
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereClause += ` AND (
        h.trans_code LIKE ? OR h.refer_code LIKE ? OR
        c.name LIKE ? OR s.name LIKE ? OR sup.name LIKE ? OR
        h.cust_code LIKE ? OR h.supp_code LIKE ? OR h.shop_code LIKE ?
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (referCode && referCode.trim()) {
      whereClause += ' AND h.refer_code = ?';
      params.push(referCode.trim());
      countParams.push(referCode.trim());
    }
    if (isSettleParam === '0' || isSettleParam === '1') {
      whereClause += ' AND COALESCE(h.is_settle, 0) = ?';
      const v = Number(isSettleParam);
      params.push(v);
      countParams.push(v);
    }
    if (isVoidParam === '0' || isVoidParam === '1') {
      whereClause += ' AND COALESCE(h.is_void, 0) = ?';
      const v = Number(isVoidParam);
      params.push(v);
      countParams.push(v);
    }
    if (invoiceSubtypeParam && invoiceSubtypeParam.trim()) {
      whereClause += ' AND COALESCE(h.invoice_subtype, \'standard\') = ?';
      params.push(invoiceSubtypeParam.trim().toLowerCase());
      countParams.push(invoiceSubtypeParam.trim().toLowerCase());
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM t_transaction_h h
      LEFT JOIN t_customers c ON h.cust_code = c.cust_code
      LEFT JOIN t_suppliers sup ON h.supp_code = sup.supp_code
      LEFT JOIN t_shop s ON h.shop_code = s.shop_code
      WHERE ${whereClause}
    `;
    const countResult = await dbService.query<{ total: number }>(countQuery, countParams);
    const total = (countResult.data && countResult.data[0]?.total) || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    const dataQuery = `
      SELECT
        h.uid,
        h.trans_code as transaction_id,
        h.create_date as transaction_date,
        h.prefix as transaction_type,
        h.cust_code as customer_code,
        c.name as customer_name,
        c.phone_1 as customer_phone,
        h.supp_code,
        sup.name as supplier_name,
        sup.phone_1 as supplier_phone,
        h.refer_code as reference_no,
        h.quotation_code,
        h.total as total_amount,
        h.create_date,
        h.modify_date,
        h.shop_code,
        s.name as shop_name,
        h.is_void,
        h.is_settle,
        h.is_convert,
        h.invoice_subtype,
        h.billing_period_from,
        h.billing_period_to,
        CASE WHEN h.prefix = 'PO' THEN IF(
          NOT EXISTS (
            SELECT 1
            FROM t_transaction_d pod
            WHERE pod.trans_code = h.trans_code
            GROUP BY pod.item_code
            HAVING COALESCE(SUM(pod.qty), 0) > 0
              AND COALESCE(SUM(pod.qty), 0) > COALESCE((
                SELECT SUM(gd.qty)
                FROM t_transaction_h gh
                INNER JOIN t_transaction_d gd ON gd.trans_code = gh.trans_code
                WHERE gh.prefix = 'GRN'
                  AND gh.refer_code = h.trans_code
                  AND (gh.is_void = 0 OR gh.is_void IS NULL)
                  AND gd.item_code = pod.item_code
              ), 0)
          ),
          1,
          0
        ) ELSE NULL END AS po_fully_grn_received,
        (SELECT GROUP_CONCAT(pm.payment_method ORDER BY tt.uid SEPARATOR ', ')
         FROM t_transaction_t tt
         LEFT JOIN t_payment_method pm ON tt.pm_code = pm.pm_code
         WHERE tt.trans_code = h.trans_code) AS payment_method
      FROM t_transaction_h h
      LEFT JOIN t_customers c ON h.cust_code = c.cust_code
      LEFT JOIN t_suppliers sup ON h.supp_code = sup.supp_code
      LEFT JOIN t_shop s ON h.shop_code = s.shop_code
      WHERE ${whereClause}
      ORDER BY h.create_date DESC
      LIMIT ? OFFSET ?
    `;
    const dataResult = await dbService.query<Record<string, unknown>>(dataQuery, [...params, pageSize, offset]);
    const data = (dataResult.data || []).map((row) => {
      const isVoid = Number(row.is_void ?? 0) === 1;
      const isSettle = Number(row.is_settle ?? 0) === 1;
      const isConvert = Number(row.is_convert ?? 0) === 1;
      let status: string;
      if (isVoid) status = 'Void';
      else if (isSettle) status = 'Settled';
      else if (isConvert) status = 'Converted';
      else if (String(row.transaction_type || '').trim().toUpperCase() === 'SO') status = 'Draft';
      else status = 'Active';
      return {
        ...row,
        status,
        is_settle: row.is_settle ?? 0,
        po_fully_grn_received:
          row.transaction_type === 'PO'
            ? Number(row.po_fully_grn_received ?? 0) === 1
              ? 1
              : 0
            : 0,
      };
    });

    void logTransactionAction({
      request,
      action: 'SEARCH',
      prefix: prefixes.length === 1 ? prefixes[0] : undefined,
      details: {
        prefixes,
        page,
        pageSize,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        hasSearch: !!(search && search.trim()),
        referCode: referCode || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        current: page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Transactions list error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch transactions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
