import { en } from './en';
import { zhHant } from './zh-Hant';

export type CustomerTipsLang = 'en' | 'zh-Hant';

export function getCustomerTipsTexts(lang: CustomerTipsLang) {
  return lang === 'zh-Hant' ? zhHant : en;
}
