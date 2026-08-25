import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { userActionLogger } from '@/lib/simple-logger';
import { getUserFromRequest } from '@/lib/user-context';
import { resetMonthlyItemTypeCache } from '@/lib/ensureMonthlyItemType';

function afterItemTypeMutation() {
  resetMonthlyItemTypeCache();
}

function normalizeTypeCode(raw: unknown): string {
  return String(raw ?? '').trim();
}

function isValidTypeCode(code: string): boolean {
  return /^\d{1,10}$/.test(code) && Number(code) > 0;
}

export async function GET(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let sql = 'SELECT type_code, name FROM t_items_type';
    let countSql = 'SELECT COUNT(*) as total FROM t_items_type';
    let params: (string | number)[] = [];

    if (search && search.trim()) {
      const searchCondition = 'WHERE type_code LIKE ? OR name LIKE ?';
      sql += ` ${searchCondition}`;
      countSql += ` ${searchCondition}`;
      const searchPattern = `%${search.trim()}%`;
      params = [searchPattern, searchPattern];
    }

    sql += ' ORDER BY CAST(type_code AS UNSIGNED) ASC, name ASC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      dbService.query(sql, params),
      dbService.query(
        countSql,
        search && search.trim() ? [`%${search.trim()}%`, `%${search.trim()}%`] : []
      ),
    ]);

    const total = (countResult.data as unknown as Array<{ total: number }>)[0]?.total || 0;

    userActionLogger.view(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'ITEM_TYPES',
      undefined,
      { search, limit, offset, total },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      data: result.data,
      total,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch item types',
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
    const type_code = normalizeTypeCode(body.type_code);
    const name = String(body.name ?? '').trim();

    if (!type_code || !name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Type code and name are required',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }
    if (!isValidTypeCode(type_code)) {
      return NextResponse.json(
        { success: false, error: 'Type code must be a positive number' },
        { status: 400 }
      );
    }

    const checkQuery =
      'SELECT COUNT(*) as cnt FROM t_items_type WHERE CAST(type_code AS UNSIGNED) = ?';
    const checkResult = await dbService.query(checkQuery, [Number(type_code)]);
    const exists = Number(checkResult.data?.[0]?.cnt || 0);
    if (exists > 0) {
      return NextResponse.json(
        { success: false, error: 'Type code already exists' },
        { status: 409 }
      );
    }

    const insertData = {
      type_code,
      name,
    };
    const result = await dbService.insert('t_items_type', insertData);
    afterItemTypeMutation();

    userActionLogger.create(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'ITEM_TYPES',
      type_code,
      {
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        insertId: (result as unknown as { insertId: number }).insertId,
        timestamp: new Date().toISOString(),
        message: 'Item type created successfully',
      },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      message: 'Item type created successfully',
      itemType: insertData,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create item type',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const body = await request.json();
    const type_code = normalizeTypeCode(body.type_code);
    const name = body.name != null ? String(body.name).trim() : '';

    if (!type_code) {
      return NextResponse.json(
        { success: false, error: 'Type code is required' },
        { status: 400 }
      );
    }

    const checkQuery =
      'SELECT COUNT(*) as cnt FROM t_items_type WHERE CAST(type_code AS UNSIGNED) = ?';
    const checkResult = await dbService.query(checkQuery, [Number(type_code)]);
    const exists = Number(checkResult.data?.[0]?.cnt || 0);
    if (exists === 0) {
      return NextResponse.json(
        { success: false, error: 'Item type not found' },
        { status: 404 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    const updateData = { name };
    const result = await dbService.update(
      't_items_type',
      updateData,
      'CAST(type_code AS UNSIGNED) = ?',
      [Number(type_code)]
    );
    afterItemTypeMutation();

    userActionLogger.update(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'ITEM_TYPES',
      type_code,
      {
        updateData,
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        message: 'Item type updated successfully',
      },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      message: 'Item type updated successfully',
      itemType: { ...updateData, type_code },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update item type',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const body = await request.json();
    const type_code = normalizeTypeCode(body.type_code);

    if (!type_code) {
      return NextResponse.json(
        { success: false, error: 'Type code is required' },
        { status: 400 }
      );
    }

    const usageQuery = 'SELECT COUNT(*) as cnt FROM t_items WHERE type = ?';
    const usageResult = await dbService.query(usageQuery, [Number(type_code)]);
    const usageCount = Number(usageResult.data?.[0]?.cnt || 0);
    if (usageCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete item type. It is used by ${usageCount} item(s).`,
        },
        { status: 409 }
      );
    }

    const result = await dbService.delete(
      't_items_type',
      'CAST(type_code AS UNSIGNED) = ?',
      [Number(type_code)]
    );
    afterItemTypeMutation();

    userActionLogger.delete(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'ITEM_TYPES',
      type_code,
      {
        usageCount,
        affectedRows: (result as unknown as { affectedRows: number }).affectedRows,
        message: 'Item type deleted successfully',
      },
      userContext.ipAddress
    );

    return NextResponse.json({
      success: true,
      message: 'Item type deleted successfully',
      deleted: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete item type',
      },
      { status: 500 }
    );
  }
}
