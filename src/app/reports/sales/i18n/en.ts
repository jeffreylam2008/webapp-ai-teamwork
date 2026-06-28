export const en = {
  breadcrumb: {
    home: 'Home',
    reports: 'Reports',
    sales: 'Sales Report',
  },
  page: {
    title: 'Sales Report',
    description: 'Invoice sales and cost summary. Cost uses the latest GRN unit price per item.',
    noPermission: 'You do not have permission to view this report.',
  },
  filters: {
    dateRange: 'Date range',
    shop: 'Shop',
    allShops: 'All shops',
    groupBy: 'Group by',
    byInvoice: 'By invoice',
    byItem: 'By item',
    search: 'Apply',
    reload: 'Reload',
  },
  summary: {
    totalSales: 'Total sales',
    totalCost: 'Total cost',
    grossProfit: 'Gross profit',
    invoiceCount: 'Invoices',
  },
  table: {
    invoice: 'Invoice',
    date: 'Date',
    customer: 'Customer',
    shop: 'Shop',
    lines: 'Lines',
    itemCode: 'Item code',
    description: 'Description',
    unit: 'Unit',
    qty: 'Qty',
    unitCost: 'Unit cost',
    sales: 'Sales',
    cost: 'Cost',
    profit: 'Gross profit',
  },
  prompts: {
    failedLoad: 'Failed to load sales report',
    errorLoad: 'Error loading sales report',
  },
  paginationTotal: (from: number, to: number, total: number) =>
    `${from}-${to} of ${total} rows`,
} as const;
