import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

// GET - Fetch all prefixes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const sortColumn = searchParams.get('sortColumn') || 'prefix_name';
    const sortDirection = searchParams.get('sortDirection') || 'asc';
    
    let query = 'SELECT uid, prefix as prefix_code, `desc` as prefix_name, status FROM t_prefix';
    let countQuery = 'SELECT COUNT(*) as total FROM t_prefix';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];
    
    // Build WHERE clause
    const whereConditions: string[] = [];
    if (search) {
      whereConditions.push('(prefix LIKE ? OR `desc` LIKE ?)');
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
    const validSortColumns = ['prefix_code', 'prefix_name', 'status'];
    const sanitizedSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'prefix_name';
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
        error: 'Failed to fetch prefixes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add new prefix
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prefix_code, prefix_name, prefix_desc, status } = body;
    
    // Validate required fields
    if (!prefix_code || !prefix_name) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Prefix code and prefix name are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if prefix code already exists
    const existing = await dbService.query(
      'SELECT prefix FROM t_prefix WHERE prefix = ?',
      [prefix_code]
    );
    
    if (existing.data.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Prefix code already exists' 
        },
        { status: 409 }
      );
    }
    
    // Insert new prefix
    await dbService.query(
      'INSERT INTO t_prefix (prefix, `desc`, status) VALUES (?, ?, ?)',
      [prefix_code, prefix_name, status === 'Active' ? 1 : 0]
    );
    
    return NextResponse.json({
      success: true,
      message: 'Prefix added successfully',
      prefix: {
        prefix_code,
        prefix_name,
        prefix_desc,
        status
      }
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add prefix',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH - Update prefix
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.prefix_code) {
      return NextResponse.json(
        { success: false, error: 'Prefix code is required' },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    
    const allowedFields = ['prefix_name', 'status'];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        if (field === 'prefix_name') {
          updateFields.push('`desc` = ?');
          params.push(body[field]);
        } else if (field === 'status') {
          updateFields.push('status = ?');
          params.push(body[field] === 'Active' ? 1 : 0);
        }
      }
    });

    params.push(body.prefix_code);

    const query = `
      UPDATE t_prefix
      SET ${updateFields.join(', ')}
      WHERE prefix_code = ?
    `;

    await dbService.query(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'Prefix updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating prefix:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete prefix
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { prefix_code } = body;
    
    if (!prefix_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Prefix code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if prefix exists
    const prefixExists = await dbService.query(
      'SELECT COUNT(*) as cnt FROM t_prefix WHERE prefix = ?',
      [prefix_code]
    );
    
    if ((prefixExists.data as unknown as Array<{ cnt: number }>)[0].cnt === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Prefix not found' 
      }, { status: 404 });
    }

    // Delete prefix
    await dbService.query(
      'DELETE FROM t_prefix WHERE prefix = ?',
      [prefix_code]
    );
    
    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'Prefix deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete prefix',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
