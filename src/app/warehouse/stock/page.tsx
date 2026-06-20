'use client';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, EditOutlined, CloseCircleOutlined, PlusOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { Modal, Table, Button, Badge, DatePicker, Select, App, Tooltip, Spin } from 'antd';
import type { Dayjs } from 'dayjs';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getStockTransactionTexts } from './i18n';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';
import {
  buildWarehouseStockPrefixList,
  canCreateWarehouseAction,
  canViewWarehouseTransactionType,
} from '@/config/transactionPermissions';

interface StockTransaction {
  uid: number;
  transaction_id: string;
  transaction_date: string;
  transaction_type: string;
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  shop_code: string;
  reference_no: string;
  status: string;
  create_date?: string;
  modify_date?: string;
}

function transactionKindLabel(
  type: string,
  t: ReturnType<typeof getStockTransactionTexts>['list']
) {
  if (type === 'ADJ') return t.kindAdjustment;
  if (type === 'ST') return t.kindStocktake;
  return t.kindGrn;
}

function StockPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getStockTransactionTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const { token } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const allowedStockPrefixes = useMemo(() => buildWarehouseStockPrefixList(can), [can]);
  const { pageSizeDefault, pageSizeOptions } = useSystemPagination();
  const [modal, contextHolder] = Modal.useModal();
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState('');
  const [tablePageSize, setTablePageSize] = useState<number>(pageSizeDefault);
  const [tableCurrent, setTableCurrent] = useState<number>(1);
  const [voidingTransCode, setVoidingTransCode] = useState<string | null>(null);
  const [prefixFilter, setPrefixFilter] = useState<string>('');
  const [pendingSoForDnCount, setPendingSoForDnCount] = useState(0);

  const fetchPendingSoForDnCount = useCallback(async () => {
    if (!token) {
      setPendingSoForDnCount(0);
      return;
    }
    try {
      const response = await fetchWithAuth(
        `/api/delivery-notes/sales-orders?countOnly=1&_=${Date.now()}`,
        token,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
      );
      const result = await response.json();
      if (response.ok && result.success) {
        setPendingSoForDnCount(Number(result.pending_count ?? 0) || 0);
      }
    } catch {
      // Non-blocking: badge is optional UI hint
    }
  }, [token]);

  const fetchTransactions = useCallback(
    async (overrides?: { prefix?: string; startDate?: string; endDate?: string }) => {
      setLoading(true);
      try {
        const prefix = overrides?.prefix !== undefined ? overrides.prefix : prefixFilter;
        const prefixParam =
          prefix != null && prefix !== '' ? prefix : allowedStockPrefixes || 'GRN';
        const startDate = overrides?.startDate ?? (dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : '');
        const endDate = overrides?.endDate ?? (dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : '');

        let url = `/api/transactions?prefix=${encodeURIComponent(prefixParam)}&page=1&pageSize=500`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        url += `&t=${Date.now()}`;

        const response = await fetchWithAuth(url, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const result = await response.json();

        if (result.success && result.data) {
          setTransactions(result.data);
          setFilteredTransactions(result.data);
        } else {
          messageApi.error(result.error || t.list.failedLoad);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
        messageApi.error(t.list.errorLoad);
      } finally {
        setLoading(false);
      }
    },
    [messageApi, t.list.failedLoad, t.list.errorLoad, prefixFilter, dateRange, token, allowedStockPrefixes]
  );

  const handleVoidGRN = useCallback(
    (record: StockTransaction) => {
      const prefix =
        record.transaction_type === 'ADJ'
          ? 'ADJ'
          : record.transaction_type === 'ST'
            ? 'ST'
            : 'GRN';
      const kind = transactionKindLabel(record.transaction_type, t.list);
      modal.confirm({
        title: t.list.voidTitle(kind),
        content: (
          <>
            <p>{t.list.voidConfirmLine(kind, record.transaction_id)}</p>
            {prefix === 'GRN' && <p>{t.list.voidGrnHint}</p>}
            {(prefix === 'ADJ' || prefix === 'ST') && <p>{t.list.voidAdjStkHint}</p>}
            <p>
              <strong>{t.list.voidCannotUndo}</strong>
            </p>
          </>
        ),
        okText: t.list.voidOk,
        okType: 'danger',
        cancelText: t.list.voidCancel,
        onOk: async () => {
          setVoidingTransCode(record.transaction_id);
          try {
            const response =
              prefix === 'ST'
                ? await fetchWithAuth('/api/transactions/delete-stocktake', token, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transCode: record.transaction_id }),
                  })
                : await fetchWithAuth('/api/transactions/update', token, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transCode: record.transaction_id,
                      headerData: { prefix, is_void: 1 },
                    }),
                  });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || t.list.voidTitle(kind));
            messageApi.success(
              prefix === 'ADJ'
                ? t.list.voidSuccessAdj
                : prefix === 'ST'
                  ? t.list.voidSuccessStk
                  : t.list.voidSuccessGrn
            );
            await fetchTransactions();
          } catch (error) {
            messageApi.error(
              error instanceof Error ? error.message : t.list.voidTitle(kind)
            );
          } finally {
            setVoidingTransCode(null);
          }
        },
      });
    },
    [modal, t.list, messageApi, fetchTransactions, token]
  );

  useEffect(() => {
    if (permissionsLoading) return;
    void fetchTransactions();
  }, [permissionsLoading, allowedStockPrefixes, fetchTransactions]);

  useEffect(() => {
    setTablePageSize(pageSizeDefault);
    setTableCurrent(1);
  }, [pageSizeDefault]);

  useEffect(() => {
    console.log('Transactions state updated:', transactions.length, 'records');
  }, [transactions]);

  const handleLocalSearch = () => {
    if (!searchText.trim()) {
      setFilteredTransactions(transactions);
      return;
    }

    const searchLower = searchText.toLowerCase();
    const filtered = transactions.filter((transaction) => {
      return (
        transaction.transaction_id?.toLowerCase().includes(searchLower) ||
        transaction.transaction_type?.toLowerCase().includes(searchLower) ||
        transaction.reference_no?.toLowerCase().includes(searchLower) ||
        transaction.status?.toLowerCase().includes(searchLower) ||
        transaction.shop_code?.toLowerCase().includes(searchLower)
      );
    });

    setFilteredTransactions(filtered);
    messageApi.success(t.list.foundMatches(filtered.length));
  };

  const displayColumns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 160,
        align: 'left' as const,
        fixed: 'left' as const,
        render: (_: unknown, record: StockTransaction) => (
          <div className="flex flex-row items-center justify-start gap-2">
            {canViewWarehouseTransactionType(can, record.transaction_type) && (
              <Tooltip title={t.list.tooltipViewDetail}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                    aria-label={t.list.tooltipViewDetail}
                    onClick={() =>
                      router.push(
                        `/warehouse/stock/detail/${encodeURIComponent(record.transaction_id || '')}`
                      )
                    }
                    style={{ verticalAlign: 'middle' }}
                  >
                    <EyeOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
            {can('edit_stocktake') &&
              record.transaction_type === 'ST' &&
              record.status !== 'Void' && (
              <Tooltip title={t.list.tooltipEditStocktake}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 text-green-600 hover:text-green-800 transition"
                    aria-label={t.list.tooltipEditStocktake}
                    onClick={() =>
                      router.push(
                        `/warehouse/stocktake?transCode=${encodeURIComponent(record.transaction_id || '')}`
                      )
                    }
                    style={{ verticalAlign: 'middle' }}
                  >
                    <EditOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
            {can('edit_adjustment') &&
              record.transaction_type === 'ADJ' &&
              record.status !== 'Void' && (
              <Tooltip title={t.list.tooltipEditAdjustment}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 text-green-600 hover:text-green-800 transition"
                    aria-label={t.list.tooltipEditAdjustment}
                    onClick={() =>
                      router.push(
                        `/warehouse/adjustment?transCode=${encodeURIComponent(record.transaction_id || '')}`
                      )
                    }
                    style={{ verticalAlign: 'middle' }}
                  >
                    <EditOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
            {((record.transaction_type === 'GRN' && can('void_grn')) ||
              (record.transaction_type === 'ADJ' && can('void_adjustment')) ||
              (record.transaction_type === 'ST' && can('void_stocktake'))) &&
              record.status !== 'Void' && (
                <Tooltip title={t.list.tooltipVoid}>
                  <span className="inline-flex">
                    <button
                      type="button"
                      className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-50 disabled:pointer-events-none"
                      aria-label={t.list.tooltipVoid}
                      onClick={() => handleVoidGRN(record)}
                      disabled={voidingTransCode === record.transaction_id}
                      style={{ verticalAlign: 'middle' }}
                    >
                      <CloseCircleOutlined />
                    </button>
                  </span>
                </Tooltip>
              )}
          </div>
        ),
      },
      {
        title: t.list.colTransactionId,
        dataIndex: 'transaction_id',
        key: 'transaction_id',
        sorter: (a: StockTransaction, b: StockTransaction) =>
          (a.transaction_id || '').localeCompare(b.transaction_id || ''),
        width: 180,
        fixed: 'left' as const,
      },
      {
        title: t.list.colType,
        dataIndex: 'transaction_type',
        key: 'transaction_type',
        sorter: (a: StockTransaction, b: StockTransaction) =>
          (a.transaction_type || '').localeCompare(b.transaction_type || ''),
        width: 100,
        render: (type: string) => (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              type === 'IN'
                ? 'bg-green-100 text-green-800'
                : type === 'OUT'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
            }`}
          >
            {type}
          </span>
        ),
      },
      {
        title: t.list.colReference,
        dataIndex: 'reference_no',
        key: 'reference_no',
        sorter: (a: StockTransaction, b: StockTransaction) =>
          (a.reference_no || '').localeCompare(b.reference_no || ''),
        width: 180,
      },
      {
        title: t.list.colStatus,
        dataIndex: 'status',
        key: 'status',
        sorter: (a: StockTransaction, b: StockTransaction) =>
          (a.status || '').localeCompare(b.status || ''),
        width: 120,
        render: (status: string) => {
          const label =
            (t.rowStatus as Record<string, string>)[status] ?? status;
          return (
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                status === 'Active'
                  ? 'bg-green-100 text-green-800'
                  : status === 'Completed'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
              }`}
            >
              {label}
            </span>
          );
        },
      },
      {
        title: t.list.colCreated,
        dataIndex: 'create_date',
        key: 'create_date',
        sorter: (a: StockTransaction, b: StockTransaction) =>
          new Date(a.create_date || '').getTime() - new Date(b.create_date || '').getTime(),
        width: 180,
        render: (date: string) => (date ? new Date(date).toLocaleString() : t.list.na),
      },
    ],
    [t, router, voidingTransCode, handleVoidGRN, can]
  );

  const [showFilters, setShowFilters] = useState(false);
  const [pageMessage, setPageMessage] = useState<{
    type: 'success' | 'error' | null;
    text: string | null;
  }>({ type: null, text: null });

  useEffect(() => {
    void fetchPendingSoForDnCount();
  }, [fetchPendingSoForDnCount]);

  useEffect(() => {
    const onFocus = () => void fetchPendingSoForDnCount();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchPendingSoForDnCount]);

  const handleRefresh = () => {
    void fetchTransactions();
    void fetchPendingSoForDnCount();
  };

  const StockButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {canCreateWarehouseAction(can, 'grn') && (
        <Button icon={<PlusOutlined />} type="primary" onClick={() => router.push('/warehouse/stock/grn')}>
          {t.list.btnGrn}
        </Button>
      )}
      {canCreateWarehouseAction(can, 'delivery_note') && (
        <Tooltip
          title={
            pendingSoForDnCount > 0 ? t.list.dnBadgeTooltip(pendingSoForDnCount) : undefined
          }
        >
          <Badge count={pendingSoForDnCount} size="small" overflowCount={99} offset={[-4, 4]}>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={() => router.push('/warehouse/delivery-note')}
            >
              {t.list.btnDeliveryNote}
            </Button>
          </Badge>
        </Tooltip>
      )}
      {canCreateWarehouseAction(can, 'adjustment') && (
        <Button icon={<PlusOutlined />} type="primary" onClick={() => router.push('/warehouse/adjustment')}>
          {t.list.btnAdjustment}
        </Button>
      )}
      {canCreateWarehouseAction(can, 'stocktake') && (
        <Button icon={<PlusOutlined />} type="primary" onClick={() => router.push('/warehouse/stocktake')}>
          {t.list.btnStocktake}
        </Button>
      )}
      <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
        {t.list.btnRefresh}
      </Button>
      <Button icon={<FilterOutlined />} onClick={() => setShowFilters(!showFilters)}>
        {showFilters ? t.list.btnHideFilters : t.list.btnShowFilters}
      </Button>
    </div>
  );

  return (
    <>
      {contextHolder}
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.list.breadcrumbHome, href: '/' },
              { label: t.list.breadcrumbWarehouse, href: '/warehouse' },
              { label: t.list.breadcrumbStock, current: true },
            ]}
          />
        }
        buttonBar={StockButtonBar}
        title={t.list.title}
        description={t.list.description}
      >
        {pageMessage.type && pageMessage.text && (
          <div className="px-8 py-4">
            <div
              className={`p-4 rounded-md border ${
                pageMessage.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="font-medium">
                    {pageMessage.type === 'success'
                      ? t.list.pageSuccessPrefix
                      : t.list.pageErrorPrefix}
                  </span>
                  <span className="ml-2">{pageMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPageMessage({ type: null, text: null })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        <Spin spinning={loading}>
        <div className="px-8 py-6 bg-white">
          {showFilters && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-900">{t.list.filterOptionsTitle}</h4>
                {searchText && (
                  <span className="text-sm text-blue-600">
                    {t.list.showingOf(filteredTransactions.length, transactions.length)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <input
                  type="text"
                  placeholder={t.list.searchPlaceholder}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLocalSearch()}
                  className="px-3 py-2 border border-gray-300 rounded-md min-w-[280px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Button type="primary" onClick={handleLocalSearch}>
                  {t.list.search}
                </Button>
                <Button
                  onClick={() => {
                    setDateRange([null, null]);
                    setSearchText('');
                    setPrefixFilter('');
                    void fetchTransactions({
                      prefix: allowedStockPrefixes || 'GRN',
                      startDate: undefined,
                      endDate: undefined,
                    });
                    messageApi.success(t.list.filtersCleared);
                  }}
                >
                  {t.list.clear}
                </Button>
              </div>
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <label className="font-bold text-gray-700 min-w-32">{t.list.labelTransactionType}</label>
                  <Select
                    placeholder={t.list.placeholderAllTypes}
                    allowClear
                    value={prefixFilter}
                    onChange={(v) => {
                      const next = v ?? '';
                      setPrefixFilter(next);
                      const prefix = next !== '' ? next : allowedStockPrefixes || 'GRN';
                      const start = dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : undefined;
                      const end = dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : undefined;
                      void fetchTransactions({ prefix, startDate: start, endDate: end });
                    }}
                    style={{ minWidth: 180 }}
                    options={[
                      { value: '', label: t.list.typeAll },
                      ...(can('view_grn') ? [{ value: 'GRN', label: t.list.typeGrn }] : []),
                      ...(can('view_delivery_note')
                        ? [{ value: 'DN', label: t.list.typeDn }]
                        : []),
                      ...(can('view_stocktake') ? [{ value: 'ST', label: t.list.typeSt }] : []),
                      ...(can('view_adjustment')
                        ? [{ value: 'ADJ', label: t.list.typeAdj }]
                        : []),
                    ]}
                  />
                </div>
                <div className="flex gap-4 items-center">
                  <label className="font-bold text-gray-700 min-w-32">{t.list.labelDateRange}</label>
                  <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => {
                      const next = (dates ?? [null, null]) as [Dayjs | null, Dayjs | null];
                      setDateRange(next);
                      const prefix =
                        prefixFilter !== '' ? prefixFilter : allowedStockPrefixes || 'GRN';
                      const start = next[0] ? next[0].format('YYYY-MM-DD') : undefined;
                      const end = next[1] ? next[1].format('YYYY-MM-DD') : undefined;
                      void fetchTransactions({ prefix, startDate: start, endDate: end });
                    }}
                    format="YYYY-MM-DD"
                    placeholder={[t.list.placeholderStartDate, t.list.placeholderEndDate]}
                  />
                </div>
              </div>
            </div>
          )}

          {!loading && filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>{t.list.noData}</p>
              {searchText && <p>{t.list.tryAdjusting}</p>}
              {transactions.length > 0 && searchText && (
                <p className="mt-2">
                  <Button
                    type="link"
                    onClick={() => {
                      setSearchText('');
                      setFilteredTransactions(transactions);
                    }}
                  >
                    {t.list.clearSearchShowAll(transactions.length)}
                  </Button>
                </p>
              )}
            </div>
          ) : (
            <Table
              columns={displayColumns}
              dataSource={filteredTransactions}
              rowKey="uid"
              loading={false}
              pagination={{
                total: filteredTransactions.length,
                current: tableCurrent,
                pageSize: tablePageSize,
                showSizeChanger: true,
                pageSizeOptions,
                showQuickJumper: true,
                showTotal: (total, range) => t.list.paginationTotal(range[0], range[1], total),
                onChange: (page) => setTableCurrent(page),
                onShowSizeChange: (_, size) => {
                  setTablePageSize(size);
                  setTableCurrent(1);
                },
              }}
              scroll={{ x: 'max-content' }}
              size="middle"
            />
          )}
        </div>
        </Spin>
      </BasicPageLayout>
    </>
  );
}

export default function StockPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} buttonBar={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <StockPageContent />
    </Suspense>
  );
}
