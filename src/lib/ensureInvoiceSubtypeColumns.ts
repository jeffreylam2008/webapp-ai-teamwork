import dbService from '@/lib/database';

let ensured = false;

/**
 * Adds invoice subtype + billing period columns to t_transaction_h when missing.
 * t_transaction_d and t_transaction_t are unchanged — monthly invoices use the same line/payment rows.
 */
export async function ensureInvoiceSubtypeColumns(): Promise<void> {
  if (ensured) return;

  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_transaction_h'
       AND COLUMN_NAME IN ('invoice_subtype', 'billing_period_from', 'billing_period_to')`
  );
  const existing = new Set((colResult.data || []).map((r) => String(r.column_name).toLowerCase()));

  if (!existing.has('invoice_subtype')) {
    await dbService.query(
      `ALTER TABLE t_transaction_h
       ADD COLUMN invoice_subtype VARCHAR(16) NOT NULL DEFAULT 'standard'
       COMMENT 'standard | monthly'`
    );
  }
  if (!existing.has('billing_period_from')) {
    await dbService.query(
      `ALTER TABLE t_transaction_h
       ADD COLUMN billing_period_from DATE NULL
       COMMENT 'Monthly invoice billing period start'`
    );
  }
  if (!existing.has('billing_period_to')) {
    await dbService.query(
      `ALTER TABLE t_transaction_h
       ADD COLUMN billing_period_to DATE NULL
       COMMENT 'Monthly invoice billing period end'`
    );
  }

  ensured = true;
}
