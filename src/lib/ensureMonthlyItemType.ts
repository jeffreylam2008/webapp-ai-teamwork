import dbService from '@/lib/database';
import {
  MONTHLY_ITEM_TYPE_CODE_PREFERRED,
  MONTHLY_ITEM_TYPE_NAME,
} from '@/config/itemTypes';

let cachedMonthlyTypeCode: number | null = null;

function asTypeCode(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Ensures t_items_type has a Monthly row and returns its type_code
 * (referenced by t_items.type for monthly-invoice item filtering).
 */
export async function ensureMonthlyItemTypeCode(): Promise<number> {
  if (cachedMonthlyTypeCode != null) return cachedMonthlyTypeCode;

  const existing = await dbService.query<{ type_code: string | number | null }>(
    `SELECT type_code FROM t_items_type
     WHERE LOWER(TRIM(COALESCE(name, ''))) = LOWER(?)
     LIMIT 1`,
    [MONTHLY_ITEM_TYPE_NAME]
  );
  const found = asTypeCode(existing.data?.[0]?.type_code);
  if (found != null) {
    cachedMonthlyTypeCode = found;
    return found;
  }

  const preferredTaken = await dbService.query<{ type_code: string | number | null }>(
    `SELECT type_code FROM t_items_type WHERE CAST(type_code AS UNSIGNED) = ? LIMIT 1`,
    [MONTHLY_ITEM_TYPE_CODE_PREFERRED]
  );
  let nextCode = MONTHLY_ITEM_TYPE_CODE_PREFERRED;
  if (preferredTaken.data?.[0]) {
    const maxRes = await dbService.query<{ max_code: number | null }>(
      `SELECT MAX(CAST(type_code AS UNSIGNED)) AS max_code FROM t_items_type`
    );
    nextCode = Math.max(MONTHLY_ITEM_TYPE_CODE_PREFERRED, Number(maxRes.data?.[0]?.max_code || 0) + 1);
  }

  await dbService.query(
    `INSERT INTO t_items_type (type_code, name) VALUES (?, ?)`,
    [String(nextCode), MONTHLY_ITEM_TYPE_NAME]
  );

  cachedMonthlyTypeCode = nextCode;
  return nextCode;
}

/** Clears memoization (tests / after manual type table changes). */
export function resetMonthlyItemTypeCache(): void {
  cachedMonthlyTypeCode = null;
}
