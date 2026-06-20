import dbService from '@/lib/database';

/**
 * When a Sales Order created from a quotation is voided, restore the quotation so it can be converted again:
 * sets is_convert = 0 and refer_code back to the value copied onto the SO at conversion time.
 */
export async function rollbackQuotationIfSalesOrderFromConversion(soTransCode: string): Promise<void> {
  const code = String(soTransCode || '').trim();
  if (!code) return;

  const soRes = await dbService.query<{
    quotation_code: string | null;
    refer_code: string | null;
  }>(
    `SELECT quotation_code, refer_code FROM t_transaction_h
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO' LIMIT 1`,
    [code]
  );
  const so = soRes.data?.[0];
  const qtaCode = String(so?.quotation_code ?? '').trim();
  if (!qtaCode) return;

  const link = await dbService.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM t_transaction_h
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'QTA'
       AND is_convert = 1 AND TRIM(COALESCE(refer_code,'')) = ?`,
    [qtaCode, code]
  );
  if (Number((link.data?.[0] as { c?: unknown })?.c ?? 0) < 1) return;

  const ref =
    so?.refer_code != null && String(so.refer_code).trim() !== '' ? String(so.refer_code).trim() : null;

  await dbService.query(
    `UPDATE t_transaction_h
     SET is_convert = 0, refer_code = ?, modify_date = NOW()
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'QTA'`,
    [ref, qtaCode]
  );
}
