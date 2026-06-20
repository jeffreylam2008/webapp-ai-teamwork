import { createPool, Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { resolvedDbConfig } from '@/lib/db-connection-config';
import { getMysqlTimezoneOffset } from '@/lib/systemTimezone';
import { systemLogger } from '@/lib/simple-logger';

const mysqlTimezone = getMysqlTimezoneOffset();

const RETRYABLE_CONNECTION_ERRORS = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
]);

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isRetryableConnectionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code != null && RETRYABLE_CONNECTION_ERRORS.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSharedPool(): Pool {
  return createPool({
    ...resolvedDbConfig,
    timezone: mysqlTimezone,
    enableKeepAlive: resolvedDbConfig.enableKeepAlive !== false,
    keepAliveInitialDelay: resolvedDbConfig.keepAliveInitialDelay ?? 0,
    idleTimeout: resolvedDbConfig.idleTimeout ?? 60_000,
    maxIdle: resolvedDbConfig.maxIdle ?? resolvedDbConfig.connectionLimit ?? 10,
  });
}

// Single shared pool for all database access (timezone aligns NOW() with APP_TIMEZONE wall clock)
const connectionPool: Pool = createSharedPool();

// Utility function to execute a query with automatic connection management
export async function executeQuery<T = RowDataPacket[]>(
  query: string, 
  params: (string | number | boolean | null)[] = [], 
  options: { 
    singleResult?: boolean, 
    logQuery?: boolean 
  } = {}
): Promise<T> {
  let connection;
  const startTime = Date.now();

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      connection = await connectionPool.getConnection();

      const formattedParams = params.map(p =>
        p === null ? '[NULL]' :
        p === undefined ? '[UNDEFINED]' :
        typeof p === 'string' ? `"${p}"` :
        JSON.stringify(p)
      );

      if (process.env.NODE_ENV !== 'production' && (options.logQuery || process.env.DEBUG_DB_QUERIES === 'true')) {
        systemLogger.debug('Database Query Execution', {
          query: query.replace(/\s+/g, ' ').trim(),
          params: formattedParams,
          timestamp: new Date().toISOString(),
        });
      }

      const [rows] = await connection.execute(query, params);

      const duration = Date.now() - startTime;
      if (duration > 100) {
        systemLogger.warn('Slow Database Query', {
          query: query.replace(/\s+/g, ' ').trim(),
          duration,
          timestamp: new Date().toISOString(),
        });
      }

      return options.singleResult
        ? (Array.isArray(rows) && rows.length > 0 ? rows[0] as T : null as T)
        : rows as T;
    } catch (error) {
      if (connection) {
        connection.release();
        connection = undefined;
      }
      if (attempt < maxAttempts && isRetryableConnectionError(error)) {
        systemLogger.warn('Database connection error, retrying executeQuery', {
          attempt,
          code: getErrorCode(error),
        });
        await sleep(75 * attempt);
        continue;
      }
      systemLogger.error('Database Query Error', error as Error, {
        query: query.replace(/\s+/g, ' ').trim(),
        params: params,
        timestamp: new Date().toISOString(),
      });
      throw error;
    } finally {
      if (connection) {
        connection.release();
        connection = undefined;
      }
    }
  }

  throw new Error('executeQuery failed after retries');
}

// Utility to close the connection pool when the application is shutting down
export async function closeConnectionPool() {
  try {
    await connectionPool.end();
    systemLogger.info('Database Connection Pool Closed Successfully');
  } catch (error) {
    systemLogger.error('Error Closing Database Connection Pool', error as Error);
  }
}

interface QueryResult<T = RowDataPacket> {
  data: T[];
  affectedRows?: number;
  insertId?: number;
  message?: string;
}

interface DatabaseError {
  code: string;
  message: string;
  sqlState?: string;
}

class DatabaseService {
  private pool: Pool;

  constructor(pool: Pool = connectionPool) {
    this.pool = pool;
    systemLogger.info('Database Connection Pool Initialized', {
      host: resolvedDbConfig.host,
      database: resolvedDbConfig.database,
      connectionLimit: resolvedDbConfig.connectionLimit,
      timezone: mysqlTimezone,
    });
  }

  private async runQuery(
    sql: string,
    params?: (string | number | boolean | null)[]
  ): Promise<[unknown, unknown]> {
    const upper = sql.trim().toUpperCase();
    if (
      upper.startsWith('START') ||
      upper.startsWith('COMMIT') ||
      upper.startsWith('ROLLBACK')
    ) {
      return this.pool.query(sql);
    }
    // Large TEXT/BLOB params (e.g. base64 images) can fail with prepared statements / packet limits
    const hasLargeStringParam = params?.some(
      (p) => typeof p === 'string' && p.length > 65_535
    );
    if (hasLargeStringParam) {
      return this.pool.query(sql, params);
    }
    return this.pool.execute(sql, params);
  }

  async query<T = RowDataPacket>(sql: string, params?: (string | number | boolean | null)[]): Promise<QueryResult<T>> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const [rows] = await this.runQuery(sql, params);

        if (Array.isArray(rows)) {
          return {
            data: rows as T[],
          };
        }
        const resultHeader = rows as ResultSetHeader;
        return {
          data: [],
          affectedRows: resultHeader.affectedRows,
          insertId: resultHeader.insertId,
          message: 'Query executed successfully',
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && isRetryableConnectionError(error)) {
          systemLogger.warn('Database connection error, retrying query', {
            attempt,
            code: getErrorCode(error),
            sql: sql.replace(/\s+/g, ' ').trim().slice(0, 120),
          });
          await sleep(75 * attempt);
          continue;
        }
        systemLogger.error('Database Query Error', error as Error, {
          sql,
          params: params?.length || 0,
        });
        const dbError = error as { code?: string; message?: string; sqlState?: string };
        throw {
          code: dbError.code || 'UNKNOWN_ERROR',
          message: dbError.message || 'Unknown database error',
          sqlState: dbError.sqlState,
        } as DatabaseError;
      }
    }

    const dbError = lastError as { code?: string; message?: string; sqlState?: string };
    throw {
      code: dbError?.code || 'UNKNOWN_ERROR',
      message: dbError?.message || 'Unknown database error',
      sqlState: dbError?.sqlState,
    } as DatabaseError;
  }

  async select<T = RowDataPacket>(table: string, columns: string[] = ['*'], where?: string, params?: (string | number | boolean | null)[]): Promise<QueryResult<T>> {
    const columnList = columns.join(', ');
    let sql = `SELECT ${columnList} FROM ${table}`;
    
    if (where) {
      sql += ` WHERE ${where}`;
    }
    
    return this.query<T>(sql, params);
  }

  async insert(table: string, data: Record<string, string | number | boolean | null>): Promise<QueryResult> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    // Add backticks around column names to handle reserved words like 'desc'
    const quotedColumns = columns.map(col => `\`${col}\``).join(', ');
    
    const sql = `INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`;
    return this.query(sql, values);
  }

  async update(table: string, data: Record<string, string | number | boolean | null>, where: string, params?: (string | number | boolean | null)[]): Promise<QueryResult> {
    const setClause = Object.keys(data).map(key => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(data), ...(params || [])];
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    return this.query(sql, values);
  }

  async delete(table: string, where: string, params?: (string | number | boolean | null)[]): Promise<QueryResult> {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    return this.query(sql, params);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as test');
      systemLogger.info('Database connection test successful');
      return true;
    } catch (error) {
      systemLogger.error('Database connection test failed', error as Error);
      return false;
    }
  }

  // Transaction-specific methods that don't use prepared statements
  async startTransaction(): Promise<void> {
    await this.pool.query('START TRANSACTION');
  }

  async commitTransaction(): Promise<void> {
    await this.pool.query('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    await this.pool.query('ROLLBACK');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Convenience methods for common operations
  async getAllUsers() {
    return this.select('users');
  }

  async getAllProducts() {
    return this.select('products');
  }

  async getProductById(id: number) {
    return this.select('products', ['*'], 'id = ?', [id]);
  }

  async createUser(userData: { name: string; email: string; password: string }) {
    return this.insert('users', userData);
  }

  async updateProduct(id: number, productData: Record<string, string | number | boolean | null>) {
    return this.update('products', productData, 'id = ?', [id]);
  }

  async deleteProduct(id: number) {
    return this.delete('products', 'id = ?', [id]);
  }
}

export const dbService = new DatabaseService();
export default dbService; 