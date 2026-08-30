'use client';

import type { AppLanguage } from '@/lib/i18n/language';
import { resolveAppLanguage } from '@/lib/i18n/language';
import { useAppLanguage } from '@/contexts/LanguageContext';

/**
 * Shared app language from LanguageProvider.
 * Optional query-string override (?lang=...) for previews.
 */
export function useSystemLanguage(queryLang?: string | null): AppLanguage {
  const { language } = useAppLanguage();
  if (queryLang) return resolveAppLanguage(queryLang);
  return language;
}

export function useSystemLanguageReady(): boolean {
  const { ready } = useAppLanguage();
  return ready;
}
