/**
 * Stable transaction-type IDs live in t_prefix.prefix_ref.
 * t_prefix.prefix is the user-editable document code used in trans_code (e.g. SO2608-001).
 *
 * t_transaction_h.prefix_ref stores the stable type id.
 * t_transaction_h.prefix mirrors prefix_ref (kept filled for legacy readers / schema).
 * Join t_prefix on prefix_ref for the current display code.
 */

/** Canonical stable refs (seeded in scripts/sql/001_create_t_prefix.sql) */
export const PREFIX_REF = {
  ADJ: '_AD',
  DN: '_DN',
  GRN: '_GR',
  INV: '_INV',
  PO: '_PO',
  QTA: '_QT',
  SO: '_SO',
  ST: '_ST',
  CR: '_CR',
  DR: '_DR',
} as const;

export type PrefixRef = (typeof PREFIX_REF)[keyof typeof PREFIX_REF];

/** Default display codes paired with each ref (also used as legacy aliases). */
export const DEFAULT_DISPLAY_BY_REF: Record<string, string> = {
  [PREFIX_REF.ADJ]: 'ADJ',
  [PREFIX_REF.DN]: 'DN',
  [PREFIX_REF.GRN]: 'GRN',
  [PREFIX_REF.INV]: 'INV',
  [PREFIX_REF.PO]: 'PO',
  [PREFIX_REF.QTA]: 'QTA',
  [PREFIX_REF.SO]: 'SO',
  [PREFIX_REF.ST]: 'ST',
  [PREFIX_REF.CR]: 'CR',
  [PREFIX_REF.DR]: 'DR',
};

/** Map default/legacy display → prefix_ref */
export const DISPLAY_TO_PREFIX_REF: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_DISPLAY_BY_REF).map(([ref, display]) => [display, ref])
);

/** Extra legacy document codes (e.g. GR vs GRN) → prefix_ref */
export const EXTRA_DISPLAY_TO_PREFIX_REF: Record<string, string> = {
  GR: PREFIX_REF.GRN,
};

const REF_SET = new Set(Object.values(PREFIX_REF).map((r) => r.toUpperCase()));

export function isPrefixRef(value: string | null | undefined): boolean {
  const v = String(value || '').trim().toUpperCase();
  return REF_SET.has(v) || (v.startsWith('_') && v.length >= 2);
}

/**
 * Normalize a query/header value that may be either display (`SO`) or ref (`_SO`)
 * into the stable prefix_ref.
 */
export function normalizeToPrefixRef(value: string | null | undefined): string {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (DISPLAY_TO_PREFIX_REF[raw]) return DISPLAY_TO_PREFIX_REF[raw];
  if (EXTRA_DISPLAY_TO_PREFIX_REF[raw]) return EXTRA_DISPLAY_TO_PREFIX_REF[raw];
  if (raw.startsWith('_')) return raw;
  return raw;
}

/**
 * Resolve stable prefix_ref from stored transaction header values.
 * Prefer t_transaction_h.prefix_ref; legacy rows may only have display/old value in prefix.
 */
export function effectivePrefixRef(
  prefixRefCol: string | null | undefined,
  storedPrefix: string | null | undefined
): string {
  const fromCol = String(prefixRefCol || '').trim().toUpperCase();
  if (fromCol) return fromCol;
  const p = String(storedPrefix || '').trim().toUpperCase();
  if (!p) return '';
  if (isPrefixRef(p)) return p;
  return normalizeToPrefixRef(p);
}

/** Split CSV of mixed display/ref values into unique normalized prefix_refs. */
export function normalizePrefixRefList(csvOrList: string | string[]): string[] {
  const parts = Array.isArray(csvOrList)
    ? csvOrList
    : String(csvOrList || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const ref = normalizeToPrefixRef(p);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

/** Default display code for a known ref (before DB lookup). */
export function defaultDisplayForRef(prefixRef: string): string {
  const ref = String(prefixRef || '').trim().toUpperCase();
  return DEFAULT_DISPLAY_BY_REF[ref] || ref.replace(/^_/, '');
}

/** Value to persist on t_transaction_h.prefix_ref. */
export function storedTransactionHeaderRef(prefixRef: string): string {
  return String(prefixRef || '').trim().toUpperCase();
}

/** @deprecated Use storedTransactionHeaderRef for t_transaction_h; generator uses t_prefix.prefix */
export function storedTransactionPrefix(prefixRef: string): string {
  return storedTransactionHeaderRef(prefixRef);
}

function uniqueMatchTokensForRefs(refs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const u = String(value || '').trim().toUpperCase();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  for (const raw of refs) {
    const normalized = normalizeToPrefixRef(raw) || String(raw || '').trim().toUpperCase();
    if (!normalized) continue;
    add(normalized);
    add(defaultDisplayForRef(normalized));
    add(raw);
    for (const [alias, mapped] of Object.entries(EXTRA_DISPLAY_TO_PREFIX_REF)) {
      if (mapped === normalized) add(alias);
    }
  }
  return out;
}

/**
 * SQL: match rows by t_transaction_h.prefix_ref (legacy fallback on prefix column).
 */
export function bindParamsForPrefixRefMatch(
  refs: string[],
  alias = 'h'
): {
  sql: string;
  params: string[];
} {
  const tokens = uniqueMatchTokensForRefs(refs);
  if (tokens.length === 0) {
    return { sql: '1=0', params: [] };
  }
  const ph = tokens.map(() => '?').join(',');
  const sql = `(
    UPPER(TRIM(COALESCE(${alias}.prefix_ref, ''))) IN (${ph})
    OR UPPER(TRIM(COALESCE(${alias}.prefix, ''))) IN (${ph})
  )`;
  return { sql, params: [...tokens, ...tokens] };
}

export function prefixRefBind(prefixRef: string): [string, string] {
  return [String(prefixRef).toUpperCase(), defaultDisplayForRef(prefixRef).toUpperCase()];
}

/** True when stored header prefix matches expected stable ref (supports legacy display values). */
export function matchesPrefixRef(
  storedPrefix: string | null | undefined,
  prefixRefCol: string | null | undefined,
  expectedRef: string
): boolean {
  const expected = normalizeToPrefixRef(expectedRef);
  if (!expected) return false;
  return effectivePrefixRef(prefixRefCol, storedPrefix) === expected;
}

/** SQL IN tuple for ref + legacy display, e.g. IN ('_SO', 'SO'). */
export function sqlPrefixInPair(ref: string): string {
  const r = storedTransactionPrefix(ref);
  const d = defaultDisplayForRef(r);
  return `('${r}', '${d}')`;
}

/** SQL IN list covering ref + legacy display for one or more refs. */
export function sqlPrefixInList(refs: string[]): string {
  const tokens = uniqueMatchTokensForRefs(refs);
  if (tokens.length === 0) return "('__NONE__')";
  return `(${tokens.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})`;
}

/** True when header prefix_ref or prefix is one of the given types (includes GR = GRN). */
export function sqlHeaderMatchesPrefixRefs(alias: string, refs: string[]): string {
  const list = sqlPrefixInList(refs);
  return `(
    UPPER(TRIM(COALESCE(${alias}.prefix_ref, ''))) IN ${list}
    OR UPPER(TRIM(COALESCE(${alias}.prefix, ''))) IN ${list}
  )`;
}

/** JOIN t_prefix to resolve current display code from stored prefix_ref. */
export function sqlJoinPrefixDisplay(hAlias = 'h', pAlias = 'p'): string {
  return `LEFT JOIN t_prefix ${pAlias} ON UPPER(TRIM(${pAlias}.prefix_ref)) = UPPER(TRIM(COALESCE(NULLIF(TRIM(${hAlias}.prefix_ref), ''), ${hAlias}.prefix)))`;
}

/** SELECT current display prefix (falls back to stored value). */
export function sqlSelectDisplayPrefix(hAlias = 'h', pAlias = 'p', alias = 'prefix'): string {
  return `COALESCE(${pAlias}.prefix, UPPER(TRIM(COALESCE(${hAlias}.prefix, '')))) AS ${alias}`;
}

/** Stable prefix_ref key for grouping (from prefix_ref column or legacy prefix). */
export function sqlStoredPrefixKey(hAlias = 'h', alias = 'prefix_key'): string {
  return `UPPER(TRIM(COALESCE(NULLIF(TRIM(${hAlias}.prefix_ref), ''), ${hAlias}.prefix))) AS ${alias}`;
}

/**
 * SQL fragment matching one prefix_ref on t_transaction_h (legacy fallback on prefix column).
 * Bind params: [ref, ref, displayFallback].
 */
export function sqlEqualsStoredPrefixRef(alias?: string): string {
  const p = alias ? `${alias}.prefix` : 'prefix';
  const r = alias ? `${alias}.prefix_ref` : 'prefix_ref';
  return `(
    UPPER(TRIM(COALESCE(${r}, ''))) = ?
    OR (
      TRIM(COALESCE(${r}, '')) = ''
      AND UPPER(TRIM(COALESCE(${p}, ''))) = ?
    )
    OR (
      TRIM(COALESCE(${r}, '')) = ''
      AND UPPER(TRIM(COALESCE(${p}, ''))) = ?
    )
  )`;
}

export function bindEqualsStoredPrefixRef(ref: string): string[] {
  const r = storedTransactionHeaderRef(ref);
  const d = defaultDisplayForRef(r);
  return [r, r, d];
}
