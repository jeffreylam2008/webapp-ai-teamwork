import dbService from '@/lib/database';
import {
  generatorSeqQuoted,
  getTransNumGeneratorSchema,
  sequenceFromGeneratorRow,
  type TransNumGeneratorSchema,
} from '@/lib/transNumGeneratorSchema';
import { resolvePrefixPair } from '@/lib/ensurePrefixRefColumn';
import { bindParamsForPrefixRefMatch, storedTransactionPrefix } from '@/lib/prefixRef';

export type GenerateNextParams = {
  /** Stable prefix_ref (_SO) or legacy display code — resolved via t_prefix. */
  prefix: string;
  suffix: string;
  sessionId: string;
};

export type GenerateNextResult =
  | {
      success: true;
      transactionCode: string;
      lastNumber: number;
      /** Current display prefix from t_prefix.prefix (used in trans_code). */
      prefix: string;
      prefix_ref: string;
      message?: string;
    }
  | { success: false; error: string };

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
    return Number((r.data as Array<{ cnt: number }> | undefined)?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function resolveGeneratorInput(
  rawPrefix: string
): Promise<{ displayPrefix: string; prefixRef: string } | null> {
  const pair = await resolvePrefixPair(rawPrefix);
  if (!pair) return null;
  return {
    displayPrefix: String(pair.prefix).trim().toUpperCase(),
    prefixRef: storedTransactionPrefix(pair.prefix_ref),
  };
}

/** Max sequence for this type (prefix_ref) + suffix, across all historical display codes in trans_code. */
async function maxSeqFromTransactionHeaders(prefixRef: string, suffix: string): Promise<number> {
  const ref = storedTransactionPrefix(prefixRef);
  const { sql, params } = bindParamsForPrefixRefMatch([ref], 'h');
  const r = await dbService.query<{ trans_code: string }>(
    `SELECT h.trans_code FROM t_transaction_h h WHERE ${sql}`,
    params
  );

  let maxSeq = 0;
  const suffixPattern = new RegExp(`^(.+)${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  for (const row of r.data || []) {
    const code = String(row.trans_code || '').trim().toUpperCase();
    const m = code.match(suffixPattern);
    if (!m) continue;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return maxSeq;
}

async function loadGeneratorRows(displayPrefix: string, suffix: string): Promise<Record<string, unknown>[]> {
  const result = await dbService.query<Record<string, unknown>>(
    `SELECT * FROM t_trans_num_generator
     WHERE UPPER(TRIM(prefix)) = ? AND suffix = ?`,
    [displayPrefix.toUpperCase(), suffix]
  );
  return result.data || [];
}

async function nextFromFallback(
  displayPrefix: string,
  prefixRef: string,
  suffix: string
): Promise<GenerateNextResult> {
  try {
    const headerMax = await maxSeqFromTransactionHeaders(prefixRef, suffix);
    const nextNum = headerMax + 1;
    return {
      success: true,
      transactionCode: `${displayPrefix}${suffix}-${pad3(nextNum)}`,
      lastNumber: nextNum,
      prefix: displayPrefix,
      prefix_ref: prefixRef,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fallback generator failed' };
  }
}

async function generateNextTransactional(
  displayPrefix: string,
  prefixRef: string,
  suffix: string,
  sessionId: string,
  sch: TransNumGeneratorSchema,
  headerMax: number
): Promise<GenerateNextResult> {
  const seqQ = generatorSeqQuoted(sch)!;

  return dbService.withTransaction(async () => {
    const rows = await loadGeneratorRows(displayPrefix, suffix);
    let keeperUid: number | null = null;
    let maxSeq = 0;

    if (rows.length > 0) {
      const uids = rows.map((r) => Number(r.uid)).filter((id) => Number.isFinite(id));
      const placeholders = uids.map(() => '?').join(', ');
      const locked = await dbService.query<Record<string, unknown>>(
        `SELECT * FROM t_trans_num_generator WHERE uid IN (${placeholders}) FOR UPDATE`,
        uids
      );
      for (const row of locked.data || []) {
        const seq = sequenceFromGeneratorRow(row, sch);
        const uid = Number(row.uid);
        if (!keeperUid || seq > maxSeq || (seq === maxSeq && uid < keeperUid)) {
          maxSeq = seq;
          keeperUid = uid;
        }
      }
      for (const row of locked.data || []) {
        const uid = Number(row.uid);
        if (keeperUid != null && uid !== keeperUid) {
          await dbService.query('DELETE FROM t_trans_num_generator WHERE uid = ?', [uid]);
        }
      }
    }

    const nextNum = Math.max(maxSeq, headerMax) + 1;

    if (keeperUid == null) {
      const insertCols = ['prefix', 'suffix', sch.seqCol!];
      const insertPh = ['?', '?', '?'];
      const insertParams: (string | number | null)[] = [displayPrefix, suffix, nextNum];
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
      const setParts = ['prefix = ?', `${seqQ} = ?`];
      const updateParams: (string | number | null)[] = [displayPrefix, nextNum];
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

    return {
      success: true,
      transactionCode: `${displayPrefix}${suffix}-${pad3(nextNum)}`,
      lastNumber: nextNum,
      prefix: displayPrefix,
      prefix_ref: prefixRef,
      message: 'Generated successfully',
    };
  });
}

export class TransactionGeneratorMiddleware {
  /**
   * Allocate the next transaction code.
   * - Numbering uses t_prefix.prefix (display code) in trans_code and t_trans_num_generator.
   * - Sequence continuity follows t_transaction_h.prefix_ref (stable type id).
   */
  static async generateNext(params: GenerateNextParams): Promise<GenerateNextResult> {
    const rawPrefix = String(params.prefix || '').trim();
    const suffix = String(params.suffix || '').trim();
    const sessionId = String(params.sessionId || '').trim();
    if (!rawPrefix) return { success: false, error: 'prefix is required' };
    if (!suffix) return { success: false, error: 'suffix is required' };
    if (!sessionId) return { success: false, error: 'sessionId is required' };

    const resolved = await resolveGeneratorInput(rawPrefix);
    if (!resolved) {
      return { success: false, error: `Unknown transaction prefix: ${rawPrefix}` };
    }
    const { displayPrefix, prefixRef } = resolved;

    const hasTable = await tableExists('t_trans_num_generator');
    if (!hasTable) return nextFromFallback(displayPrefix, prefixRef, suffix);

    try {
      const sch = await getTransNumGeneratorSchema();
      const seqQ = generatorSeqQuoted(sch);
      if (!seqQ || !sch.seqCol) {
        return nextFromFallback(displayPrefix, prefixRef, suffix);
      }

      const headerMax = await maxSeqFromTransactionHeaders(prefixRef, suffix);
      return await generateNextTransactional(
        displayPrefix,
        prefixRef,
        suffix,
        sessionId,
        sch,
        headerMax
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generator failed';
      const fallback = await nextFromFallback(displayPrefix, prefixRef, suffix);
      if (fallback.success) return fallback;
      return { success: false, error: msg };
    }
  }
}

/** Lookup t_trans_num_generator row for commit/discard (keyed by display prefix from trans_code). */
export async function generatorLookupParams(
  displayPrefix: string,
  suffix: string,
  lastNumber: number
): Promise<{ whereSql: string; params: (string | number)[] }> {
  const sch = await getTransNumGeneratorSchema();
  const seqQ = generatorSeqQuoted(sch);
  const resolved = await resolveGeneratorInput(displayPrefix);
  const prefix = (resolved?.displayPrefix || displayPrefix).toUpperCase();
  return {
    whereSql: `UPPER(TRIM(prefix)) = ? AND suffix = ? AND ${seqQ || 'last_number'} = ?`,
    params: [prefix, suffix, lastNumber],
  };
}
