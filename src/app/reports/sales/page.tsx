'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesReportTexts } from './i18n';
import { ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Row, Select, Space, Spin, Statistic, Table } from 'antd';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';

type GroupBy = 'invoice' | 'item';

type SalesReportSummary = {
  invoice_count: number;
  total_sales: number;
  total_cost: number;
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
  const [rows, setRows] = useState<(InvoiceReportRow | ItemReportRow)[]>([]);
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

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    const page = newPagination.current || 1;
    const pageSize = newPagination.pageSize || pagination.pageSize;
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    void fetchReport(page, pageSize);
  };

  const invoiceColumns = useMemo(
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
        width: 170,
        render: (value: string) => formatDisplayDateTime(value),
      },
      {
        title: t.table.customer,
        key: 'customer',
        width: 200,
        render: (_: unknown, record: InvoiceReportRow) =>
          record.customer_name
            ? `${record.customer_code || ''} - ${record.customer_name}`
            : record.customer_code || '-',
      },
      {
        title: t.table.shop,
        key: 'shop',
        width: 160,
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
          setPagination((prev) => ({ ...prev, current: 1 }));
          void fetchReport(1, pagination.pageSize, value);
        }}
        style={{ width: 150 }}
        options={[
          { value: 'invoice', label: t.filters.byInvoice },
          { value: 'item', label: t.filters.byItem },
        ]}
      />
      <Button type="primary" icon={<FilterOutlined />} onClick={handleApplyFilters} disabled={!canView}>
        {t.filters.search}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={() => void fetchReport(pagination.current, pagination.pageSize)} disabled={!canView}>
        {t.filters.reload}
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
            {groupBy === 'item' ? (
              <Table<ItemReportRow>
                key="item"
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
            ) : (
              <Table<InvoiceReportRow>
                key="invoice"
                columns={invoiceColumns}
                dataSource={rows as InvoiceReportRow[]}
                rowKey="trans_code"
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
            )}
          </Card>
        </div>
      </Spin>
    </BasicPageLayout>
  );
}
