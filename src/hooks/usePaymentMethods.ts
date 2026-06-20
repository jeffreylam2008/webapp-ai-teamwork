'use client';

import { useState, useEffect, useRef } from 'react';

interface PaymentMethod {
  pm_code: string;
  payment_method: string;
}

// Global cache for payment methods
let paymentMethodsCache: PaymentMethod[] | null = null;
let paymentMethodsPromise: Promise<PaymentMethod[]> | null = null;

export function usePaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceId = useRef(Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      console.log('usePaymentMethods: Starting fetch - Instance ID:', instanceId.current);
      
      // If we have cached data, use it immediately
      if (paymentMethodsCache) {
        console.log('usePaymentMethods: Using cached data - Instance ID:', instanceId.current);
        setPaymentMethods(paymentMethodsCache);
        return;
      }

      // If there's already a request in progress, wait for it
      if (paymentMethodsPromise) {
        console.log('usePaymentMethods: Waiting for existing request - Instance ID:', instanceId.current);
        try {
          const data = await paymentMethodsPromise;
          setPaymentMethods(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
        return;
      }

      setLoading(true);
      setError(null);

      // Create a new promise for this request
      paymentMethodsPromise = (async () => {
        try {
          const response = await fetch('/api/payment-methods');
          const result = await response.json();
          
          console.log('usePaymentMethods: Fetch completed - Instance ID:', instanceId.current, 'data count:', result.data?.length);
          
          if (result.success) {
            const data = result.data || [];
            paymentMethodsCache = data; // Cache the result
            return data;
          } else {
            throw new Error(result.error || 'Failed to fetch payment methods');
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An error occurred';
          console.error('Error fetching payment methods:', err);
          throw err;
        } finally {
          paymentMethodsPromise = null; // Clear the promise
        }
      })();

      try {
        const data = await paymentMethodsPromise;
        setPaymentMethods(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentMethods();
  }, []);

  return {
    paymentMethods,
    loading,
    error,
    options: paymentMethods.map(method => ({
      value: method.pm_code,
      label: method.payment_method
    }))
  };
}