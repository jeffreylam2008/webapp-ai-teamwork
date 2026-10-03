'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { DEFAULT_TIMEZONE } from '@/lib/systemTimezone';

const CACHE_KEY = '__system_timezone';
const CACHE_TTL_MS = 60_000;

function safeParseCached(raw: string | null): { timezone: string; ts: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { timezone?: string; ts?: number };
    if (typeof parsed.timezone !== 'string' || !Number.isFinite(parsed.ts)) return null;
    return { timezone: parsed.timezone, ts: parsed.ts! };
  } catch {
    return null;
  }
}

/** Load t_systems.timezone into sessionStorage for client datetime formatting. */
export function useSystemTimezone(): void {
  const { token } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (typeof window !== 'undefined') {
          const cached = safeParseCached(sessionStorage.getItem(CACHE_KEY));
          if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return;
        }

        const res = token
          ? await fetchWithAuth('/api/system/timezone', token, { cache: 'no-store' })
          : await fetch('/api/system/timezone', { cache: 'no-store' });
        const result = await res.json();
        if (cancelled || !result?.success) return;

        const timezone = result.data?.timezone ?? DEFAULT_TIMEZONE;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timezone, ts: Date.now() }));
        }
      } catch {
        // keep fallback
      }
    };

    void load();

    const onTimezoneChanged = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail || typeof window === 'undefined') return;
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timezone: detail, ts: Date.now() }));
    };

    window.addEventListener('app-timezone-changed', onTimezoneChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('app-timezone-changed', onTimezoneChanged);
    };
  }, [token]);
}
