import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

// GET - Get customer by cust_code
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cust_code: string }> }
) {
  try {
    const { cust_code } = await params;
    
    const rows = await executeQuery(
      `SELECT 
        cust_code, name, attn_1, attn_2, delivery_addr, 
        phone_1, phone_2, pm_code, pt_code, status, 
        email_1, email_2, 
        create_date, modify_date, 
        remark, statement_remark 
      FROM t_customers 
      WHERE cust_code = ?`,
      [cust_code],
      { logQuery: true }
    );
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer not found' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      customer: rows[0]
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
// PUT - Update customer by cust_code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ cust_code: string }> }
) {
  try {
    const { cust_code } = await params;
    const body = await request.json();
    const { name, attn_1, delivery_addr, phone_1, pm_code, status } = body;
    
    // Update customer
    await executeQuery(
      'UPDATE t_customers SET name = ?, attn_1 = ?, delivery_addr = ?, phone_1 = ?, pm_code = ?, status = ? WHERE cust_code = ?',
      [name, attn_1, delivery_addr || null, phone_1, pm_code, status, cust_code]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Customer updated successfully',
      customer: {
        cust_code,
        name,
        attn_1,
        delivery_addr,
        phone_1,
        pm_code,
        status
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update customer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 
