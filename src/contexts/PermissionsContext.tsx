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
import { isAdministratorRoleCode } from '@/config/rolePermissionDefaults';

type PermissionsContextValue = {
  permissions: string[];
  loading: boolean;
  can: (key: string) => boolean;
  canManageAccess: boolean;
  isAdministrator: boolean;
  roleCode: number | null;
  refetch: () => void;
};

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

type MeResponse = {
  success?: boolean;
  data?: string[];
  can_manage_access?: boolean;
  has_full_transaction_access?: boolean;
  is_administrator?: boolean;
  role_code?: number;
};

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [canManageAccess, setCanManageAccess] = useState(false);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [roleCode, setRoleCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const can = useCallback(
    (key: string) => permissions.includes(key),
    [permissions]
  );

  const applyMeResult = useCallback((result: MeResponse) => {
    const list = result?.success && Array.isArray(result.data) ? result.data : [];
    setPermissions(list);
    const role = result?.role_code != null ? Number(result.role_code) : null;
    setRoleCode(Number.isFinite(role as number) ? (role as number) : null);
    const isAdmin =
      result?.is_administrator === true || isAdministratorRoleCode(role);
    setIsAdministrator(isAdmin);
    setCanManageAccess(
      Boolean(result?.can_manage_access) ||
        Boolean(result?.has_full_transaction_access) ||
        isAdmin
    );
  }, []);

  const refetch = useCallback(() => {
    if (!token) {
      setPermissions([]);
      setCanManageAccess(false);
      setIsAdministrator(false);
      setRoleCode(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchWithAuth('/api/administration/permissions/me', token, { cache: 'no-store' })
      .then((res) => res.json())
      .then((result: MeResponse) => applyMeResult(result))
      .catch(() => {
        setPermissions([]);
        setCanManageAccess(false);
        setIsAdministrator(false);
        setRoleCode(null);
      })
      .finally(() => setLoading(false));
  }, [token, applyMeResult]);

  useEffect(() => {
    const onPermissionsUpdated = () => refetch();
    window.addEventListener('permissions-updated', onPermissionsUpdated);
    return () => window.removeEventListener('permissions-updated', onPermissionsUpdated);
  }, [refetch]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setPermissions([]);
      setCanManageAccess(false);
      setIsAdministrator(false);
      setRoleCode(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchWithAuth('/api/administration/permissions/me', token, { cache: 'no-store' })
      .then((res) => res.json())
      .then((result: MeResponse) => {
        if (cancelled) return;
        applyMeResult(result);
      })
      .catch(() => {
        if (!cancelled) {
          setPermissions([]);
          setCanManageAccess(false);
          setIsAdministrator(false);
          setRoleCode(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, applyMeResult]);

  const value = useMemo(
    () => ({
      permissions,
      loading,
      can,
      canManageAccess,
      isAdministrator,
      roleCode,
      refetch,
    }),
    [permissions, loading, can, canManageAccess, isAdministrator, roleCode, refetch]
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
