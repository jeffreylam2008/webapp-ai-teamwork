import dayjs from 'dayjs';
import dbService from '@/lib/database';
import { getCurrentSuffix, generateSessionId } from '@/utils/transactionUtils';
import { TransactionGeneratorMiddleware } from '@/middleware/transactionGenerator';
import { ensureInvoiceSubtypeColumns } from '@/lib/ensureInvoiceSubtypeColumns';
import { ensurePrefixRefColumn } from '@/lib/ensurePrefixRefColumn';
import { PREFIX_REF, sqlEqualsStoredPrefixRef, bindEqualsStoredPrefixRef } from '@/lib/prefixRef';
import { INVOICE_SUBTYPE_MONTHLY } from '@/config/invoiceSubtypes';

export type RecurringGenerateResult = {
  sourceTransCode: string;
  newTransCode: string;
  billing_period_from: string;
  billing_period_to: string;
};

type SourceHeader = {
  trans_code: string;
  cust_code: string | null;
  shop_code: string | null;
  employee_code: string | number | null;
  remark: string | null;
  total: number | string | null;
  billing_period_from: string | Date | null;
  billing_period_to: string | Date | null;
};

function toDateKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

function nextBillingPeriod(fromRaw: string | Date | null, toRaw: string | Date | null): {
  from: string;
  to: string;
} | null {
  const from = dayjs(fromRaw);
  const to = dayjs(toRaw);
  if (!from.isValid() || !to.isValid()) return null;
  return {
    from: from.add(1, 'month').format('YYYY-MM-DD'),
    to: to.add(1, 'month').format('YYYY-MM-DD'),
  };
}

async function alreadyGenerated(sourceTransCode: string, nextFrom: string): Promise<boolean> {
  const check = await dbService.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM t_transaction_h
     WHERE ${sqlEqualsStoredPrefixRef()}
       AND COALESCE(invoice_subtype, 'standard') = ?
       AND COALESCE(is_void, 0) = 0
       AND TRIM(COALESCE(refer_code, '')) = ?
       AND DATE(billing_period_from) = ?`,
    [...bindEqualsStoredPrefixRef(PREFIX_REF.INV), INVOICE_SUBTYPE_MONTHLY, sourceTransCode, nextFrom]
  );
  return Number(check.data?.[0]?.cnt || 0) > 0;
}

async function loadChildInvoice(
  sourceTransCode: string,
  nextFrom: string
): Promise<SourceHeader | null> {
  const res = await dbService.query<SourceHeader>(
    `SELECT
       trans_code, cust_code, shop_code, employee_code, remark, total,
       billing_period_from, billing_period_to
     FROM t_transaction_h
     WHERE ${sqlEqualsStoredPrefixRef()}
       AND COALESCE(invoice_subtype, 'standard') = ?
       AND COALESCE(is_void, 0) = 0
       AND TRIM(COALESCE(refer_code, '')) = ?
       AND DATE(billing_period_from) = ?
     LIMIT 1`,
    [...bindEqualsStoredPrefixRef(PREFIX_REF.INV), INVOICE_SUBTYPE_MONTHLY, sourceTransCode, nextFrom]
  );
  return res.data?.[0] || null;
}

async function createNextInvoiceFromSource(
  source: SourceHeader
): Promise<RecurringGenerateResult | null> {
  const period = nextBillingPeriod(source.billing_period_from, source.billing_period_to);
  if (!period) return null;

  if (await alreadyGenerated(source.trans_code, period.from)) {
    return null;
  }

  const suffix = getCurrentSuffix();
  const sessionId = `recur_${Date.now()}_${generateSessionId()}`;
  const numberResult = await TransactionGeneratorMiddleware.generateNext({
    prefix: PREFIX_REF.INV,
    suffix,
    sessionId,
  });
  if (!numberResult.success || !numberResult.transactionCode) {
    const genErr = !numberResult.success ? numberResult.error : 'Failed to generate invoice number';
    throw new Error(genErr || 'Failed to generate invoice number');
  }
  const newCode = numberResult.transactionCode;

  const details = await dbService.query<{
    item_code: string | null;
    eng_name: string | null;
    chi_name: string | null;
    qty: number | null;
    unit: string | null;
    price: number | null;
    discount: number | null;
  }>(
    `SELECT item_code, eng_name, chi_name, qty, unit, price, discount
     FROM t_transaction_d WHERE trans_code = ?`,
    [source.trans_code]
  );

  const payments = await dbService.query<{ pm_code: string | null; total: number | null }>(
    `SELECT pm_code, total FROM t_transaction_t WHERE trans_code = ?`,
    [source.trans_code]
  );

  await dbService.query(
    `INSERT INTO t_transaction_h (
      trans_code, prefix, prefix_ref, cust_code, refer_code, shop_code,
      total, employee_code, remark, create_date, modify_date,
      is_void, is_convert, is_settle,
      invoice_subtype, billing_period_from, billing_period_to, is_recurring
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0, 0, ?, ?, ?, 1)`,
    [
      newCode,
      PREFIX_REF.INV,
      PREFIX_REF.INV,
      source.cust_code,
      source.trans_code,
      source.shop_code,
      source.total,
      source.employee_code,
      source.remark,
      INVOICE_SUBTYPE_MONTHLY,
      period.from,
      period.to,
    ]
  );

  for (const detail of details.data || []) {
    const itemCode = String(detail.item_code || '').trim();
    if (!itemCode) continue;
    await dbService.query(
      `INSERT INTO t_transaction_d (
        trans_code, item_code, eng_name, chi_name,
        qty, unit, price, discount,
        create_date, modify_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        newCode,
        itemCode,
        detail.eng_name,
        detail.chi_name,
        detail.qty,
        detail.unit,
        detail.price,
        detail.discount,
      ]
    );
  }

  for (const payment of payments.data || []) {
    const pm = String(payment.pm_code || '').trim();
    if (!pm) continue;
    await dbService.query(
      `INSERT INTO t_transaction_t (
        trans_code, pm_code, total, create_date, modify_date
      ) VALUES (?, ?, ?, NOW(), NOW())`,
      [newCode, pm, payment.total]
    );
  }

  await dbService.query('UPDATE t_trans_num_generator SET status = "committed" WHERE session_id = ?', [
    sessionId,
  ]);

  return {
    sourceTransCode: source.trans_code,
    newTransCode: newCode,
    billing_period_from: period.from,
    billing_period_to: period.to,
  };
}

/**
 * Creates the next monthly invoice for each due recurring source
 * (is_recurring=1, billing_period_to before today, no child for next period yet).
 * Catch-up: keeps creating subsequent periods until current (max 24 months).
 */
export async function generateDueRecurringMonthlyInvoices(options?: {
  /** Only process this source invoice (after toggle on). */
  onlyTransCode?: string;
  /** Limit to the logged-in shop. */
  shopCode?: string;
}): Promise<RecurringGenerateResult[]> {
  await ensureInvoiceSubtypeColumns();
  await ensurePrefixRefColumn();

  const today = dayjs().format('YYYY-MM-DD');
  const params: (string | number)[] = [
    ...bindEqualsStoredPrefixRef(PREFIX_REF.INV),
    INVOICE_SUBTYPE_MONTHLY,
    today,
  ];
  let onlySql = '';
  if (options?.onlyTransCode) {
    onlySql = ' AND trans_code = ?';
    params.push(String(options.onlyTransCode).trim());
  }
  if (options?.shopCode) {
    onlySql += ' AND shop_code = ?';
    params.push(String(options.shopCode).trim());
  }

  const sources = await dbService.query<SourceHeader>(
    `SELECT
       trans_code, cust_code, shop_code, employee_code, remark, total,
       billing_period_from, billing_period_to
     FROM t_transaction_h
     WHERE ${sqlEqualsStoredPrefixRef()}
       AND COALESCE(invoice_subtype, 'standard') = ?
       AND COALESCE(is_void, 0) = 0
       AND COALESCE(is_recurring, 0) = 1
       AND billing_period_from IS NOT NULL
       AND billing_period_to IS NOT NULL
       AND DATE(billing_period_to) < ?
       ${onlySql}
     ORDER BY billing_period_to ASC, create_date ASC`,
    params
  );

  const created: RecurringGenerateResult[] = [];
  for (const source of sources.data || []) {
    if (!toDateKey(source.billing_period_to) || !toDateKey(source.billing_period_from)) continue;

    let working: SourceHeader = source;
    for (let step = 0; step < 24; step++) {
      const toKey = toDateKey(working.billing_period_to);
      if (!toKey || toKey >= today) break;

      const period = nextBillingPeriod(working.billing_period_from, working.billing_period_to);
      if (!period) break;

      const result = await createNextInvoiceFromSource(working);
      if (result) {
        created.push(result);
        working = {
          ...working,
          trans_code: result.newTransCode,
          billing_period_from: result.billing_period_from,
          billing_period_to: result.billing_period_to,
        };
        continue;
      }

      // Next period already exists — continue chain from that child if still overdue
      const child = await loadChildInvoice(working.trans_code, period.from);
      if (!child) break;
      working = child;
    }
  }
  return created;
}
