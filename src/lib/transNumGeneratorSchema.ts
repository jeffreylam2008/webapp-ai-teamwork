import dbService from '@/lib/database';

export type TransNumGeneratorSchema = {
  /** Actual column name for the numeric sequence (quoted in SQL). */
  seqCol: string | null;
  hasStatus: boolean;
  hasSessionId: boolean;
  /** True when a UNIQUE index covers both prefix and suffix (required for safe upsert). */
  hasUniquePrefixSuffix: boolean;
};

let cache: TransNumGeneratorSchema | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

function quoteIdent(name: string): string {
  return '`' + String(name).replace(/`/g, '') + '`';
}

/**
 * Inspect `t_trans_num_generator` so we support both `last_number` and legacy `last` (and similar).
 */
export async function getTransNumGeneratorSchema(): Promise<TransNumGeneratorSchema> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;

  const r = await dbService.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_trans_num_generator'`
  );
  const lower = new Set((r.data || []).map((row) => String(row.COLUMN_NAME).toLowerCase()));

  let seqCol: string | null = null;
  if (lower.has('last_number')) seqCol = 'last_number';
  else if (lower.has('last')) seqCol = 'last';
  else if (lower.has('lastnum')) seqCol = 'lastnum';

  const idx = await dbService.query<{ INDEX_NAME: string; COLUMN_NAME: string; NON_UNIQUE: number; SEQ_IN_INDEX: number }>(
    `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_trans_num_generator'
       AND INDEX_NAME <> 'PRIMARY'`
  );
  const byIndex = new Map<string, { nonUnique: number; cols: string[] }>();
  for (const row of idx.data || []) {
    const name = String(row.INDEX_NAME);
    const entry = byIndex.get(name) ?? { nonUnique: Number(row.NON_UNIQUE), cols: [] };
    entry.cols[Number(row.SEQ_IN_INDEX)] = String(row.COLUMN_NAME).toLowerCase();
    byIndex.set(name, entry);
  }
  let hasUniquePrefixSuffix = false;
  for (const entry of byIndex.values()) {
    if (entry.nonUnique !== 0) continue;
    const cols = entry.cols.filter(Boolean);
    if (cols.length === 2 && cols.includes('prefix') && cols.includes('suffix')) {
      hasUniquePrefixSuffix = true;
      break;
    }
  }

  cache = {
    seqCol,
    hasStatus: lower.has('status'),
    hasSessionId: lower.has('session_id'),
    hasUniquePrefixSuffix,
  };
  cacheAt = now;
  return cache;
}

/** Clear schema cache after DDL (e.g. adding UNIQUE index). */
export function clearTransNumGeneratorSchemaCache(): void {
  cache = null;
  cacheAt = 0;
}

/** Safe `` `col` `` for SQL fragments. */
export function generatorSeqQuoted(schema: TransNumGeneratorSchema): string | null {
  if (!schema.seqCol) return null;
  return quoteIdent(schema.seqCol);
}

/** Read sequence value from a generator row (SELECT *). */
export function sequenceFromGeneratorRow(row: Record<string, unknown>, schema: TransNumGeneratorSchema): number {
  const keys = [schema.seqCol, 'last_number', 'last', 'lastnum'].filter(Boolean) as string[];
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}
