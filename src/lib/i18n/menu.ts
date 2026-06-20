import type { AppLanguage } from '@/lib/i18n/language';

type MenuKey = string;

const ZH_HANT: Record<MenuKey, string> = {
  home: '首頁',
  customers: '客戶',
  suppliers: '供應商',
  products: '產品',
  items: '貨品',
  categories: '分類',

  warehouse: '倉庫',
  stock: '庫存',
  actions: '操作',
  adjustment: '調整',
  stocktake: '盤點',
  'delivery-note': '送貨單',
  'goods-received-note': '收貨單',

  purchasing: '採購',
  purchases: '採購單',

  sales: '銷售',
  invoices: '發票',
  'monthly-invoices': '月結發票',
  orders: '銷售訂單',
  quotations: '報價單',

  administration: '系統管理',
  users: '用戶',
  settings: '設定',
  district: '地區',
  prefix: '前綴',
  'payment-method': '付款方式',
  'payment-term': '付款條款',
  shops: '店舖',
  'master-data': '匯入／匯出',
  system: '系統',
  profile: '個人資料',
};

export function getMenuLabel(lang: AppLanguage, key: string, fallbackEnglish: string): string {
  if (lang === 'zh-Hant') {
    return ZH_HANT[key] || fallbackEnglish;
  }
  return fallbackEnglish;
}

