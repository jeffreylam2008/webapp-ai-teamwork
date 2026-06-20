import type { AppLanguage } from './language';

export type HubPagesTexts = {
  home: { title: string; line1: string; line2: string };
  productsHub: {
    title: string;
    description: string;
    cardItemsTitle: string;
    cardItemsDesc: string;
    cardCategoriesTitle: string;
    cardCategoriesDesc: string;
  };
  administrationHub: {
    title: string;
    description: string;
    usersTitle: string;
    usersDesc: string;
    settingsTitle: string;
    settingsDesc: string;
    importTitle: string;
    importDesc: string;
    systemTitle: string;
    systemDesc: string;
    profileTitle: string;
    profileDesc: string;
  };
  settingsHub: {
    title: string;
    description: string;
    districtsTitle: string;
    districtsDesc: string;
    prefixesTitle: string;
    prefixesDesc: string;
    paymentMethodsTitle: string;
    paymentMethodsDesc: string;
    paymentTermsTitle: string;
    paymentTermsDesc: string;
    shopsTitle: string;
    shopsDesc: string;
  };
};

const EN: HubPagesTexts = {
  home: {
    title: 'Welcome to the Home Page!',
    line1: 'This is the main content area for the home page.',
    line2: 'Click on different menu items in the sidebar to navigate to different pages.',
  },
  productsHub: {
    title: 'Products Management',
    description: 'Manage your product catalog, items, and categories',
    cardItemsTitle: 'Product Items',
    cardItemsDesc: 'Manage your product items, including details, pricing, and inventory.',
    cardCategoriesTitle: 'Product Categories',
    cardCategoriesDesc: 'Organize your products with categories and classifications.',
  },
  administrationHub: {
    title: 'Administration',
    description: 'Manage users, settings, and master data import/export',
    usersTitle: 'Users',
    usersDesc: 'Manage user access control.',
    settingsTitle: 'Settings',
    settingsDesc: 'Configure districts, prefixes, payment methods, payment terms, and shops.',
    importTitle: 'Import/Export',
    importDesc: 'Upload/export master data files.',
    systemTitle: 'System',
    systemDesc: 'Manage system-wide settings and preferences.',
    profileTitle: 'Profile',
    profileDesc: 'View and update your account, default shop, and password.',
  },
  settingsHub: {
    title: 'Settings',
    description: 'Manage system settings and configurations',
    districtsTitle: 'Districts',
    districtsDesc: 'Manage districts and their configurations.',
    prefixesTitle: 'Prefixes',
    prefixesDesc: 'Manage transaction prefixes and numbering.',
    paymentMethodsTitle: 'Payment Methods',
    paymentMethodsDesc: 'Manage payment methods and settings.',
    paymentTermsTitle: 'Payment Terms',
    paymentTermsDesc: 'Manage payment terms and due date rules.',
    shopsTitle: 'Shops',
    shopsDesc: 'Manage shops and their configurations.',
  },
};

const ZH_HANT: HubPagesTexts = {
  home: {
    title: '歡迎使用首頁！',
    line1: '這裡是首頁的主要內容區域。',
    line2: '請點選側邊選單以前往各功能頁面。',
  },
  productsHub: {
    title: '產品管理',
    description: '管理產品目錄、品項與分類',
    cardItemsTitle: '產品品項',
    cardItemsDesc: '管理產品品項，包含明細、定價與庫存。',
    cardCategoriesTitle: '產品分類',
    cardCategoriesDesc: '以分類與類別整理產品。',
  },
  administrationHub: {
    title: '系統管理',
    description: '管理使用者、設定與主檔匯入／匯出',
    usersTitle: '用戶',
    usersDesc: '管理用戶與存取權限。',
    settingsTitle: '設定',
    settingsDesc: '設定地區、前綴、付款方式、付款條款與店舖等。',
    importTitle: '匯入／匯出',
    importDesc: '上傳或匯出主檔資料。',
    systemTitle: '系統',
    systemDesc: '管理全系統設定與偏好。',
    profileTitle: '個人資料',
    profileDesc: '檢視與更新帳號、預設店舖與密碼。',
  },
  settingsHub: {
    title: '設定',
    description: '管理系統設定與組態',
    districtsTitle: '地區',
    districtsDesc: '管理地區與相關設定。',
    prefixesTitle: '字首',
    prefixesDesc: '管理交易字首與編號。',
    paymentMethodsTitle: '付款方式',
    paymentMethodsDesc: '管理付款方式與設定。',
    paymentTermsTitle: '付款條件',
    paymentTermsDesc: '管理付款條件與到期規則。',
    shopsTitle: '店舖',
    shopsDesc: '管理店舖與相關設定。',
  },
};

export function getHubPagesTexts(lang: AppLanguage): HubPagesTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}
