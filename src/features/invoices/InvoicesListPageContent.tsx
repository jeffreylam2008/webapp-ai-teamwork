'use client';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getInvoiceTexts } from '@/app/sales/invoices/i18n';
import {
  PlusOutlined,
  ReloadOutlined,
  FilterOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { App, Modal, Table, Button, DatePicker, Space, Tooltip, Spin } from 'antd';
import { Dayjs } from 'dayjs';
import {
  getInvoiceModuleConfig,
  INVOICE_DRAFT_TRANS_CODE,
  invoiceDetailPath,
  invoiceDraftCreatePath,
  type InvoiceModuleMode,
} from '@/features/invoices/invoiceModule';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';

interface InvoiceTransaction {
  uid: number;
  transaction_id: string;
  transaction_date: string;
  transaction_type: string;
  customer_code: string;
  customer_name?: string;
  total_amount: number;
  reference_no: string;
  status: string;
  create_date?: string;
  modify_date?: string;
  employee_code?: string;
  shop_code?: string;
  shop_name?: string;
  remark?: string;
  quotation_code?: string;
  payment_method?: string;
  customer_phone?: string;
  is_void?: number;
  is_settle?: number;
  invoice_subtype?: string;
  billing_period_from?: string;
  billing_period_to?: string;
}

export default function InvoicesListPageContent({ mode }: { mode: InvoiceModuleMode }) {
  const config = getInvoiceModuleConfig(mode);
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getInvoiceTexts(lang), [lang]);
  const { message: messageApi, modal } = App.useApp();
  const { token, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();
  const [transactions, setTransactions] = useState<InvoiceTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState('');
  
  // Pagination state
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  
  // Browser session for invoice number generator (used on create page save)
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  // Refs for mount + filter change tracking
  const hasInitialFetch = useRef(false);
  const isMounted = useRef(false);
  const prevDateRange = useRef<[Dayjs | null, Dayjs | null]>([null, null]);
  const prevSearchText = useRef<string>('');

  // Fetch invoice transactions from t_transaction_h table
  const fetchTransactions = useCallback(async (page: number = 1, pageSize: number = 20) => {
    setLoading(true);
    try {
      // Build URL with filters - focus on INV prefix for invoices
      let url = `/api/transactions?prefix=INV&invoice_subtype=${encodeURIComponent(config.invoiceSubtype)}&page=${page}&pageSize=${pageSize}`;
      
      // Add date range if set
      if (dateRange[0] && dateRange[1]) {
        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      
      // Add search term if provided
      if (searchText && searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }
      
      url += `&t=${Date.now()}`;

      const response = await fetchWithAuth(url, token, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        setTransactions(result.data);

        if (result.pagination) {
          setPagination(result.pagination);
        }
      } else {
        messageApi.error(
          (typeof result.error === 'string' && result.error) || t.prompts.failedLoadList
        );
      }
    } catch (error) {
      messageApi.error(t.prompts.errorLoadList);
    } finally {
      setLoading(false);
    }
  }, [dateRange, searchText, config.invoiceSubtype, messageApi, t, token]);

  useEffect(() => {
    setPagination(prev => {
      const nextPageSize = Math.min(Math.max(1, pageSizeDefault), pageSizeMax);
      if (prev.pageSize === nextPageSize) return prev;
      if (prev.pageSize !== 20 && prev.pageSize !== 100) return prev;
      return { ...prev, pageSize: nextPageSize, current: 1 };
    });
  }, [pageSizeDefault, pageSizeMax]);

  // Load transactions after auth is ready (only once)
  useEffect(() => {
    if (authLoading) return;
    if (!hasInitialFetch.current && !isMounted.current) {
      isMounted.current = true;
      hasInitialFetch.current = true;
      fetchTransactions(1, pagination.pageSize);
    }
  }, [authLoading, fetchTransactions, pagination.pageSize]);

  // Refetch when filters change (but skip initial mount)
  useEffect(() => {
    // Skip if component hasn't mounted yet or initial fetch hasn't completed
    if (!isMounted.current || !hasInitialFetch.current) {
      return;
    }
    
    // Check if filters actually changed from previous values
    const dateRangeChanged = 
      prevDateRange.current[0]?.format('YYYY-MM-DD') !== dateRange[0]?.format('YYYY-MM-DD') ||
      prevDateRange.current[1]?.format('YYYY-MM-DD') !== dateRange[1]?.format('YYYY-MM-DD');
    const searchTextChanged = prevSearchText.current !== searchText;

    if (!dateRangeChanged && !searchTextChanged) {
      return;
    }

    prevDateRange.current = dateRange;
    prevSearchText.current = searchText;
    
    // Reset to first page when filters change
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, searchText]);

  // Debug: log transactions state changes
  useEffect(() => {
    console.log('Transactions state updated:', transactions.length, 'records');
  }, [transactions]);

  // Server-side search function
  const handleSearch = () => {
    // Reset to first page when searching
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
  };

  const handleCreateInvoice = () => {
    router.push(invoiceDraftCreatePath(config));
  };

  const handleCloneInvoice = useCallback(
    async (invoiceId: string) => {
      if (!invoiceId) {
        messageApi.error(t.prompts.errorClone);
        return;
      }
      setCloningId(invoiceId);
      messageApi.loading({ content: t.prompts.cloneStarted, key: 'cloneInvoice', duration: 0 });
      try {
        const sourceRes = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(invoiceId)}`, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const sourceJson = (await sourceRes.json()) as {
          success: boolean;
          header?: Record<string, unknown>;
          details?: Array<{
            item_code?: string;
            eng_name?: string;
            chi_name?: string;
            qty?: number;
            unit?: string;
            price?: number;
            discount?: number;
          }>;
          paymentTotals?: Array<{ pm_code?: string; payment_amount?: number }>;
          error?: string;
        };
        if (!sourceJson.success) {
          throw new Error(sourceJson.error || t.prompts.failedClone);
        }
        const sourceHeader = sourceJson.header || {};
        if (String(sourceHeader.prefix || '').trim().toUpperCase() !== 'INV') {
          throw new Error(t.prompts.failedClone);
        }
        const sourceDetails = Array.isArray(sourceJson.details) ? sourceJson.details : [];
        const sourcePaymentTotals = Array.isArray(sourceJson.paymentTotals) ? sourceJson.paymentTotals : [];
        const pm_code = sourcePaymentTotals?.[0]?.pm_code;

        const clonePayload = {
          sourceTransCode: invoiceId,
          header: {
            cust_code: sourceHeader.cust_code ?? undefined,
            shop_code: sourceHeader.shop_code ?? undefined,
            refer_code: sourceHeader.refer_code ?? undefined,
            quotation_code: sourceHeader.quotation_code ?? undefined,
            remark: sourceHeader.remark ?? undefined,
            pm_code: pm_code ?? undefined,
            invoice_subtype: config.invoiceSubtype,
            billing_period_from: sourceHeader.billing_period_from ?? undefined,
            billing_period_to: sourceHeader.billing_period_to ?? undefined,
            customer_name: sourceHeader.customer_name ?? undefined,
          },
          details: sourceDetails.map((d) => ({
            item_code: d.item_code ?? '',
            eng_name: d.eng_name ?? '',
            chi_name: d.chi_name ?? '',
            qty: Number(d.qty || 0),
            unit: d.unit ?? '',
            price: Number(d.price || 0),
            discount: Number(d.discount || 0),
          })),
        };
        sessionStorage.setItem(
          `${config.cloneKeyPrefix}${INVOICE_DRAFT_TRANS_CODE}`,
          JSON.stringify(clonePayload)
        );

        messageApi.destroy('cloneInvoice');
        router.push(invoiceDraftCreatePath(config));
      } catch (err) {
        console.error('Error cloning invoice:', err);
        messageApi.destroy('cloneInvoice');
        messageApi.error(err instanceof Error ? err.message : t.prompts.errorClone);
      } finally {
        setCloningId(null);
      }
    },
    [config, messageApi, router, t, token]
  );

  const handleVoidInvoice = useCallback(
    (record: InvoiceTransaction) => {
      const transCode = (record.transaction_id || '').trim();
      if (!transCode || record.transaction_type !== 'INV' || record.status === 'Void' || record.status === 'Settled') return;
      modal.confirm({
        title: t.prompts.voidTitle,
        content: t.prompts.voidContent,
        okText: t.prompts.voidOk,
        okButtonProps: { danger: true },
        cancelText: t.prompts.voidCancel,
        onOk: async () => {
          setVoidingId(record.uid);
          try {
            const res = await fetchWithAuth('/api/transactions/void-invoice', token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transCode }),
            });
            const result = (await res.json()) as { success?: boolean; error?: string; message?: string };
            if (result.success) {
              messageApi.success(result.message || t.prompts.invoiceVoided);
              await fetchTransactions(pagination.current, pagination.pageSize);
            } else {
              messageApi.error(result.error || t.prompts.voidFailed);
            }
          } catch {
            messageApi.error(t.prompts.voidFailed);
          } finally {
            setVoidingId(null);
          }
        },
      });
    },
    [modal, messageApi, t, fetchTransactions, pagination.current, pagination.pageSize, token]
  );

  const displayColumns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 150,
        align: 'left' as const,
        fixed: 'left' as const,
        render: (_: unknown, record: InvoiceTransaction) => {
          const id = (record.transaction_id || '').trim();
          const canClone = record.transaction_type === 'INV' && can('create_invoice');
          const canVoid =
            record.transaction_type === 'INV' &&
            record.status !== 'Void' &&
            record.status !== 'Settled' &&
            can('void_invoice');
          return (
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltip title={t.actions.viewInvoice}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                  aria-label={t.actions.viewInvoice}
                  onClick={() => {
                    if (!id) {
                      messageApi.error(t.prompts.errorLoadList);
                      return;
                    }
                    router.push(invoiceDetailPath(config, id));
                  }}
                  style={{ verticalAlign: 'middle' }}
                >
                  <EyeOutlined />
                </button>
              </span>
            </Tooltip>
            {canClone && (
              <Tooltip title={t.actions.cloneInvoice}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.cloneInvoice}
                    onClick={() => void handleCloneInvoice(id)}
                    disabled={cloningId === id || voidingId === record.uid}
                    style={{ verticalAlign: 'middle' }}
                  >
                    {cloningId === id ? (
                      <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CopyOutlined />
                    )}
                  </button>
                </span>
              </Tooltip>
            )}
            {canVoid && (
              <Tooltip title={t.actions.voidInvoice}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-50"
                    aria-label={t.actions.voidInvoice}
                    onClick={() => handleVoidInvoice(record)}
                    disabled={voidingId === record.uid || cloningId === id}
                    style={{ verticalAlign: 'middle' }}
                  >
                    {voidingId === record.uid ? (
                      <span className="inline-block w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CloseCircleOutlined />
                    )}
                  </button>
                </span>
              </Tooltip>
            )}
          </div>
          );
        },
      },
      {
        title: t.columns.invoiceId,
        dataIndex: 'transaction_id',
        key: 'transaction_id',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) =>
          (a.transaction_id || '').localeCompare(b.transaction_id || ''),
        width: 160,
        fixed: 'left' as const,
        ellipsis: true,
      },
      {
        title: t.columns.type,
        dataIndex: 'transaction_type',
        key: 'transaction_type',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) =>
          (a.transaction_type || '').localeCompare(b.transaction_type || ''),
        width: config.isMonthly ? 120 : 80,
        render: (type: string) => (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              type === 'INV' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {type}
          </span>
        ),
      },
      ...(config.isMonthly
        ? [
            {
              title: t.columns.billingPeriod,
              key: 'billing_period',
              width: 180,
              render: (_: unknown, record: InvoiceTransaction) => {
                const from = record.billing_period_from
                  ? formatDisplayDateTime(record.billing_period_from, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB').slice(0, 10)
                  : '';
                const to = record.billing_period_to
                  ? formatDisplayDateTime(record.billing_period_to, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB').slice(0, 10)
                  : '';
                if (!from && !to) return '-';
                return `${from || '?'} – ${to || '?'}`;
              },
            },
          ]
        : []),
      {
        title: t.columns.customer,
        dataIndex: 'customer_code',
        key: 'customer_code',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) =>
          (a.customer_code || '').localeCompare(b.customer_code || ''),
        width: 280,
        ellipsis: true,
        render: (code: string, record: InvoiceTransaction) => (
          <div>
            <div>
              <strong>{code}</strong>
            </div>
            {record.customer_name && <div className="text-sm text-gray-600 truncate">{record.customer_name}</div>}
            {record.customer_phone && <div className="text-xs text-gray-500">📞 {record.customer_phone}</div>}
          </div>
        ),
      },
      {
        title: t.columns.totalAmount,
        dataIndex: 'total_amount',
        key: 'total_amount',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) => (a.total_amount || 0) - (b.total_amount || 0),
        width: 120,
        align: 'right' as const,
        render: (amount: number) => {
          const numAmount = typeof amount === 'number' ? amount : parseFloat(amount as string) || 0;
          return formatCurrency(numAmount);
        },
      },
      {
        title: t.columns.shop,
        dataIndex: 'shop_code',
        key: 'shop_code',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) => (a.shop_code || '').localeCompare(b.shop_code || ''),
        width: 200,
        ellipsis: true,
        render: (code: string, record: InvoiceTransaction) => (
          <div>
            <div>
              <strong>{code}</strong>
            </div>
            {record.shop_name && <div className="text-sm text-gray-600 truncate">{record.shop_name}</div>}
          </div>
        ),
      },
      {
        title: t.columns.paymentMethod,
        dataIndex: 'payment_method',
        key: 'payment_method',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) =>
          (a.payment_method || '').localeCompare(b.payment_method || ''),
        width: 160,
        ellipsis: true,
      },
      {
        title: t.columns.reference,
        dataIndex: 'reference_no',
        key: 'reference_no',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) => (a.reference_no || '').localeCompare(b.reference_no || ''),
        width: 160,
        ellipsis: true,
      },
      {
        title: t.columns.status,
        dataIndex: 'status',
        key: 'status',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) => (a.status || '').localeCompare(b.status || ''),
        width: 100,
        render: (status: string) => {
          const label = (t.rowStatus as Record<string, string>)[status] ?? status;
          return (
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                status === 'Active'
                  ? 'bg-green-100 text-green-800'
                  : status === 'Settled'
                    ? 'bg-blue-100 text-blue-800'
                    : status === 'Void'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
              }`}
            >
              {label}
            </span>
          );
        },
      },
      {
        title: t.columns.created,
        dataIndex: 'create_date',
        key: 'create_date',
        sorter: (a: InvoiceTransaction, b: InvoiceTransaction) =>
          new Date(a.create_date || '').getTime() - new Date(b.create_date || '').getTime(),
        width: 180,
        render: (date: string) =>
          date ? formatDisplayDateTime(date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB') : t.detailLabels.na,
      },
    ],
    [t, lang, router, messageApi, can, voidingId, cloningId, handleVoidInvoice, handleCloneInvoice, config]
  );

  // State management
  const [showFilters, setShowFilters] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });

  const handleRefresh = () => {
    fetchTransactions();
  };

  // Invoices Button Bar Component
  const InvoicesButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {can('create_invoice') && (
      <Button 
        icon={<PlusOutlined />}
        type="primary"
        onClick={handleCreateInvoice}
      >
        {config.isMonthly ? t.listPage.generateMonthly : t.listPage.generate}
      </Button>
      )}
      <Button 
        icon={<ReloadOutlined />}
        onClick={handleRefresh}
        loading={loading}
      >
        {t.listPage.refresh}
      </Button>
      <Button 
        icon={<FilterOutlined />}
        onClick={() => setShowFilters(!showFilters)}
      >
        {showFilters ? t.listPage.hideFilters : t.listPage.showFilters}
      </Button>
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.breadcrumb.home, href: '/' },
            { label: t.breadcrumb.sales, href: '/sales' },
            { label: t.breadcrumb[config.breadcrumbKey], current: true }
          ]} 
        />
      }
      buttonBar={InvoicesButtonBar}
      title={config.isMonthly ? t.listPage.monthlyTitle : t.listPage.title}
      description={config.isMonthly ? t.listPage.monthlyDescription : t.listPage.description}
    >
      {!can('view_invoice') ? (
        <div className="px-8 py-6 text-gray-600">{t.listPage.noPermission}</div>
      ) : (
      <>
      {/* Message Section */}
      {pageMessage.type && pageMessage.text && (
        <div className="px-8 py-4">
          <div className={`p-4 rounded-md border ${
            pageMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="font-medium">
                  {pageMessage.type === 'success' ? `✅ ${t.listPage.successPrefix}` : `❌ ${t.listPage.errorPrefix}`}
                </span>
                <span className="ml-2">{pageMessage.text}</span>
              </div>
              <button
                onClick={() => setPageMessage({ type: null, text: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Block */}
      <Spin spinning={loading}>
      <div className="px-8 py-6 bg-white w-full max-w-full overflow-x-auto">
        {/* Filter Section */}
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-900">{t.listPage.filterOptions}</h4>
              <span className="text-sm text-blue-600">
                {t.listPage.showingCount(transactions.length, pagination.total)}
              </span>
            </div>
            <div className="space-y-4">
              {/* Date Range Filter */}
              <div className="flex gap-4 items-center">
                <label className="font-bold text-gray-700 min-w-32">{t.listPage.dateRange}</label>
                <Space direction="horizontal">
                  <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
                    format="YYYY-MM-DD"
                    placeholder={[t.listPage.startDate, t.listPage.endDate]}
                  />
                  <Button
                    type="primary"
                    onClick={() => {
                      fetchTransactions();
                      messageApi.success(t.listPage.filterApplied);
                    }}
                  >
                    {t.listPage.applyFilter}
                  </Button>
                  <Button
                    onClick={() => {
                      setDateRange([null, null]);
                      setSearchText('');
                      setPagination(prev => ({ ...prev, current: 1 }));
                      fetchTransactions(1, pagination.pageSize);
                      messageApi.success(t.listPage.filtersCleared);
                    }}
                  >
                    {t.listPage.clearFilter}
                  </Button>
                </Space>
              </div>
              
              {/* Search Filter */}
              <div className="flex gap-4 items-center">
                <label className="font-bold text-gray-700 min-w-32">{t.listPage.searchLabel}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t.listPage.searchPlaceholder}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    type="primary"
                    onClick={handleSearch}
                  >
                    {t.listPage.search}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Display */}
        {!loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p>{t.listPage.noData}</p>
            {searchText && <p>{t.listPage.adjustSearch}</p>}
            {pagination.total > 0 && searchText && (
              <p className="mt-2">
                <Button type="link" onClick={() => {
                  setSearchText('');
                  setPagination(prev => ({ ...prev, current: 1 }));
                  fetchTransactions(1, pagination.pageSize);
                }}>
                  {t.listPage.clearSearchToShowAll(pagination.total)}
                </Button>
              </p>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table
              columns={displayColumns}
              dataSource={transactions}
              rowKey="uid"
              loading={false}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                pageSizeOptions,
                showQuickJumper: true,
                showTotal: (total, range) => t.listPage.paginationTotal(range[0], range[1], total),
                onChange: (page, pageSize) => {
                  setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || 20 }));
                  fetchTransactions(page, pageSize || 20);
                },
                onShowSizeChange: (current, size) => {
                  setPagination(prev => ({ ...prev, current: 1, pageSize: size }));
                  fetchTransactions(1, size);
                }
              }}
              scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
              size="middle"
              style={{ width: '100%' }}
              tableLayout="auto"
            />
          </div>
        )}
      </div>
      </Spin>
      </>
      )}
    </BasicPageLayout>
  );
}
