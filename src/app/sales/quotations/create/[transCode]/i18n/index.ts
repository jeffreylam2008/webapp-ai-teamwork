import { en } from './en';
import { zhHant } from './zh-Hant';
import { resolveAppLanguage, type AppLanguage } from '@/lib/i18n/language';

export type QuotationCreateLang = AppLanguage;

export function resolveQuotationCreateLang(lang: string | null | undefined): QuotationCreateLang {
  return resolveAppLanguage(lang);
}

export function getQuotationCreateTexts(lang: QuotationCreateLang) {
  return (lang === 'zh-Hant' ? zhHant : en) as any;
}
