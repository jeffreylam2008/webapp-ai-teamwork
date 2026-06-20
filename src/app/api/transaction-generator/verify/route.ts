import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    console.log('Transaction verification API called');
    const { sessionId } = await request.json();
    console.log('Verifying sessionId:', sessionId);

    if (!sessionId) {
      console.error('Missing sessionId in verification request');
      return NextResponse.json(
        { success: false, error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    // Check if the transaction exists in the database
    console.log('Querying database for sessionId...');
    const result = await dbService.query(
      'SELECT * FROM t_trans_num_generator WHERE session_id = ?',
      [sessionId]
    );
    
    console.log('Database query result:', result);
    
    const exists = result.data && result.data.length > 0;
    console.log('Transaction exists in database:', exists);
    
    if (exists) {
      const transaction = result.data[0];
      console.log('Found transaction:', {
        uid: transaction.uid,
        prefix: transaction.prefix,
        suffix: transaction.suffix,
        last: transaction.last,
        session_id: transaction.session_id,
        status: transaction.status,
        create_date: transaction.create_date
      });
    }

    const response = {
      success: true,
      exists,
      transaction: exists ? result.data[0] : null,
      message: exists ? 'Transaction found in database' : 'Transaction not found in database'
    };
    
    console.log('Returning verification response:', response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error verifying transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify transaction' },
      { status: 500 }
    );
  }
}
