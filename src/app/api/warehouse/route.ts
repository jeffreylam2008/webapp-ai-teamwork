import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { userActionLogger } from '@/lib/simple-logger';
import { getUserFromRequest } from '@/lib/user-context';

export async function GET(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const itemCode = searchParams.get('item_code');
    if (!itemCode) {
      return NextResponse.json({
        success: false,
        error: 'Item code is required',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }
    // Query warehouse data for the specific item
    const query = `
      SELECT 
        uid,
        item_code,
        qty as stock_on_hand,
        type,
        create_date,
        modify_date
      FROM t_warehouse 
      WHERE item_code = ?
      ORDER BY uid
    `;
    const result = await dbService.query(query, [itemCode]);
    // Log user action
    userActionLogger.view(
      userContext.userId || 'anonymous',
      userContext.username || 'anonymous',
      'WAREHOUSE',
      itemCode,
      { stockCount: result.data?.length || 0 },
      userContext.ipAddress
    );
    return NextResponse.json({
      success: true,
      data: result.data || [],
      total: result.data?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
