/**
 * Compatibility layer — all DB access goes through the single shared pool in @/lib/database.
 * Do not create a second mysql pool here (that was leaking connections under Next.js HMR).
 */
import type { PoolConnection } from 'mysql2/promise';
import {
  dbService,
  executeQuery as sharedExecuteQuery,
  getSharedMysqlPool,
} from '@/lib/database';

export async function getDbService() {
  return getSharedMysqlPool();
}

export async function executeQuery<T>(
  query: string,
  params?: (string | number | boolean | null)[]
): Promise<T> {
  try {
    return await sharedExecuteQuery<T>(query, params ?? []);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/** Prefer dbService.withTransaction() for multi-statement transactions. */
export async function beginTransaction(): Promise<PoolConnection> {
  const connection = await getSharedMysqlPool().getConnection();
  await connection.beginTransaction();
  return connection;
}

export async function commitTransaction(connection: PoolConnection) {
  await connection.commit();
  connection.release();
}

export async function rollbackTransaction(connection: PoolConnection) {
  try {
    await connection.rollback();
  } finally {
    connection.release();
  }
}

export async function recordExists(
  table: string,
  field: string,
  value: string | number
): Promise<boolean> {
  const query = `SELECT 1 FROM ${table} WHERE ${field} = ? LIMIT 1`;
  const result = await executeQuery<{ [key: string]: unknown }[]>(query, [value]);
  return result.length > 0;
}

export async function canDeleteRecord(
  table: string,
  field: string,
  value: string | number,
  relatedTables: { table: string; field: string }[]
): Promise<boolean> {
  const exists = await recordExists(table, field, value);
  if (!exists) {
    return false;
  }

  for (const related of relatedTables) {
    const query = `SELECT 1 FROM ${related.table} WHERE ${related.field} = ? LIMIT 1`;
    const result = await executeQuery<{ [key: string]: unknown }[]>(query, [value]);
    if (result.length > 0) {
      return false;
    }
  }

  return true;
}

export async function getTotalCount(
  table: string,
  whereClause?: string,
  params?: (string | number | boolean | null)[]
): Promise<number> {
  const query = `SELECT COUNT(*) as total FROM ${table} ${whereClause || ''}`;
  const result = await executeQuery<{ total: number }[]>(query, params);
  return result[0].total;
}

export function buildWhereClause(
  filters: Record<string, string | number | boolean | null>,
  searchFields: string[]
): { whereClause: string; params: (string | number | boolean | null)[] } {
  const conditions: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  if (filters.search && searchFields.length > 0) {
    const searchConditions = searchFields.map((field) => `${field} LIKE ?`);
    conditions.push(`(${searchConditions.join(' OR ')})`);
    params.push(...searchFields.map(() => `%${filters.search}%`));
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (key !== 'search' && value) {
      conditions.push(`${key} = ?`);
      params.push(value);
    }
  });

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

export function buildOrderClause(sortField?: string, sortOrder?: 'ASC' | 'DESC'): string {
  if (sortField) {
    return `ORDER BY ${sortField} ${sortOrder || 'ASC'}`;
  }
  return '';
}

export function buildPaginationClause(
  page?: number,
  pageSize?: number
): { limitClause: string; params: number[] } {
  if (page !== undefined && pageSize !== undefined) {
    const offset = (page - 1) * pageSize;
    return {
      limitClause: 'LIMIT ? OFFSET ?',
      params: [pageSize, offset],
    };
  }
  return { limitClause: '', params: [] };
}

export { dbService };
export default getSharedMysqlPool;
