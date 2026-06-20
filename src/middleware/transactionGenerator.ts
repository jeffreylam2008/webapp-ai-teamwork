import dbService from '@/lib/database';
import {
  generatorSeqQuoted,
  getTransNumGeneratorSchema,
  sequenceFromGeneratorRow,
  type TransNumGeneratorSchema,
} from '@/lib/transNumGeneratorSchema';

export type GenerateNextParams = {
  prefix: string;
  suffix: string;
  sessionId: string;
};

export type GenerateNextResult =
  | { success: true; transactionCode: string; lastNumber: number; message?: string; error?: string }
  | { success: false; transactionCode?: undefined; lastNumber?: undefined; error: string };

function pad3(n: number) {
  return String(n).padStart(3, '0');
}

function quoteCols(names: string[]): string {
  return names.map((n) => '`' + n.replace(/`/g, '') + '`').join(', ');
}

async function tableExists(table: string): Promise<boolean> {
  try {
    const r = await dbService.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [table]
    );
    const cnt = Number((r.data as Array<{ cnt: number }> | undefined)?.[0]?.cnt || 0);
    return cnt > 0;
  } catch {
    return false;
  }
}

/** Highest sequence already used in saved transactions for this prefix+suffix. */
async function maxSeqFromTransactionHeaders(prefix: string, suffix: string): Promise<number> {
  const like = `${prefix}${suffix}-%`;
  const r = await dbService.query<{ trans_code: string }>(
    'SELECT trans_code FROM t_transaction_h WHERE trans_code LIKE ? ORDER BY trans_code DESC LIMIT 1',
    [like]
  );
  const last = (r.data as Array<{ trans_code: string }> | undefined)?.[0]?.trans_code || '';
  const m = String(last).match(/-(\d{1,})$/);
  const lastNum = m ? Number(m[1]) : 0;
  return Number.isFinite(lastNum) ? lastNum : 0;
}

async function nextFromFallback(prefix: string, suffix: string): Promise<GenerateNextResult> {
  try {
    const headerMax = await maxSeqFromTransactionHeaders(prefix, suffix);
    const nextNum = headerMax + 1;
    return { success: true, transactionCode: `${prefix}${suffix}-${pad3(nextNum)}`, lastNumber: nextNum };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fallback generator failed' };
  }
}

/**
 * Atomic increment when UNIQUE(prefix, suffix) exists: one row per pair, last += 1.
 */
async function generateNextWithUniqueKey(
  prefix: string,
  suffix: string,
  sessionId: string,
  sch: TransNumGeneratorSchema,
  headerMax: number
): Promise<GenerateNextResult> {
  const seqQ = generatorSeqQuoted(sch)!;
  const initialLast = headerMax + 1;

  const insertCols = ['prefix', 'suffix', sch.seqCol!];
  const insertPh = ['?', '?', '?'];
  const insertParams: (string | number | null)[] = [prefix, suffix, initialLast];

  if (sch.hasStatus) {
    insertCols.push('status');
    insertPh.push('?');
    insertParams.push('reserved');
  }
  if (sch.hasSessionId) {
    insertCols.push('session_id');
    insertPh.push('?');
    insertParams.push(sessionId);
  }

  const updateParts = [`${seqQ} = GREATEST(${seqQ}, ?) + 1`];
  const updateParams: (string | number | null)[] = [headerMax];
  if (sch.hasStatus) {
    updateParts.push(`status = 'reserved'`);
  }
  if (sch.hasSessionId) {
    updateParts.push('session_id = ?');
    updateParams.push(sessionId);
  }

  await dbService.query(
    `INSERT INTO t_trans_num_generator (${quoteCols(insertCols)})
     VALUES (${insertPh.join(', ')})
     ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}`,
    [...insertParams, ...updateParams]
  );

  const r = await dbService.query<{ v: number }>(
    `SELECT ${seqQ} AS v FROM t_trans_num_generator WHERE prefix = ? AND suffix = ? LIMIT 1`,
    [prefix, suffix]
  );
  const lastNumber = Number((r.data as Array<{ v: number }> | undefined)?.[0]?.v || 0);
  if (!lastNumber) return { success: false, error: 'failed to allocate next number' };

  const transactionCode = `${prefix}${suffix}-${pad3(lastNumber)}`;
  return { success: true, transactionCode, lastNumber, message: 'Generated successfully' };
}

/**
 * Transactional path when UNIQUE(prefix, suffix) is missing: merge duplicate rows, then last += 1.
 */
async function generateNextTransactional(
  prefix: string,
  suffix: string,
  sessionId: string,
  sch: TransNumGeneratorSchema,
  headerMax: number
): Promise<GenerateNextResult> {
  const seqQ = generatorSeqQuoted(sch)!;

  await dbService.query('START TRANSACTION');
  try {
    const locked = await dbService.query<Record<string, unknown>>(
      `SELECT * FROM t_trans_num_generator WHERE prefix = ? AND suffix = ? FOR UPDATE`,
      [prefix, suffix]
    );
    const rows = locked.data || [];

    let keeperUid: number | null = null;
    let maxSeq = 0;

    for (const row of rows) {
      const seq = sequenceFromGeneratorRow(row, sch);
      const uid = Number(row.uid);
      if (!keeperUid || seq > maxSeq || (seq === maxSeq && uid < keeperUid)) {
        maxSeq = seq;
        keeperUid = uid;
      }
    }

    for (const row of rows) {
      const uid = Number(row.uid);
      if (keeperUid != null && uid !== keeperUid) {
        await dbService.query('DELETE FROM t_trans_num_generator WHERE uid = ?', [uid]);
      }
    }

    const nextNum = Math.max(maxSeq, headerMax) + 1;

    if (keeperUid == null) {
      const insertCols = ['prefix', 'suffix', sch.seqCol!];
      const insertPh = ['?', '?', '?'];
      const insertParams: (string | number | null)[] = [prefix, suffix, nextNum];
      if (sch.hasStatus) {
        insertCols.push('status');
        insertPh.push('?');
        insertParams.push('reserved');
      }
      if (sch.hasSessionId) {
        insertCols.push('session_id');
        insertPh.push('?');
        insertParams.push(sessionId);
      }
      await dbService.query(
        `INSERT INTO t_trans_num_generator (${quoteCols(insertCols)}) VALUES (${insertPh.join(', ')})`,
        insertParams
      );
    } else {
      const setParts = [`${seqQ} = ?`];
      const updateParams: (string | number | null)[] = [nextNum];
      if (sch.hasStatus) {
        setParts.push(`status = 'reserved'`);
      }
      if (sch.hasSessionId) {
        setParts.push('session_id = ?');
        updateParams.push(sessionId);
      }
      updateParams.push(keeperUid);
      await dbService.query(
        `UPDATE t_trans_num_generator SET ${setParts.join(', ')} WHERE uid = ?`,
        updateParams
      );
    }

    await dbService.query('COMMIT');

    const transactionCode = `${prefix}${suffix}-${pad3(nextNum)}`;
    return { success: true, transactionCode, lastNumber: nextNum, message: 'Generated successfully' };
  } catch (e) {
    try {
      await dbService.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export class TransactionGeneratorMiddleware {
  /**
   * Allocate the next transaction code for (prefix, suffix).
   * Exactly one counter row per prefix+suffix; sequence = max(stored last, headers) + 1.
   */
  static async generateNext(params: GenerateNextParams): Promise<GenerateNextResult> {
    const prefix = String(params.prefix || '').trim().toUpperCase();
    const suffix = String(params.suffix || '').trim();
    const sessionId = String(params.sessionId || '').trim();
    if (!prefix) return { success: false, error: 'prefix is required' };
    if (!suffix) return { success: false, error: 'suffix is required' };
    if (!sessionId) return { success: false, error: 'sessionId is required' };

    const hasTable = await tableExists('t_trans_num_generator');
    if (!hasTable) return nextFromFallback(prefix, suffix);

    try {
      const sch = await getTransNumGeneratorSchema();
      const seqQ = generatorSeqQuoted(sch);
      if (!seqQ || !sch.seqCol) {
        return nextFromFallback(prefix, suffix);
      }

      const headerMax = await maxSeqFromTransactionHeaders(prefix, suffix);

      if (sch.hasUniquePrefixSuffix) {
        return await generateNextWithUniqueKey(prefix, suffix, sessionId, sch, headerMax);
      }

      return await generateNextTransactional(prefix, suffix, sessionId, sch, headerMax);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generator failed';
      const fallback = await nextFromFallback(prefix, suffix);
      if (fallback.success) return fallback;
      return { success: false, error: msg };
    }
  }
}
