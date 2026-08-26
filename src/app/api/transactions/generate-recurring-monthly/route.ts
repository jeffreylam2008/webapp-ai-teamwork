import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { generateDueRecurringMonthlyInvoices } from '@/lib/generateRecurringMonthlyInvoices';
import { PREFIX_REF } from '@/lib/prefixRef';

/**
 * POST /api/transactions/generate-recurring-monthly
 * Creates next-period monthly invoices for all due recurring sources.
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

  try {
    const generated = await generateDueRecurringMonthlyInvoices();

    void logTransactionAction({
      request,
      action: 'CREATE',
      prefix: PREFIX_REF.INV,
      details: {
        recurringGenerated: generated.map((g) => ({
          from: g.sourceTransCode,
          to: g.newTransCode,
          billing_period_from: g.billing_period_from,
          billing_period_to: g.billing_period_to,
        })),
        count: generated.length,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        generated.length > 0
          ? `Generated ${generated.length} recurring monthly invoice(s)`
          : 'No due recurring monthly invoices',
      generated,
      count: generated.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[generate-recurring-monthly]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
