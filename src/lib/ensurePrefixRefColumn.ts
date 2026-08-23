import dbService from '@/lib/database';
import { columnExists, createIndexIfMissing, indexExists } from '@/lib/schemaMigration';
import {
  DISPLAY_TO_PREFIX_REF,
  storedTransactionPrefix,
} from '@/lib/prefixRef';

let ensured = false;
let prefixDateColsEnsured = false;

/** Ensure t_prefix has create_date / modify_date (older DBs may lack them). */
export async function ensurePrefixDateColumns(): Promise<void> {
  if (prefixDateColsEnsured) return;
  try {
    if (!(await columnExists('t_prefix', 'create_date'))) {
      await dbService.query(
        `ALTER TABLE t_prefix
         ADD COLUMN create_date DATETIME NULL DEFAULT CURRENT_TIMESTAMP`
      );
      await dbService.query(
        `UPDATE t_prefix SET create_date = NOW() WHERE create_date IS NULL`
      );
    }
    if (!(await columnExists('t_prefix', 'modify_date'))) {
      await dbService.query(
        `ALTER TABLE t_prefix
         ADD COLUMN modify_date DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
      await dbService.query(
        `UPDATE t_prefix SET modify_date = COALESCE(create_date, NOW()) WHERE modify_date IS NULL`
      );
    }
    prefixDateColsEnsured = true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_DUP_FIELDNAME') {
      prefixDateColsEnsured = true;
      return;
    }
    throw err;
  }
}

/**
 * Ensure t_prefix.prefix_ref and t_transaction_h.prefix_ref are populated.
 * Transaction type is stored in t_transaction_h.prefix_ref; display code comes from t_prefix.prefix.
 */
export async function ensurePrefixRefColumn(): Promise<void> {
  await ensurePrefixDateColumns();
  if (ensured) return;

  try {
  const prefixCols = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_prefix'
       AND COLUMN_NAME = 'prefix_ref'`
  );
  if (!(prefixCols.data || []).length) {
    await dbService.query(
      `ALTER TABLE t_prefix
       ADD COLUMN prefix_ref VARCHAR(10) NULL
       COMMENT 'Stable type id; prefix is user-editable display code'`
    );
    for (const [display, ref] of Object.entries(DISPLAY_TO_PREFIX_REF)) {
      await dbService.query(
        `UPDATE t_prefix SET prefix_ref = ? WHERE UPPER(TRIM(prefix)) = ? AND (prefix_ref IS NULL OR TRIM(prefix_ref) = '')`,
        [ref, display]
      );
    }
    await dbService.query(
      `UPDATE t_prefix SET prefix_ref = CONCAT('_', UPPER(TRIM(prefix)))
       WHERE prefix_ref IS NULL OR TRIM(prefix_ref) = ''`
    );
    try {
      const hasUnique = await indexExists('t_prefix', 'uq_t_prefix_prefix_ref');
      if (!hasUnique) {
        await dbService.query(
          `ALTER TABLE t_prefix
           MODIFY COLUMN prefix_ref VARCHAR(10) NOT NULL,
           ADD UNIQUE KEY uq_t_prefix_prefix_ref (prefix_ref)`
        );
      }
    } catch {
      // unique may already exist
    }
  }

  const hCols = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_transaction_h'
       AND COLUMN_NAME = 'prefix_ref'`
  );
  if (!(hCols.data || []).length) {
    await dbService.query(
      `ALTER TABLE t_transaction_h
       ADD COLUMN prefix_ref VARCHAR(10) NULL
       COMMENT 'Sync copy; t_transaction_h.prefix stores the stable ref'`
    );
  }

  await dbService.query(
    `UPDATE t_transaction_h h
     INNER JOIN t_prefix p ON UPPER(TRIM(h.prefix)) = UPPER(TRIM(p.prefix))
     SET h.prefix_ref = p.prefix_ref
     WHERE h.prefix_ref IS NULL OR TRIM(h.prefix_ref) = ''`
  );

  // Backfill prefix_ref from legacy display codes in prefix column (do not overwrite prefix_ref with prefix)
  for (const [display, ref] of Object.entries(DISPLAY_TO_PREFIX_REF)) {
    await dbService.query(
      `UPDATE t_transaction_h
       SET prefix_ref = ?
       WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '')
         AND UPPER(TRIM(prefix)) = ?`,
      [ref, display]
    );
  }

  // Fill empty prefix from prefix_ref (rows created after prefix was omitted on insert)
  await dbService.query(
    `UPDATE t_transaction_h
     SET prefix = prefix_ref
     WHERE prefix_ref IS NOT NULL AND TRIM(prefix_ref) <> ''
       AND (prefix IS NULL OR TRIM(prefix) = '')`
  );

  // Keep prefix in sync with prefix_ref when prefix still holds a legacy display code
  await dbService.query(
    `UPDATE t_transaction_h
     SET prefix = prefix_ref
     WHERE prefix_ref IS NOT NULL AND TRIM(prefix_ref) <> ''
       AND UPPER(TRIM(prefix)) <> UPPER(TRIM(prefix_ref))
       AND UPPER(TRIM(prefix_ref)) LIKE '\\_%'`
  );

  await createIndexIfMissing('t_transaction_h', 'idx_transaction_h_prefix_ref', 'prefix_ref');

  ensured = true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Index/constraint already present — safe to continue
    if (code === 'ER_DUP_KEYNAME' || code === 'ER_DUP_ENTRY') {
      ensured = true;
      return;
    }
    throw err;
  }
}

async function loadPrefixRowByRef(
  prefixRef: string
): Promise<{ prefix: string; prefix_ref: string } | null> {
  const ref = storedTransactionPrefix(prefixRef);
  if (!ref) return null;
  const byRef = await dbService.query<{ prefix: string; prefix_ref: string }>(
    `SELECT prefix, prefix_ref FROM t_prefix
     WHERE UPPER(TRIM(prefix_ref)) = ?
     LIMIT 1`,
    [ref]
  );
  const row = byRef.data?.[0];
  if (!row) return null;
  return {
    prefix: String(row.prefix).trim().toUpperCase(),
    prefix_ref: storedTransactionPrefix(row.prefix_ref),
  };
}

/**
 * Resolve current display prefix + stable prefix_ref from t_prefix.
 * Accepts prefix_ref (_SO) or current/legacy display code (SO / SORD).
 * Display code always comes from t_prefix.prefix when the row exists.
 */
export async function resolvePrefixPair(
  input: string | null | undefined
): Promise<{ prefix: string; prefix_ref: string } | null> {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  await ensurePrefixRefColumn();

  // 1) Exact prefix_ref match in master
  const byRef = await loadPrefixRowByRef(upper);
  if (byRef) return byRef;

  // 2) Exact current display prefix match in master
  const byDisplay = await dbService.query<{ prefix: string; prefix_ref: string }>(
    `SELECT prefix, prefix_ref FROM t_prefix
     WHERE UPPER(TRIM(prefix)) = ?
     LIMIT 1`,
    [upper]
  );
  if (byDisplay.data?.[0]) {
    return {
      prefix: String(byDisplay.data[0].prefix).trim().toUpperCase(),
      prefix_ref: storedTransactionPrefix(byDisplay.data[0].prefix_ref),
    };
  }

  // 3) Legacy hardcoded display (SO, INV, …) → look up current t_prefix row by known ref
  const legacyRef = DISPLAY_TO_PREFIX_REF[upper];
  if (legacyRef) {
    const fromLegacy = await loadPrefixRowByRef(legacyRef);
    if (fromLegacy) return fromLegacy;
  }

  return null;
}

/** Current display code from master for a stored prefix_ref. */
export async function resolveDisplayPrefix(prefixRef: string): Promise<string> {
  const ref = storedTransactionPrefix(prefixRef);
  if (!ref) return '';
  const pair = await resolvePrefixPair(ref);
  return pair?.prefix || ref.replace(/^_/, '');
}
