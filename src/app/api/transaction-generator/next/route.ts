import { NextRequest, NextResponse } from 'next/server';
import { TransactionGeneratorMiddleware } from '@/middleware/transactionGenerator';
import { resolvePrefixPair } from '@/lib/ensurePrefixRefColumn';

/**
 * POST /api/transaction-generator/next
 * Body: { prefix_ref: '_SO' | ... } preferred, or legacy { prefix: 'SO' }.
 * Display code for the new trans_code is always taken from t_prefix.prefix.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { suffix, sessionId } = body;
    const rawPrefix = String(body.prefix_ref || body.prefix || '').trim();

    if (!rawPrefix || !suffix || !sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: prefix_ref (preferred) or prefix, suffix, sessionId',
        },
        { status: 400 }
      );
    }

    const resolved = await resolvePrefixPair(rawPrefix);
    if (!resolved) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown transaction type "${rawPrefix}". Add or enable it in t_prefix first.`,
        },
        { status: 400 }
      );
    }

    const result = await TransactionGeneratorMiddleware.generateNext({
      prefix: resolved.prefix_ref,
      suffix: String(suffix).trim(),
      sessionId: String(sessionId).trim(),
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to generate transaction code' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transactionCode: result.transactionCode,
      lastNumber: result.lastNumber,
      prefix: result.prefix,
      prefix_ref: result.prefix_ref,
    });
  } catch (error) {
    console.error('Error generating transaction code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate transaction code' },
      { status: 500 }
    );
  }
}
