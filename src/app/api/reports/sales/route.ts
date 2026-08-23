import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTimestamp } from '@/lib/datetime';
import {
  getAuthenticatedPermissionKeys,
  forbiddenResponse,
} from '@/lib/transactionPermissionAuth';
import {
  PREFIX_REF,
  bindEqualsStoredPrefixRef,
  sqlEqualsStoredPrefixRef,
  sqlPrefixInList,
} from '@/lib/prefixRef';

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
    WHERE UPPER(TRIM(COALESCE(h2.prefix, ''))) IN ${sqlPrefixInList([PREFIX_REF.GRN])}
      AND COALESCE(h2.is_void, 0) = 0
  ) ranked
  WHERE rn = 1
`;

type ReportRow = Record<string, unknown> & {
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  details?: Record<string, unknown>[];
  invoices?: ReportRow[];
};

function buildWhereClause(
  startDate: string,
  endDate: string,
  shopCode: string
): { clause: string; params: string[] } {
  const params: string[] = [...bindEqualsStoredPrefixRef(PREFIX_REF.INV)];
  let clause = `${sqlEqualsStoredPrefixRef('h')} AND COALESCE(h.is_void, 0) = 0`;

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

function mapMoneyRow(row: Record<string, unknown>): ReportRow {
  const sales = Number(row.sales_amount || 0);
  const cost = Number(row.cost_amount || 0);
  return {
    ...row,
    sales_amount: sales,
    cost_amount: cost,
    gross_profit: sales - cost,
  };
}

async function attachInvoiceLineDetails(invoiceRows: ReportRow[]): Promise<ReportRow[]> {
  if (invoiceRows.length === 0) return invoiceRows;

  const transCodes = invoiceRows
    .map((r) => String(r.trans_code || '').trim())
    .filter(Boolean);
  if (transCodes.length === 0) {
    return invoiceRows.map((row) => ({ ...row, details: [] }));
  }

  const placeholders = transCodes.map(() => '?').join(', ');
  const linesResult = await dbService.query<Record<string, unknown>>(
    `SELECT
      d.uid,
      d.trans_code,
      d.item_code,
      d.eng_name,
      d.chi_name,
      d.unit,
      d.qty,
      d.price,
      d.discount,
      COALESCE(${LINE_SALES_EXPR}, 0) AS sales_amount,
      COALESCE(d.qty * COALESCE(gc.unit_cost, 0), 0) AS cost_amount,
      COALESCE(gc.unit_cost, 0) AS unit_cost
     FROM t_transaction_d d
     LEFT JOIN (${LATEST_GRN_COST_SUBQUERY}) gc ON gc.item_code = d.item_code
     WHERE d.trans_code IN (${placeholders})
     ORDER BY d.trans_code, d.uid`,
    transCodes
  );

  const linesByTrans = new Map<string, Record<string, unknown>[]>();
  for (const line of linesResult.data || []) {
    const code = String(line.trans_code || '').trim();
    if (!code) continue;
    const sales = Number(line.sales_amount || 0);
    const cost = Number(line.cost_amount || 0);
    const mapped = {
      uid: line.uid,
      item_code: line.item_code,
      eng_name: line.eng_name,
      chi_name: line.chi_name,
      unit: line.unit,
      qty: Number(line.qty || 0),
      price: Number(line.price || 0),
      discount: Number(line.discount || 0),
      unit_cost: Number(line.unit_cost || 0),
      sales_amount: sales,
      cost_amount: cost,
      gross_profit: sales - cost,
    };
    const list = linesByTrans.get(code) || [];
    list.push(mapped);
    linesByTrans.set(code, list);
  }

  return invoiceRows.map((row) => {
    const code = String(row.trans_code || '').trim();
    return {
      ...row,
      details: linesByTrans.get(code) || [],
    };
  });
}

async function loadInvoicesForCustomers(
  whereClause: string,
  whereParams: string[],
  customerCodes: string[]
): Promise<Map<string, ReportRow[]>> {
  const byCustomer = new Map<string, ReportRow[]>();
  if (customerCodes.length === 0) return byCustomer;

  const placeholders = customerCodes.map(() => '?').join(', ');
  const invoiceResult = await dbService.query<Record<string, unknown>>(
    `SELECT
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
       AND h.cust_code IN (${placeholders})
     GROUP BY
       h.trans_code,
       h.create_date,
       h.cust_code,
       c.name,
       h.shop_code,
       s.name
     ORDER BY h.create_date DESC`,
    [...whereParams, ...customerCodes]
  );

  let invoices = (invoiceResult.data || []).map(mapMoneyRow);
  invoices = await attachInvoiceLineDetails(invoices);

  for (const inv of invoices) {
    const cust = String(inv.customer_code || '').trim();
    const list = byCustomer.get(cust) || [];
    list.push(inv);
    byCustomer.set(cust, list);
  }

  return byCustomer;
}

type GroupByMode =
  | 'invoice'
  | 'invoice_detail'
  | 'customer'
  | 'customer_detail'
  | 'product';

function parseGroupBy(raw: string): GroupByMode {
  const value = raw.trim().toLowerCase();
  if (value === 'invoice_detail') return 'invoice_detail';
  if (value === 'customer') return 'customer';
  if (value === 'customer_detail') return 'customer_detail';
  if (value === 'product' || value === 'item') return 'product';
  return 'invoice';
}

/**
 * GET /api/reports/sales?start_date=&end_date=&shop_code=&group_by=invoice|invoice_detail|customer|customer_detail|product&page=1&pageSize=50
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
    const groupBy = parseGroupBy(searchParams.get('group_by') || 'invoice');
    const isExport = searchParams.get('export') === '1';
    const page = isExport ? 1 : Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = isExport
      ? 10000
      : Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = isExport ? 0 : (page - 1) * pageSize;

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

    if (groupBy === 'product') {
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
    } else if (groupBy === 'customer' || groupBy === 'customer_detail') {
      countQuery = `
        SELECT COUNT(DISTINCT h.cust_code) AS total
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        WHERE ${whereClause}
          AND TRIM(COALESCE(h.cust_code, '')) <> ''
      `;

      dataQuery = `
        SELECT
          h.cust_code AS customer_code,
          c.name AS customer_name,
          COUNT(DISTINCT h.trans_code) AS invoice_count,
          COUNT(DISTINCT d.uid) AS line_count,
          COALESCE(SUM(${LINE_SALES_EXPR}), 0) AS sales_amount,
          COALESCE(SUM(d.qty * COALESCE(gc.unit_cost, 0)), 0) AS cost_amount
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        LEFT JOIN t_customers c ON c.cust_code = h.cust_code
        LEFT JOIN (${LATEST_GRN_COST_SUBQUERY}) gc ON gc.item_code = d.item_code
        WHERE ${whereClause}
          AND TRIM(COALESCE(h.cust_code, '')) <> ''
        GROUP BY h.cust_code, c.name
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

    let rows: ReportRow[] = (dataResult.data || []).map(mapMoneyRow);

    if (groupBy === 'invoice_detail' && rows.length > 0) {
      rows = await attachInvoiceLineDetails(rows);
    }

    if (groupBy === 'customer_detail' && rows.length > 0) {
      const customerCodes = rows
        .map((r) => String(r.customer_code || '').trim())
        .filter(Boolean);
      const invoicesByCustomer = await loadInvoicesForCustomers(
        whereClause,
        whereParams,
        customerCodes
      );
      rows = rows.map((row) => {
        const code = String(row.customer_code || '').trim();
        return {
          ...row,
          invoice_count: Number(row.invoice_count || 0),
          invoices: invoicesByCustomer.get(code) || [],
        };
      });
    }

    return NextResponse.json({
      success: true,
      summary: {
        invoice_count: invoiceCount,
        total_sales: totalSales,
        total_cost: totalCost,
        gross_profit: totalSales - totalCost,
      },
      data: rows,
      group_by: groupBy,
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
