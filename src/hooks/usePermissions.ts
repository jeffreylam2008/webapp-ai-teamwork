'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

export function usePermissions() {
  const { token, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const can = useCallback(
    (key: string) => permissions.includes(key),
    [permissions]
  );

  const refetch = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetchWithAuth('/api/administration/permissions/me', token, { cache: 'no-store' })
      .then((res) => res.json())
      .then((result) => {
        const list = result?.success && Array.isArray(result.data) ? result.data : [];
        setPermissions(list);
      })
      .catch(() => setPermissions([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const onPermissionsUpdated = () => refetch();
    window.addEventListener('permissions-updated', onPermissionsUpdated);
    return () => window.removeEventListener('permissions-updated', onPermissionsUpdated);
  }, [refetch]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchWithAuth('/api/administration/permissions/me', token, { cache: 'no-store' })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        const list = result?.success && Array.isArray(result.data) ? result.data : [];
        setPermissions(list);
      })
      .catch(() => {
        if (!cancelled) setPermissions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  return { permissions, loading, can };
}
