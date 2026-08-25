import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { ensureItemPurchasePriceColumn } from '@/lib/ensureItemPurchasePriceColumn';
import { ensureMonthlyItemTypeCode } from '@/lib/ensureMonthlyItemType';

export async function GET(request: NextRequest) {
  try {
    console.log('[API] Fetching form data for transaction edit');

    await ensureItemPurchasePriceColumn();

    const productCategory = request.nextUrl.searchParams.get('product_category')?.trim() || '';
    const itemTypeParam = request.nextUrl.searchParams.get('item_type')?.trim().toLowerCase() || '';
    const productTypeRaw = request.nextUrl.searchParams.get('product_type')?.trim() || '';

    // Fetch customers
    const customersResult = await dbService.query(
      `SELECT cust_code, name, phone_1, email_1, pm_code 
       FROM t_customers 
       ORDER BY name ASC`
    );

    // Fetch products:
    // - item_type=monthly → ensure Monthly in t_items_type, filter t_items.type
    // - product_type=N → filter t_items.type = N
    // - product_category → legacy filter on t_items.cate_code
    const productParams: Array<string | number> = [];
    let productsSql =
      `SELECT item_code, eng_name, chi_name, unit, price, purchase_price, cate_code, type FROM t_items`;
    const whereParts: string[] = [];

    if (itemTypeParam === 'monthly') {
      const monthlyTypeCode = await ensureMonthlyItemTypeCode();
      whereParts.push('type = ?');
      productParams.push(monthlyTypeCode);
    } else if (productTypeRaw) {
      const productType = Number(productTypeRaw);
      if (Number.isFinite(productType) && productType > 0) {
        whereParts.push('type = ?');
        productParams.push(Math.trunc(productType));
      }
    } else if (productCategory) {
      whereParts.push('cate_code = ?');
      productParams.push(productCategory);
    }

    if (whereParts.length > 0) {
      productsSql += ` WHERE ${whereParts.join(' AND ')}`;
    }
    productsSql += ` ORDER BY eng_name ASC`;

    const productsResult = await dbService.query(productsSql, productParams);

    const whCol = await dbService.query<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 't_shop'
         AND COLUMN_NAME = 'default_whcode'`
    );
    const hasDefWh = Number(((whCol.data || [])[0] as { c: number })?.c || 0) > 0;
    const shopsSql = hasDefWh
      ? `SELECT shop_code, name, is_warehouse, default_whcode FROM t_shop ORDER BY name ASC`
      : `SELECT shop_code, name, is_warehouse, NULL AS default_whcode FROM t_shop ORDER BY name ASC`;

    const shopsResult = await dbService.query(shopsSql);

    // Fetch payment methods
    const paymentMethodsResult = await dbService.query(
      `SELECT pm_code, payment_method 
       FROM t_payment_method 
       ORDER BY payment_method ASC`
    );

    // Fetch suppliers (for purchase orders)
    const suppliersResult = await dbService.query(
      `SELECT supp_code, name, phone_1, email_1, pm_code 
       FROM t_suppliers 
       ORDER BY name ASC`
    );

    console.log('[API] Form data fetched successfully');
    console.log('[API] Customers:', customersResult.data?.length || 0);
    console.log('[API] Products:', productsResult.data?.length || 0);
    console.log('[API] Shops:', shopsResult.data?.length || 0);
    console.log('[API] Payment Methods:', paymentMethodsResult.data?.length || 0);
    console.log('[API] Suppliers:', suppliersResult.data?.length || 0);

    return NextResponse.json({
      success: true,
      data: {
        customers: customersResult.data || [],
        products: productsResult.data || [],
        shops: shopsResult.data || [],
        suppliers: suppliersResult.data || [],
        employees: [], // Empty array for now since t_employees table might not exist
        paymentMethods: paymentMethodsResult.data || []
      }
    });

  } catch (error) {
    console.error('[API] Error fetching form data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch form data: ${errorMessage}` },
      { status: 500 }
    );
  }
}
