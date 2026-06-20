import { NextRequest, NextResponse } from 'next/server';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
  compressed?: boolean;
}

interface OptimizedResponseOptions {
  ttl?: number;
  compress?: boolean;
  cacheKey?: string;
  headers?: Record<string, string>;
}

interface BatchRequestOptions {
  parallel?: boolean;
  maxConcurrency?: number;
}

class APIOptimizer {
  private static instance: APIOptimizer;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): APIOptimizer {
    if (!APIOptimizer.instance) {
      APIOptimizer.instance = new APIOptimizer();
    }
    return APIOptimizer.instance;
  }

  // Optimized response with caching and compression
  async createOptimizedResponse(
    data: unknown,
    options: OptimizedResponseOptions = {}
  ): Promise<NextResponse> {
    const { compress = true, cacheKey, headers = {}, ttl = 300000 } = options;

    // Cache the response if cacheKey is provided
    if (cacheKey) {
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl,
        compressed: false
      });
    }

    // Compress response if enabled
    let responseData: unknown = data;
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}, stale-while-revalidate=${Math.floor(ttl / 2000)}`,
      'Vary': 'Accept-Encoding',
      ...headers
    };

    if (compress) {
      try {
        const compressed = await gzipAsync(JSON.stringify(data));
        responseData = compressed;
        responseHeaders['Content-Encoding'] = 'gzip';
        responseHeaders['Content-Length'] = compressed.length.toString();
      } catch (error) {
        console.warn('Compression failed, sending uncompressed response:', error);
      }
    }

    return new NextResponse(responseData as string, {
      status: 200,
      headers: responseHeaders
    });
  }

  // Get cached response
  getCachedResponse(cacheKey: string): unknown | null {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }

  // Clear cache
  clearCache(pattern?: string): void {
    if (pattern) {
      for (const [key] of this.cache) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // Generate cache key from request
  generateCacheKey(request: NextRequest, additionalParams?: unknown): string {
    const url = request.url;
    const searchParams = request.nextUrl?.searchParams.toString() || '';
    const body = additionalParams ? JSON.stringify(additionalParams) : '';
    return `${url}_${searchParams}_${body}`;
  }

  // Optimize request handling
  async handleRequest(
    request: NextRequest,
    handler: () => Promise<unknown>,
    options: OptimizedResponseOptions = {}
  ): Promise<NextResponse> {
    const { cacheKey, ttl = this.DEFAULT_TTL } = options;

    // Check cache first
    if (cacheKey) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return this.createOptimizedResponse(cached, { ...options, ttl: 0 }); // Don't cache cached data again
      }
    }

    try {
      const data = await handler();
      return this.createOptimizedResponse(data, { ...options, cacheKey });
    } catch (error) {
      console.error('API handler error:', error);
      return new NextResponse(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Batch multiple API calls
  async batchRequests(
    requests: Array<() => Promise<unknown>>,
    options: BatchRequestOptions = {}
  ): Promise<unknown[]> {
    const { parallel = true, maxConcurrency = 5 } = options;

    if (parallel) {
      // Execute requests in parallel with concurrency limit
      const results: unknown[] = [];
      const chunks = this.chunkArray(requests, maxConcurrency);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(chunk.map(req => req()));
        results.push(...chunkResults);
      }

      return results;
    } else {
      // Execute requests sequentially
      const results: unknown[] = [];
      for (const request of requests) {
        const result = await request();
        results.push(result);
      }
      return results;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Get cache statistics
  getCacheStats(): Record<string, number> {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp < entry.ttl) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      cacheSize: this.cache.size
    };
  }
}

export default APIOptimizer;
