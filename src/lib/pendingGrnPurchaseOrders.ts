import { PREFIX_REF, bindParamsForPrefixRefMatch } from '@/lib/prefixRef';

/**
 * Non-void purchase orders not yet fully received (is_settle = 0).
 * Eligible as soon as a PO is created; cleared when fully GRN-received.
 * Matches on prefix_ref (with legacy prefix fallback).
 */
function pendingPoForGrnWhere(): { sql: string; params: string[] } {
  const poMatch = bindParamsForPrefixRefMatch([PREFIX_REF.PO], 'po');
  return {
    sql: `
      ${poMatch.sql}
      AND COALESCE(po.is_void, 0) = 0
      AND COALESCE(po.is_settle, 0) = 0
    `,
    params: poMatch.params,
  };
}

export function pendingPoForGrnCountQuery(shopCode: string): { sql: string; params: string[] } {
  const where = pendingPoForGrnWhere();
  return {
    sql: `
      SELECT COUNT(*) AS c
      FROM t_transaction_h po
      WHERE ${where.sql}
        AND po.shop_code = ?
    `,
    params: [...where.params, shopCode],
  };
}

export function pendingPoForGrnListQuery(shopCode: string): { sql: string; params: string[] } {
  const where = pendingPoForGrnWhere();
  return {
    sql: `
      SELECT
        po.trans_code AS transaction_id,
        po.create_date AS transaction_date,
        s.name AS supplier_name,
        po.supp_code AS supplier_code,
        po.is_settle,
        po.is_void
      FROM t_transaction_h po
      LEFT JOIN t_suppliers s ON s.supp_code = po.supp_code
      WHERE ${where.sql}
        AND po.shop_code = ?
      ORDER BY po.create_date DESC
      LIMIT 500
    `,
    params: [...where.params, shopCode],
  };
}
