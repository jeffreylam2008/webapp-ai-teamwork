import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/services/dbService';
import { systemLogger } from '@/lib/simple-logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const sortColumn = searchParams.get('sortColumn') || 'transaction_date';
    const sortDirection = searchParams.get('sortDirection') || 'DESC';

    // Valid sort columns
    const validSortColumns = [
      'transaction_id', 'transaction_date', 'transaction_type', 
      'item_code', 'item_name', 'quantity', 'unit_price', 
      'total_amount', 'shop_code', 'reference_no', 'status', 'create_date'
    ];

    // Validate sort column
    const finalSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'transaction_date';
    const finalSortDirection = sortDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause for search
    let whereClause = '';
    let searchParamsArray: (string | number | boolean | null)[] = [];

    if (search) {
      whereClause = `WHERE (
        transaction_id LIKE ? OR 
        item_code LIKE ? OR 
        item_name LIKE ? OR 
        reference_no LIKE ? OR
        shop_code LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      searchParamsArray = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM t_transaction_h ${whereClause}`;
    const countResult = await executeQuery<{ total: number }[]>(countQuery, searchParamsArray);
    const total = countResult[0]?.total || 0;

    // Get data with pagination
    const dataQuery = `
      SELECT 
        uid,
        transaction_id,
        transaction_date,
        transaction_type,
        item_code,
        item_name,
        quantity,
        unit_price,
        total_amount,
        shop_code,
        reference_no,
        status,
        create_date,
        modify_date
      FROM t_transaction_h 
      ${whereClause}
      ORDER BY ${finalSortColumn} ${finalSortDirection}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...searchParamsArray, limit, offset];
    const dataResult = await executeQuery(dataQuery, dataParams);

    systemLogger.info('Warehouse stock data retrieved', {
      total,
      page,
      limit,
      search: search || 'none'
    });

    return NextResponse.json({
      success: true,
      data: dataResult,
      total,
      page,
      limit,
      offset,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemLogger.error('Error retrieving warehouse stock data', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve stock data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      transaction_id,
      transaction_date,
      transaction_type,
      item_code,
      item_name,
      quantity,
      unit_price,
      total_amount,
      shop_code,
      reference_no,
      status = 'Active'
    } = body;

    // Validate required fields
    if (!transaction_id || !transaction_date || !transaction_type || !item_code || !item_name) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: transaction_id, transaction_date, transaction_type, item_code, item_name',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Check if transaction_id already exists
    const existingQuery = 'SELECT 1 FROM t_transaction_h WHERE transaction_id = ? LIMIT 1';
    const existingResult = await executeQuery(existingQuery, [transaction_id]);
    
    if ((existingResult as unknown[]).length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Transaction ID already exists',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Insert new transaction
    const insertQuery = `
      INSERT INTO t_transaction_h (
        transaction_id, transaction_date, transaction_type, item_code, item_name,
        quantity, unit_price, total_amount, shop_code, reference_no, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertParams = [
      transaction_id,
      transaction_date,
      transaction_type,
      item_code,
      item_name,
      quantity || 0,
      unit_price || 0,
      total_amount || 0,
      shop_code || '',
      reference_no || '',
      status
    ];

    await executeQuery(insertQuery, insertParams);

    systemLogger.info('New warehouse stock transaction created', {
      transaction_id,
      transaction_type,
      item_code
    });

    return NextResponse.json({
      success: true,
      message: 'Transaction created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemLogger.error('Error creating warehouse stock transaction', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create transaction',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
