import type { PluginsLabTexts } from './en';

export const zhHant = {
  page: {
    title: '外掛測試',
    description:
      '為此瀏覽器工作階段選擇外掛。用來測試功能套件；之後「專案設定」會改為依部署儲存。',
  },
  actions: {
    resetDefaults: '重設預設',
    openProjectSetup: '專案設定（規劃中）',
  },
  messages: {
    enabled: (name: string) => `已啟用 ${name}`,
    disabled: (name: string) => `已停用 ${name}`,
    resetOk: '外掛選擇已重設為預設值',
  },
  table: {
    name: '外掛',
    category: '分類',
    version: '版本',
    enabled: '啟用',
    notes: '說明',
  },
  categories: {
    sales: '銷售',
    warehouse: '倉庫',
    system: '系統',
    other: '其他',
  },
  hint: {
    storage:
      '目前僅儲存在此瀏覽器（localStorage）供測試。專案設定之後會改為伺服器端專案設定檔。',
    monthly: '關閉「月結發票」會隱藏選單「銷售 → 月結發票」並阻擋相關路由。',
  },
} satisfies PluginsLabTexts;
