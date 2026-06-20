import mysql from 'mysql2/promise';

interface QueryResult<T> {
  data: T[];
  fields?: mysql.FieldPacket[];
}

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
  ttl: number;
}

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  cacheSize: number;
}

class DatabaseOptimizer {
  private static instance: DatabaseOptimizer;
  private pool: mysql.Pool;
  private queryCache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'dbadmin',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'teamwork',
      waitForConnections: true,
      connectionLimit: 20, // Increased connection limit
      queueLimit: 0,
      // Connection optimization
      charset: 'utf8mb4',
      // Query optimization
      multipleStatements: false,
      dateStrings: true,
      // Performance tuning
      maxIdle: 60000,
      idleTimeout: 60000,
    });
  }

  public static getInstance(): DatabaseOptimizer {
    if (!DatabaseOptimizer.instance) {
      DatabaseOptimizer.instance = new DatabaseOptimizer();
    }
    return DatabaseOptimizer.instance;
  }

  // Optimized query with caching
  async query<T = unknown>(sql: string, params?: (string | number | boolean | null)[]): Promise<QueryResult<T>> {
    const cacheKey = this.generateCacheKey(sql, params);
    
    // Check cache for SELECT queries
    if (this.isSelectQuery(sql) && this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < cached.ttl) {
        return { data: cached.data as T[] };
      }
    }

    try {
      const [rows, fields] = await this.pool.execute(sql, params);
      
      // Cache SELECT query results
      if (this.isSelectQuery(sql)) {
        this.queryCache.set(cacheKey, {
          data: rows as unknown[],
          timestamp: Date.now(),
          ttl: this.CACHE_TTL
        });
      }

      return { data: rows as T[], fields };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Batch queries for better performance
  async batchQueries(queries: Array<{ sql: string; params?: (string | number | boolean | null)[] }>): Promise<unknown[]> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const results = [];
      for (const query of queries) {
        const [rows] = await connection.execute(query.sql, query.params);
        results.push(rows);
      }
      
      await connection.commit();
      return results;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Optimized transaction handling
  async transaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Clear cache for specific table
  clearTableCache(tableName: string): void {
    for (const [key] of this.queryCache) {
      if (key.toLowerCase().includes(tableName.toLowerCase())) {
        this.queryCache.delete(key);
      }
    }
  }

  // Clear all cache
  clearCache(): void {
    this.queryCache.clear();
  }

  // Get connection pool stats
  getPoolStats(): PoolStats {
    return {
      totalConnections: 20, // connectionLimit from config
      idleConnections: 0, // Not available in mysql2
      activeConnections: 0, // Not available in mysql2
      cacheSize: this.queryCache.size,
    };
  }

  private generateCacheKey(sql: string, params?: (string | number | boolean | null)[]): string {
    return `${sql.toLowerCase()}_${JSON.stringify(params || [])}`;
  }

  private isSelectQuery(sql: string): boolean {
    return sql.trim().toLowerCase().startsWith('select');
  }

  // Cleanup method
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default DatabaseOptimizer;
