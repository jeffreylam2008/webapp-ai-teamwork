import { NextRequest, NextResponse } from 'next/server';
import { TransactionGeneratorMiddleware } from '@/middleware/transactionGenerator';
import { isValidPrefix, getValidPrefixes } from '@/utils/transactionUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('Transaction generator API called');
    const { prefix, suffix, sessionId } = await request.json();
    console.log('Received data:', { prefix, suffix, sessionId });

    if (!prefix || !suffix || !sessionId) {
      console.error('Missing required fields:', { prefix, suffix, sessionId });
      return NextResponse.json(
        { success: false, error: 'Missing required fields: prefix, suffix, sessionId' },
        { status: 400 }
      );
    }

    // Validate prefix using single source of truth (transactionUtils)
    if (!isValidPrefix(prefix)) {
      console.error('Invalid prefix:', prefix);
      return NextResponse.json(
        {
          success: false,
          error: `Invalid prefix: ${prefix}. Valid prefixes are: ${getValidPrefixes().join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Use the middleware to generate the transaction number
    const result = await TransactionGeneratorMiddleware.generateNext({
      prefix,
      suffix,
      sessionId
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to generate transaction code' },
        { status: 500 }
      );
    }

    console.log('Returning response:', result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error generating transaction code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate transaction code' },
      { status: 500 }
    );
  }
}
