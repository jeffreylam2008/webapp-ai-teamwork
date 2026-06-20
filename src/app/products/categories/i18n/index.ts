import type { AppLanguage } from '@/lib/i18n/language';
import { en } from './en';
import { zhHant } from './zh-Hant';

export function getCategoryListTexts(lang: AppLanguage) {
  return lang === 'zh-Hant' ? zhHant : en;
}
