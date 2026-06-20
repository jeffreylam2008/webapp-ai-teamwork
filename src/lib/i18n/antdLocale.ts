import enUS from 'antd/locale/en_US';
import zhTW from 'antd/locale/zh_TW';
import type { Locale } from 'antd/es/locale';
import type { AppLanguage } from './language';

/**
 * Ant Design component copy (Pagination, DatePicker, Table empty text, etc.)
 * follows ConfigProvider `locale`.
 */
export function getAntdLocale(lang: AppLanguage): Locale {
  return lang === 'zh-Hant' ? zhTW : enUS;
}

export { enUS as antdLocaleEnUS, zhTW as antdLocaleZhTW };
