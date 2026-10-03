import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

export type TransactionDetailApiResponse = {
  success: boolean;
  header?: Record<string, unknown>;
  details?: Array<Record<string, unknown>>;
  paymentTotals?: Array<Record<string, unknown>>;
  error?: string;
};

/** Short TTL avoids Strict Mode double-mount + auth hydrate causing duplicate GETs. */
const DETAIL_CACHE_TTL_MS = 5_000;
const detailCache = new Map<string, { ts: number; json: TransactionDetailApiResponse }>();
const detailInFlight = new Map<string, Promise<TransactionDetailApiResponse>>();

function cacheKey(transCode: string): string {
  return String(transCode || '').trim();
}

/**
 * GET /api/transactions/detail/[transCode] with in-flight + short TTL cache.
 * Concurrent callers (e.g. React Strict Mode) share one network request.
 */
export async function fetchTransactionDetail(
  transCode: string,
  token: string | null | undefined,
  init: RequestInit = {}
): Promise<TransactionDetailApiResponse> {
  const key = cacheKey(transCode);
  if (!key) {
    return { success: false, error: 'Transaction code is required' };
  }

  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL_MS) {
    return cached.json;
  }

  const existing = detailInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const res = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(key)}`, token, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      ...init,
    });
    const json = (await res.json()) as TransactionDetailApiResponse;
    if (res.ok && json.success) {
      detailCache.set(key, { ts: Date.now(), json });
    }
    return json;
  })().finally(() => {
    detailInFlight.delete(key);
  });

  detailInFlight.set(key, request);
  return request;
}

/** Clear cache after mutations so the next load gets fresh data. */
export function invalidateTransactionDetailCache(transCode?: string): void {
  if (transCode == null || transCode === '') {
    detailCache.clear();
    return;
  }
  detailCache.delete(cacheKey(transCode));
}
