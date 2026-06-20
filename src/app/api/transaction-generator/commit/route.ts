import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { generatorSeqQuoted, getTransNumGeneratorSchema } from '@/lib/transNumGeneratorSchema';
import { parseGeneratedTransactionCode } from '@/utils/transactionUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const transactionCode =
      typeof body.transactionCode === 'string' ? body.transactionCode.trim() : '';

    if (!sessionId && !transactionCode) {
      return NextResponse.json(
        { success: false, error: 'Missing sessionId or transactionCode' },
        { status: 400 }
      );
    }

    // 1) Preferred: row still has this session_id (works when no other next() overwrote it)
    if (sessionId) {
      const checkResult = await dbService.query(
        'SELECT uid FROM t_trans_num_generator WHERE session_id = ? LIMIT 1',
        [sessionId]
      );
      if ((checkResult.data?.length ?? 0) > 0) {
        const sch = await getTransNumGeneratorSchema();
        let updatedRows = 0;
        if (sch.hasStatus) {
          const updateResult = await dbService.query(
            'UPDATE t_trans_num_generator SET status = "committed" WHERE session_id = ?',
            [sessionId]
          );
          updatedRows = updateResult.affectedRows ?? 0;
        }
        return NextResponse.json({
          success: true,
          message: 'Transaction committed successfully',
          updatedRows,
          via: 'session_id',
        });
      }
    }

    // 2) Fallback: generator stores one row per (prefix, suffix); session_id is overwritten on each next().
    // Commit by the saved transaction code so the correct row is marked committed.
    if (transactionCode) {
      const parts = parseGeneratedTransactionCode(transactionCode);
      const sch = await getTransNumGeneratorSchema();
      const seqQ = generatorSeqQuoted(sch);
      if (parts && seqQ && sch.hasStatus) {
        const byParts = await dbService.query(
          `UPDATE t_trans_num_generator
           SET status = "committed"
           WHERE prefix = ? AND suffix = ? AND ${seqQ} = ?`,
          [parts.prefix, parts.suffix, parts.lastNumber]
        );
        const n = byParts.affectedRows ?? 0;
        if (n > 0) {
          return NextResponse.json({
            success: true,
            message: 'Transaction committed successfully',
            updatedRows: n,
            via: 'transaction_code',
          });
        }
      }

      // 3) Idempotent: document already persisted — treat as success (session row may be missing or stale)
      const exists = await dbService.query<{ c: number }>(
        'SELECT COUNT(*) AS c FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
        [transactionCode]
      );
      const cnt = Number(((exists.data || [])[0] as { c: number })?.c || 0);
      if (cnt > 0) {
        return NextResponse.json({
          success: true,
          message: 'Transaction already saved; generator commit skipped',
          updatedRows: 0,
          idempotent: true,
        });
      }
    }

    console.error('Session not found and could not commit by transaction code:', { sessionId, transactionCode });
    return NextResponse.json(
      {
        success: false,
        error:
          'Session not found. Generate a new number from the list, or ensure the transaction code matches the generator.',
      },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error committing transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to commit transaction' },
      { status: 500 }
    );
  }
}
