import { useState, useEffect } from 'react';

interface SupplierStats {
  totalSuppliers: number;
  activeSuppliers: number;
  inactiveSuppliers: number;
}

export function useSupplierStats() {
  const [statistics, setStatistics] = useState<SupplierStats>({
    totalSuppliers: 0,
    activeSuppliers: 0,
    inactiveSuppliers: 0
  });

  const refreshStatistics = async () => {
    try {
      // Use dedicated statistics endpoint to avoid duplicate requests
      const response = await fetch('/api/suppliers/stats');
      const result = await response.json();
      
      if (result.success) {
        setStatistics(result.data);
      }
    } catch (error) {
      console.error('Error fetching supplier statistics:', error);
    }
  };

  useEffect(() => {
    refreshStatistics();
  }, []);

  return { statistics, refreshStatistics };
}
