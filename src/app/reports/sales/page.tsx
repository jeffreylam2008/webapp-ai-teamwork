'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesReportTexts } from './i18n';
import { FilterOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Pagination,
  Row,
  Select,
  Spin,
  Statistic,
  Table,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  isSalesReportPrintPopupBlocked,
  openSalesReportPrintWindow,
} from '@/lib/openSalesReportPrintWindow';
import {
  isCustomerGroup,
  type SalesReportGroupBy,
} from './groupBy';

type GroupBy = SalesReportGroupBy;

type SalesReportSummary = {
  invoice_count: number;
  total_sales: number;
  total_cost: number;
  gross_profit: number;
};

type InvoiceLineDetail = {
  uid?: number;
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  qty: number;
  price: number;
  discount: number;
  unit_cost: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
};

type InvoiceReportRow = {
  trans_code: string;
  transaction_date: string;
  customer_code?: string;
  customer_name?: string;
  shop_code?: string;
  shop_name?: string;
  line_count?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  details?: InvoiceLineDetail[];
};

type CustomerReportRow = {
  customer_code: string;
  customer_name?: string;
  invoice_count: number;
  line_count?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  invoices?: InvoiceReportRow[];
};

type ItemReportRow = {
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  total_qty: number;
  unit_cost?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
};

type ShopOption = { shop_code: string; name: string };

export default function SalesReportPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSalesReportTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const { token, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();

  const canView = can('view_sales_report');

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SalesReportSummary | null>(null);
  const [rows, setRows] = useState<(InvoiceReportRow | ItemReportRow | CustomerReportRow)[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('invoice');
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopCode, setShopCode] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>([]);

  const hasInitialFetch = useRef(false);

  useEffect(() => {
    setPagination((prev) => {
      const nextPageSize = Math.min(Math.max(1, pageSizeDefault), pageSizeMax);
      if (prev.pageSize === nextPageSize) return prev;
      if (prev.pageSize !== 50) return prev;
      return { ...prev, pageSize: nextPageSize, current: 1 };
    });
  }, [pageSizeDefault, pageSizeMax]);

  useEffect(() => {
    if (!token || authLoading) return;
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/shops?limit=500&sortColumn=name&sortDirection=asc', token);
        const json = (await res.json()) as { success?: boolean; data?: ShopOption[] };
        if (json.success && Array.isArray(json.data)) {
          setShops(json.data);
        }
      } catch {
        /* optional filter list */
      }
    })();
  }, [token, authLoading]);

  const fetchReport = useCallback(
    async (page = 1, pageSize = pagination.pageSize, groupByOverride?: GroupBy) => {
      if (!token || !canView) return;
      const effectiveGroupBy = groupByOverride ?? groupBy;
      setLoading(true);
      try {
        let url = `/api/reports/sales?group_by=${effectiveGroupBy}&page=${page}&pageSize=${pageSize}`;
        if (dateRange[0] && dateRange[1]) {
          url += `&start_date=${dateRange[0].format('YYYY-MM-DD')}`;
          url += `&end_date=${dateRange[1].format('YYYY-MM-DD')}`;
        }
        if (shopCode) {
          url += `&shop_code=${encodeURIComponent(shopCode)}`;
        }
        url += `&t=${Date.now()}`;

        const response = await fetchWithAuth(url, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const result = await response.json();

        if (result.success) {
          setSummary(result.summary || null);
          setRows(Array.isArray(result.data) ? result.data : []);
          setActiveCollapseKeys([]);
          if (result.pagination) {
            setPagination({
              current: result.pagination.current ?? page,
              pageSize: result.pagination.pageSize ?? pageSize,
              total: result.pagination.total ?? 0,
            });
          }
        } else {
          messageApi.error(
            (typeof result.error === 'string' && result.error) || t.prompts.failedLoad
          );
        }
      } catch {
        messageApi.error(t.prompts.errorLoad);
      } finally {
        setLoading(false);
      }
    },
    [token, canView, groupBy, dateRange, shopCode, pagination.pageSize, messageApi, t]
  );

  useEffect(() => {
    if (authLoading || !canView) return;
    if (!hasInitialFetch.current) {
      hasInitialFetch.current = true;
      void fetchReport(1, pagination.pageSize);
    }
  }, [authLoading, canView, fetchReport, pagination.pageSize]);

  const handleApplyFilters = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    void fetchReport(1, pagination.pageSize);
  };

  const handleExport = () => {
    const selectedShop = shops.find((s) => s.shop_code === shopCode);
    const shopLabel = selectedShop ? `${selectedShop.shop_code} - ${selectedShop.name}` : '';
    const popup = openSalesReportPrintWindow({
      startDate: dateRange[0]?.format('YYYY-MM-DD'),
      endDate: dateRange[1]?.format('YYYY-MM-DD'),
      shopCode,
      shopLabel,
      groupBy,
      lang,
    });
    if (isSalesReportPrintPopupBlocked(popup)) {
      messageApi.warning(t.prompts.popupBlocked);
    }
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    const page = newPagination.current || 1;
    const pageSize = newPagination.pageSize || pagination.pageSize;
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    void fetchReport(page, pageSize);
  };

  const handleInvoicePageChange = (page: number, pageSize: number) => {
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    void fetchReport(page, pageSize);
  };

  const invoiceLineColumns = useMemo(
    () => [
      {
        title: t.table.itemCode,
        dataIndex: 'item_code',
        key: 'item_code',
        width: 120,
      },
      {
        title: t.table.description,
        key: 'description',
        width: 220,
        render: (_: unknown, record: InvoiceLineDetail) =>
          record.eng_name || record.chi_name || '-',
      },
      {
        title: t.table.unit,
        dataIndex: 'unit',
        key: 'unit',
        width: 70,
      },
      {
        title: t.table.qty,
        dataIndex: 'qty',
        key: 'qty',
        width: 80,
        align: 'right' as const,
      },
      {
        title: t.table.price,
        dataIndex: 'price',
        key: 'price',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value || 0),
      },
      {
        title: t.table.discount,
        dataIndex: 'discount',
        key: 'discount',
        width: 80,
        align: 'right' as const,
        render: (value: number) => `${Number(value || 0).toFixed(0)}%`,
      },
      {
        title: t.table.unitCost,
        dataIndex: 'unit_cost',
        key: 'unit_cost',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value || 0),
      },
      {
        title: t.table.sales,
        dataIndex: 'sales_amount',
        key: 'sales_amount',
        width: 110,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.cost,
        dataIndex: 'cost_amount',
        key: 'cost_amount',
        width: 110,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.profit,
        dataIndex: 'gross_profit',
        key: 'gross_profit',
        width: 110,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
    ],
    [t]
  );

  const itemColumns = useMemo(
    () => [
      {
        title: t.table.itemCode,
        dataIndex: 'item_code',
        key: 'item_code',
        width: 120,
      },
      {
        title: t.table.description,
        key: 'description',
        width: 220,
        render: (_: unknown, record: ItemReportRow) => record.eng_name || record.chi_name || '-',
      },
      {
        title: t.table.unit,
        dataIndex: 'unit',
        key: 'unit',
        width: 80,
      },
      {
        title: t.table.qty,
        dataIndex: 'total_qty',
        key: 'total_qty',
        width: 90,
        align: 'right' as const,
      },
      {
        title: t.table.unitCost,
        dataIndex: 'unit_cost',
        key: 'unit_cost',
        width: 110,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value || 0),
      },
      {
        title: t.table.sales,
        dataIndex: 'sales_amount',
        key: 'sales_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.cost,
        dataIndex: 'cost_amount',
        key: 'cost_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.profit,
        dataIndex: 'gross_profit',
        key: 'gross_profit',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
    ],
    [t]
  );

  const invoiceSummaryColumns = useMemo(
    () => [
      {
        title: t.table.invoice,
        dataIndex: 'trans_code',
        key: 'trans_code',
        width: 140,
      },
      {
        title: t.table.date,
        dataIndex: 'transaction_date',
        key: 'transaction_date',
        width: 160,
        render: (value: string) => formatDisplayDateTime(value),
      },
      {
        title: t.table.customer,
        key: 'customer',
        width: 220,
        render: (_: unknown, record: InvoiceReportRow) =>
          record.customer_name
            ? `${record.customer_code || ''} - ${record.customer_name}`
            : record.customer_code || '-',
      },
      {
        title: t.table.shop,
        key: 'shop',
        width: 180,
        render: (_: unknown, record: InvoiceReportRow) =>
          record.shop_name
            ? `${record.shop_code || ''} - ${record.shop_name}`
            : record.shop_code || '-',
      },
      {
        title: t.table.lines,
        dataIndex: 'line_count',
        key: 'line_count',
        width: 80,
        align: 'right' as const,
      },
      {
        title: t.table.sales,
        dataIndex: 'sales_amount',
        key: 'sales_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.cost,
        dataIndex: 'cost_amount',
        key: 'cost_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.profit,
        dataIndex: 'gross_profit',
        key: 'gross_profit',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
    ],
    [t]
  );

  const customerSummaryColumns = useMemo(
    () => [
      {
        title: t.table.customer,
        key: 'customer',
        width: 260,
        render: (_: unknown, record: CustomerReportRow) =>
          record.customer_name
            ? `${record.customer_code || ''} - ${record.customer_name}`
            : record.customer_code || '-',
      },
      {
        title: t.summary.invoiceCount,
        dataIndex: 'invoice_count',
        key: 'invoice_count',
        width: 100,
        align: 'right' as const,
      },
      {
        title: t.table.lines,
        dataIndex: 'line_count',
        key: 'line_count',
        width: 80,
        align: 'right' as const,
      },
      {
        title: t.table.sales,
        dataIndex: 'sales_amount',
        key: 'sales_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.cost,
        dataIndex: 'cost_amount',
        key: 'cost_amount',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: t.table.profit,
        dataIndex: 'gross_profit',
        key: 'gross_profit',
        width: 120,
        align: 'right' as const,
        render: (value: number) => formatCurrency(value),
      },
    ],
    [t]
  );

  const buildInvoiceCollapseItems = useCallback(
    (invoices: InvoiceReportRow[], keyPrefix = '') =>
      invoices.map((invoice) => {
        const customerLabel = invoice.customer_name
          ? `${invoice.customer_code || ''} - ${invoice.customer_name}`
          : invoice.customer_code || '-';
        const shopLabel = invoice.shop_name
          ? `${invoice.shop_code || ''} - ${invoice.shop_name}`
          : invoice.shop_code || '-';
        const details = Array.isArray(invoice.details) ? invoice.details : [];

        return {
          key: `${keyPrefix}${invoice.trans_code}`,
          label: (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pr-2 text-sm">
              <span className="font-semibold text-gray-900">{invoice.trans_code}</span>
              <span className="text-gray-500">
                {formatDisplayDateTime(invoice.transaction_date)}
              </span>
              {keyPrefix ? null : <span className="text-gray-700">{customerLabel}</span>}
              <span className="text-gray-500">{shopLabel}</span>
              <span className="text-gray-500">
                {t.table.lines}: {invoice.line_count ?? details.length}
              </span>
              <span>
                {t.table.sales}: <strong>{formatCurrency(invoice.sales_amount)}</strong>
              </span>
              <span>
                {t.table.cost}: <strong>{formatCurrency(invoice.cost_amount)}</strong>
              </span>
              <span>
                {t.table.profit}:{' '}
                <strong style={{ color: invoice.gross_profit >= 0 ? '#3f8600' : '#cf1322' }}>
                  {formatCurrency(invoice.gross_profit)}
                </strong>
              </span>
            </div>
          ),
          children: (
            <Table<InvoiceLineDetail>
              size="small"
              columns={invoiceLineColumns}
              dataSource={details}
              rowKey={(r) => String(r.uid ?? `${r.item_code}-${r.qty}-${r.price}`)}
              pagination={false}
              scroll={{ x: 1100 }}
              locale={{ emptyText: t.table.noLineItems }}
            />
          ),
        };
      }),
    [invoiceLineColumns, t]
  );

  const invoiceRows = rows as InvoiceReportRow[];
  const customerRows = rows as CustomerReportRow[];

  const invoiceCollapseItems = useMemo(
    () => buildInvoiceCollapseItems(invoiceRows),
    [buildInvoiceCollapseItems, invoiceRows]
  );

  const customerCollapseItems = useMemo(
    () =>
      customerRows.map((customer) => {
        const customerLabel = customer.customer_name
          ? `${customer.customer_code || ''} - ${customer.customer_name}`
          : customer.customer_code || '-';
        const invoices = Array.isArray(customer.invoices) ? customer.invoices : [];

        return {
          key: customer.customer_code,
          label: (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pr-2 text-sm">
              <span className="font-semibold text-gray-900">{customerLabel}</span>
              <span className="text-gray-500">
                {t.summary.invoiceCount}: {customer.invoice_count ?? invoices.length}
              </span>
              <span className="text-gray-500">
                {t.table.lines}: {customer.line_count ?? 0}
              </span>
              <span>
                {t.table.sales}: <strong>{formatCurrency(customer.sales_amount)}</strong>
              </span>
              <span>
                {t.table.cost}: <strong>{formatCurrency(customer.cost_amount)}</strong>
              </span>
              <span>
                {t.table.profit}:{' '}
                <strong style={{ color: customer.gross_profit >= 0 ? '#3f8600' : '#cf1322' }}>
                  {formatCurrency(customer.gross_profit)}
                </strong>
              </span>
            </div>
          ),
          children:
            invoices.length === 0 ? (
              <div className="py-4 text-center text-gray-500">{t.table.noInvoices}</div>
            ) : (
              <Collapse
                size="small"
                items={buildInvoiceCollapseItems(invoices, `${customer.customer_code}::`)}
              />
            ),
        };
      }),
    [customerRows, buildInvoiceCollapseItems, t]
  );

  const buttonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex flex-wrap gap-2 items-center">
      <DatePicker.RangePicker
        value={dateRange}
        onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
        allowClear={false}
      />
      <Select
        value={shopCode || undefined}
        onChange={(value) => setShopCode(value || '')}
        placeholder={t.filters.allShops}
        allowClear
        style={{ minWidth: 180 }}
        options={shops.map((s) => ({
          value: s.shop_code,
          label: `${s.shop_code} - ${s.name}`,
        }))}
      />
      <Select
        value={groupBy}
        onChange={(value: GroupBy) => {
          setGroupBy(value);
          setRows([]);
          setActiveCollapseKeys([]);
          setPagination((prev) => ({ ...prev, current: 1 }));
          void fetchReport(1, pagination.pageSize, value);
        }}
        style={{ minWidth: 200 }}
        options={[
          { value: 'invoice', label: t.filters.byInvoice },
          { value: 'invoice_detail', label: t.filters.byInvoiceDetail },
          { value: 'customer', label: t.filters.byCustomer },
          { value: 'customer_detail', label: t.filters.byCustomerDetail },
          { value: 'product', label: t.filters.byProduct },
        ]}
      />
      <Button type="primary" icon={<FilterOutlined />} onClick={handleApplyFilters} disabled={!canView}>
        {t.filters.search}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={() => void fetchReport(pagination.current, pagination.pageSize)} disabled={!canView}>
        {t.filters.reload}
      </Button>
      <Button icon={<PrinterOutlined />} onClick={handleExport} disabled={!canView}>
        {t.filters.export}
      </Button>
    </div>
  );

  if (!authLoading && !canView) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.breadcrumb.home, href: '/' },
              { label: t.breadcrumb.reports, href: '/reports/sales' },
              { label: t.breadcrumb.sales, current: true },
            ]}
          />
        }
        title={t.page.title}
        description={t.page.noPermission}
      >
        <div className="px-8 py-6 text-gray-600">{t.page.noPermission}</div>
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, href: '/' },
            { label: t.breadcrumb.reports, href: '/reports/sales' },
            { label: t.breadcrumb.sales, current: true },
          ]}
        />
      }
      buttonBar={buttonBar}
      title={t.page.title}
      description={t.page.description}
    >
      <Spin spinning={loading}>
        <div className="px-8 py-6 space-y-6">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.totalSales}
                  value={summary?.total_sales ?? 0}
                  formatter={(value) => formatCurrency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.totalCost}
                  value={summary?.total_cost ?? 0}
                  formatter={(value) => formatCurrency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.grossProfit}
                  value={summary?.gross_profit ?? 0}
                  formatter={(value) => formatCurrency(Number(value))}
                  valueStyle={{ color: (summary?.gross_profit ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title={t.summary.invoiceCount} value={summary?.invoice_count ?? 0} />
              </Card>
            </Col>
          </Row>

          <Card size="small">
            {groupBy === 'product' ? (
              <Table<ItemReportRow>
                key="product"
                columns={itemColumns}
                dataSource={rows as ItemReportRow[]}
                rowKey="item_code"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions,
                  showTotal: (total, range) => t.paginationTotal(range[0], range[1], total),
                }}
                onChange={handleTableChange}
                scroll={{ x: 1100 }}
              />
            ) : groupBy === 'invoice' ? (
              <Table<InvoiceReportRow>
                key="invoice"
                columns={invoiceSummaryColumns}
                dataSource={rows as InvoiceReportRow[]}
                rowKey="trans_code"
                locale={{ emptyText: t.table.noInvoices }}
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions,
                  showTotal: (total, range) => t.paginationTotal(range[0], range[1], total),
                }}
                onChange={handleTableChange}
                scroll={{ x: 1100 }}
              />
            ) : groupBy === 'customer' ? (
              <Table<CustomerReportRow>
                key="customer"
                columns={customerSummaryColumns}
                dataSource={rows as CustomerReportRow[]}
                rowKey="customer_code"
                locale={{ emptyText: t.table.noCustomers }}
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions,
                  showTotal: (total, range) => t.paginationTotal(range[0], range[1], total),
                }}
                onChange={handleTableChange}
                scroll={{ x: 900 }}
              />
            ) : (
              <div className="space-y-4">
                {(isCustomerGroup(groupBy) ? customerCollapseItems : invoiceCollapseItems)
                  .length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    {isCustomerGroup(groupBy) ? t.table.noCustomers : t.table.noInvoices}
                  </div>
                ) : (
                  <Collapse
                    accordion={false}
                    activeKey={activeCollapseKeys}
                    onChange={(keys) =>
                      setActiveCollapseKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])
                    }
                    items={
                      isCustomerGroup(groupBy) ? customerCollapseItems : invoiceCollapseItems
                    }
                  />
                )}
                <div className="flex justify-end">
                  <Pagination
                    current={pagination.current}
                    pageSize={pagination.pageSize}
                    total={pagination.total}
                    showSizeChanger
                    pageSizeOptions={pageSizeOptions}
                    showTotal={(total, range) => t.paginationTotal(range[0], range[1], total)}
                    onChange={handleInvoicePageChange}
                    onShowSizeChange={handleInvoicePageChange}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      </Spin>
    </BasicPageLayout>
  );
}
