import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

// GET - Fetch all payment methods
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortColumn = searchParams.get('sortColumn');
    const sortDirection = searchParams.get('sortDirection');

    let orderByClause = 'ORDER BY payment_method';
    if (sortColumn) {
      const validColumns = ['pm_code', 'payment_method', 'create_date', 'modify_date'];
      if (validColumns.includes(sortColumn)) {
        orderByClause = `ORDER BY ${sortColumn} ${sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }
    }

    const result = await dbService.query(
      `SELECT pm_code, payment_method, create_date, modify_date 
       FROM t_payment_method 
       ${orderByClause}`
    );
    
    return NextResponse.json({
      success: true,
      data: result.data,
      total: result.data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch payment methods',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add new payment method
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pm_code, payment_method } = body;
    
    // Validate required fields
    if (!pm_code || !payment_method) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment method code and description are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if payment method code already exists
    const existing = await dbService.query(
      'SELECT pm_code FROM t_payment_method WHERE pm_code = ?',
      [pm_code]
    );
    
    if (existing.data.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment method code already exists' 
        },
        { status: 409 }
      );
    }
    
    // Insert new payment method
    await dbService.query(
      'INSERT INTO t_payment_method (pm_code, payment_method) VALUES (?, ?)',
      [pm_code, payment_method]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Payment method added successfully',
      data: {
        pm_code,
        payment_method
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add payment method',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH - Update payment method
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.pm_code) {
      return NextResponse.json(
        { success: false, error: 'Payment method code is required' },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    
    const allowedFields = ['payment_method'];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        params.push(body[field]);
      }
    });

    params.push(body.pm_code);

    // Always update modify_date when updating
    updateFields.push('modify_date = CURRENT_TIMESTAMP()');

    const query = `
      UPDATE t_payment_method
      SET ${updateFields.join(', ')}
      WHERE pm_code = ?
    `;

    await dbService.query(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'Payment method updated successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update payment method',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete payment method
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { pm_code } = body;
    
    if (!pm_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment method code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if payment method exists
    const paymentMethodExists = await dbService.query(
      'SELECT COUNT(*) as cnt FROM t_payment_method WHERE pm_code = ?',
      [pm_code]
    );
    
    if ((paymentMethodExists.data as unknown as Array<{ cnt: number }>)[0].cnt === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Payment method not found' 
      }, { status: 404 });
    }

    // Delete payment method
    await dbService.query(
      'DELETE FROM t_payment_method WHERE pm_code = ?',
      [pm_code]
    );
    
    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'Payment method deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete payment method',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}