export type AppLanguage = 'en' | 'zh-Hant';

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'en';

export function resolveAppLanguage(lang: string | null | undefined): AppLanguage {
  const normalized = (lang || '').trim().toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-Hant';
  return 'en';
}

const SESSION_LANGUAGE_KEY = '__app_language';
const AUTH_TOKEN_KEY = 'auth_token';

let languageInflight: Promise<AppLanguage> | null = null;

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'zh-Hant';
}

/** Synchronous read of cached language (client only). */
export function getCachedAppLanguage(): AppLanguage | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem(SESSION_LANGUAGE_KEY);
    return isAppLanguage(cached) ? cached : null;
  } catch {
    return null;
  }
}

export function cacheAppLanguage(language: AppLanguage) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_LANGUAGE_KEY, language);
  } catch {
    // ignore
  }
}

/**
 * Resolve app language from query override -> global system setting -> browser locale.
 */
export async function getPreferredAppLanguage(
  queryLang?: string | null
): Promise<AppLanguage> {
  if (queryLang) return resolveAppLanguage(queryLang);

  try {
    if (typeof window !== 'undefined') {
      const cached = getCachedAppLanguage();
      if (cached) return cached;
    }

    const token =
      typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
    const authHeaders =
      token != null && token.trim() !== '' ? { Authorization: `Bearer ${token}` } : undefined;

    if (!languageInflight) {
      languageInflight = (async () => {
        const res = await fetch('/api/system/language', {
          cache: 'no-store',
          credentials: 'include',
          headers: authHeaders,
        });
        const result = await res.json();
        if (result?.success) {
          return resolveAppLanguage(result.data?.language);
        }
        throw new Error('language fetch failed');
      })().finally(() => {
        languageInflight = null;
      });
    }

    try {
      return await languageInflight;
    } catch {
      // Fall through to browser locale.
    }
  } catch {
    // Fall through to browser locale.
  }

  if (typeof window !== 'undefined') {
    return resolveAppLanguage(window.navigator.language);
  }

  return DEFAULT_APP_LANGUAGE;
}

/** Prefetch + cache language (used by ApplicationEnvGuard after env unlock). */
export async function warmAppLanguageCache(queryLang?: string | null): Promise<AppLanguage> {
  try {
    const preferred = await getPreferredAppLanguage(queryLang);
    cacheAppLanguage(preferred);
    return preferred;
  } catch {
    const fallback =
      typeof window !== 'undefined'
        ? resolveAppLanguage(window.navigator.language)
        : DEFAULT_APP_LANGUAGE;
    cacheAppLanguage(fallback);
    return fallback;
  }
}

