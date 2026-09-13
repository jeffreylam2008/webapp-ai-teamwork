import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTimestamp } from '@/lib/datetime';
import {
  getAuthenticatedPermissionKeys,
  forbiddenResponse,
  filterDbPrefixesByView,
} from '@/lib/transactionPermissionAuth';
import {
  PREFIX_REF,
  bindParamsForPrefixRefMatch,
  sqlJoinPrefixDisplay,
  sqlPrefixInList,
  sqlSelectDisplayPrefix,
  sqlStoredPrefixKey,
} from '@/lib/prefixRef';

const ALL_WAREHOUSE_PREFIXES = [
  PREFIX_REF.GRN,
  PREFIX_REF.DN,
  PREFIX_REF.ST,
  PREFIX_REF.ADJ,
] as const;

/** Qty into warehouse from a line */
const QTY_IN_EXPR = `CASE
  WHEN UPPER(TRIM(COALESCE(h.prefix, ''))) IN ${sqlPrefixInList([PREFIX_REF.GRN])} THEN GREATEST(COALESCE(d.qty, 0), 0)
  WHEN UPPER(TRIM(COALESCE(h.prefix, ''))) IN ${sqlPrefixInList([PREFIX_REF.ADJ, PREFIX_REF.ST])} AND COALESCE(d.qty, 0) > 0 THEN d.qty
  ELSE 0
END`;

/** Qty out of warehouse from a line */
const QTY_OUT_EXPR = `CASE
  WHEN UPPER(TRIM(COALESCE(h.prefix, ''))) IN ${sqlPrefixInList([PREFIX_REF.DN])} THEN GREATEST(COALESCE(d.qty, 0), 0)
  WHEN UPPER(TRIM(COALESCE(h.prefix, ''))) IN ${sqlPrefixInList([PREFIX_REF.ADJ, PREFIX_REF.ST])} AND COALESCE(d.qty, 0) < 0 THEN ABS(d.qty)
  ELSE 0
END`;

type ReportRow = Record<string, unknown> & {
  qty_in: number;
  qty_out: number;
  net_qty: number;
  details?: Record<string, unknown>[];
  documents?: ReportRow[];
};

type GroupByMode =
  | 'document'
  | 'document_detail'
  | 'movement'
  | 'movement_detail'
  | 'product';

function parseGroupBy(raw: string): GroupByMode {
  const value = raw.trim().toLowerCase();
  if (value === 'document_detail') return 'document_detail';
  if (value === 'movement') return 'movement';
  if (value === 'movement_detail') return 'movement_detail';
  if (value === 'product' || value === 'item') return 'product';
  return 'document';
}

function buildWhereClause(
  startDate: string,
  endDate: string,
  shopCode: string,
  prefixes: string[]
): { clause: string; params: string[] } {
  const { sql: prefixSql, params } = bindParamsForPrefixRefMatch(prefixes, 'h');
  let clause = `${prefixSql} AND COALESCE(h.is_void, 0) = 0`;

  if (startDate) {
    clause += ' AND DATE(h.create_date) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    clause += ' AND DATE(h.create_date) <= ?';
    params.push(endDate);
  }
  if (shopCode) {
    clause += ` AND COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code) = ?`;
    params.push(shopCode);
  }

  return { clause, params };
}

function mapQtyRow(row: Record<string, unknown>): ReportRow {
  const qtyIn = Number(row.qty_in || 0);
  const qtyOut = Number(row.qty_out || 0);
  return {
    ...row,
    qty_in: qtyIn,
    qty_out: qtyOut,
    net_qty: Number(row.net_qty != null ? row.net_qty : qtyIn - qtyOut),
  };
}

async function attachDocumentLineDetails(documentRows: ReportRow[]): Promise<ReportRow[]> {
  if (documentRows.length === 0) return documentRows;

  const transCodes = documentRows
    .map((r) => String(r.trans_code || '').trim())
    .filter(Boolean);
  if (transCodes.length === 0) {
    return documentRows.map((row) => ({ ...row, details: [] }));
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
      h.prefix,
      COALESCE(${QTY_IN_EXPR}, 0) AS qty_in,
      COALESCE(${QTY_OUT_EXPR}, 0) AS qty_out
     FROM t_transaction_d d
     INNER JOIN t_transaction_h h ON h.trans_code = d.trans_code
     WHERE d.trans_code IN (${placeholders})
     ORDER BY d.trans_code, d.uid`,
    transCodes
  );

  const linesByTrans = new Map<string, Record<string, unknown>[]>();
  for (const line of linesResult.data || []) {
    const code = String(line.trans_code || '').trim();
    if (!code) continue;
    const qtyIn = Number(line.qty_in || 0);
    const qtyOut = Number(line.qty_out || 0);
    const mapped = {
      uid: line.uid,
      item_code: line.item_code,
      eng_name: line.eng_name,
      chi_name: line.chi_name,
      unit: line.unit,
      qty: Number(line.qty || 0),
      price: Number(line.price || 0),
      prefix: line.prefix,
      qty_in: qtyIn,
      qty_out: qtyOut,
      net_qty: qtyIn - qtyOut,
    };
    const list = linesByTrans.get(code) || [];
    list.push(mapped);
    linesByTrans.set(code, list);
  }

  return documentRows.map((row) => {
    const code = String(row.trans_code || '').trim();
    return {
      ...row,
      details: linesByTrans.get(code) || [],
    };
  });
}

async function loadDocumentsForMovements(
  whereClause: string,
  whereParams: string[]
): Promise<Map<string, ReportRow[]>> {
  const byMovement = new Map<string, ReportRow[]>();

  const result = await dbService.query<Record<string, unknown>>(
    `SELECT
      h.trans_code,
      h.create_date AS transaction_date,
      ${sqlStoredPrefixKey('h', 'prefix_key')},
      ${sqlSelectDisplayPrefix('h', 'p')},
      h.refer_code,
      h.supp_code AS supplier_code,
      h.cust_code AS customer_code,
      COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code) AS shop_code,
      s.name AS shop_name,
      COUNT(DISTINCT d.uid) AS line_count,
      COALESCE(SUM(${QTY_IN_EXPR}), 0) AS qty_in,
      COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS qty_out
     FROM t_transaction_h h
     INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
     ${sqlJoinPrefixDisplay('h', 'p')}
     LEFT JOIN t_shop s ON s.shop_code = COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code)
     WHERE ${whereClause}
     GROUP BY
       h.trans_code,
       h.create_date,
       h.prefix,
       h.prefix_ref,
       p.prefix,
       h.refer_code,
       h.supp_code,
       h.cust_code,
       COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code),
       s.name
     ORDER BY h.create_date DESC`,
    whereParams
  );

  let documents = (result.data || []).map(mapQtyRow);
  documents = await attachDocumentLineDetails(documents);

  for (const doc of documents) {
    const prefixKey = String(doc.prefix_key || doc.prefix || '').trim().toUpperCase();
    if (!prefixKey) continue;
    const list = byMovement.get(prefixKey) || [];
    list.push(doc);
    byMovement.set(prefixKey, list);
  }

  return byMovement;
}

/**
 * GET /api/reports/warehouse?start_date=&end_date=&shop_code=&prefix=&group_by=document|document_detail|movement|movement_detail|product&page=1&pageSize=50
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;

    if (!authResult.keys.has('view_warehouse_report')) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const startDate = (searchParams.get('start_date') || '').trim();
    const endDate = (searchParams.get('end_date') || '').trim();
    const shopCode = (searchParams.get('shop_code') || '').trim();
    const groupBy = parseGroupBy(searchParams.get('group_by') || 'document');
    const isExport = searchParams.get('export') === '1';
    const page = isExport ? 1 : Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = isExport
      ? 10000
      : Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = isExport ? 0 : (page - 1) * pageSize;

    const prefixParam = (searchParams.get('prefix') || '').trim().toUpperCase();
    const requestedPrefixes = prefixParam
      ? prefixParam.split(',').map((p) => p.trim()).filter(Boolean)
      : [...ALL_WAREHOUSE_PREFIXES];
    const prefixes = filterDbPrefixesByView(authResult.keys, requestedPrefixes);

    if (prefixes.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          document_count: 0,
          qty_in: 0,
          qty_out: 0,
          net_qty: 0,
        },
        data: [],
        group_by: groupBy,
        prefixes: [],
        pagination: {
          current: 1,
          pageSize,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
        timestamp: logTimestamp(),
      });
    }

    const { clause: whereClause, params: whereParams } = buildWhereClause(
      startDate,
      endDate,
      shopCode,
      prefixes
    );

    const summaryQuery = `
      SELECT
        COUNT(DISTINCT h.trans_code) AS document_count,
        COALESCE(SUM(${QTY_IN_EXPR}), 0) AS qty_in,
        COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS qty_out
      FROM t_transaction_h h
      INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
      WHERE ${whereClause}
    `;

    const summaryResult = await dbService.query<{
      document_count: number;
      qty_in: number;
      qty_out: number;
    }>(summaryQuery, whereParams);

    const summaryRow = summaryResult.data?.[0];
    const documentCount = Number(summaryRow?.document_count || 0);
    const totalQtyIn = Number(summaryRow?.qty_in || 0);
    const totalQtyOut = Number(summaryRow?.qty_out || 0);

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
          COALESCE(SUM(${QTY_IN_EXPR}), 0) AS qty_in,
          COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS qty_out,
          COALESCE(SUM(${QTY_IN_EXPR}), 0) - COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS net_qty,
          COUNT(DISTINCT h.trans_code) AS document_count
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        WHERE ${whereClause}
        GROUP BY d.item_code
        ORDER BY ABS(COALESCE(SUM(${QTY_IN_EXPR}), 0) - COALESCE(SUM(${QTY_OUT_EXPR}), 0)) DESC
        LIMIT ? OFFSET ?
      `;
    } else if (groupBy === 'movement' || groupBy === 'movement_detail') {
      countQuery = `
        SELECT COUNT(DISTINCT UPPER(TRIM(COALESCE(NULLIF(TRIM(h.prefix_ref), ''), h.prefix)))) AS total
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        WHERE ${whereClause}
      `;

      dataQuery = `
        SELECT
          ${sqlStoredPrefixKey('h', 'prefix_key')},
          ${sqlSelectDisplayPrefix('h', 'p')},
          COUNT(DISTINCT h.trans_code) AS document_count,
          COUNT(DISTINCT d.uid) AS line_count,
          COALESCE(SUM(${QTY_IN_EXPR}), 0) AS qty_in,
          COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS qty_out,
          COALESCE(SUM(${QTY_IN_EXPR}), 0) - COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS net_qty
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        ${sqlJoinPrefixDisplay('h', 'p')}
        WHERE ${whereClause}
        GROUP BY
          UPPER(TRIM(COALESCE(NULLIF(TRIM(h.prefix_ref), ''), h.prefix))),
          p.prefix
        ORDER BY prefix ASC
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
          ${sqlSelectDisplayPrefix('h', 'p')},
          h.refer_code,
          h.supp_code AS supplier_code,
          sp.name AS supplier_name,
          h.cust_code AS customer_code,
          c.name AS customer_name,
          COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code) AS shop_code,
          s.name AS shop_name,
          COUNT(DISTINCT d.uid) AS line_count,
          COALESCE(SUM(${QTY_IN_EXPR}), 0) AS qty_in,
          COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS qty_out,
          COALESCE(SUM(${QTY_IN_EXPR}), 0) - COALESCE(SUM(${QTY_OUT_EXPR}), 0) AS net_qty
        FROM t_transaction_h h
        INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
        ${sqlJoinPrefixDisplay('h', 'p')}
        LEFT JOIN t_shop s ON s.shop_code = COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code)
        LEFT JOIN t_suppliers sp ON sp.supp_code = h.supp_code
        LEFT JOIN t_customers c ON c.cust_code = h.cust_code
        WHERE ${whereClause}
        GROUP BY
          h.trans_code,
          h.create_date,
          h.prefix,
          h.prefix_ref,
          p.prefix,
          h.refer_code,
          h.supp_code,
          sp.name,
          h.cust_code,
          c.name,
          COALESCE(NULLIF(TRIM(h.wh_code), ''), h.shop_code),
          s.name
        ORDER BY h.create_date DESC
        LIMIT ? OFFSET ?
      `;
    }

    const countResult = await dbService.query<{ total: number }>(countQuery, whereParams);
    const total = Number(countResult.data?.[0]?.total || 0);

    const dataParams = [...whereParams, pageSize, offset];
    const dataResult = await dbService.query(dataQuery, dataParams);

    let rows: ReportRow[] = (dataResult.data || []).map(mapQtyRow);

    if (groupBy === 'document_detail' && rows.length > 0) {
      rows = await attachDocumentLineDetails(rows);
    }

    if (groupBy === 'movement_detail' && rows.length > 0) {
      const documentsByMovement = await loadDocumentsForMovements(whereClause, whereParams);
      rows = rows.map((row) => {
        const prefixKey = String(row.prefix_key || row.prefix || '').trim().toUpperCase();
        return {
          ...row,
          document_count: Number(row.document_count || 0),
          documents: documentsByMovement.get(prefixKey) || [],
        };
      });
    }

    return NextResponse.json({
      success: true,
      summary: {
        document_count: documentCount,
        qty_in: totalQtyIn,
        qty_out: totalQtyOut,
        net_qty: totalQtyIn - totalQtyOut,
      },
      data: rows,
      group_by: groupBy,
      prefixes,
      pagination: {
        current: page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0,
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
      timestamp: logTimestamp(),
    });
  } catch (error) {
    console.error('[API] warehouse report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to generate warehouse report: ${errorMessage}` },
      { status: 500 }
    );
  }
}
