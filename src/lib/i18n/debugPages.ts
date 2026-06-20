import type { AppLanguage } from './language';

export type DebugPagesTexts = {
  breadcrumbHome: string;
  breadcrumbDebug: string;
  pageTitle: string;
  pageDescription: string;
  cardDebugMode: string;
  dnDebugTitle: string;
  dnDebugDesc: string;
  showSessionTitle: string;
  showSessionDesc: string;
  showTechTitle: string;
  showTechDesc: string;
  logLevelTitle: string;
  logLevelDesc: string;
  cardActiveSession: string;
  sessionType: string;
  currentPath: string;
  startedAt: string;
  cardDebugInfo: string;
  alertStatusTitle: string;
  dnDebugLabel: string;
  sessionInfoLabel: string;
  techDetailsLabel: string;
  logLevelLabel: string;
  on: string;
  off: string;
  visible: string;
  hidden: string;
  footerNote: string;
  cardDbTools: string;
  dbToolsTitle: string;
  dbToolsDesc: string;
  dbToolsButton: string;
  cardQuickActions: string;
  enableDebug: string;
  disableDebug: string;
  resetDefaults: string;
  clearAll: string;
  testDb: {
    breadcrumbDebugCenter: string;
    breadcrumbTestDb: string;
    title: string;
    subtitle: string;
    testButton: string;
    testing: string;
    errorPrefix: string;
    successTitle: string;
    failedTitle: string;
    messageLabel: string;
    timestampLabel: string;
    errorLabel: string;
    aboutTitle: string;
    aboutIntro: string;
    aboutLi1: string;
    aboutLi2: string;
    aboutLi3: string;
    aboutLi4: string;
    connectionFailed: string;
  };
};

const EN: DebugPagesTexts = {
  breadcrumbHome: 'Home',
  breadcrumbDebug: 'Debug',
  pageTitle: 'Debug & Development Tools',
  pageDescription: 'Configure debug settings and view system information',
  cardDebugMode: 'Debug Mode Settings',
  dnDebugTitle: 'Delivery Note Debug Mode',
  dnDebugDesc: 'Show transaction session information and technical details',
  showSessionTitle: 'Show Session Information',
  showSessionDesc: 'Display transaction session details when debug mode is active',
  showTechTitle: 'Show Technical Details',
  showTechDesc: 'Display additional technical information for debugging',
  logLevelTitle: 'Log Level',
  logLevelDesc: 'Set the minimum log level for debug output',
  cardActiveSession: 'Active Session',
  sessionType: 'Session Type:',
  currentPath: 'Current Path:',
  startedAt: 'Started At:',
  cardDebugInfo: 'Debug Information',
  alertStatusTitle: 'Debug Mode Status',
  dnDebugLabel: 'Delivery Note Debug:',
  sessionInfoLabel: 'Session Info:',
  techDetailsLabel: 'Technical Details:',
  logLevelLabel: 'Log Level:',
  on: 'ON',
  off: 'OFF',
  visible: 'Visible',
  hidden: 'Hidden',
  footerNote:
    'Debug settings are saved to your browser and will persist across sessions. Changes take effect immediately on all open delivery note pages.',
  cardDbTools: 'Database Tools',
  dbToolsTitle: 'Database Connection Test',
  dbToolsDesc: 'Test MySQL database connection and verify basic operations',
  dbToolsButton: '🗄️ Test Database Connection',
  cardQuickActions: 'Quick Actions',
  enableDebug: 'Enable Debug Mode',
  disableDebug: 'Disable Debug Mode',
  resetDefaults: 'Reset to Defaults',
  clearAll: 'Clear All Settings',
  testDb: {
    breadcrumbDebugCenter: 'Debug Center',
    breadcrumbTestDb: 'Test Database',
    title: '🗄️ MySQL Database Test',
    subtitle: 'Test your MySQL database connection and basic operations.',
    testButton: 'Test Database Connection',
    testing: 'Testing...',
    errorPrefix: 'Error:',
    successTitle: '✅ Connection Successful',
    failedTitle: '❌ Connection Failed',
    messageLabel: 'Message:',
    timestampLabel: 'Timestamp:',
    errorLabel: 'Error:',
    aboutTitle: 'About Database Testing',
    aboutIntro: 'This page allows you to test the MySQL database connection and verify that:',
    aboutLi1: 'The database server is accessible',
    aboutLi2: 'Connection credentials are correct',
    aboutLi3: 'Required tables exist',
    aboutLi4: 'Basic queries can be executed',
    connectionFailed: 'Failed to test database connection',
  },
};

const ZH_HANT: DebugPagesTexts = {
  breadcrumbHome: '首頁',
  breadcrumbDebug: '除錯',
  pageTitle: '除錯與開發工具',
  pageDescription: '設定除錯選項並檢視系統資訊',
  cardDebugMode: '除錯模式設定',
  dnDebugTitle: '出貨單除錯模式',
  dnDebugDesc: '顯示交易工作階段與技術細節',
  showSessionTitle: '顯示工作階段資訊',
  showSessionDesc: '除錯模式啟用時顯示交易工作階段細節',
  showTechTitle: '顯示技術細節',
  showTechDesc: '顯示額外技術資訊以供除錯',
  logLevelTitle: '日誌層級',
  logLevelDesc: '設定除錯輸出的最低日誌層級',
  cardActiveSession: '使用中工作階段',
  sessionType: '工作階段類型：',
  currentPath: '目前路徑：',
  startedAt: '開始時間：',
  cardDebugInfo: '除錯資訊',
  alertStatusTitle: '除錯模式狀態',
  dnDebugLabel: '出貨單除錯：',
  sessionInfoLabel: '工作階段資訊：',
  techDetailsLabel: '技術細節：',
  logLevelLabel: '日誌層級：',
  on: '開啟',
  off: '關閉',
  visible: '顯示',
  hidden: '隱藏',
  footerNote: '除錯設定會儲存在瀏覽器並跨工作階段保留。變更會立即套用到已開啟的出貨單頁面。',
  cardDbTools: '資料庫工具',
  dbToolsTitle: '資料庫連線測試',
  dbToolsDesc: '測試 MySQL 連線並驗證基本操作',
  dbToolsButton: '🗄️ 測試資料庫連線',
  cardQuickActions: '快速操作',
  enableDebug: '啟用除錯模式',
  disableDebug: '停用除錯模式',
  resetDefaults: '重設為預設值',
  clearAll: '清除所有設定',
  testDb: {
    breadcrumbDebugCenter: '除錯中心',
    breadcrumbTestDb: '測試資料庫',
    title: '🗄️ MySQL 資料庫測試',
    subtitle: '測試 MySQL 連線與基本操作。',
    testButton: '測試資料庫連線',
    testing: '測試中...',
    errorPrefix: '錯誤：',
    successTitle: '✅ 連線成功',
    failedTitle: '❌ 連線失敗',
    messageLabel: '訊息：',
    timestampLabel: '時間戳：',
    errorLabel: '錯誤：',
    aboutTitle: '關於資料庫測試',
    aboutIntro: '此頁面可測試 MySQL 連線並確認：',
    aboutLi1: '資料庫伺服器可連線',
    aboutLi2: '連線憑證正確',
    aboutLi3: '必要資料表存在',
    aboutLi4: '可執行基本查詢',
    connectionFailed: '無法測試資料庫連線',
  },
};

export function getDebugPagesTexts(lang: AppLanguage): DebugPagesTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}
