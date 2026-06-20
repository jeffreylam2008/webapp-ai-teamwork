import mysql from 'mysql2/promise';
import { resolvedDbConfig } from '@/lib/db-connection-config';

// Create a connection pool (same env-aware config as @/lib/database)
const pool = mysql.createPool({
  host: resolvedDbConfig.host,
  port: resolvedDbConfig.port,
  user: resolvedDbConfig.user,
  password: resolvedDbConfig.password,
  database: resolvedDbConfig.database,
  connectTimeout: resolvedDbConfig.connectTimeout,
  waitForConnections: resolvedDbConfig.waitForConnections,
  connectionLimit: resolvedDbConfig.connectionLimit,
  queueLimit: resolvedDbConfig.queueLimit,
});

// Get a database connection with query method
export async function getDbService() {
  return pool;
}

// Helper function to execute SQL queries
export async function executeQuery<T>(
  query: string,
  params?: (string | number | boolean | null)[]
): Promise<T> {
  try {
    const [rows] = await pool.execute(query, params);
    return rows as T;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to begin a transaction
export async function beginTransaction() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

// Helper function to commit a transaction
export async function commitTransaction(connection: mysql.PoolConnection) {
  await connection.commit();
  connection.release();
}

// Helper function to rollback a transaction
export async function rollbackTransaction(connection: mysql.PoolConnection) {
  await connection.rollback();
  connection.release();
}

// Helper function to check if a record exists
export async function recordExists(
  table: string,
  field: string,
  value: string | number
): Promise<boolean> {
  const query = `SELECT 1 FROM ${table} WHERE ${field} = ? LIMIT 1`;
  const result = await executeQuery<{ [key: string]: unknown }[]>(query, [value]);
  return result.length > 0;
}

// Helper function to check if a record can be deleted
export async function canDeleteRecord(
  table: string,
  field: string,
  value: string | number,
  relatedTables: { table: string; field: string }[]
): Promise<boolean> {
  // First check if the record exists
  const exists = await recordExists(table, field, value);
  if (!exists) {
    return false;
  }

  // Then check each related table for references
  for (const related of relatedTables) {
    const query = `SELECT 1 FROM ${related.table} WHERE ${related.field} = ? LIMIT 1`;
    const result = await executeQuery<{ [key: string]: unknown }[]>(query, [value]);
    if (result.length > 0) {
      return false;
    }
  }

  return true;
}

// Helper function to get the total count of records
export async function getTotalCount(
  table: string,
  whereClause?: string,
  params?: (string | number | boolean | null)[]
): Promise<number> {
  const query = `SELECT COUNT(*) as total FROM ${table} ${whereClause || ''}`;
  const result = await executeQuery<{ total: number }[]>(query, params);
  return result[0].total;
}

// Helper function to build a WHERE clause from filters
export function buildWhereClause(
  filters: Record<string, string | number | boolean | null>,
  searchFields: string[]
): { whereClause: string; params: (string | number | boolean | null)[] } {
  const conditions: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  // Handle search filter
  if (filters.search && searchFields.length > 0) {
    const searchConditions = searchFields.map(field => `${field} LIKE ?`);
    conditions.push(`(${searchConditions.join(' OR ')})`);
    params.push(...searchFields.map(() => `%${filters.search}%`));
  }

  // Handle other filters
  Object.entries(filters).forEach(([key, value]) => {
    if (key !== 'search' && value) {
      conditions.push(`${key} = ?`);
      params.push(value);
    }
  });

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// Helper function to build ORDER BY clause
export function buildOrderClause(
  sortField?: string,
  sortOrder?: 'ASC' | 'DESC'
): string {
  if (sortField) {
    return `ORDER BY ${sortField} ${sortOrder || 'ASC'}`;
  }
  return '';
}

// Helper function to build LIMIT/OFFSET clause
export function buildPaginationClause(
  page?: number,
  pageSize?: number
): { limitClause: string; params: number[] } {
  if (page !== undefined && pageSize !== undefined) {
    const offset = (page - 1) * pageSize;
    return {
      limitClause: 'LIMIT ? OFFSET ?',
      params: [pageSize, offset]
    };
  }
  return { limitClause: '', params: [] };
}

// Export the pool for direct access if needed
export default pool;