import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { logTransactionAction } from '@/lib/audit';
import { fulfillDeliveryNoteWarehouseStock } from '@/lib/salesOrderConfirmWarehouse';
import { ensureSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { formatSqlDateTime } from '@/lib/datetime';
import { PREFIX_REF, bindEqualsStoredPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';
import {
  assertTransCodeInShopScope,
  getShopScopeFromAuth,
  shopScopeRequiredResponse,
} from '@/lib/shopScope';

type DeliveryNoteItemInput = {
  item_code?: string;
  item_name?: string;
  quantity?: number;
  qty?: number;
};

type DeliveryNoteBody = {
  delivery_note_no?: string;
  reference_no?: string;
  transaction_date?: string;
  shop_code?: string;
  wh_code?: string;
  cust_code?: string;
  pm_code?: string;
  remark?: string;
  total_amount?: number;
  items?: DeliveryNoteItemInput[];
};

const EPS = 1e-9;

function sumItemsByCode(items: DeliveryNoteItemInput[]): Map<string, { qty: number; eng_name: string }> {
  const m = new Map<string, { qty: number; eng_name: string }>();
  for (const row of items) {
    const code = String(row.item_code || '').trim();
    if (!code) continue;
    const qty = Number(row.quantity ?? row.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const name = String(row.item_name || code).trim();
    const prev = m.get(code);
    m.set(code, {
      qty: (prev?.qty || 0) + qty,
      eng_name: prev?.eng_name || name,
    });
  }
  return m;
}

/**
 * POST /api/delivery-notes
 * Creates a delivery note (DN).
 *
 * Stock flow (normal practice):
 * - Confirmed SO keeps reservation in t_warehouse_stage
 * - DN finds those stage rows, deducts t_warehouse, then clears the stage holds
 * - DN without SO reference deducts t_warehouse directly
 * - Legacy confirmed SOs with no stage (already deducted at confirm) skip a second deduction
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

  const scopeShop = getShopScopeFromAuth(auth.user);
  if (!scopeShop) return shopScopeRequiredResponse();

  let body: DeliveryNoteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const transCode = String(body.delivery_note_no || '').trim();
  const referCode = String(body.reference_no || '').trim();
  const custCode = String(body.cust_code || '').trim();
  const shopCode = scopeShop;
  const whCode = String(body.wh_code || scopeShop || '').trim() || scopeShop;
  const pmCode = String(body.pm_code || '').trim();
  const employeeCode = String(auth.user.employee_code || '').trim();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!transCode) {
    return NextResponse.json({ success: false, error: 'delivery_note_no is required' }, { status: 400 });
  }
  if (!custCode) {
    return NextResponse.json({ success: false, error: 'Customer is required' }, { status: 400 });
  }
  if (!shopCode) {
    return NextResponse.json({ success: false, error: 'Shop / warehouse is required' }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: 'At least one line item is required' }, { status: 400 });
  }

  const stockShop = whCode || shopCode;
  const byItem = sumItemsByCode(items);
  if (byItem.size === 0) {
    return NextResponse.json({ success: false, error: 'No valid line items' }, { status: 400 });
  }

  try {
    const exists = await dbService.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
      [transCode]
    );
    if (Number((exists.data?.[0] as { c?: number })?.c ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: `Delivery note ${transCode} already exists` },
        { status: 409 }
      );
    }

    if (referCode) {
      const soScopeErr = await assertTransCodeInShopScope(referCode, scopeShop);
      if (soScopeErr) return soScopeErr;

      const soHdr = await dbService.query<{ is_settle: number | null; is_void: number | null }>(
        `SELECT is_settle, is_void FROM t_transaction_h
         WHERE trans_code = ? AND ${sqlEqualsStoredPrefixRef()} AND shop_code = ? LIMIT 1`,
        [referCode, ...bindEqualsStoredPrefixRef(PREFIX_REF.SO), scopeShop]
      );
      const so = soHdr.data?.[0];
      if (!so || Number(so.is_void ?? 0) === 1) {
        return NextResponse.json(
          { success: false, error: 'Referenced sales order was not found or is void' },
          { status: 400 }
        );
      }
      if (Number(so.is_settle ?? 0) !== 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Referenced sales order must be confirmed before creating a delivery note',
          },
          { status: 400 }
        );
      }

      const soLines = await dbService.query<{ item_code: string; qty: number | null }>(
        `SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?`,
        [referCode]
      );
      const expected = new Map<string, number>();
      for (const row of soLines.data || []) {
        const code = String(row.item_code || '').trim();
        if (!code) continue;
        const qty = Number(row.qty ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        expected.set(code, (expected.get(code) || 0) + qty);
      }
      if (expected.size === 0) {
        return NextResponse.json(
          { success: false, error: 'Referenced sales order has no deliverable line items' },
          { status: 400 }
        );
      }
      if (expected.size !== byItem.size) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Delivery note items must match the confirmed sales order exactly (no add, remove, or quantity changes)',
          },
          { status: 400 }
        );
      }
      for (const [itemCode, { qty }] of byItem) {
        const expectedQty = expected.get(itemCode);
        if (expectedQty == null || Math.abs(expectedQty - qty) > EPS) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Delivery note items must match the confirmed sales order exactly (no add, remove, or quantity changes)',
            },
            { status: 400 }
          );
        }
      }

      // Write/refresh t_warehouse_stage from SO lines before DN exists, then DN confirms those rows.
      await ensureSalesOrderWarehouseStageHold({
        transCode: referCode,
        shopCode: stockShop,
      });
    }

    const qtyByItem = new Map<string, number>();
    for (const [itemCode, { qty }] of byItem) {
      qtyByItem.set(itemCode, qty);
    }

    const txDate = formatSqlDateTime(body.transaction_date) ?? formatSqlDateTime(new Date())!;
    let lineTotal = 0;
    for (const { qty } of byItem.values()) lineTotal += qty;

    const stockResult = await dbService.withTransaction(async () => {
      await dbService.query(
        `INSERT INTO t_transaction_h (
          trans_code, prefix, prefix_ref, cust_code, refer_code, shop_code, wh_code,
          total, employee_code, remark, is_void, is_convert, is_settle, create_date, modify_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
        [
          transCode,
          PREFIX_REF.DN,
          PREFIX_REF.DN,
          custCode,
          referCode || null,
          shopCode || null,
          whCode || null,
          lineTotal,
          employeeCode || null,
          body.remark != null ? String(body.remark) : null,
          txDate,
          txDate,
        ]
      );

      for (const [itemCode, { qty, eng_name }] of byItem) {
        await dbService.query(
          `INSERT INTO t_transaction_d (
            trans_code, item_code, eng_name, chi_name, qty, unit, price, discount, create_date, modify_date
          ) VALUES (?, ?, ?, '', ?, 'PCS', 0, 0, ?, ?)`,
          [transCode, itemCode, eng_name, qty, txDate, txDate]
        );
      }

      if (pmCode) {
        await dbService.query(
          `INSERT INTO t_transaction_t (trans_code, pm_code, total, create_date, modify_date)
           VALUES (?, ?, ?, ?, ?)`,
          [transCode, pmCode, lineTotal, txDate, txDate]
        );
      }

      return fulfillDeliveryNoteWarehouseStock({
        stockShop,
        referSoCode: referCode || null,
        qtyByItem,
      });
    });

    void logTransactionAction({
      request,
      action: 'CREATE',
      transCode,
      prefix: PREFIX_REF.DN,
      details: {
        referCode: referCode || undefined,
        deducted: stockResult.deducted,
        clearedStage: stockResult.clearedStage,
        legacySkipped: stockResult.legacySkipped,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Delivery note created',
      transCode,
      stock: stockResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create delivery note';
    console.error('[delivery-notes POST]', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
