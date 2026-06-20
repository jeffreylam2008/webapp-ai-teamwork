import dbService from '@/lib/database';

const columnCache = new Map<string, Set<string>>();

export async function getTableColumns(tableName: string): Promise<Set<string>> {
  const key = tableName.toLowerCase();
  const cached = columnCache.get(key);
  if (cached) return cached;

  const result = await dbService.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  const cols = new Set(
    (result.data || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()).filter(Boolean)
  );
  columnCache.set(key, cols);
  return cols;
}

export function clearSystemTablesColumnCache(): void {
  columnCache.clear();
}

/** Normalize logo / shop_logo from VARCHAR or LONGBLOB row values. */
export function normalizeBrandField(value: unknown): string | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) return null;
    return `data:image/png;base64,${value.toString('base64')}`;
  }
  const s = String(value).trim();
  return s || null;
}
