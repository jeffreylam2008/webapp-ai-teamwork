import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

// GET - Fetch all payment terms
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const sortColumn = searchParams.get('sortColumn') || 'payment_term';
    const sortDirection = searchParams.get('sortDirection') || 'asc';
    
    let query = 'SELECT `uid`, `pt_code`, `terms` as `payment_term`, `create_date`, `modify_date` FROM `t_payment_term`';
    let countQuery = 'SELECT COUNT(*) as total FROM `t_payment_term`';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];
    
    // Build WHERE clause
    const whereConditions: string[] = [];
    if (search) {
      whereConditions.push('(pt_code LIKE ? OR terms LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm);
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    // Validate and sanitize sort column
    const validSortColumns = ['pt_code', 'payment_term', 'create_date'];
    const sanitizedSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'payment_term';
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
        error: 'Failed to fetch payment terms',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add new payment term
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pt_code, payment_term } = body;
    
    // Validate required fields
    if (!pt_code || !payment_term) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment term code and description are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if payment term code already exists
    const existing = await dbService.query(
      'SELECT `pt_code` FROM `t_payment_term` WHERE `pt_code` = ?',
      [pt_code]
    );
    
    if (existing.data.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment term code already exists' 
        },
        { status: 409 }
      );
    }
    
    // Insert new payment term
    await dbService.query(
      'INSERT INTO `t_payment_term` (`pt_code`, `terms`, `create_date`, `modify_date`) VALUES (?, ?, NOW(), NOW())',
      [pt_code, payment_term]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Payment term added successfully',
      payment_term: {
        pt_code,
        payment_term
      }
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add payment term',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH - Update payment term
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.pt_code) {
      return NextResponse.json(
        { success: false, error: 'Payment term code is required' },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    
    const allowedFields = ['terms'];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        params.push(body[field]);
      }
    });

    // Add modify_date update
    updateFields.push('modify_date = NOW()');
    params.push(body.pt_code);

    const query = `
      UPDATE t_payment_term
      SET ${updateFields.join(', ')}
      WHERE pt_code = ?
    `;

    await dbService.query(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'Payment term updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating payment term:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete payment term
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { pt_code } = body;
    
    if (!pt_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment term code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if payment term exists
    const paymentTermExists = await dbService.query(
      'SELECT COUNT(*) as cnt FROM `t_payment_term` WHERE `pt_code` = ?',
      [pt_code]
    );
    
    if ((paymentTermExists.data as unknown as Array<{ cnt: number }>)[0].cnt === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Payment term not found' 
      }, { status: 404 });
    }

    // Delete payment term
    await dbService.query(
      'DELETE FROM `t_payment_term` WHERE `pt_code` = ?',
      [pt_code]
    );
    
    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'Payment term deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete payment term',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}