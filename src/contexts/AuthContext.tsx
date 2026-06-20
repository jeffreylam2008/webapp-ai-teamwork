'use client';
import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { parseJsonResponse } from '@/lib/parseJsonResponse';

const FALLBACK_IDLE_MINUTES = 10;
const CHECK_INTERVAL_MS = 1000; // counter: check every second
const SESSION_REVALIDATE_MS = 60_000; // re-check with server (e.g. t_employee.last_token cleared)
// Intentional interactions only — mousemove/scroll fire passively and prevent idle logout.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'click', 'touchstart', 'wheel'] as const;

interface User {
  uid: number;
  employee_code: number;
  username: string;
  default_shopcode: string;
  selected_shopcode?: string;
  selected_shopname?: string;
  role_code: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string, shop_code?: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const logoutRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const lastActivityRef = useRef(Date.now());
  const idleMinutesRef = useRef(FALLBACK_IDLE_MINUTES);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const redirectToLoginIfNeeded = useCallback(() => {
    if (pathname !== '/login') {
      router.replace('/login');
    }
  }, [pathname, router]);

  /** Clear client session (e.g. last_token nulled, logout, or verify failure). */
  const invalidateClientSession = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setToken(null);
    setLoading(false);
    redirectToLoginIfNeeded();
  }, [redirectToLoginIfNeeded]);

  const runVerify = useCallback(
    async (tokenToVerify: string, mode: 'initial' | 'background') => {
      try {
        const response = await fetch('/api/auth/verify', {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${tokenToVerify}`,
          },
        });

        if (response.status === 401) {
          invalidateClientSession();
          return;
        }

        const result = await response.json();

        if (result.success && result.data?.user) {
          const synced =
            typeof result.data.token === 'string' && result.data.token.length > 0
              ? result.data.token
              : tokenToVerify;
          setUser(result.data.user);
          setToken(synced);
          localStorage.setItem('auth_token', synced);
        } else {
          invalidateClientSession();
        }
      } catch (error) {
        if (mode === 'initial') {
          console.error('Token verification failed:', error);
          localStorage.removeItem('auth_token');
          setUser(null);
          setToken(null);
          redirectToLoginIfNeeded();
        }
        // background: keep session on transient network errors; next revalidate will retry
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        }
      }
    },
    [invalidateClientSession, redirectToLoginIfNeeded]
  );

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      void runVerify(storedToken, 'initial');
    } else {
      setLoading(false);
    }
  }, [runVerify]);

  // Re-validate while logged in: server can revoke (e.g. last_token cleared) without waiting for JWT expiry
  useEffect(() => {
    if (!token) return;

    const backgroundVerify = () => {
      const t = tokenRef.current;
      if (t) void runVerify(t, 'background');
    };

    const intervalId = setInterval(backgroundVerify, SESSION_REVALIDATE_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        backgroundVerify();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, runVerify]);

  const login = async (username: string, password: string, shop_code?: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, shop_code })
      });

      const result = await parseJsonResponse<{
        success?: boolean;
        error?: string;
        data?: { user: User; token: string };
      }>(response);

      if (!response.ok && !result.success) {
        throw new Error(result.error || `Login failed (${response.status})`);
      }

      if (result.success && result.data) {
        setUser(result.data.user);
        setToken(result.data.token);
        localStorage.setItem('auth_token', result.data.token);
        // Page routes are not blocked by middleware (see middleware.ts); client `ProtectedRoute`
        // and API calls use Bearer + localStorage. Soft navigation is fine.
        router.push('/');
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }

      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  logoutRef.current = logout;

  const handleIdleTimeout = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const t = tokenRef.current;
    if (t) {
      void fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${t}` },
      });
    }
    invalidateClientSession();
  }, [invalidateClientSession]);

  // Idle timeout: browser counter checks every second; when idle exceeds system setting, trigger logout
  useEffect(() => {
    if (!token) return;

    lastActivityRef.current = Date.now();
    idleMinutesRef.current = FALLBACK_IDLE_MINUTES;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const loadIdleMinutes = async (tokenToUse: string) => {
      try {
        const res = await fetchWithAuth('/api/system/idle', tokenToUse, { cache: 'no-store' });
        const data = await res.json();
        if (data?.success && typeof data?.data?.idle === 'number' && data.data.idle >= 1) {
          idleMinutesRef.current = Math.min(1440, data.data.idle);
        }
      } catch {
        // keep current idleMinutesRef
      }
    };

    const onIdleChanged = (e: Event) => {
      const mins = (e as CustomEvent<number>).detail;
      if (typeof mins === 'number' && mins >= 1) {
        idleMinutesRef.current = Math.min(1440, mins);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && tokenRef.current) {
        void loadIdleMinutes(tokenRef.current);
      }
    };

    void loadIdleMinutes(token);

    intervalRef.current = setInterval(() => {
      const idleMs = idleMinutesRef.current * 60 * 1000;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleMs) {
        handleIdleTimeout();
      }
    }, CHECK_INTERVAL_MS);

    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, onActivity, { passive: true });
    }
    window.addEventListener('app-idle-changed', onIdleChanged);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, onActivity);
      }
      window.removeEventListener('app-idle-changed', onIdleChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, handleIdleTimeout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user && !!token,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

