import type { AppLanguage } from './language';

/** Shared breadcrumb / submenu labels used across administration and product hubs. */
export type BreadcrumbLabels = {
  home: string;
  administration: string;
  users: string;
  settings: string;
  importExport: string;
  system: string;
  styleProfiles: string;
  products: string;
  categories: string;
  sales: string;
  purchasing: string;
  warehouse: string;
  stock: string;
  deliveryNote: string;
  grn: string;
  adjustment: string;
  stocktake: string;
  shops: string;
  paymentMethods: string;
  paymentTerms: string;
  detail: string;
  loading: string;
  notFound: string;
  profile: string;
  debug: string;
  /** Header user menu */
  logout: string;
  guest: string;
  expandSidebar: string;
  collapseSidebar: string;
  currentShopHint: string;
};

const EN: BreadcrumbLabels = {
  home: 'Home',
  administration: 'Administration',
  users: 'Users',
  settings: 'Settings',
  importExport: 'Import/Export',
  system: 'System',
  styleProfiles: 'Style Profiles',
  products: 'Products',
  categories: 'Categories',
  sales: 'Sales',
  purchasing: 'Purchasing',
  warehouse: 'Warehouse',
  stock: 'Stock',
  deliveryNote: 'Delivery Note',
  grn: 'GRN',
  adjustment: 'Adjustment',
  stocktake: 'Stocktake',
  shops: 'Shops',
  paymentMethods: 'Payment Methods',
  paymentTerms: 'Payment Terms',
  detail: 'Detail',
  loading: 'Loading...',
  notFound: 'Not found',
  profile: 'Profile',
  debug: 'Debug',
  logout: 'Logout',
  guest: 'Guest',
  expandSidebar: 'Expand sidebar',
  collapseSidebar: 'Collapse sidebar',
  currentShopHint: 'Current shop (selected at login)',
};

const ZH_HANT: BreadcrumbLabels = {
  home: '首頁',
  administration: '系統管理',
  users: '使用者',
  settings: '設定',
  importExport: '匯入／匯出',
  system: '系統',
  styleProfiles: '樣式設定檔',
  products: '產品',
  categories: '分類',
  sales: '銷售',
  purchasing: '採購',
  warehouse: '倉庫',
  stock: '庫存',
  deliveryNote: '送貨單',
  grn: '收貨單',
  adjustment: '庫存調整',
  stocktake: '盤點',
  shops: '店舖',
  paymentMethods: '付款方式',
  paymentTerms: '付款條件',
  detail: '詳情',
  loading: '載入中…',
  notFound: '找不到',
  profile: '個人資料',
  debug: '除錯',
  logout: '登出',
  guest: '訪客',
  expandSidebar: '展開側邊欄',
  collapseSidebar: '收合側邊欄',
  currentShopHint: '目前店舖（登入時選擇）',
};

export function getBreadcrumbLabels(lang: AppLanguage): BreadcrumbLabels {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}
