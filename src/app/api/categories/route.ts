import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { sqlNow } from '@/lib/datetime';
import { userActionLogger } from '@/lib/simple-logger';
import { getUserFromRequest } from '@/lib/user-context';

export async function GET(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    let sql = 'SELECT cate_code, `desc`, create_date, modify_date FROM t_items_category';
    let countSql = 'SELECT COUNT(*) as total FROM t_items_category';
    let params: (string | number)[] = [];
    // Add search condition if search parameter is provided
    if (search && search.trim()) {
      const searchCondition = 'WHERE cate_code LIKE ? OR `desc` LIKE ?';
      sql += ` ${searchCondition}`;
      countSql += ` ${searchCondition}`;
      const searchPattern = `%${search.trim()}%`;
      params = [searchPattern, searchPattern];
    }
    // Add ordering
    sql += ' ORDER BY `desc`';
    // Add pagination
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    // Execute queries
    const [result, countResult] = await Promise.all([
      dbService.query(sql, params),
      dbService.query(countSql, search && search.trim() ? [`%${search.trim()}%`, `%${search.trim()}%`] : [])
    ]);
    const total = (countResult.data as unknown as Array<{ total: number }>)[0]?.total || 0;
    // Log user action
    userActionLogger.view(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'CATEGORIES',
      undefined,
      { search, limit, offset, total },
      userContext.ipAddress
    );
    return NextResponse.json({
      success: true,
      data: result.data,
      total: total,
      limit: limit,
      offset: offset,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch categories',
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const body = await request.json();
    
    const { cate_code, desc } = body;
    if (!cate_code || !desc) {
      return NextResponse.json({
        success: false,
        error: 'Category code and description are required',
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }
    // Check if category code already exists
    const checkQuery = 'SELECT COUNT(*) as cnt FROM t_items_category WHERE cate_code = ?';
    const checkResult = await dbService.query(checkQuery, [cate_code]);
    const exists = checkResult.data?.[0]?.cnt || 0;
    if (exists > 0) {
      return NextResponse.json({
        success: false,
        error: 'Category code already exists',
      }, { status: 409 });
    }
    // Insert new category (don't include uid as it's auto-increment)
    const insertData = {
      cate_code: cate_code.trim(),
      desc: desc.trim(),
      create_date: sqlNow(),
      modify_date: sqlNow(),
    };
    const result = await dbService.insert('t_items_category', insertData);
    userActionLogger.create(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'CATEGORIES',
      cate_code,
      {
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        insertId: (result as unknown as { insertId: number }).insertId,
        timestamp: new Date().toISOString(),
        message: 'Category created successfully'
      },
      userContext.ipAddress
    );
    return NextResponse.json({
      success: true,
      message: 'Category created successfully',
      category: insertData
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create category',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const body = await request.json();
    const { cate_code, desc } = body;

    if (!cate_code) {
      return NextResponse.json({
        success: false,
        error: 'Category code is required',
      }, { status: 400 });
    }

    // Check if category exists
    const checkQuery = 'SELECT COUNT(*) as cnt FROM t_items_category WHERE cate_code = ?';
    const checkResult = await dbService.query(checkQuery, [cate_code]);
    const exists = checkResult.data?.[0]?.cnt || 0;
    if (exists === 0) {
      return NextResponse.json({
        success: false,
        error: 'Category not found',
      }, { status: 404 });
    }

    // Update category
    const updateData: Record<string, string> = {};
    if (desc) {
      updateData.desc = desc.trim();
    }
    updateData.modify_date = sqlNow();

    const result = await dbService.update('t_items_category', updateData, 'cate_code = ?', [cate_code]);
    
    userActionLogger.update(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'CATEGORIES',
      cate_code,
      {
        updateData,
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        message: 'Category updated successfully'
      },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      message: 'Category updated successfully',
      category: { ...updateData, cate_code }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update category',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const body = await request.json();
    const { cate_code } = body;

    if (!cate_code) {
      return NextResponse.json({
        success: false,
        error: 'Category code is required',
      }, { status: 400 });
    }

    // Check if category is used in items
    const usageQuery = 'SELECT COUNT(*) as cnt FROM t_items WHERE cate_code = ?';
    const usageResult = await dbService.query(usageQuery, [cate_code]);
    const usageCount = usageResult.data?.[0]?.cnt || 0;
    if (usageCount > 0) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete category. It is used by ${usageCount} item(s).`,
      }, { status: 409 });
    }

    // Delete category
    const result = await dbService.delete('t_items_category', 'cate_code = ?', [cate_code]);
    
    userActionLogger.delete(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'CATEGORIES',
      cate_code,
      {
        usageCount,
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        message: 'Category deleted successfully'
      },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
      deleted: true
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete category',
      },
      { status: 500 }
    );
  }
} 
