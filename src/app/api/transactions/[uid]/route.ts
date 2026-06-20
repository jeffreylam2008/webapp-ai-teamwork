import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params;
    
    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Transaction UID is required' },
        { status: 400 }
      );
    }
    
    // Delete the transaction from t_transaction_h
    const result = await dbService.query(
      'DELETE FROM t_transaction_h WHERE uid = ?',
      [uid]
    );
    
    if (result.affectedRows && result.affectedRows > 0) {
      return NextResponse.json({
        success: true,
        message: 'Transaction deleted successfully'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Transaction not found or already deleted'
      });
    }
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}

