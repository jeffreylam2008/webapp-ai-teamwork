'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getWarehouseReportTexts } from './i18n';
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
import {
  isWarehouseReportPrintPopupBlocked,
  openWarehouseReportPrintWindow,
} from '@/lib/openWarehouseReportPrintWindow';
import { buildWarehouseStockPrefixList } from '@/config/transactionPermissions';
import {
  isMovementGroup,
  WAREHOUSE_MOVEMENT_LABELS,
  type WarehouseReportGroupBy,
} from './groupBy';

type GroupBy = WarehouseReportGroupBy;

type WarehouseReportSummary = {
  document_count: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type DocumentLineDetail = {
  uid?: number;
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  qty: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type DocumentReportRow = {
  trans_code: string;
  transaction_date: string;
  prefix?: string;
  refer_code?: string;
  supplier_code?: string;
  supplier_name?: string;
  customer_code?: string;
  customer_name?: string;
  shop_code?: string;
  shop_name?: string;
  line_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
  details?: DocumentLineDetail[];
};

type MovementReportRow = {
  prefix: string;
  document_count: number;
  line_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
  documents?: DocumentReportRow[];
};

type ProductReportRow = {
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  document_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type ShopOption = { shop_code: string; name: string };

function formatQty(value: number): string {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function WarehouseReportPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getWarehouseReportTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const { token, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();

  const canView = can('view_warehouse_report');
  const allowedPrefixes = useMemo(() => buildWarehouseStockPrefixList(can), [can]);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<WarehouseReportSummary | null>(null);
  const [rows, setRows] = useState<(DocumentReportRow | MovementReportRow | ProductReportRow)[]>(
    []
  );
  const [groupBy, setGroupBy] = useState<GroupBy>('document');
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopCode, setShopCode] = useState<string>('');
  const [prefix, setPrefix] = useState<string>('');
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

  const movementLabel = useCallback(
    (code: string) => {
      const key = String(code || '').trim().toUpperCase();
      const entry = WAREHOUSE_MOVEMENT_LABELS[key];
      if (!entry) return key || '-';
      return lang === 'zh-Hant' ? entry.zh : entry.en;
    },
    [lang]
  );

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
        const res = await fetchWithAuth(
          '/api/shops?limit=500&sortColumn=name&sortDirection=asc',
          token
        );
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
        let url = `/api/reports/warehouse?group_by=${effectiveGroupBy}&page=${page}&pageSize=${pageSize}`;
        if (dateRange[0] && dateRange[1]) {
          url += `&start_date=${dateRange[0].format('YYYY-MM-DD')}`;
          url += `&end_date=${dateRange[1].format('YYYY-MM-DD')}`;
        }
        if (shopCode) {
          url += `&shop_code=${encodeURIComponent(shopCode)}`;
        }
        if (prefix) {
          url += `&prefix=${encodeURIComponent(prefix)}`;
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
    [token, canView, groupBy, dateRange, shopCode, prefix, pagination.pageSize, messageApi, t]
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
    const prefixLabel = prefix ? movementLabel(prefix) : t.filters.allMovements;
    const popup = openWarehouseReportPrintWindow({
      startDate: dateRange[0]?.format('YYYY-MM-DD'),
      endDate: dateRange[1]?.format('YYYY-MM-DD'),
      shopCode,
      shopLabel,
      prefix,
      prefixLabel,
      groupBy,
      lang,
    });
    if (isWarehouseReportPrintPopupBlocked(popup)) {
      messageApi.warning(t.prompts.popupBlocked);
    }
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    const page = newPagination.current || 1;
    const pageSize = newPagination.pageSize || pagination.pageSize;
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    void fetchReport(page, pageSize);
  };

  const handlePageChange = (page: number, pageSize: number) => {
    setPagination((prev) => ({ ...prev, current: page, pageSize }));
    void fetchReport(page, pageSize);
  };

  const partyLabel = (row: DocumentReportRow): string => {
    if (row.supplier_code || row.supplier_name) {
      return row.supplier_name
        ? `${row.supplier_code || ''} - ${row.supplier_name}`
        : row.supplier_code || '-';
    }
    if (row.customer_code || row.customer_name) {
      return row.customer_name
        ? `${row.customer_code || ''} - ${row.customer_name}`
        : row.customer_code || '-';
    }
    return '-';
  };

  const shopLabel = (row: { shop_code?: string; shop_name?: string }) => {
    const code = String(row.shop_code || '').trim();
    const name = String(row.shop_name || '').trim();
    if (code && name) return `${code} - ${name}`;
    return code || name || '-';
  };

  const lineColumns = useMemo(
    () => [
      { title: t.table.itemCode, dataIndex: 'item_code', key: 'item_code', width: 120 },
      {
        title: t.table.description,
        key: 'description',
        width: 220,
        render: (_: unknown, record: DocumentLineDetail) =>
          record.eng_name || record.chi_name || '-',
      },
      { title: t.table.unit, dataIndex: 'unit', key: 'unit', width: 70 },
      {
        title: t.table.qty,
        dataIndex: 'qty',
        key: 'qty',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.qtyIn,
        dataIndex: 'qty_in',
        key: 'qty_in',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.qtyOut,
        dataIndex: 'qty_out',
        key: 'qty_out',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.netQty,
        dataIndex: 'net_qty',
        key: 'net_qty',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
    ],
    [t]
  );

  const productColumns = useMemo(
    () => [
      { title: t.table.itemCode, dataIndex: 'item_code', key: 'item_code', width: 120 },
      {
        title: t.table.description,
        key: 'description',
        width: 220,
        render: (_: unknown, record: ProductReportRow) =>
          record.eng_name || record.chi_name || '-',
      },
      { title: t.table.unit, dataIndex: 'unit', key: 'unit', width: 80 },
      {
        title: t.table.documents,
        dataIndex: 'document_count',
        key: 'document_count',
        width: 100,
        align: 'right' as const,
      },
      {
        title: t.table.qtyIn,
        dataIndex: 'qty_in',
        key: 'qty_in',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.qtyOut,
        dataIndex: 'qty_out',
        key: 'qty_out',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.netQty,
        dataIndex: 'net_qty',
        key: 'net_qty',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
    ],
    [t]
  );

  const documentSummaryColumns = useMemo(
    () => [
      { title: t.table.document, dataIndex: 'trans_code', key: 'trans_code', width: 140 },
      {
        title: t.table.date,
        dataIndex: 'transaction_date',
        key: 'transaction_date',
        width: 160,
        render: (value: string) => formatDisplayDateTime(value),
      },
      {
        title: t.table.movementType,
        dataIndex: 'prefix',
        key: 'prefix',
        width: 160,
        render: (value: string) => movementLabel(value),
      },
      {
        title: t.table.party,
        key: 'party',
        width: 200,
        render: (_: unknown, record: DocumentReportRow) => partyLabel(record),
      },
      {
        title: t.table.shop,
        key: 'shop',
        width: 160,
        render: (_: unknown, record: DocumentReportRow) => shopLabel(record),
      },
      {
        title: t.table.lines,
        dataIndex: 'line_count',
        key: 'line_count',
        width: 80,
        align: 'right' as const,
      },
      {
        title: t.table.qtyIn,
        dataIndex: 'qty_in',
        key: 'qty_in',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.qtyOut,
        dataIndex: 'qty_out',
        key: 'qty_out',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.netQty,
        dataIndex: 'net_qty',
        key: 'net_qty',
        width: 90,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
    ],
    [t, movementLabel]
  );

  const movementSummaryColumns = useMemo(
    () => [
      {
        title: t.table.movementType,
        dataIndex: 'prefix',
        key: 'prefix',
        width: 220,
        render: (value: string) => movementLabel(value),
      },
      {
        title: t.summary.documentCount,
        dataIndex: 'document_count',
        key: 'document_count',
        width: 110,
        align: 'right' as const,
      },
      {
        title: t.table.lines,
        dataIndex: 'line_count',
        key: 'line_count',
        width: 90,
        align: 'right' as const,
      },
      {
        title: t.table.qtyIn,
        dataIndex: 'qty_in',
        key: 'qty_in',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.qtyOut,
        dataIndex: 'qty_out',
        key: 'qty_out',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
      {
        title: t.table.netQty,
        dataIndex: 'net_qty',
        key: 'net_qty',
        width: 100,
        align: 'right' as const,
        render: (value: number) => formatQty(value),
      },
    ],
    [t, movementLabel]
  );

  const buildDocumentCollapseItems = useCallback(
    (documents: DocumentReportRow[], keyPrefix = '') =>
      documents.map((doc) => {
        const details = Array.isArray(doc.details) ? doc.details : [];
        return {
          key: `${keyPrefix}${doc.trans_code}`,
          label: (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pr-2 text-sm">
              <span className="font-semibold text-gray-900">{doc.trans_code}</span>
              <span className="text-gray-500">{formatDisplayDateTime(doc.transaction_date)}</span>
              <span className="text-gray-700">{movementLabel(doc.prefix || '')}</span>
              {!keyPrefix && <span className="text-gray-700">{partyLabel(doc)}</span>}
              <span className="text-gray-500">{shopLabel(doc)}</span>
              <span className="text-gray-500">
                {t.table.lines}: {doc.line_count ?? details.length}
              </span>
              <span>
                {t.table.qtyIn}: <strong>{formatQty(doc.qty_in)}</strong>
              </span>
              <span>
                {t.table.qtyOut}: <strong>{formatQty(doc.qty_out)}</strong>
              </span>
              <span>
                {t.table.netQty}: <strong>{formatQty(doc.net_qty)}</strong>
              </span>
            </div>
          ),
          children: (
            <Table<DocumentLineDetail>
              size="small"
              columns={lineColumns}
              dataSource={details}
              rowKey={(r) => String(r.uid ?? `${r.item_code}-${r.qty}`)}
              pagination={false}
              scroll={{ x: 800 }}
              locale={{ emptyText: t.table.noLineItems }}
            />
          ),
        };
      }),
    [lineColumns, movementLabel, t]
  );

  const documentRows = rows as DocumentReportRow[];
  const movementRows = rows as MovementReportRow[];

  const documentCollapseItems = useMemo(
    () => buildDocumentCollapseItems(documentRows),
    [buildDocumentCollapseItems, documentRows]
  );

  const movementCollapseItems = useMemo(
    () =>
      movementRows.map((movement) => {
        const documents = Array.isArray(movement.documents) ? movement.documents : [];
        return {
          key: movement.prefix,
          label: (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pr-2 text-sm">
              <span className="font-semibold text-gray-900">{movementLabel(movement.prefix)}</span>
              <span className="text-gray-500">
                {t.summary.documentCount}: {movement.document_count ?? documents.length}
              </span>
              <span className="text-gray-500">
                {t.table.lines}: {movement.line_count ?? 0}
              </span>
              <span>
                {t.table.qtyIn}: <strong>{formatQty(movement.qty_in)}</strong>
              </span>
              <span>
                {t.table.qtyOut}: <strong>{formatQty(movement.qty_out)}</strong>
              </span>
              <span>
                {t.table.netQty}: <strong>{formatQty(movement.net_qty)}</strong>
              </span>
            </div>
          ),
          children:
            documents.length === 0 ? (
              <div className="py-4 text-center text-gray-500">{t.table.noDocuments}</div>
            ) : (
              <Collapse
                size="small"
                items={buildDocumentCollapseItems(documents, `${movement.prefix}::`)}
              />
            ),
        };
      }),
    [movementRows, buildDocumentCollapseItems, movementLabel, t]
  );

  const prefixOptions = useMemo(() => {
    const list = allowedPrefixes
      ? allowedPrefixes.split(',').map((p) => p.trim()).filter(Boolean)
      : [];
    return list.map((code) => ({ value: code, label: movementLabel(code) }));
  }, [allowedPrefixes, movementLabel]);

  const buttonBar = (
    <div className="page-toolbar px-3 sm:px-8 py-3 bg-white border-b border-gray-200 mb-4">
      <DatePicker.RangePicker
        value={dateRange}
        onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
        allowClear={false}
        className="w-full sm:w-auto"
      />
      <Select
        value={shopCode || undefined}
        onChange={(value) => setShopCode(value || '')}
        placeholder={t.filters.allShops}
        allowClear
        className="w-full sm:min-w-[180px] sm:w-[180px]"
        options={shops.map((s) => ({
          value: s.shop_code,
          label: `${s.shop_code} - ${s.name}`,
        }))}
      />
      <Select
        value={prefix || undefined}
        onChange={(value) => setPrefix(value || '')}
        placeholder={t.filters.allMovements}
        allowClear
        className="w-full sm:min-w-[180px] sm:w-[200px]"
        options={prefixOptions}
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
        className="w-full sm:min-w-[200px] sm:w-[240px]"
        options={[
          { value: 'document', label: t.filters.byDocument },
          { value: 'document_detail', label: t.filters.byDocumentDetail },
          { value: 'movement', label: t.filters.byMovement },
          { value: 'movement_detail', label: t.filters.byMovementDetail },
          { value: 'product', label: t.filters.byProduct },
        ]}
      />
      <Button type="primary" icon={<FilterOutlined />} onClick={handleApplyFilters} disabled={!canView}>
        {t.filters.search}
      </Button>
      <Button
        icon={<ReloadOutlined />}
        onClick={() => void fetchReport(pagination.current, pagination.pageSize)}
        disabled={!canView}
      >
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
              { label: t.breadcrumb.reports, href: '/reports/warehouse' },
              { label: t.breadcrumb.warehouse, current: true },
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
            { label: t.breadcrumb.reports, href: '/reports/warehouse' },
            { label: t.breadcrumb.warehouse, current: true },
          ]}
        />
      }
      buttonBar={buttonBar}
      title={t.page.title}
      description={t.page.description}
    >
      <Spin spinning={loading}>
        <div className="px-3 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title={t.summary.documentCount} value={summary?.document_count ?? 0} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.qtyIn}
                  value={summary?.qty_in ?? 0}
                  formatter={(value) => formatQty(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.qtyOut}
                  value={summary?.qty_out ?? 0}
                  formatter={(value) => formatQty(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={t.summary.netQty}
                  value={summary?.net_qty ?? 0}
                  formatter={(value) => formatQty(Number(value))}
                  valueStyle={{
                    color: (summary?.net_qty ?? 0) >= 0 ? '#3f8600' : '#cf1322',
                  }}
                />
              </Card>
            </Col>
          </Row>

          <Card size="small" className="table-scroll-host">
            {groupBy === 'product' ? (
              <Table<ProductReportRow>
                key="product"
                columns={productColumns}
                dataSource={rows as ProductReportRow[]}
                rowKey="item_code"
                locale={{ emptyText: t.table.noProducts }}
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
            ) : groupBy === 'document' ? (
              <Table<DocumentReportRow>
                key="document"
                columns={documentSummaryColumns}
                dataSource={rows as DocumentReportRow[]}
                rowKey="trans_code"
                locale={{ emptyText: t.table.noDocuments }}
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
            ) : groupBy === 'movement' ? (
              <Table<MovementReportRow>
                key="movement"
                columns={movementSummaryColumns}
                dataSource={rows as MovementReportRow[]}
                rowKey="prefix"
                locale={{ emptyText: t.table.noMovements }}
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions,
                  showTotal: (total, range) => t.paginationTotal(range[0], range[1], total),
                }}
                onChange={handleTableChange}
                scroll={{ x: 800 }}
              />
            ) : (
              <div className="space-y-4">
                {(isMovementGroup(groupBy) ? movementCollapseItems : documentCollapseItems)
                  .length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    {isMovementGroup(groupBy) ? t.table.noMovements : t.table.noDocuments}
                  </div>
                ) : (
                  <Collapse
                    accordion={false}
                    activeKey={activeCollapseKeys}
                    onChange={(keys) =>
                      setActiveCollapseKeys(
                        Array.isArray(keys) ? keys.map(String) : [String(keys)]
                      )
                    }
                    items={
                      isMovementGroup(groupBy) ? movementCollapseItems : documentCollapseItems
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
                    onChange={handlePageChange}
                    onShowSizeChange={handlePageChange}
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
