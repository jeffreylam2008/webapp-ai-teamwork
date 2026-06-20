import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    console.log('[API] Fetching form data for transaction edit');

    const productCategory = request.nextUrl.searchParams.get('product_category')?.trim() || '';

    // Fetch customers
    const customersResult = await dbService.query(
      `SELECT cust_code, name, phone_1, email_1, pm_code 
       FROM t_customers 
       ORDER BY name ASC`
    );

    // Fetch products (optional product_category limits to one t_items_category.cate_code)
    const productParams: string[] = [];
    let productsSql =
      `SELECT item_code, eng_name, chi_name, unit, price, cate_code FROM t_items`;
    if (productCategory) {
      productsSql += ` WHERE cate_code = ?`;
      productParams.push(productCategory);
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
