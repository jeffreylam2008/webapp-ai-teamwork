import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

interface PreviousItemRow {
  item_code: string;
  eng_name: string;
  chi_name: string;
  unit: string;
  price: number | string | null;
  discount: number | string | null;
  qty: number | string | null;
  trans_code: string;
  create_date: string | Date | null;
}

export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const auth = await verifyToken(token);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const custCode = request.nextUrl.searchParams.get('cust_code')?.trim() || '';
    const excludeTransCode = request.nextUrl.searchParams.get('exclude_trans_code')?.trim() || '';

    if (!custCode) {
      return NextResponse.json({ success: false, error: 'cust_code is required' }, { status: 400 });
    }

    const params: string[] = [custCode];
    let excludeClause = '';
    if (excludeTransCode) {
      excludeClause = ' AND h.trans_code <> ?';
      params.push(excludeTransCode);
    }

    const result = await dbService.query<PreviousItemRow>(
      `SELECT
         d.item_code,
         d.eng_name,
         d.chi_name,
         d.unit,
         d.price,
         d.discount,
         d.qty,
         h.trans_code,
         h.create_date
       FROM t_transaction_d d
       INNER JOIN t_transaction_h h ON h.trans_code = d.trans_code
       WHERE h.cust_code = ?
         AND h.prefix = 'QTA'
         ${excludeClause}
       ORDER BY h.create_date DESC, d.uid ASC`,
      params
    );

    const rows = result.data || [];
    const seen = new Set<string>();
    const items = [];

    for (const row of rows) {
      const itemCode = String(row.item_code || '').trim();
      if (!itemCode || seen.has(itemCode)) continue;
      seen.add(itemCode);
      items.push({
        item_code: itemCode,
        eng_name: String(row.eng_name || ''),
        chi_name: String(row.chi_name || ''),
        unit: String(row.unit || ''),
        price: Number(row.price || 0),
        discount: Number(row.discount || 0),
        qty: Number(row.qty || 0),
        last_trans_code: String(row.trans_code || ''),
        last_used_date: row.create_date ? String(row.create_date) : null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        cust_code: custCode,
        items,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
