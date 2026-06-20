import type { AppLanguage } from '@/lib/i18n/language';
import type { WarehouseTexts } from './en';
import { warehouseEn } from './en';
import { warehouseZhHant } from './zh-Hant';

export function getWarehouseTexts(lang: AppLanguage): WarehouseTexts {
  return lang === 'zh-Hant' ? warehouseZhHant : warehouseEn;
}

export type { WarehouseTexts };
