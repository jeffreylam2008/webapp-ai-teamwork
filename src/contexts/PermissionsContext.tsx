'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

type PermissionsContextValue = {
  permissions: string[];
  loading: boolean;
  can: (key: string) => boolean;
  refetch: () => void;
};

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const can = useCallback(
    (key: string) => permissions.includes(key),
    [permissions]
  );

  const refetch = useCallback(() => {
    if (!token) {
      setPermissions([]);
      setLoading(false);
      return;
    }

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

  const value = useMemo(
    () => ({ permissions, loading, can, refetch }),
    [permissions, loading, can, refetch]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissionsContext() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
