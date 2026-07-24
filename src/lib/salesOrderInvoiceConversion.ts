import dbService from '@/lib/database';

/**
 * When an invoice is created from a settled sales order, mark the SO so it cannot be invoiced again.
 */
export async function markSalesOrderInvoiced(soTransCode: string): Promise<void> {
  const so = String(soTransCode || '').trim();
  if (!so) return;

  const soRes = await dbService.query<{
    is_convert: number | null;
    is_settle: number | null;
    is_void: number | null;
  }>(
    `SELECT is_convert, is_settle, is_void FROM t_transaction_h
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO' LIMIT 1`,
    [so]
  );
  const row = soRes.data?.[0];
  if (!row) throw new Error('Linked sales order not found');
  if (Number(row.is_void ?? 0) === 1) throw new Error('Cannot create invoice from a void sales order');
  if (Number(row.is_settle ?? 0) !== 1) {
    throw new Error('Sales order must be settled before creating an invoice');
  }
  if (Number(row.is_convert ?? 0) === 1) {
    throw new Error('Sales order has already been converted to an invoice');
  }

  await dbService.query(
    `UPDATE t_transaction_h
     SET is_convert = 1, modify_date = NOW()
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO'`,
    [so]
  );
}

/**
 * When an invoice linked to a sales order is voided, allow the SO to be invoiced again.
 */
export async function rollbackSalesOrderIfInvoiceVoided(invTransCode: string): Promise<void> {
  const inv = String(invTransCode || '').trim();
  if (!inv) return;

  const invRes = await dbService.query<{ refer_code: string | null }>(
    `SELECT refer_code FROM t_transaction_h
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'INV' LIMIT 1`,
    [inv]
  );
  const soCode = String(invRes.data?.[0]?.refer_code ?? '').trim();
  if (!soCode.toUpperCase().startsWith('SO')) return;

  await dbService.query(
    `UPDATE t_transaction_h
     SET is_convert = 0, modify_date = NOW()
     WHERE trans_code = ? AND UPPER(TRIM(COALESCE(prefix,''))) = 'SO'
       AND is_convert = 1`,
    [soCode]
  );
}
