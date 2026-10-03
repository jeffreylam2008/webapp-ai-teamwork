import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { getShopScopeFromAuth, shopScopeRequiredResponse } from '@/lib/shopScope';
import {
  PREFIX_REF,
  bindParamsForPrefixRefMatch,
  defaultDisplayForRef,
  effectivePrefixRef,
  sqlJoinPrefixDisplay,
  sqlSelectDisplayPrefix,
} from '@/lib/prefixRef';

type MovementRow = {
  trans_code: string;
  create_date: string | null;
  refer_code: string | null;
  shop_code: string | null;
  wh_code: string | null;
  qty: number | null;
  display_prefix: string | null;
  prefix: string | null;
  prefix_ref: string | null;
};

/**
 * GET /api/products/item-movements?item_code=
 * Sales order (on hold), GRN (current +), and DN (current −) lines for an item.
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

  const scopeShop = getShopScopeFromAuth(auth.user);
  if (!scopeShop) return shopScopeRequiredResponse();

  const itemCode = String(request.nextUrl.searchParams.get('item_code') || '').trim();
  if (!itemCode) {
    return NextResponse.json({ success: false, error: 'item_code is required' }, { status: 400 });
  }

  try {
    const prefixMatch = bindParamsForPrefixRefMatch(
      [PREFIX_REF.GRN, PREFIX_REF.DN, PREFIX_REF.SO],
      'h'
    );
    const soMatch = bindParamsForPrefixRefMatch([PREFIX_REF.SO], 'h');
    const dnMatch = bindParamsForPrefixRefMatch([PREFIX_REF.DN], 'dn');

    const result = await dbService.query<MovementRow>(
      `SELECT
         h.trans_code,
         h.create_date,
         h.refer_code,
         h.shop_code,
         h.wh_code,
         d.qty,
         ${sqlSelectDisplayPrefix('h', 'p', 'display_prefix')},
         h.prefix,
         h.prefix_ref
       FROM t_transaction_d d
       INNER JOIN t_transaction_h h ON h.trans_code = d.trans_code
       ${sqlJoinPrefixDisplay('h', 'p')}
       WHERE d.item_code = ?
         AND ${prefixMatch.sql}
         AND COALESCE(h.is_void, 0) = 0
         AND h.shop_code = ?
         AND (
           NOT ${soMatch.sql}
           OR NOT EXISTS (
             SELECT 1 FROM t_transaction_h dn
             WHERE ${dnMatch.sql}
               AND dn.refer_code = h.trans_code
               AND COALESCE(dn.is_void, 0) = 0
           )
         )
       ORDER BY h.create_date DESC, h.trans_code DESC`,
      [itemCode, ...prefixMatch.params, scopeShop, ...soMatch.params, ...dnMatch.params]
    );

    const data = (result.data || [])
      .map((row) => {
        const typeRef = effectivePrefixRef(row.prefix_ref, row.prefix);
        const qtyAbs = Math.abs(Number(row.qty || 0));
        if (!Number.isFinite(qtyAbs) || qtyAbs <= 0) return null;
        const kind = typeRef === PREFIX_REF.SO ? 'on_hold' : 'current';
        const signedQty =
          typeRef === PREFIX_REF.DN ? -qtyAbs : qtyAbs;
        return {
          trans_code: String(row.trans_code || '').trim(),
          date: row.create_date ?? null,
          type_ref: typeRef,
          type_label: defaultDisplayForRef(typeRef || String(row.display_prefix || '')),
          refer_code: row.refer_code ? String(row.refer_code).trim() : '',
          shop_code: String(row.wh_code || row.shop_code || '').trim(),
          qty: signedQty,
          qty_kind: kind as 'on_hold' | 'current',
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row && !!row.trans_code);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[item-movements GET]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load item movements' },
      { status: 500 }
    );
  }
}
