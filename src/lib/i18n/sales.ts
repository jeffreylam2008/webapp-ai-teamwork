import type { AppLanguage } from '@/lib/i18n/language';

export function getSalesItemTexts(lang: AppLanguage) {
  if (lang === 'zh-Hant') {
    return {
      itemCode: '貨品編號',
      description: '描述',
      englishName: '英文名稱',
      chineseName: '中文名稱',
      searchByItemName: '可用貨品編號、英文名或中文名搜尋...',
      selectItem: '選擇貨品',
      close: '關閉',
      na: '—',
    } as const;
  }

  return {
    itemCode: 'Item Code',
    description: 'Description',
    englishName: 'English Name',
    chineseName: 'Chinese Name',
    searchByItemName: 'Search by item code, English name, or Chinese name...',
    selectItem: 'Select Item',
    close: 'Close',
    na: '—',
  } as const;
}

export function getPreferredItemName(
  lang: AppLanguage,
  item: { eng_name?: string | null; chi_name?: string | null }
): string {
  const en = (item.eng_name || '').trim();
  const zh = (item.chi_name || '').trim();
  if (lang === 'zh-Hant') return zh || en || '—';
  return en || zh || '—';
}

export function getSecondaryItemName(
  lang: AppLanguage,
  item: { eng_name?: string | null; chi_name?: string | null }
): string {
  const en = (item.eng_name || '').trim();
  const zh = (item.chi_name || '').trim();
  if (lang === 'zh-Hant') return en && en !== zh ? en : '';
  return zh && zh !== en ? zh : '';
}

