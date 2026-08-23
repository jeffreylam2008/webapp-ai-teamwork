import type { AppLanguage } from './language';

export type HubPagesTexts = {
  home: {
    title: string;
    description: string;
    overview: string;
    workflow: string;
    periodThisMonth: string;
    metrics: {
      monthSales: string;
      invoices: string;
      suppliers: string;
      customers: string;
      users: string;
      warehousePending: string;
      draftSalesOrders: string;
      purchaseOrders: string;
    };
    workflowGroups: {
      sales: string;
      purchasing: string;
      warehouse: string;
      reports: string;
      masterData: string;
      administration: string;
    };
    links: {
      invoices: string;
      invoicesDesc: string;
      salesOrders: string;
      salesOrdersDesc: string;
      quotations: string;
      quotationsDesc: string;
      purchases: string;
      purchasesDesc: string;
      warehouseStock: string;
      warehouseStockDesc: string;
      deliveryNote: string;
      deliveryNoteDesc: string;
      grn: string;
      grnDesc: string;
      salesReport: string;
      salesReportDesc: string;
      warehouseReport: string;
      warehouseReportDesc: string;
      customers: string;
      customersDesc: string;
      suppliers: string;
      suppliersDesc: string;
      products: string;
      productsDesc: string;
      users: string;
      usersDesc: string;
    };
    failedLoad: string;
  };
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
    title: 'Dashboard',
    description: 'Overview of key metrics and shortcuts to daily workflows.',
    overview: 'Overview',
    workflow: 'Workflow',
    periodThisMonth: 'This month',
    metrics: {
      monthSales: 'Sales (this month)',
      invoices: 'Invoices',
      suppliers: 'Vendors',
      customers: 'Customers',
      users: 'Users',
      warehousePending: 'Warehouse pending',
      draftSalesOrders: 'Draft sales orders',
      purchaseOrders: 'Purchase orders',
    },
    workflowGroups: {
      sales: 'Sales',
      purchasing: 'Purchasing',
      warehouse: 'Warehouse',
      reports: 'Reports',
      masterData: 'Master data',
      administration: 'Administration',
    },
    links: {
      invoices: 'Invoices',
      invoicesDesc: 'Create and manage customer invoices',
      salesOrders: 'Sales orders',
      salesOrdersDesc: 'Confirm orders and track fulfilment',
      quotations: 'Quotations',
      quotationsDesc: 'Prepare and convert quotations',
      purchases: 'Purchase orders',
      purchasesDesc: 'Order from suppliers',
      warehouseStock: 'Warehouse stock',
      warehouseStockDesc: 'GRN, delivery, adjustment, and stocktake',
      deliveryNote: 'Delivery notes',
      deliveryNoteDesc: 'Ship confirmed sales orders',
      grn: 'Goods received',
      grnDesc: 'Receive supplier deliveries into stock',
      salesReport: 'Sales report',
      salesReportDesc: 'Sales, cost, and profit by invoice or product',
      warehouseReport: 'Warehouse report',
      warehouseReportDesc: 'Track stock in and out movements',
      customers: 'Customers',
      customersDesc: 'Customer master records',
      suppliers: 'Vendors',
      suppliersDesc: 'Supplier master records',
      products: 'Products',
      productsDesc: 'Items and categories',
      users: 'Users',
      usersDesc: 'Accounts and access control',
    },
    failedLoad: 'Failed to load dashboard metrics',
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
    title: '儀表板',
    description: '關鍵指標總覽與日常作業快速連結。',
    overview: '總覽',
    workflow: '作業流程',
    periodThisMonth: '本月',
    metrics: {
      monthSales: '銷售額（本月）',
      invoices: '發票數',
      suppliers: '供應商',
      customers: '客戶',
      users: '用戶',
      warehousePending: '倉庫待辦',
      draftSalesOrders: '草稿銷售單',
      purchaseOrders: '採購單',
    },
    workflowGroups: {
      sales: '銷售',
      purchasing: '採購',
      warehouse: '倉庫',
      reports: '報表',
      masterData: '主檔',
      administration: '系統管理',
    },
    links: {
      invoices: '發票',
      invoicesDesc: '建立與管理客戶發票',
      salesOrders: '銷售單',
      salesOrdersDesc: '確認訂單並追蹤出貨',
      quotations: '報價單',
      quotationsDesc: '準備報價並轉換為訂單',
      purchases: '採購單',
      purchasesDesc: '向供應商下單',
      warehouseStock: '倉庫庫存',
      warehouseStockDesc: '收貨、送貨、調整與盤點',
      deliveryNote: '送貨單',
      deliveryNoteDesc: '為已確認銷售單出貨',
      grn: '收貨單',
      grnDesc: '將供應商送貨入庫',
      salesReport: '銷售報表',
      salesReportDesc: '按發票或產品查看銷售與毛利',
      warehouseReport: '倉庫報表',
      warehouseReportDesc: '追蹤進出庫存異動',
      customers: '客戶',
      customersDesc: '客戶主檔',
      suppliers: '供應商',
      suppliersDesc: '供應商主檔',
      products: '產品',
      productsDesc: '品項與分類',
      users: '用戶',
      usersDesc: '帳號與權限管理',
    },
    failedLoad: '無法載入儀表板指標',
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
