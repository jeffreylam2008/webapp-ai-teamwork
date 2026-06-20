import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

function bodyToWarehouseFlag(v: unknown): number {
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

// GET - Fetch specific shop by shop_code
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shop_code: string }> }
) {
  try {
    const { shop_code } = await params;
    
    const result = await dbService.query(
      'SELECT uid, shop_code, name, phone, address1, address2, is_warehouse, default_whcode, create_date, modify_date FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    if ((result.data as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop not found' 
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: (result.data as unknown[])[0],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch shop',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT - Update specific shop by shop_code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shop_code: string }> }
) {
  try {
    const { shop_code } = await params;
    const body = await request.json();
    const { name, phone, address1, address2, is_warehouse, default_whcode } = body;
    const wh = bodyToWarehouseFlag(is_warehouse);
    // DB column is NOT NULL; use empty string when unset
    const defaultWh = typeof default_whcode === 'string' ? default_whcode.trim() : '';
    
    // Validate required fields
    if (!name || !phone || !address1) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Shop name, phone, and address1 are required' 
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
    
    // Fetch updated shop data
    const updatedResult = await dbService.query(
      'SELECT uid, shop_code, name, phone, address1, address2, is_warehouse, default_whcode, create_date, modify_date FROM t_shop WHERE shop_code = ?',
      [shop_code]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Shop updated successfully',
      data: (updatedResult.data as unknown[])[0],
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
