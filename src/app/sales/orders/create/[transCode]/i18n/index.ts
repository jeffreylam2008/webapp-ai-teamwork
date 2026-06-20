import { en } from './en';
import { zhHant } from './zh-Hant';

export type SalesOrderCreateLang = 'en' | 'zh-Hant';

export function resolveSalesOrderCreateLang(lang: string | null | undefined): SalesOrderCreateLang {
  const normalized = (lang || '').toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-Hant';
  return 'en';
}

export function getSalesOrderCreateTexts(lang: SalesOrderCreateLang) {
  return lang === 'zh-Hant' ? zhHant : en;
}
