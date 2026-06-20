import type { AppLanguage } from './language';

export type LogsPageTexts = {
  pageTitle: string;
  pageDescription: string;
  cardTitle: string;
  colTimestamp: string;
  colType: string;
  colAction: string;
  colUser: string;
  colResource: string;
  colIp: string;
  colStatus: string;
  colActions: string;
  anonymous: string;
  typeUserActions: string;
  typeErrors: string;
  typeSystem: string;
  deleteLog: string;
  paginationTotal: (from: number, to: number, total: number) => string;
  modalTitle: string;
  failedFetch: string;
  errorFetch: string;
  deleteSuccess: string;
  deleteFailed: string;
  deleteError: string;
};

const EN: LogsPageTexts = {
  pageTitle: 'System Logs',
  pageDescription: 'Monitor and manage system logs, user actions, and error tracking',
  cardTitle: 'System Logs',
  colTimestamp: 'Timestamp',
  colType: 'Type',
  colAction: 'Action',
  colUser: 'User',
  colResource: 'Resource',
  colIp: 'IP Address',
  colStatus: 'Status',
  colActions: 'Actions',
  anonymous: 'anonymous',
  typeUserActions: 'User Actions',
  typeErrors: 'Errors',
  typeSystem: 'System',
  deleteLog: 'Delete Log',
  paginationTotal: (from, to, total) => `${from}-${to} of ${total} logs`,
  modalTitle: 'Log Details',
  failedFetch: 'Failed to fetch logs',
  errorFetch: 'Error fetching logs',
  deleteSuccess: 'Log file deleted successfully',
  deleteFailed: 'Failed to delete log file',
  deleteError: 'Error deleting log file',
};

const ZH_HANT: LogsPageTexts = {
  pageTitle: '系統日誌',
  pageDescription: '監控與管理系統日誌、使用者操作與錯誤追蹤',
  cardTitle: '系統日誌',
  colTimestamp: '時間',
  colType: '類型',
  colAction: '動作',
  colUser: '使用者',
  colResource: '資源',
  colIp: 'IP 位址',
  colStatus: '狀態',
  colActions: '操作',
  anonymous: '匿名',
  typeUserActions: '使用者操作',
  typeErrors: '錯誤',
  typeSystem: '系統',
  deleteLog: '刪除日誌',
  paginationTotal: (from, to, total) => `第 ${from}-${to} 筆，共 ${total} 筆日誌`,
  modalTitle: '日誌詳情',
  failedFetch: '無法取得日誌',
  errorFetch: '取得日誌時發生錯誤',
  deleteSuccess: '日誌檔已成功刪除',
  deleteFailed: '無法刪除日誌檔',
  deleteError: '刪除日誌檔時發生錯誤',
};

export function getLogsPageTexts(lang: AppLanguage): LogsPageTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}
