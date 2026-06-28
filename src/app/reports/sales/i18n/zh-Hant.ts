export const zhHant = {
  breadcrumb: {
    home: '首頁',
    reports: '報表',
    sales: '銷售報表',
  },
  page: {
    title: '銷售報表',
    description: '發票銷售與成本彙總。成本以各貨品最新 GRN 單價計算。',
    noPermission: '您沒有權限檢視此報表。',
  },
  filters: {
    dateRange: '日期範圍',
    shop: '店舖',
    allShops: '全部店舖',
    groupBy: '分組',
    byInvoice: '按發票',
    byItem: '按貨品',
    search: '套用',
    reload: '重新載入',
  },
  summary: {
    totalSales: '銷售總額',
    totalCost: '成本總額',
    grossProfit: '毛利',
    invoiceCount: '發票數',
  },
  table: {
    invoice: '發票',
    date: '日期',
    customer: '客戶',
    shop: '店舖',
    lines: '行數',
    itemCode: '貨品編號',
    description: '描述',
    unit: '單位',
    qty: '數量',
    unitCost: '單位成本',
    sales: '銷售',
    cost: '成本',
    profit: '毛利',
  },
  prompts: {
    failedLoad: '無法載入銷售報表',
    errorLoad: '載入銷售報表時發生錯誤',
  },
  paginationTotal: (from: number, to: number, total: number) =>
    `第 ${from}-${to} 項，共 ${total} 項`,
} as const;
