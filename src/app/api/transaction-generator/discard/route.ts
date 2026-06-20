import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import {
  generatorSeqQuoted,
  getTransNumGeneratorSchema,
  sequenceFromGeneratorRow,
} from '@/lib/transNumGeneratorSchema';
import { parseGeneratedTransactionCode } from '@/utils/transactionUtils';

function transactionCodeFromRow(row: Record<string, unknown>, prefix: string, suffix: string, lastNumber: number): string {
  return `${prefix}${suffix}-${lastNumber.toString().padStart(3, '0')}`;
}

async function isTransactionInUse(transCode: string): Promise<boolean> {
  const inUse = await dbService.query('SELECT 1 FROM t_transaction_h WHERE trans_code = ? LIMIT 1', [transCode]);
  return Boolean(inUse.data && inUse.data.length > 0);
}

async function applyGeneratorDiscard(
  whereSql: string,
  whereParams: (string | number)[],
  inUse: boolean
): Promise<number> {
  const sch = await getTransNumGeneratorSchema();

  if (inUse) {
    if (sch.hasStatus) {
      const updateResult = await dbService.query(
        `UPDATE t_trans_num_generator SET status = "committed" WHERE ${whereSql}`,
        whereParams
      );
      return updateResult.affectedRows ?? 0;
    }
    if (sch.hasSessionId) {
      const updateResult = await dbService.query(
        `UPDATE t_trans_num_generator SET session_id = NULL WHERE ${whereSql}`,
        whereParams
      );
      return updateResult.affectedRows ?? 0;
    }
    return 0;
  }

  if (sch.hasStatus && sch.hasSessionId) {
    const updateResult = await dbService.query(
      `UPDATE t_trans_num_generator SET session_id = NULL, status = "discarded" WHERE ${whereSql}`,
      whereParams
    );
    return updateResult.affectedRows ?? 0;
  }
  if (sch.hasSessionId) {
    const updateResult = await dbService.query(
      `UPDATE t_trans_num_generator SET session_id = NULL WHERE ${whereSql}`,
      whereParams
    );
    return updateResult.affectedRows ?? 0;
  }
  if (sch.hasStatus) {
    const updateResult = await dbService.query(
      `UPDATE t_trans_num_generator SET status = "discarded" WHERE ${whereSql}`,
      whereParams
    );
    return updateResult.affectedRows ?? 0;
  }
  return 0;
}

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

    const sch = await getTransNumGeneratorSchema();

    if (sessionId) {
      const checkResult = await dbService.query(
        'SELECT * FROM t_trans_num_generator WHERE session_id = ? LIMIT 1',
        [sessionId]
      );

      if (checkResult.data && checkResult.data.length > 0) {
        const genRow = checkResult.data[0] as Record<string, unknown>;
        const prefix = String(genRow.prefix || '');
        const suffix = String(genRow.suffix || '');
        const lastNumber = sequenceFromGeneratorRow(genRow, sch);
        const code = transactionCodeFromRow(genRow, prefix, suffix, lastNumber);
        const inUse = await isTransactionInUse(code);
        const updatedRows = await applyGeneratorDiscard('session_id = ?', [sessionId], inUse);

        return NextResponse.json({
          success: true,
          message: 'Transaction discarded successfully',
          updatedRows,
          via: 'session_id',
        });
      }
    }

    if (transactionCode) {
      const parts = parseGeneratedTransactionCode(transactionCode);
      const seqQ = generatorSeqQuoted(sch);
      const inUse = await isTransactionInUse(transactionCode);

      if (parts && seqQ) {
        const updatedRows = await applyGeneratorDiscard(
          `prefix = ? AND suffix = ? AND ${seqQ} = ?`,
          [parts.prefix, parts.suffix, parts.lastNumber],
          inUse
        );
        if (updatedRows > 0) {
          return NextResponse.json({
            success: true,
            message: 'Transaction discarded successfully',
            updatedRows,
            via: 'transaction_code',
          });
        }
      }

      if (!inUse) {
        return NextResponse.json({
          success: true,
          message: 'Transaction number not in use; discard treated as complete',
          updatedRows: 0,
          idempotent: true,
        });
      }

      if (parts && seqQ && sch.hasStatus) {
        await dbService.query(
          `UPDATE t_trans_num_generator SET status = "committed" WHERE prefix = ? AND suffix = ? AND ${seqQ} = ?`,
          [parts.prefix, parts.suffix, parts.lastNumber]
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Transaction already saved; generator release skipped',
        updatedRows: 0,
        idempotent: true,
      });
    }

    return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
  } catch (error) {
    console.error('Error discarding transaction:', error);
    return NextResponse.json({ success: false, error: 'Failed to discard transaction' }, { status: 500 });
  }
}
