import { AsyncLocalStorage } from 'async_hooks';
import { createPool, Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getResolvedDbConfig, type AppDbConfig } from '@/lib/db-connection-config';
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

type TxContext = { connection: PoolConnection };

/** Ensures all queries inside withTransaction() share one connection. */
const txAls = new AsyncLocalStorage<TxContext>();

type GlobalMysql = typeof globalThis & {
  __webappMysqlPool?: Pool | null;
};

const globalForMysql = globalThis as GlobalMysql;

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

function createSharedPool(config: AppDbConfig): Pool {
  const connectionLimit = config.connectionLimit ?? 10;
  // mysql2 only runs the idle sweeper when maxIdle < connectionLimit.
  // If maxIdle === connectionLimit, idleTimeout is ignored and Sleep sessions stay until wait_timeout.
  const configuredMaxIdle = config.maxIdle ?? Math.min(2, connectionLimit);
  const maxIdle =
    configuredMaxIdle < connectionLimit
      ? configuredMaxIdle
      : Math.max(0, connectionLimit - 1);
  const idleTimeout = config.idleTimeout ?? 60_000;

  systemLogger.info('Database Connection Pool Initialized', {
    host: config.host,
    database: config.database,
    connectionLimit,
    maxIdle,
    idleTimeout,
    timezone: mysqlTimezone,
  });

  return createPool({
    ...config,
    timezone: mysqlTimezone,
    enableKeepAlive: config.enableKeepAlive !== false,
    keepAliveInitialDelay: config.keepAliveInitialDelay ?? 0,
    connectionLimit,
    idleTimeout,
    maxIdle,
  });
}

/** Single shared pool for the process (survives Next.js HMR via globalThis). */
export function getSharedMysqlPool(): Pool {
  if (!globalForMysql.__webappMysqlPool) {
    const config = getResolvedDbConfig();
    globalForMysql.__webappMysqlPool = createSharedPool(config);
  }
  return globalForMysql.__webappMysqlPool;
}

function getActiveRunner(): Pool | PoolConnection {
  return txAls.getStore()?.connection ?? getSharedMysqlPool();
}

async function runSql(
  sql: string,
  params?: (string | number | boolean | null)[]
): Promise<[unknown, unknown]> {
  const runner = getActiveRunner();
  const upper = sql.trim().toUpperCase();

  // Explicit TX control must go through withTransaction() — never borrow a random pool conn.
  if (
    upper.startsWith('START TRANSACTION') ||
    upper === 'BEGIN' ||
    upper.startsWith('COMMIT') ||
    upper.startsWith('ROLLBACK')
  ) {
    throw new Error(
      'Do not run START TRANSACTION / COMMIT / ROLLBACK via query(). Use dbService.withTransaction() instead.'
    );
  }

  const hasLargeStringParam = params?.some(
    (p) => typeof p === 'string' && p.length > 65_535
  );
  if (hasLargeStringParam) {
    return runner.query(sql, params) as Promise<[unknown, unknown]>;
  }
  return runner.execute(sql, params) as Promise<[unknown, unknown]>;
}

/**
 * Execute a query with automatic connection management.
 * Prefers pool.execute (auto acquire/release). Inside withTransaction(), uses the TX connection.
 */
export async function executeQuery<T = RowDataPacket[]>(
  query: string,
  params: (string | number | boolean | null)[] = [],
  options: {
    singleResult?: boolean;
    logQuery?: boolean;
  } = {}
): Promise<T> {
  const startTime = Date.now();
  const maxAttempts = txAls.getStore() ? 1 : 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (process.env.NODE_ENV !== 'production' && (options.logQuery || process.env.DEBUG_DB_QUERIES === 'true')) {
        const formattedParams = params.map((p) =>
          p === null
            ? '[NULL]'
            : p === undefined
              ? '[UNDEFINED]'
              : typeof p === 'string'
                ? `"${p}"`
                : JSON.stringify(p)
        );
        systemLogger.debug('Database Query Execution', {
          query: query.replace(/\s+/g, ' ').trim(),
          params: formattedParams,
          timestamp: new Date().toISOString(),
        });
      }

      const [rows] = await runSql(query, params);

      const duration = Date.now() - startTime;
      if (duration > 100) {
        systemLogger.warn('Slow Database Query', {
          query: query.replace(/\s+/g, ' ').trim(),
          duration,
          timestamp: new Date().toISOString(),
        });
      }

      return options.singleResult
        ? ((Array.isArray(rows) && rows.length > 0 ? rows[0] : null) as T)
        : (rows as T);
    } catch (error) {
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
    }
  }

  throw new Error('executeQuery failed after retries');
}

export async function closeConnectionPool() {
  try {
    if (globalForMysql.__webappMysqlPool) {
      await globalForMysql.__webappMysqlPool.end();
      globalForMysql.__webappMysqlPool = null;
    }
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
  /**
   * Run fn inside a real MySQL transaction on a single pooled connection.
   * All dbService.query / executeQuery calls inside fn reuse that connection.
   * Connection is always released in finally (prevents pool exhaustion).
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txAls.getStore()) {
      // Already in a transaction — join the existing one (no nested BEGIN).
      return fn();
    }

    const connection = await getSharedMysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      try {
        const result = await txAls.run({ connection }, fn);
        await connection.commit();
        return result;
      } catch (err) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          systemLogger.warn('Transaction rollback failed', {
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }
        throw err;
      }
    } finally {
      connection.release();
    }
  }

  private async runQuery(
    sql: string,
    params?: (string | number | boolean | null)[]
  ): Promise<[unknown, unknown]> {
    return runSql(sql, params);
  }

  async query<T = RowDataPacket>(
    sql: string,
    params?: (string | number | boolean | null)[]
  ): Promise<QueryResult<T>> {
    const maxAttempts = txAls.getStore() ? 1 : 3;
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

  async select<T = RowDataPacket>(
    table: string,
    columns: string[] = ['*'],
    where?: string,
    params?: (string | number | boolean | null)[]
  ): Promise<QueryResult<T>> {
    const columnList = columns.join(', ');
    let sql = `SELECT ${columnList} FROM ${table}`;

    if (where) {
      sql += ` WHERE ${where}`;
    }

    return this.query<T>(sql, params);
  }

  async insert(
    table: string,
    data: Record<string, string | number | boolean | null>
  ): Promise<QueryResult> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const quotedColumns = columns.map((col) => `\`${col}\``).join(', ');
    const sql = `INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`;
    return this.query(sql, values);
  }

  async update(
    table: string,
    data: Record<string, string | number | boolean | null>,
    where: string,
    params?: (string | number | boolean | null)[]
  ): Promise<QueryResult> {
    const setClause = Object.keys(data)
      .map((key) => `\`${key}\` = ?`)
      .join(', ');
    const values = [...Object.values(data), ...(params || [])];
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    return this.query(sql, values);
  }

  async delete(
    table: string,
    where: string,
    params?: (string | number | boolean | null)[]
  ): Promise<QueryResult> {
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

  /** @deprecated Use withTransaction() */
  async startTransaction(): Promise<void> {
    throw new Error('Use dbService.withTransaction(async () => { ... }) instead of startTransaction()');
  }

  /** @deprecated Use withTransaction() */
  async commitTransaction(): Promise<void> {
    throw new Error('Use dbService.withTransaction(async () => { ... }) instead of commitTransaction()');
  }

  /** @deprecated Use withTransaction() */
  async rollbackTransaction(): Promise<void> {
    throw new Error('Use dbService.withTransaction(async () => { ... }) instead of rollbackTransaction()');
  }

  async close(): Promise<void> {
    await closeConnectionPool();
  }
}

export const dbService = new DatabaseService();
export default dbService;
