/** Confirmed, non-void SOs that do not yet have a non-void delivery note (refer_code = SO). */
export const PENDING_SO_FOR_DN_WHERE = `
  UPPER(TRIM(COALESCE(so.prefix, ''))) = 'SO'
  AND COALESCE(so.is_void, 0) = 0
  AND COALESCE(so.is_settle, 0) = 1
  AND NOT EXISTS (
    SELECT 1 FROM t_transaction_h dn
    WHERE UPPER(TRIM(COALESCE(dn.prefix, ''))) = 'DN'
      AND COALESCE(dn.is_void, 0) = 0
      AND TRIM(COALESCE(dn.refer_code, '')) = TRIM(so.trans_code)
  )
`;

export const PENDING_SO_FOR_DN_COUNT_SQL = `
  SELECT COUNT(*) AS c
  FROM t_transaction_h so
  WHERE ${PENDING_SO_FOR_DN_WHERE}
`;

export const PENDING_SO_FOR_DN_LIST_SQL = `
  SELECT
    so.trans_code AS transaction_id,
    so.create_date AS transaction_date,
    c.name AS customer_name,
    so.is_settle,
    so.is_void
  FROM t_transaction_h so
  LEFT JOIN t_customers c ON so.cust_code = c.cust_code
  WHERE ${PENDING_SO_FOR_DN_WHERE}
  ORDER BY so.create_date DESC
  LIMIT 500
`;
