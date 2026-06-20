'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

export interface TransactionFormData {
  customers: Array<{
    cust_code: string;
    name: string;
    phone_1: string;
    email_1: string;
    pm_code?: string | null;
  }>;
  products: Array<{
    item_code: string;
    eng_name: string;
    chi_name: string;
    unit: string;
    price: number;
  }>;
  shops: Array<{
    shop_code: string;
    name: string;
    is_warehouse?: number | string;
    default_whcode?: string | null;
  }>;
  employees: Array<{ employee_code: string; name: string }>;
  paymentMethods: Array<{ pm_code: string; payment_method: string }>;
  suppliers?: Array<{
    supp_code: string;
    name: string;
    phone_1: string;
    email_1: string;
    pm_code?: string | null;
  }>;
}

let formDataCache: TransactionFormData | null = null;
let formDataPromise: Promise<TransactionFormData> | null = null;

export function clearTransactionFormDataCache(): void {
  formDataCache = null;
  formDataPromise = null;
}

export async function fetchTransactionFormData(
  token: string,
  options?: { refresh?: boolean }
): Promise<TransactionFormData> {
  if (options?.refresh) {
    formDataCache = null;
    formDataPromise = null;
  }

  if (formDataCache) return formDataCache;
  if (formDataPromise) return formDataPromise;

  formDataPromise = (async () => {
    const response = await fetchWithAuth('/api/transactions/form-data', token, { cache: 'no-store' });
    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to load form data');
    }
    const data = result.data as TransactionFormData;
    formDataCache = data;
    return data;
  })()
    .catch((err) => {
      formDataCache = null;
      throw err;
    })
    .finally(() => {
      formDataPromise = null;
    });

  return formDataPromise;
}

/**
 * Shared transaction form dropdown data (customers, items, shops, etc.).
 * Dedupes parallel/Strict Mode requests; use `refresh()` after adding a customer.
 */
export function useTransactionFormData(token: string | null) {
  const [formData, setFormData] = useState<TransactionFormData | null>(formDataCache);
  const [loading, setLoading] = useState(Boolean(token) && !formDataCache);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh?: boolean) => {
      if (!token) {
        setFormData(null);
        setLoading(false);
        return null;
      }

      if (!refresh && formDataCache) {
        setFormData(formDataCache);
        setLoading(false);
        setError(null);
        return formDataCache;
      }

      setLoading(true);
      try {
        const data = await fetchTransactionFormData(token, { refresh });
        setFormData(data);
        setError(null);
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load form data';
        setError(msg);
        setFormData(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { formData, loading, error, refresh };
}
