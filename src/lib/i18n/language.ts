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

/**
 * Resolve app language from query override -> global system setting -> browser locale.
 */
export async function getPreferredAppLanguage(
  queryLang?: string | null
): Promise<AppLanguage> {
  if (queryLang) return resolveAppLanguage(queryLang);

  try {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem(SESSION_LANGUAGE_KEY);
      if (isAppLanguage(cached)) return cached;
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

