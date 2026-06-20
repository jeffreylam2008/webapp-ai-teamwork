import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

// GET - Fetch all districts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const sortColumn = searchParams.get('sortColumn') || 'district_eng';
    const sortDirection = searchParams.get('sortDirection') || 'asc';
    
    let query = 'SELECT district_code, district_eng, district_chi, region FROM t_district';
    let countQuery = 'SELECT COUNT(*) as total FROM t_district';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];
    
    // Build WHERE clause
    const whereConditions: string[] = [];
    if (search) {
      whereConditions.push('(district_code LIKE ? OR district_eng LIKE ?)');
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
    const validSortColumns = ['district_code', 'district_eng', 'district_chi', 'region'];
    const sanitizedSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'district_eng';
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
        error: 'Failed to fetch districts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Add new district
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { district_code, district_eng, district_chi, region } = body;
    
    // Validate required fields
    if (!district_code || !district_eng || !district_chi) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'District code, English name, and Chinese name are required' 
        },
        { status: 400 }
      );
    }
    
    // Check if district code already exists
    const existing = await dbService.query(
      'SELECT district_code FROM t_district WHERE district_code = ?',
      [district_code]
    );
    
    if (existing.data.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'District code already exists' 
        },
        { status: 409 }
      );
    }
    
    // Insert new district
    await dbService.query(
      'INSERT INTO t_district (district_code, district_eng, district_chi, region) VALUES (?, ?, ?, ?)',
      [district_code, district_eng, district_chi, region || 'HK']
    );
    
    return NextResponse.json({
      success: true,
      message: 'District added successfully',
      district: {
        district_code,
        district_eng,
        district_chi,
        region
      }
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add district',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PATCH - Update district
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.district_code) {
      return NextResponse.json(
        { success: false, error: 'District code is required' },
        { status: 400 }
      );
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    
    const allowedFields = ['district_eng', 'district_chi', 'region'];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        params.push(body[field]);
      }
    });

    params.push(body.district_code);

    const query = `
      UPDATE t_district
      SET ${updateFields.join(', ')}
      WHERE district_code = ?
    `;

    await dbService.query(query, params);
    
    return NextResponse.json({
      success: true,
      message: 'District updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating district:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete district
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { district_code } = body;
    
    if (!district_code) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'District code is required' 
        },
        { status: 400 }
      );
    }
    
    // Check if district exists
    const districtExists = await dbService.query(
      'SELECT COUNT(*) as cnt FROM t_district WHERE district_code = ?',
      [district_code]
    );
    
    if ((districtExists.data as unknown as Array<{ cnt: number }>)[0].cnt === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'District not found' 
      }, { status: 404 });
    }

    // Delete district
    await dbService.query(
      'DELETE FROM t_district WHERE district_code = ?',
      [district_code]
    );
    
    return NextResponse.json({
      success: true,
      deleted: true,
      message: 'District deleted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete district',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
