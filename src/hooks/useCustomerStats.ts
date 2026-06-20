'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
}

export function useCustomerStats() {
  const { token } = useAuth();
  const [statistics, setStatistics] = useState<CustomerStats>({
    totalCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth('/api/customers?include_stats=true', token);
      const result = await response.json();
      
      console.log('Customer Statistics Response:', {
        success: result.success,
        statistics: result.statistics,
        fullResponse: result
      });
      
      if (result.success && result.statistics) {
        setStatistics(result.statistics);
      } else {
        throw new Error(result.error || 'Failed to fetch statistics');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error fetching statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when session token is available
  useEffect(() => {
    if (!token) return;
    fetchStatistics();
  }, [token]);

  // Provide a way to manually refresh statistics if needed
  const refreshStatistics = () => {
    fetchStatistics();
  };

  return {
    statistics,
    loading,
    error,
    refreshStatistics
  };
}
