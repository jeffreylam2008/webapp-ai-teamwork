'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface PaymentTerm {
  pt_code: string;
  /** Description text (API may send `terms` or alias `payment_term`) */
  terms: string;
}

function normalizePaymentTermRow(row: unknown): PaymentTerm {
  const r = row as Record<string, unknown>;
  const pt_code = String(r.pt_code ?? '');
  const desc = String(r.terms ?? r.payment_term ?? '').trim();
  return { pt_code, terms: desc };
}

function paymentTermOptionLabel(term: PaymentTerm): string {
  return term.terms ? `${term.pt_code} - ${term.terms}` : term.pt_code;
}

// Global cache for payment terms
let paymentTermsCache: PaymentTerm[] | null = null;
let paymentTermsPromise: Promise<PaymentTerm[]> | null = null;

export function usePaymentTerms() {
  const { token } = useAuth();
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceId = useRef(Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    if (!token) {
      return;
    }
    const fetchPaymentTerms = async () => {
      console.log('usePaymentTerms: Starting fetch - Instance ID:', instanceId.current);
      
      // If we have cached data, use it immediately
      if (paymentTermsCache) {
        console.log('usePaymentTerms: Using cached data - Instance ID:', instanceId.current);
        setPaymentTerms(paymentTermsCache.map(normalizePaymentTermRow));
        return;
      }

      // If there's already a request in progress, wait for it
      if (paymentTermsPromise) {
        console.log('usePaymentTerms: Waiting for existing request - Instance ID:', instanceId.current);
        try {
          const data = await paymentTermsPromise;
          setPaymentTerms(data.map(normalizePaymentTermRow));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
        return;
      }

      setLoading(true);
      setError(null);

      // Create a new promise for this request
      paymentTermsPromise = (async () => {
        try {
          const response = await fetchWithAuth('/api/payment-terms', token);
          const result = await response.json();
          
          console.log('usePaymentTerms: Fetch completed - Instance ID:', instanceId.current, 'data count:', result.data?.length);
          
          if (result.success) {
            const raw = result.data || [];
            const data = raw.map(normalizePaymentTermRow);
            paymentTermsCache = data;
            return data;
          } else {
            throw new Error(result.error || 'Failed to fetch payment terms');
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An error occurred';
          setError(errorMessage);
          console.error('Error fetching payment terms:', err);
          throw err;
        } finally {
          paymentTermsPromise = null; // Clear the promise
        }
      })();

      try {
        const data = await paymentTermsPromise;
        setPaymentTerms(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentTerms();
  }, [token]);

  return {
    paymentTerms,
    loading,
    error,
    options: (paymentTerms || []).map((term) => ({
      value: term.pt_code,
      label: paymentTermOptionLabel(term),
    })),
  };
}
