import { NextResponse } from 'next/server';
import dbService from '@/lib/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');
    let sql = 'SELECT item_code, eng_name, chi_name FROM t_items';
    let params: (string | number)[] = [];
    if (search) {
      sql += ' WHERE item_code LIKE ? OR eng_name LIKE ? OR chi_name LIKE ?';
      const searchPattern = `%${search}%`;
      params = [searchPattern, searchPattern, searchPattern];
    }
    sql += ` ORDER BY item_code LIMIT ${limit}`;
    const result = await dbService.query(sql, params);
    return NextResponse.json({
      success: true,
      data: result.data || [],
      total: result.data?.length || 0,
      query: sql,
      parameters: params,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
} 
