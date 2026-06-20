'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface District {
  district_code: string;
  district_eng: string;
}

interface DistrictOption {
  value: string;
  label: string;
}

// Global cache for districts
let districtsCache: District[] | null = null;
let districtsPromise: Promise<District[]> | null = null;

export const useDistricts = () => {
  const { token } = useAuth();
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const instanceId = useRef(Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    if (!token) {
      return;
    }
    const fetchDistricts = async () => {
      console.log(`[useDistricts-${instanceId.current}] Starting fetch`);

      // Check if we have cached data
      if (districtsCache) {
        console.log(`[useDistricts-${instanceId.current}] Using cached data`);
        setDistricts(districtsCache);
        return;
      }

      // Check if there's an ongoing request
      if (districtsPromise) {
        console.log(`[useDistricts-${instanceId.current}] Waiting for ongoing request`);
        try {
          const result = await districtsPromise;
          setDistricts(result);
        } catch (error) {
          console.error(`[useDistricts-${instanceId.current}] Error from ongoing request:`, error);
          setDistricts([]);
        }
        return;
      }

      // Start new request
      console.log(`[useDistricts-${instanceId.current}] Starting new request`);
      setLoading(true);
      
      districtsPromise = fetchWithAuth('/api/districts', token)
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            const data = result.data || [];
            console.log(`[useDistricts-${instanceId.current}] Request successful, caching data`);
            districtsCache = data;
            return data;
          } else {
            throw new Error(result.error || 'Failed to fetch districts');
          }
        })
        .catch(error => {
          console.error(`[useDistricts-${instanceId.current}] Request failed:`, error);
          districtsCache = null;
          throw error;
        })
        .finally(() => {
          districtsPromise = null;
        });

      try {
        const result = await districtsPromise;
        setDistricts(result);
      } catch (error) {
        setDistricts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDistricts();
  }, [token]);

  const options: DistrictOption[] = districts.map(district => ({
    value: district.district_code,
    label: `${district.district_eng} (${district.district_code})`
  }));

  return { districts, options, loading };
};
