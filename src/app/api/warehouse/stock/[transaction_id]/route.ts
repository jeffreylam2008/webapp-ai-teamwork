import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/services/dbService';
import { systemLogger } from '@/lib/simple-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transaction_id: string }> }
) {
  try {
    const { transaction_id } = await params;

    const query = `
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
      WHERE transaction_id = ?
    `;

    const result = await executeQuery(query, [transaction_id]);

    if ((result as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Transaction not found',
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      );
    }

    systemLogger.info('Warehouse stock transaction retrieved', {
      transaction_id
    });

    return NextResponse.json({
      success: true,
      data: (result as unknown[])[0],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemLogger.error('Error retrieving warehouse stock transaction', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve transaction',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transaction_id: string }> }
) {
  try {
    const { transaction_id } = await params;
    const body = await request.json();

    const {
      transaction_date,
      transaction_type,
      item_code,
      item_name,
      quantity,
      unit_price,
      total_amount,
      shop_code,
      reference_no,
      status
    } = body;

    // Check if transaction exists
    const existingQuery = 'SELECT 1 FROM t_transaction_h WHERE transaction_id = ? LIMIT 1';
    const existingResult = await executeQuery(existingQuery, [transaction_id]);
    
    if ((existingResult as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Transaction not found',
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      );
    }

    // Update transaction
    const updateQuery = `
      UPDATE t_transaction_h SET
        transaction_date = ?,
        transaction_type = ?,
        item_code = ?,
        item_name = ?,
        quantity = ?,
        unit_price = ?,
        total_amount = ?,
        shop_code = ?,
        reference_no = ?,
        status = ?,
        modify_date = NOW()
      WHERE transaction_id = ?
    `;

    const updateParams = [
      transaction_date,
      transaction_type,
      item_code,
      item_name,
      quantity || 0,
      unit_price || 0,
      total_amount || 0,
      shop_code || '',
      reference_no || '',
      status || 'Active',
      transaction_id
    ];

    await executeQuery(updateQuery, updateParams);

    // Get updated data
    const updatedQuery = `
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
      WHERE transaction_id = ?
    `;

    const updatedResult = await executeQuery(updatedQuery, [transaction_id]);

    systemLogger.info('Warehouse stock transaction updated', {
      transaction_id
    });

    return NextResponse.json({
      success: true,
      data: (updatedResult as unknown[])[0],
      message: 'Transaction updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemLogger.error('Error updating warehouse stock transaction', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update transaction',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ transaction_id: string }> }
) {
  try {
    const { transaction_id } = await params;

    // Check if transaction exists
    const existingQuery = 'SELECT 1 FROM t_transaction_h WHERE transaction_id = ? LIMIT 1';
    const existingResult = await executeQuery(existingQuery, [transaction_id]);
    
    if ((existingResult as unknown[]).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Transaction not found',
          timestamp: new Date().toISOString()
        },
        { status: 404 }
      );
    }

    // Delete transaction
    const deleteQuery = 'DELETE FROM t_transaction_h WHERE transaction_id = ?';
    await executeQuery(deleteQuery, [transaction_id]);

    systemLogger.info('Warehouse stock transaction deleted', {
      transaction_id
    });

    return NextResponse.json({
      success: true,
      message: 'Transaction deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemLogger.error('Error deleting warehouse stock transaction', error as Error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete transaction',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
