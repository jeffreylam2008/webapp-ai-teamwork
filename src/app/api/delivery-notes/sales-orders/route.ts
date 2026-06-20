import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  PENDING_SO_FOR_DN_COUNT_SQL,
  PENDING_SO_FOR_DN_LIST_SQL,
} from '@/lib/pendingDeliverySalesOrders';

/**
 * GET /api/delivery-notes/sales-orders
 * Confirmed sales orders not yet linked to a delivery note.
 * Query: countOnly=1 — returns { pending_count } only (for stock page badge).
 */
export async function GET(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const countOnly = request.nextUrl.searchParams.get('countOnly') === '1';

    const countResult = await dbService.query<{ c: number }>(PENDING_SO_FOR_DN_COUNT_SQL);
    const pending_count = Number((countResult.data?.[0] as { c?: unknown })?.c ?? 0) || 0;

    if (countOnly) {
      return NextResponse.json({ success: true, pending_count });
    }

    const result = await dbService.query<{
      transaction_id: string;
      transaction_date: string | null;
      customer_name: string | null;
      is_settle: number | null;
      is_void: number | null;
    }>(PENDING_SO_FOR_DN_LIST_SQL);

    const data = (result.data || [])
      .map((row) => {
        const isSettle = Number(row.is_settle ?? 0) === 1;
        return {
          transaction_id: String(row.transaction_id || '').trim(),
          customer_name: row.customer_name ?? undefined,
          transaction_date: row.transaction_date ?? undefined,
          is_settle: isSettle ? 1 : 0,
          status: isSettle ? 'Settled' : 'Draft',
        };
      })
      .filter((row) => row.transaction_id);

    return NextResponse.json({ success: true, data, pending_count });
  } catch (err) {
    console.error('[delivery-notes/sales-orders GET]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load sales orders' },
      { status: 500 }
    );
  }
}
