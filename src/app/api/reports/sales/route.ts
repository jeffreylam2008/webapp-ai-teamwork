import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTimestamp } from '@/lib/datetime';
import {
  getAuthenticatedPermissionKeys,
  forbiddenResponse,
} from '@/lib/transactionPermissionAuth';

const LINE_SALES_EXPR =
  'd.qty * d.price * (1 - COALESCE(d.discount, 0) / 100)';

const LATEST_GRN_COST_SUBQUERY = `
  SELECT item_code, unit_cost FROM (
    SELECT
      d2.item_code,
      d2.price AS unit_cost,
      ROW_NUMBER() OVER (
        PARTITION BY d2.item_code
        ORDER BY h2.create_date DESC, h2.uid DESC, d2.uid DESC
      ) AS rn
    FROM t_transaction_d d2
    INNER JOIN t_transaction_h h2 ON h2.trans_code = d2.trans_code
    WHERE UPPER(TRIM(COALESCE(h2.prefix, ''))) = 'GRN'
      AND COALESCE(h2.is_void, 0) = 0
  ) ranked
  WHERE rn = 1
`;

function buildWhereClause(
  startDate: string,
  endDate: string,
  shopCode: string
): { clause: string; params: string[] } {
  const params: string[] = [];
  let clause = `UPPER(TRIM(COALESCE(h.prefix, ''))) = 'INV'
    AND COALESCE(h.is_void, 0) = 0`;

  if (startDate) {
    clause += ' AND DATE(h.create_date) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    clause += ' AND DATE(h.create_date) <= ?';
    params.push(endDate);
  }
  if (shopCode) {
    clause += ' AND h.shop_code = ?';
    params.push(shopCode);
  }

  return { clause, params };
}

/**
 * GET /api/reports/sales?start_date=&end_date=&shop_code=&group_by=invoice|item&page=1&pageSize=50
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;

    if (!authResult.keys.has('view_sales_report')) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const startDate = (searchParams.get('start_date') || '').trim();
    const endDate = (searchParams.get('end_date') || '').trim();
    const shopCode = (searchParams.get('shop_code') || '').trim();
    const groupBy = (searchParams.get('group_by') || 'invoice').trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = (page - 1) * pageSize;

    const { clause: whereClause, params: whereParams } = buildWhereClause(
      startDate,
      endDate,
      shopCode
    );

    const summaryQuery = `
      SELECT
        COUNT(DISTINCT h.trans_code) AS invoice_count,
        COALESCE(SUM(${LINE_SALES_EXPR}), 0) AS total_sales,
        COALESCE(SUM(d.qty * COALESCE(gc.unit_cost, 0)), 0) AS total_cost
      FROM t_transaction_h h
      INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
      LEFT JOIN (${LATEST_GRN_COST_SUBQUERY}) gc ON gc.item_code = d.item_code
      WHERE ${whereClause}
    `;

    const summaryResult = await dbService.query<{
      invoice_count: number;
      total_sales: number;
      total_cost: number;
    }>(summaryQuery, whereParams);

    const summaryRow = summaryResult.data?.[0];
    const totalSales = Number(summaryRow?.total_sales || 0);
    const totalCost = Number(summaryRow?.total_cost || 0);
    const invoiceCount = Number(summaryRow?.invoice_count || 0);

    let dataQuery: string;
    let countQuery: string;

    if (groupBy === 'item') {
      countQuery = `
        SELECT COUNT(DISTINCT d.item_code) AS total
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        WHERE ${whereClause}
      `;

      dataQuery = `
        SELECT
          d.item_code,
          MAX(d.eng_name) AS eng_name,
          MAX(d.chi_name) AS chi_name,
          MAX(d.unit) AS unit,
          COALESCE(SUM(d.qty), 0) AS total_qty,
          COALESCE(SUM(${LINE_SALES_EXPR}), 0) AS sales_amount,
          COALESCE(SUM(d.qty * COALESCE(gc.unit_cost, 0)), 0) AS cost_amount,
          COALESCE(AVG(gc.unit_cost), 0) AS unit_cost
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        LEFT JOIN (${LATEST_GRN_COST_SUBQUERY}) gc ON gc.item_code = d.item_code
        WHERE ${whereClause}
        GROUP BY d.item_code
        ORDER BY sales_amount DESC
        LIMIT ? OFFSET ?
      `;
    } else {
      countQuery = `
        SELECT COUNT(DISTINCT h.trans_code) AS total
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        WHERE ${whereClause}
      `;

      dataQuery = `
        SELECT
          h.trans_code,
          h.create_date AS transaction_date,
          h.cust_code AS customer_code,
          c.name AS customer_name,
          h.shop_code,
          s.name AS shop_name,
          COUNT(DISTINCT d.uid) AS line_count,
          COALESCE(SUM(${LINE_SALES_EXPR}), 0) AS sales_amount,
          COALESCE(SUM(d.qty * COALESCE(gc.unit_cost, 0)), 0) AS cost_amount
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        LEFT JOIN t_customers c ON c.cust_code = h.cust_code
        LEFT JOIN t_shop s ON s.shop_code = h.shop_code
        LEFT JOIN (${LATEST_GRN_COST_SUBQUERY}) gc ON gc.item_code = d.item_code
        WHERE ${whereClause}
        GROUP BY
          h.trans_code,
          h.create_date,
          h.cust_code,
          c.name,
          h.shop_code,
          s.name
        ORDER BY h.create_date DESC
        LIMIT ? OFFSET ?
      `;
    }

    const countResult = await dbService.query<{ total: number }>(countQuery, whereParams);
    const total = Number(countResult.data?.[0]?.total || 0);

    const dataParams = [...whereParams, pageSize, offset];
    const dataResult = await dbService.query(dataQuery, dataParams);

    const rows = (dataResult.data || []).map((row: Record<string, unknown>) => {
      const sales = Number(row.sales_amount || 0);
      const cost = Number(row.cost_amount || 0);
      return {
        ...row,
        sales_amount: sales,
        cost_amount: cost,
        gross_profit: sales - cost,
      };
    });

    return NextResponse.json({
      success: true,
      summary: {
        invoice_count: invoiceCount,
        total_sales: totalSales,
        total_cost: totalCost,
        gross_profit: totalSales - totalCost,
      },
      data: rows,
      group_by: groupBy === 'item' ? 'item' : 'invoice',
      pagination: {
        current: page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
      timestamp: logTimestamp(),
    });
  } catch (error) {
    console.error('[API] sales report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to generate sales report: ${errorMessage}` },
      { status: 500 }
    );
  }
}
