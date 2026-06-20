'use client';

import { useState, useEffect } from 'react';
import type { TablePaginationConfig, FilterValue, SorterResult } from 'antd/es/table/interface';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const FALLBACK_DEFAULT_PAGE_SIZE = 100;
const FALLBACK_MAX_PAGE_SIZE = 500;
const SYSTEM_PAGINATION_CACHE_KEY = '__system_pagination';
const SYSTEM_PAGINATION_CACHE_TTL_MS = 60_000; // 1 minute

function buildPageSizeOptions(pageSizeDefault: number, pageSizeMax: number): string[] {
  const base = [10, 20, 50, 100, 200, 500];
  const nums = Array.from(new Set([...base, pageSizeDefault, pageSizeMax]))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= pageSizeMax)
    .sort((a, b) => a - b);
  return nums.map(n => String(n));
}

function safeParseCached(raw: string | null): { page_size_default: number; page_size_max: number; ts: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { page_size_default?: number; page_size_max?: number; ts?: number };
    const page_size_default = Number(parsed.page_size_default);
    const page_size_max = Number(parsed.page_size_max);
    const ts = Number(parsed.ts);
    if (!Number.isFinite(page_size_default) || !Number.isFinite(page_size_max) || !Number.isFinite(ts)) return null;
    return { page_size_default, page_size_max, ts };
  } catch {
    return null;
  }
}

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface UseDataTableOptions {
  apiEndpoint: string;
  defaultPageSize?: number;
  includeStats?: boolean;
}

interface PaginationConfig {
  current: number;
  pageSize: number;
  total: number;
  showSizeChanger: boolean;
  showQuickJumper: boolean;
  pageSizeOptions: string[];
}

interface SortConfig {
  column?: string;
  order?: 'ascend' | 'descend' | null;
}

interface TableFilters {
  search?: string;
  status?: string;
  pm_code?: string;
  [key: string]: string | undefined;
}

interface ApiResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  statistics?: Record<string, unknown>;
}

export function useDataTable<T>({ apiEndpoint, defaultPageSize = 10, includeStats = false }: UseDataTableOptions) {
  const { token } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<TableFilters>({});
  const [sorting, setSorting] = useState<SortConfig>({});
  const [statistics, setStatistics] = useState<Record<string, unknown> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Add refresh key to force refetch

  const cached = typeof window !== 'undefined' ? safeParseCached(sessionStorage.getItem(SYSTEM_PAGINATION_CACHE_KEY)) : null;
  const cachedValid =
    cached && Date.now() - cached.ts < SYSTEM_PAGINATION_CACHE_TTL_MS
      ? cached
      : null;
  const initialMax = Math.min(
    Math.max(1, cachedValid?.page_size_max ?? FALLBACK_MAX_PAGE_SIZE),
    FALLBACK_MAX_PAGE_SIZE
  );
  const initialDefault = Math.min(
    Math.max(1, cachedValid?.page_size_default ?? FALLBACK_DEFAULT_PAGE_SIZE),
    initialMax
  );
  const [pagination, setPagination] = useState<PaginationConfig>({
    current: 1,
    pageSize: Math.min(Math.max(1, initialDefault || defaultPageSize), initialMax),
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: buildPageSizeOptions(initialDefault || defaultPageSize, initialMax)
  });

  // Memoize the filters to prevent unnecessary fetches
  const debouncedFilters = useDebounce(filters, 500);

  // Load system pagination settings (cached) to control default & max page size
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (typeof window !== 'undefined') {
          const c = safeParseCached(sessionStorage.getItem(SYSTEM_PAGINATION_CACHE_KEY));
          if (c && Date.now() - c.ts < SYSTEM_PAGINATION_CACHE_TTL_MS) {
            return;
          }
        }
        const res = await fetchWithAuth('/api/system/pagination', token, { cache: 'no-store' });
        const result = await res.json();
        if (cancelled) return;
        if (result?.success && result?.data) {
          const max = Math.min(Math.max(1, Number(result.data.page_size_max ?? FALLBACK_MAX_PAGE_SIZE)), FALLBACK_MAX_PAGE_SIZE);
          const def = Math.min(Math.max(1, Number(result.data.page_size_default ?? FALLBACK_DEFAULT_PAGE_SIZE)), max);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(SYSTEM_PAGINATION_CACHE_KEY, JSON.stringify({ page_size_default: def, page_size_max: max, ts: Date.now() }));
          }
          setPagination(prev => ({
            ...prev,
            pageSize: Math.min(Math.max(1, prev.pageSize || def), max),
            pageSizeOptions: buildPageSizeOptions(def, max),
          }));
        }
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Single useEffect to handle all data fetching
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const doFetch = async () => {
      if (!token) {
        setData([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: pagination.pageSize.toString(),
          offset: ((pagination.current - 1) * pagination.pageSize).toString(),
          ...(debouncedFilters.search && { search: debouncedFilters.search }),
          ...(debouncedFilters.status && { status: debouncedFilters.status }),
          ...(debouncedFilters.pm_code && { pm_code: debouncedFilters.pm_code }),
          ...(debouncedFilters.cate_code && { categories: debouncedFilters.cate_code }),
          ...(includeStats && { include_stats: 'true' })
        });

        const response = await fetchWithAuth(`${apiEndpoint}?${params}`, token, { signal, cache: 'no-store' });
        const result: ApiResponse<T> = await response.json();

        if (!signal.aborted && result.success) {
          setData(result.data);
          setPagination(prev => ({
            ...prev,
            total: result.total
          }));
          if (includeStats && result.statistics) {
            setStatistics(result.statistics);
          }
        } else if (!signal.aborted && !result.success) {
          setData([]);
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error fetching data:', error);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    doFetch();

    return () => {
      controller.abort();
    };
  }, [pagination.current, pagination.pageSize, debouncedFilters, apiEndpoint, includeStats, refreshKey, token]);

  const handleTableChange = (
    newPagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<T> | SorterResult<T>[]
  ) => {
    // Only update pagination if it changed
    if (newPagination.current !== pagination.current || 
        newPagination.pageSize !== pagination.pageSize) {
      setPagination(prev => ({
        ...prev,
        current: newPagination.current || 1,
        pageSize: newPagination.pageSize || defaultPageSize
      }));
    }

    // Update sorting state (this won't trigger a fetch)
    if (Array.isArray(sorter)) {
      // Multiple sorters
      if (sorter.length > 0 && sorter[0].column) {
        setSorting({
          column: sorter[0].field as string,
          order: sorter[0].order
        });
      } else {
        setSorting({});
      }
    } else {
      // Single sorter
      if (sorter.column) {
        setSorting({
          column: sorter.field as string,
          order: sorter.order
        });
      } else {
        setSorting({});
      }
    }
  };

  const refreshData = () => {
    // Force refetch and reset to page 1
    setRefreshKey(prev => prev + 1);
    setPagination(prev => ({
      ...prev,
      current: 1
    }));
  };

  return {
    data,
    loading,
    pagination,
    filters,
    setFilters,
    refreshData,
    handleTableChange,
    sorting,
    setSorting,
    statistics
  };
}