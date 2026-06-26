'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, PlusOutlined, ReloadOutlined, FilterOutlined, FileTextOutlined, FileSyncOutlined, ExclamationCircleOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { Modal, message, Table, Button, DatePicker, Space, App, Tooltip, Spin } from 'antd';
import { Dayjs } from 'dayjs';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getQuotationTexts } from './i18n';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  quotationDraftCreatePath,
  QUOTATION_CLONE_KEY_PREFIX,
  TRANSACTION_DRAFT_TRANS_CODE,
} from '@/features/quotations/quotationModule';

interface QuotationTransaction {
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
  /** 1 when converted to SO — deletion not allowed */
  is_convert?: number;
}

export default function QuotationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { modal } = App.useApp();
  const { can } = usePermissions();
  const { token } = useAuth();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getQuotationTexts(lang);
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();
  const [transactions, setTransactions] = useState<QuotationTransaction[]>([]);
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
  
  // Refs for mount + filter change tracking
  const hasInitialFetch = useRef(false);
  const isMounted = useRef(false);
  const prevDateRange = useRef<[Dayjs | null, Dayjs | null]>([null, null]);
  const prevSearchText = useRef<string>('');

  // Browser session for create flows
  useEffect(() => {
    const initializeBrowserSession = () => {
      try {
        let existingSessionId = sessionStorage.getItem('quotation_session_id');
        if (!existingSessionId) {
          existingSessionId = generateBrowserSessionId();
          sessionStorage.setItem('quotation_session_id', existingSessionId);
        }
      } catch (error) {
        console.error('Error initializing quotation browser session:', error);
      }
    };
    initializeBrowserSession();
  }, []);

  const generateBrowserSessionId = (): string => {
    // Generate a unique session ID for this browser tab
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `browser_${timestamp}${randomStr}`;
  };

  // Fetch quotation transactions from t_transaction_h table
  const fetchTransactions = useCallback(async (page: number = 1, pageSize: number = 20) => {
    setLoading(true);
    try {
      console.log('Fetching quotation transactions...');
      
      // Build URL with filters - focus on QTA prefix for quotations
      let url = `/api/transactions?prefix=QTA&page=${page}&pageSize=${pageSize}`;
      
      // Add date range if set
      if (dateRange[0] && dateRange[1]) {
        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');
        url += `&start_date=${startDate}&end_date=${endDate}`;
        console.log('Date range filter:', startDate, 'to', endDate);
      }
      
      // Add search term if provided
      if (searchText && searchText.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
        console.log('Search filter:', searchText);
      }
      
      url += `&t=${Date.now()}`; // Cache busting
      
      console.log('Fetching from URL:', url);
      const response = await fetchWithAuth(url, token, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('API Response:', result);
      
      if (result.success && result.data) {
        console.log('Setting transactions:', result.data.length, 'records');
        setTransactions(result.data);
        
        // Update pagination state
        if (result.pagination) {
          setPagination(result.pagination);
        }
      } else {
        console.error('API failed:', result);
        message.error(t.prompts.failedLoadTransactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      message.error(t.prompts.errorLoadTransactions);
    } finally {
      setLoading(false);
    }
  }, [dateRange, searchText, token]);

  useEffect(() => {
    setPagination(prev => {
      const nextPageSize = Math.min(Math.max(1, pageSizeDefault), pageSizeMax);
      if (prev.pageSize === nextPageSize) return prev;
      if (prev.pageSize !== 20 && prev.pageSize !== 100) return prev;
      return { ...prev, pageSize: nextPageSize, current: 1 };
    });
  }, [pageSizeDefault, pageSizeMax]);

  // Load transactions on mount (only once)
  useEffect(() => {
    if (!hasInitialFetch.current && !isMounted.current) {
      isMounted.current = true;
      hasInitialFetch.current = true;
      fetchTransactions(1, pagination.pageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

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
    
    // Only refetch if filters actually changed
    if (!dateRangeChanged && !searchTextChanged) {
      return;
    }
    
    // Update previous values
    prevDateRange.current = dateRange;
    prevSearchText.current = searchText;
    
    // Reset to first page when filters change
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, searchText, token]); // Only refetch when filters change

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

  const handleCreateQuotation = () => {
    router.push(quotationDraftCreatePath());
  };

  // Define the columns we want to display
  const displayColumns = [
    {
      title: '',
      key: 'actions',
      width: 152,
      align: 'left' as const,
      fixed: 'left' as const,
      render: (_: unknown, record: QuotationTransaction) => {
        const id = record.transaction_id || '';
        const isConverted = record.status === 'Converted' || Number(record.is_convert) === 1;
        return (
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltip title={t.actions.viewDetails}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                  aria-label={t.actions.viewDetails}
                  onClick={() => {
                    if (!id) {
                      message.error(t.prompts.invalidQuotationId);
                      return;
                    }
                    router.push(`/sales/quotations/detail/${encodeURIComponent(id)}`);
                  }}
                  style={{ verticalAlign: 'middle' }}
                >
                  <EyeOutlined />
                </button>
              </span>
            </Tooltip>
            <Tooltip title={t.actions.cloneQuotation}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50 disabled:pointer-events-none"
                  aria-label={t.actions.cloneQuotation}
                  onClick={() => handleCloneQuotation(id)}
                  disabled={cloningId === id || convertingId === id || deletingId === id}
                  style={{ verticalAlign: 'middle' }}
                >
                  <CopyOutlined />
                </button>
              </span>
            </Tooltip>
            {!isConverted && (
              <Tooltip title={t.actions.convertToSalesOrder}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-purple-100 text-purple-600 hover:text-purple-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.convertToSalesOrder}
                    onClick={() => handleConvertToSalesOrder(id)}
                    disabled={convertingId === id}
                    style={{ verticalAlign: 'middle' }}
                  >
                    <FileSyncOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
            {can('void_quotation') && !isConverted && (
              <Tooltip title={t.actions.deleteQuotation}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.deleteQuotation}
                    onClick={() => handleDeleteQuotation(id)}
                    disabled={deletingId === id || convertingId === id}
                    style={{ verticalAlign: 'middle' }}
                  >
                    <DeleteOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: t.columns.quotationId,
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.transaction_id || '').localeCompare(b.transaction_id || ''),
      width: 160,
      fixed: 'left' as const,
      ellipsis: true,
    },
    {
      title: t.columns.type,
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.transaction_type || '').localeCompare(b.transaction_type || ''),
      width: 80,
      render: (type: string) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          type === 'QTA' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {type}
        </span>
      )
    },
    {
      title: t.columns.customer,
      dataIndex: 'customer_code',
      key: 'customer_code',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.customer_code || '').localeCompare(b.customer_code || ''),
      width: 280,
      ellipsis: true,
      render: (code: string, record: QuotationTransaction) => (
        <div>
          <div><strong>{code}</strong></div>
          {record.customer_name && <div className="text-sm text-gray-600 truncate">{record.customer_name}</div>}
          {record.customer_phone && <div className="text-xs text-gray-500">📞 {record.customer_phone}</div>}
        </div>
      )
    },
    {
      title: t.columns.totalAmount,
      dataIndex: 'total_amount',
      key: 'total_amount',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.total_amount || 0) - (b.total_amount || 0),
      width: 120,
      align: 'right' as const,
      render: (amount: number) => {
        const numAmount = typeof amount === 'number' ? amount : parseFloat(amount as string) || 0;
        return formatCurrency(numAmount);
      }
    },
    {
      title: t.columns.shop,
      dataIndex: 'shop_code',
      key: 'shop_code',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.shop_code || '').localeCompare(b.shop_code || ''),
      width: 200,
      ellipsis: true,
      render: (code: string, record: QuotationTransaction) => (
        <div>
          <div><strong>{code}</strong></div>
          {record.shop_name && <div className="text-sm text-gray-600 truncate">{record.shop_name}</div>}
        </div>
      )
    },
    {
      title: t.columns.paymentMethod,
      dataIndex: 'payment_method',
      key: 'payment_method',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.payment_method || '').localeCompare(b.payment_method || ''),
      width: 160,
      ellipsis: true,
    },
    {
      title: t.columns.reference,
      dataIndex: 'reference_no',
      key: 'reference_no',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.reference_no || '').localeCompare(b.reference_no || ''),
      width: 160,
      ellipsis: true,
    },
    {
      title: t.columns.status,
      dataIndex: 'status',
      key: 'status',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => (a.status || '').localeCompare(b.status || ''),
      width: 100,
      render: (status: string) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          status === 'Active' ? 'bg-green-100 text-green-800' :
          status === 'Settled' ? 'bg-blue-100 text-blue-800' :
          status === 'Void' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {status}
        </span>
      )
    },
    {
      title: t.columns.created,
      dataIndex: 'create_date',
      key: 'create_date',
      sorter: (a: QuotationTransaction, b: QuotationTransaction) => new Date(a.create_date || '').getTime() - new Date(b.create_date || '').getTime(),
      width: 180,
      render: (date: string) =>
        date ? formatDisplayDateTime(date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB') : 'N/A',
    }
  ];

  // State management
  const [showFilters, setShowFilters] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  // Handle refresh
  const handleRefresh = () => {
    fetchTransactions();
  };

  type TransactionDetailRow = {
    item_code?: string;
    eng_name?: string;
    chi_name?: string;
    qty?: number;
    unit?: string;
    price?: number;
    discount?: number;
  };

  type TransactionDetailResponse = {
    success: boolean;
    header?: Record<string, unknown>;
    details?: TransactionDetailRow[];
    paymentTotals?: Array<{ pm_code?: string; payment_amount?: number }>;
    error?: string;
  };

  const handleCloneQuotation = async (quotationId: string) => {
    if (!quotationId) {
      message.error(t.prompts.invalidQuotationId);
      return;
    }

    setCloningId(quotationId);
    message.loading({ content: t.prompts.cloneStarted, key: 'cloneQuotation', duration: 0 });
    try {
      const sourceRes = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(quotationId)}`, token, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const sourceJson = (await sourceRes.json()) as TransactionDetailResponse;
      if (!sourceJson.success) {
        throw new Error(sourceJson.error || t.prompts.failedClone);
      }

      const sourceHeader = sourceJson.header || {};
      const sourceDetails = Array.isArray(sourceJson.details) ? sourceJson.details : [];
      const sourcePaymentTotals = Array.isArray(sourceJson.paymentTotals) ? sourceJson.paymentTotals : [];
      const pm_code = sourcePaymentTotals?.[0]?.pm_code;

      const clonePayload = {
        sourceTransCode: quotationId,
        header: {
          cust_code: sourceHeader.cust_code ?? undefined,
          shop_code: sourceHeader.shop_code ?? undefined,
          refer_code: sourceHeader.refer_code ?? undefined,
          quotation_code: sourceHeader.quotation_code ?? undefined,
          remark: sourceHeader.remark ?? undefined,
          valid_until_date: sourceHeader.valid_until_date ?? sourceHeader.valid_until ?? undefined,
          customer_name: sourceHeader.customer_name ?? undefined,
          pm_code: pm_code ?? undefined,
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
        `${QUOTATION_CLONE_KEY_PREFIX}${TRANSACTION_DRAFT_TRANS_CODE}`,
        JSON.stringify(clonePayload)
      );

      message.destroy('cloneQuotation');
      router.push(quotationDraftCreatePath());
    } catch (err) {
      console.error('Error cloning quotation:', err);
      message.destroy('cloneQuotation');
      message.error(err instanceof Error ? err.message : t.prompts.errorClone);
    } finally {
      setCloningId(null);
    }
  };

  // Handle convert quotation to Sales Order (draft) — confirm before API call
  const handleConvertToSalesOrder = (quotationId: string) => {
    if (!quotationId) {
      message.error(t.prompts.invalidQuotationId);
      return;
    }

    modal.confirm({
      title: t.confirms.convertTitle,
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>
            {t.confirms.convertBody(quotationId)}
          </p>
          <p className="text-gray-600 text-sm mt-2">{t.confirms.irreversible}</p>
        </div>
      ),
      okText: t.confirms.convertOk,
      okType: 'primary',
      cancelText: t.confirms.cancel,
      onOk: async () => {
        setConvertingId(quotationId);
        try {
          const response = await fetchWithAuth('/api/transactions/convert-quotation', token, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              quotationCode: quotationId,
            }),
          });

          const result = await response.json();

          if (result.success) {
            const orderCode = result.orderCode || result.invoiceCode;
            message.success(t.prompts.convertSuccess(orderCode));
            await fetchTransactions();
            router.push(`/sales/orders/detail/${encodeURIComponent(orderCode)}`);
          } else {
            message.error(result.error || t.prompts.failedConvert);
            throw new Error(result.error || 'convert failed');
          }
        } catch (error) {
          console.error('Error converting quotation:', error);
          if (!(error instanceof Error && error.message === 'convert failed')) {
            message.error(t.prompts.errorConvert);
          }
          throw error;
        } finally {
          setConvertingId(null);
        }
      },
    });
  };

  const handleDeleteQuotation = (quotationId: string) => {
    if (!quotationId) {
      message.error(t.prompts.invalidQuotationId);
      return;
    }

    modal.confirm({
      title: t.confirms.deleteTitle,
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>
            {t.confirms.deleteBody(quotationId)}
          </p>
          <p className="text-gray-600 text-sm mt-2">{t.confirms.convertedCannotDelete}</p>
        </div>
      ),
      okText: t.confirms.deleteOk,
      okType: 'danger',
      cancelText: t.confirms.cancel,
      onOk: async () => {
        setDeletingId(quotationId);
        try {
          const response = await fetchWithAuth('/api/transactions/delete-quotation', token, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transCode: quotationId }),
          });
          const result = await response.json();
          if (result.success) {
            message.success(result.message || t.prompts.quotationDeleted);
            await fetchTransactions();
          } else {
            message.error(result.error || t.prompts.failedDeleteQuotation);
            throw new Error(result.error || 'delete failed');
          }
        } catch (error) {
          console.error('Error deleting quotation:', error);
          if (!(error instanceof Error && error.message === 'delete failed')) {
            message.error(t.prompts.errorDeleteQuotation);
          }
          throw error;
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  // Quotation Button Bar Component
  const QuotationButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {can('create_quotation') && (
      <Button 
        icon={<PlusOutlined />}
        type="primary"
        onClick={handleCreateQuotation}
      >
        {t.listPage.generate}
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
            { label: t.breadcrumb.quotations, current: true }
          ]} 
        />
      }
      buttonBar={QuotationButtonBar}
      title={t.listPage.title}
      description={t.listPage.description}
    >
      {!can('view_quotation') ? (
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
                  {pageMessage.type === 'success' ? '✅ Success:' : '❌ Error:'}
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
                {t.listPage.showingTransactions(transactions.length, pagination.total)}
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
                      fetchTransactions(1, pagination.pageSize);
                      message.success(t.prompts.filterApplied);
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
                      message.success(t.prompts.filtersCleared);
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
