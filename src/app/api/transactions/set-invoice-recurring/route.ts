import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { ensureInvoiceSubtypeColumns } from '@/lib/ensureInvoiceSubtypeColumns';
import { PREFIX_REF, bindEqualsStoredPrefixRef, matchesPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';
import { isMonthlyInvoiceSubtype } from '@/config/invoiceSubtypes';
import { generateDueRecurringMonthlyInvoices } from '@/lib/generateRecurringMonthlyInvoices';

/**
 * POST /api/transactions/set-invoice-recurring
 * Body: { transCode: string, is_recurring: 0 | 1 | boolean }
 *
 * Turns auto-recurrence on/off for a monthly invoice.
 * When turned on, immediately generates the next invoice if billing_period_to has already passed.
 */
export async function POST(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  let body: { transCode?: string; is_recurring?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const transCode = String(body.transCode || '').trim();
  if (!transCode) {
    return NextResponse.json({ success: false, error: 'transCode is required' }, { status: 400 });
  }

  const flagRaw = body.is_recurring;
  const isRecurring =
    flagRaw === true || flagRaw === 1 || flagRaw === '1' || String(flagRaw).toLowerCase() === 'true'
      ? 1
      : 0;

  try {
    await ensureInvoiceSubtypeColumns();

    const hdr = await dbService.query<{
      prefix: string | null;
      prefix_ref: string | null;
      is_void: number | null;
      invoice_subtype: string | null;
      billing_period_from: string | Date | null;
      billing_period_to: string | Date | null;
    }>(
      `SELECT prefix, prefix_ref, is_void, invoice_subtype, billing_period_from, billing_period_to
       FROM t_transaction_h WHERE trans_code = ? LIMIT 1`,
      [transCode]
    );

    const row = hdr.data?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }
    if (!matchesPrefixRef(row.prefix, row.prefix_ref, PREFIX_REF.INV)) {
      return NextResponse.json({ success: false, error: 'Not an invoice transaction' }, { status: 400 });
    }
    if (!isMonthlyInvoiceSubtype(row.invoice_subtype)) {
      return NextResponse.json(
        { success: false, error: 'Recurrence is only available for monthly invoices' },
        { status: 400 }
      );
    }
    if (Number(row.is_void ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot set recurrence on a void invoice' },
        { status: 400 }
      );
    }
    if (isRecurring === 1 && (!row.billing_period_from || !row.billing_period_to)) {
      return NextResponse.json(
        { success: false, error: 'Monthly invoice needs billing period from/to before enabling recurrence' },
        { status: 400 }
      );
    }

    await dbService.query(
      `UPDATE t_transaction_h
       SET is_recurring = ?, modify_date = NOW()
       WHERE trans_code = ? AND ${sqlEqualsStoredPrefixRef()}`,
      [isRecurring, transCode, ...bindEqualsStoredPrefixRef(PREFIX_REF.INV)]
    );

    let generated: Awaited<ReturnType<typeof generateDueRecurringMonthlyInvoices>> = [];
    if (isRecurring === 1) {
      generated = await generateDueRecurringMonthlyInvoices({ onlyTransCode: transCode });
    }

    void logTransactionAction({
      request,
      action: 'EDIT',
      transCode,
      prefix: PREFIX_REF.INV,
      details: {
        is_recurring: isRecurring,
        generated: generated.map((g) => g.newTransCode),
      },
    });

    return NextResponse.json({
      success: true,
      message: isRecurring ? 'Recurrence enabled' : 'Recurrence disabled',
      transCode,
      is_recurring: isRecurring,
      generated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[set-invoice-recurring]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
