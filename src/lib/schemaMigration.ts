import dbService from '@/lib/database';

/** Returns true if an index exists on TABLE in the current database. */
export async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const r = await dbService.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(r.data?.[0]?.cnt ?? 0) > 0;
}

/** Returns true if a column exists on TABLE in the current database. */
export async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const r = await dbService.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(r.data?.[0]?.cnt ?? 0) > 0;
}

/** Create index only when missing (avoids ER_DUP_KEYNAME log noise). */
export async function createIndexIfMissing(
  tableName: string,
  indexName: string,
  columnsSql: string
): Promise<void> {
  if (await indexExists(tableName, indexName)) return;
  await dbService.query(`CREATE INDEX ${indexName} ON ${tableName} (${columnsSql})`);
}
