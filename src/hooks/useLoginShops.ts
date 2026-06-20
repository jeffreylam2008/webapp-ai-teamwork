'use client';

import { useEffect, useState } from 'react';

export interface LoginShop {
  shop_code: string;
  name: string;
}

let shopsCache: LoginShop[] | null = null;
let shopsPromise: Promise<LoginShop[]> | null = null;

async function fetchLoginShops(): Promise<LoginShop[]> {
  const response = await fetch('/api/shops?excludeWarehouse=1', { cache: 'no-store' });
  const result = await response.json();
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to load shops');
  }
  return Array.isArray(result.data) ? result.data : [];
}

/** Non-warehouse shops for the login form — deduped (Strict Mode / remount safe). */
export function useLoginShops() {
  const [shops, setShops] = useState<LoginShop[]>(shopsCache ?? []);
  const [loading, setLoading] = useState(!shopsCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (shopsCache) {
        setShops(shopsCache);
        setLoading(false);
        return;
      }

      if (shopsPromise) {
        try {
          const data = await shopsPromise;
          if (!cancelled) {
            setShops(data);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load shops');
            setShops([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      setLoading(true);
      shopsPromise = fetchLoginShops()
        .then((data) => {
          shopsCache = data;
          return data;
        })
        .catch((err) => {
          shopsCache = null;
          throw err;
        })
        .finally(() => {
          shopsPromise = null;
        });

      try {
        const data = await shopsPromise;
        if (!cancelled) {
          setShops(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load shops');
          setShops([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { shops, loading, error };
}
