'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const FALLBACK_DEFAULT_PAGE_SIZE = 100;
const FALLBACK_MAX_PAGE_SIZE = 500;
const CACHE_KEY = '__system_pagination';
const CACHE_TTL_MS = 60_000; // 1 minute

type PaginationSettings = {
  page_size_default: number;
  page_size_max: number;
};

function buildPageSizeOptions(pageSizeDefault: number, pageSizeMax: number): string[] {
  const base = [10, 20, 50, 100, 200, 500];
  const nums = Array.from(
    new Set([...base, pageSizeDefault, pageSizeMax].filter(n => Number.isFinite(n) && n >= 1))
  )
    .filter(n => n <= pageSizeMax)
    .sort((a, b) => a - b);

  return nums.map(n => String(n));
}

function safeParseCached(raw: string | null): { settings: PaginationSettings; ts: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { page_size_default?: number; page_size_max?: number; ts?: number };
    const page_size_default = Number(parsed.page_size_default);
    const page_size_max = Number(parsed.page_size_max);
    const ts = Number(parsed.ts);
    if (!Number.isFinite(page_size_default) || !Number.isFinite(page_size_max) || !Number.isFinite(ts)) return null;
    return { settings: { page_size_default, page_size_max }, ts };
  } catch {
    return null;
  }
}

export function useSystemPagination() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<PaginationSettings>(() => {
    if (typeof window === 'undefined') {
      return { page_size_default: FALLBACK_DEFAULT_PAGE_SIZE, page_size_max: FALLBACK_MAX_PAGE_SIZE };
    }
    const cached = safeParseCached(sessionStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.settings;
    }
    return { page_size_default: FALLBACK_DEFAULT_PAGE_SIZE, page_size_max: FALLBACK_MAX_PAGE_SIZE };
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (typeof window !== 'undefined') {
          const cached = safeParseCached(sessionStorage.getItem(CACHE_KEY));
          if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
            return;
          }
        }

        const res = await fetchWithAuth('/api/system/pagination', token, { cache: 'no-store' });
        const result = await res.json();
        if (cancelled) return;
        if (result?.success && result?.data) {
          const page_size_default = Number(result.data.page_size_default ?? FALLBACK_DEFAULT_PAGE_SIZE);
          const page_size_max = Number(result.data.page_size_max ?? FALLBACK_MAX_PAGE_SIZE);
          const next: PaginationSettings = {
            page_size_default: Number.isFinite(page_size_default) ? page_size_default : FALLBACK_DEFAULT_PAGE_SIZE,
            page_size_max: Number.isFinite(page_size_max) ? page_size_max : FALLBACK_MAX_PAGE_SIZE,
          };
          setSettings(next);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...next, ts: Date.now() }));
          }
        }
      } catch {
        // ignore and keep fallback/cached
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pageSizeMax = Math.min(Math.max(1, settings.page_size_max || FALLBACK_MAX_PAGE_SIZE), FALLBACK_MAX_PAGE_SIZE);
  const pageSizeDefault = Math.min(
    Math.max(1, settings.page_size_default || FALLBACK_DEFAULT_PAGE_SIZE),
    pageSizeMax
  );

  const pageSizeOptions = useMemo(() => buildPageSizeOptions(pageSizeDefault, pageSizeMax), [pageSizeDefault, pageSizeMax]);

  return {
    pageSizeDefault,
    pageSizeMax,
    pageSizeOptions,
  };
}

