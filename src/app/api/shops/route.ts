import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

function bodyToWarehouseFlag(v: unknown): number {
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

// GET - Fetch all shops
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const warehouseOnly = searchParams.get('warehouseOnly');
    const excludeWarehouse = searchParams.get('excludeWarehouse');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const sortColumn = searchParams.get('sortColumn') || 'name';
    const sortDirection = searchParams.get('sortDirection') || 'asc';
    
    let query =
      'SELECT uid, shop_code, name, phone, address1, address2, is_warehouse, default_whcode, create_date, modify_date FROM t_shop';
    let countQuery = 'SELECT COUNT(*) as total FROM t_shop';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];
    
    // Build WHERE clause
    const whereConditions: string[] = [];
    if (warehouseOnly === '1') {
      whereConditions.push('is_warehouse = 1');
    } else if (excludeWarehouse === '1') {
      // Non-warehouse locations only (e.g. login shop picker; warehouses are is_warehouse = 1)
      whereConditions.push('(is_warehouse = 0 OR is_warehouse IS NULL)');
    }
    if (search) {
      whereConditions.push('(shop_code LIKE ? OR name LIKE ? OR address1 LIKE ? OR address2 LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    // Validate and sanitize sort column
    const validSortColumns = [
      'shop_code',
      'name',
      'phone',
      'address1',
      'address2',
      'is_warehouse',
      'default_whcode',
      'create_date',
    ];
    const sanitizedSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'name';
    const sanitizedSortDirection = ['asc', 'desc'].includes(sortDirection.toLowerCase()) ? sortDirection.toLowerCase() : 'asc';
    
    query += ` ORDER BY ${sanitizedSortColumn} ${sanitizedSortDirection}`;
    
    // Add pagination
    if (limit) {
      const limitNum = parseInt(limit);
      const offsetNum = offset ? parseInt(offset) : 0;
      
      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offsetNum);
    }
    
    // Get paginated data
    const result = await dbService.query(query, params);
    
    // Get total count
    const countResult = await dbService.query(countQuery, countParams);
    const totalCount = (countResult.data as unknown as Array<{ total: number }>)[0]?.total || 0;
    
    return NextResponse.json({
      success: true,
      data: result.data,
      total: totalCount,
      limit: limit ? parseInt(limit) : null,
      offset: offset ? parseInt(offset) : 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch shops',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add new shop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop_code, name, phone, address1, address2, is_warehouse, default_whcode } = body;
    const wh = bodyToWarehouseFlag(is_warehouse);
    // DB column is NOT NULL; use empty string when unset
    const defaultWh = typeof default_whcode === 'string' ? default_whcode.trim() : '';

    // Validate required fields
    if (!shop_code || !name || !phone || !address1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop code, name, phone, and address1 are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if shop code already exists
    const existing = await dbService.query(
      'SELECT shop_code FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    if (existing.data.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop code already exists' 
        },
        { status: 400 }
      );
    }
    
    // Insert new shop
    await dbService.query(
      'INSERT INTO t_shop (shop_code, name, phone, address1, address2, is_warehouse, default_whcode, create_date, modify_date) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [shop_code, name, phone, address1, address2 || '', wh, defaultWh]
    );

    return NextResponse.json({
      success: true,
      message: '店舖已成功建立',
      data: {
        shop_code,
        name,
        phone,
        address1,
        address2: address2 || '',
        is_warehouse: wh,
        default_whcode: defaultWh,
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create shop',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT - Update shop
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop_code, name, phone, address1, address2, is_warehouse, default_whcode } = body;
    const wh = bodyToWarehouseFlag(is_warehouse);
    // DB column is NOT NULL; use empty string when unset
    const defaultWh = typeof default_whcode === 'string' ? default_whcode.trim() : '';

    // Validate required fields
    if (!shop_code || !name || !phone || !address1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop code, name, phone, and address1 are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if shop exists
    const existing = await dbService.query(
      'SELECT shop_code FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    if ((existing.data as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop not found' 
        },
        { status: 404 }
      );
    }
    
    // Update shop
    await dbService.query(
      'UPDATE t_shop SET name = ?, phone = ?, address1 = ?, address2 = ?, is_warehouse = ?, default_whcode = ?, modify_date = NOW() WHERE shop_code = ?',
      [name, phone, address1, address2 || '', wh, defaultWh, shop_code]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Shop updated successfully',
      data: {
        shop_code,
        name,
        phone,
        address1,
        address2: address2 || '',
        is_warehouse: wh,
        default_whcode: defaultWh,
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update shop',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete shop
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop_code } = body;
    
    if (!shop_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if shop exists
    const existing = await dbService.query(
      'SELECT shop_code FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    if ((existing.data as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop not found' 
        },
        { status: 404 }
      );
    }
    
    // Block deletion when the shop is referenced anywhere.
    // 1) User login defaults: t_employee.default_shopcode references t_shop.shop_code
    const employeeUse = await dbService.query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM t_employee WHERE default_shopcode = ?',
      [shop_code]
    );
    const employeeCnt = Number((employeeUse.data as unknown as Array<{ cnt: number }>)[0]?.cnt || 0);
    if (employeeCnt > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete shop: it is used as a default shop for one or more users',
        },
        { status: 400 }
      );
    }

    // 2) Other shops default warehouse: t_shop.default_whcode references the warehouse shop_code
    const whRefUse = await dbService.query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM t_shop WHERE default_whcode = ?',
      [shop_code]
    );
    const whRefCnt = Number((whRefUse.data as unknown as Array<{ cnt: number }>)[0]?.cnt || 0);
    if (whRefCnt > 0) {
      return NextResponse.json(
        {
          success: false,
          error: '無法刪除倉庫：至少一間店舖已將此倉庫設為預設倉庫。',
        },
        { status: 400 }
      );
    }

    // 3) Transactions: used as header.shop_code OR detail.wh_code
    const headerUse = await dbService.query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM t_transaction_h WHERE shop_code = ?',
      [shop_code]
    );
    const detailUse = await dbService.query<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM t_transaction_d WHERE wh_code = ?',
      [shop_code]
    );
    const headerCnt = Number((headerUse.data as unknown as Array<{ cnt: number }>)[0]?.cnt || 0);
    const detailCnt = Number((detailUse.data as unknown as Array<{ cnt: number }>)[0]?.cnt || 0);
    if (headerCnt > 0 || detailCnt > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete shop: it has related transaction records',
        },
        { status: 400 }
      );
    }
    
    // Delete shop
    await dbService.query(
      'DELETE FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Shop deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete shop',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
