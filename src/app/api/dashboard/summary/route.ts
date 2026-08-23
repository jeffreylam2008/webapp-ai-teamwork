import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { logTimestamp } from '@/lib/datetime';
import {
  getAuthenticatedPermissionKeys,
} from '@/lib/transactionPermissionAuth';
import { PENDING_SO_FOR_DN_COUNT_SQL } from '@/lib/pendingDeliverySalesOrders';
import { canAccessWarehouseStockMenu } from '@/config/transactionPermissions';
import {
  PREFIX_REF,
  bindEqualsStoredPrefixRef,
  sqlEqualsStoredPrefixRef,
} from '@/lib/prefixRef';
import { ensurePrefixRefColumn } from '@/lib/ensurePrefixRefColumn';

const LINE_SALES_EXPR =
  'd.qty * d.price * (1 - COALESCE(d.discount, 0) / 100)';

function monthBounds(now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

/**
 * GET /api/dashboard/summary
 * Home dashboard KPIs. Fields are null when the user lacks permission.
 */
export async function GET(request: NextRequest) {
  try {
    await ensurePrefixRefColumn();
    const authResult = await getAuthenticatedPermissionKeys(request);
    if (!authResult.ok) return authResult.response;

    const keys = authResult.keys;
    const can = (key: string) => keys.has(key);
    const shopCode = (
      authResult.user.selected_shopcode ||
      authResult.user.default_shopcode ||
      ''
    ).trim();

    const { start: monthStart, end: monthEnd } = monthBounds();

    const canSales =
      can('view_sales_report') || can('view_invoice');
    const canWarehouse = canAccessWarehouseStockMenu(can);
    const canSalesOrder = can('view_sales_order');
    const canPo = can('view_po');

    let monthSales: number | null = null;
    let invoiceCount: number | null = null;
    let supplierCount: number | null = null;
    let customerCount: number | null = null;
    let userCount: number | null = null;
    let warehousePending: number | null = null;
    let draftSalesOrders: number | null = null;
    let openPurchaseOrders: number | null = null;

    // Month sales (INV)
    if (canSales) {
      let shopFilter = '';
      if (shopCode) {
        shopFilter = ' AND h.shop_code = ?';
      }
      const salesResult = await dbService.query<{
        invoice_count: number;
        total_sales: number;
      }>(
        `SELECT
          COUNT(DISTINCT h.trans_code) AS invoice_count,
          COALESCE(SUM(${LINE_SALES_EXPR}), 0) AS total_sales
         FROM t_transaction_h h
         INNER JOIN t_transaction_d d ON d.trans_code = h.trans_code
         WHERE ${sqlEqualsStoredPrefixRef('h')}
           AND COALESCE(h.is_void, 0) = 0
           AND DATE(h.create_date) >= ?
           AND DATE(h.create_date) <= ?
           ${shopFilter}`,
        [...bindEqualsStoredPrefixRef(PREFIX_REF.INV), monthStart, monthEnd, ...(shopCode ? [shopCode] : [])]
      );
      const row = salesResult.data?.[0];
      monthSales = Number(row?.total_sales || 0);
      invoiceCount = Number(row?.invoice_count || 0);
    }

    // Suppliers
    {
      const result = await dbService.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM t_suppliers'
      );
      supplierCount = Number(result.data?.[0]?.total || 0);
    }

    // Customers
    {
      const result = await dbService.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM t_customers'
      );
      customerCount = Number(result.data?.[0]?.total || 0);
    }

    // Users (employees for current shop when available)
    {
      const result = shopCode
        ? await dbService.query<{ total: number }>(
            'SELECT COUNT(*) AS total FROM t_employee WHERE default_shopcode = ?',
            [shopCode]
          )
        : await dbService.query<{ total: number }>(
            'SELECT COUNT(*) AS total FROM t_employee'
          );
      userCount = Number(result.data?.[0]?.total || 0);
    }

    // Warehouse pending: confirmed SO waiting for delivery note
    if (canWarehouse || can('view_delivery_note') || canSalesOrder) {
      const result = await dbService.query<{ c: number }>(PENDING_SO_FOR_DN_COUNT_SQL);
      warehousePending = Number(result.data?.[0]?.c || 0);
    }

    // Draft sales orders
    if (canSalesOrder) {
      let shopFilter = '';
      if (shopCode) {
        shopFilter = ' AND shop_code = ?';
      }
      const result = await dbService.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM t_transaction_h
         WHERE ${sqlEqualsStoredPrefixRef()}
           AND COALESCE(is_void, 0) = 0
           AND COALESCE(is_settle, 0) = 0
           ${shopFilter}`,
        [...bindEqualsStoredPrefixRef(PREFIX_REF.SO), ...(shopCode ? [shopCode] : [])]
      );
      draftSalesOrders = Number(result.data?.[0]?.total || 0);
    }

    // Open (non-void) purchase orders this month — useful workflow signal
    if (canPo) {
      let shopFilter = '';
      if (shopCode) {
        shopFilter = ' AND shop_code = ?';
      }
      const result = await dbService.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM t_transaction_h
         WHERE ${sqlEqualsStoredPrefixRef()}
           AND COALESCE(is_void, 0) = 0
           AND DATE(create_date) >= ?
           AND DATE(create_date) <= ?
           ${shopFilter}`,
        [...bindEqualsStoredPrefixRef(PREFIX_REF.PO), monthStart, monthEnd, ...(shopCode ? [shopCode] : [])]
      );
      openPurchaseOrders = Number(result.data?.[0]?.total || 0);
    }

    return NextResponse.json({
      success: true,
      period: { start_date: monthStart, end_date: monthEnd },
      shop_code: shopCode || null,
      metrics: {
        month_sales: monthSales,
        invoice_count: invoiceCount,
        supplier_count: supplierCount,
        customer_count: customerCount,
        user_count: userCount,
        warehouse_pending: warehousePending,
        draft_sales_orders: draftSalesOrders,
        purchase_orders_month: openPurchaseOrders,
      },
      permissions: {
        sales: canSales,
        warehouse: canWarehouse || can('view_delivery_note'),
        sales_order: canSalesOrder,
        purchase: canPo,
        sales_report: can('view_sales_report'),
        warehouse_report: can('view_warehouse_report'),
        invoice: can('view_invoice'),
        quotation: can('view_quotation'),
        grn: can('view_grn'),
        delivery_note: can('view_delivery_note'),
        adjustment: can('view_adjustment'),
        stocktake: can('view_stocktake'),
      },
      timestamp: logTimestamp(),
    });
  } catch (error) {
    console.error('[API] dashboard summary error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to load dashboard: ${errorMessage}` },
      { status: 500 }
    );
  }
}
