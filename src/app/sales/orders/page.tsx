'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import {
  PlusOutlined,
  ReloadOutlined,
  FilterOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  FileAddOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  createInvoiceFromSalesOrder,
  getOrCreateInvoiceBrowserSessionId,
} from '@/lib/createInvoiceFromSalesOrder';
import { Modal, Table, Button, DatePicker, Space, Form, Input, App, Tooltip, Spin } from 'antd';
import { Dayjs } from 'dayjs';
import { getCurrentSuffix } from '@/utils/transactionUtils';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesOrderTexts } from './i18n';

interface OrderTransaction {
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
}

interface TransactionGeneratorResponse {
  success: boolean;
  message?: string;
  error?: string;
  transactionCode?: string;
  lastNumber?: number;
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSalesOrderTexts(lang), [lang]);
  const { token } = useAuth();
  const { can } = usePermissions();
  const { modal, message: messageApi } = App.useApp();
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();
  const [transactions, setTransactions] = useState<OrderTransaction[]>([]);
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
  
  // Transaction generation states
  const [browserSessionId, setBrowserSessionId] = useState<string>('');
  const [transactionSession, setTransactionSession] = useState<TransactionGeneratorResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [form] = Form.useForm();
  const [showFilters, setShowFilters] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({
    type: null,
    text: null,
  });
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [creatingInvoiceId, setCreatingInvoiceId] = useState<number | null>(null);

  // Refs for mount + filter change tracking
  const hasInitialFetch = useRef(false);
  const isMounted = useRef(false);
  const prevDateRange = useRef<[Dayjs | null, Dayjs | null]>([null, null]);
  const prevSearchText = useRef<string>('');

  // Initialize browser session ID (fixed for this browser)
  useEffect(() => {
    const initializeBrowserSession = () => {
      try {
        let existingSessionId = sessionStorage.getItem('order_session_id');
        if (!existingSessionId) {
          existingSessionId = generateBrowserSessionId();
          sessionStorage.setItem('order_session_id', existingSessionId);
        }
        setBrowserSessionId(existingSessionId);
      } catch (error) {
        console.error('Error initializing order browser session:', error);
      }
    };
    initializeBrowserSession();
  }, []);

  const generateBrowserSessionId = (): string => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `browser_${timestamp}${randomStr}`;
  };

  // Fetch Sales Order transactions (prefix SO)
  const fetchTransactions = useCallback(async (page: number = 1, pageSize: number = 20) => {
    setLoading(true);
    try {
      let url = `/api/transactions?prefix=SO&page=${page}&pageSize=${pageSize}`;
      if (dateRange[0] && dateRange[1]) {
        url += `&start_date=${dateRange[0].format('YYYY-MM-DD')}&end_date=${dateRange[1].format('YYYY-MM-DD')}`;
      }
      if (searchText?.trim()) {
        url += `&search=${encodeURIComponent(searchText.trim())}`;
      }
      url += `&t=${Date.now()}`;
      const response = await fetchWithAuth(url, token, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result = await response.json();
      if (result.success && result.data) {
        setTransactions(result.data);
        if (result.pagination) setPagination(result.pagination);
      } else {
        messageApi.error(result.error || t.prompts.failedLoadList);
      }
    } catch (error) {
      console.error('Error fetching Sales Order transactions:', error);
      messageApi.error(t.prompts.errorLoadList);
    } finally {
      setLoading(false);
    }
  }, [dateRange, searchText, pagination.pageSize, messageApi, t, token]);

  useEffect(() => {
    setPagination(prev => {
      const nextPageSize = Math.min(Math.max(1, pageSizeDefault), pageSizeMax);
      if (prev.pageSize === nextPageSize) return prev;
      if (prev.pageSize !== 20 && prev.pageSize !== 100) return prev;
      return { ...prev, pageSize: nextPageSize, current: 1 };
    });
  }, [pageSizeDefault, pageSizeMax]);

  useEffect(() => {
    if (!hasInitialFetch.current && !isMounted.current) {
      isMounted.current = true;
      hasInitialFetch.current = true;
      fetchTransactions(1, pagination.pageSize);
    }
  }, []);

  useEffect(() => {
    if (!isMounted.current || !hasInitialFetch.current) return;
    const dateRangeChanged =
      prevDateRange.current[0]?.format('YYYY-MM-DD') !== dateRange[0]?.format('YYYY-MM-DD') ||
      prevDateRange.current[1]?.format('YYYY-MM-DD') !== dateRange[1]?.format('YYYY-MM-DD');
    const searchTextChanged = prevSearchText.current !== searchText;
    if (!dateRangeChanged && !searchTextChanged) return;
    prevDateRange.current = dateRange;
    prevSearchText.current = searchText;
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
  }, [dateRange, searchText]);

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
  };

  const generateOrderNumber = async () => {
    setIsGenerating(true);
    try {
      const suffix = getCurrentSuffix();
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'SO', suffix, sessionId: browserSessionId }),
      });
      const result = await response.json();
      if (result.success) {
        setTransactionSession({
          success: result.success,
          transactionCode: result.transactionCode,
          lastNumber: result.lastNumber,
          message: result.message
        });
        form.setFieldsValue({ order_number: result.transactionCode });
        messageApi.success(result.message || t.prompts.generatedNumber);
      } else {
        messageApi.error(result.error || t.prompts.failedGenerate);
      }
    } catch (error) {
      console.error('Error generating Sales Order number:', error);
      messageApi.error(t.prompts.errorGenerate);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModalOpen = () => {
    setShowGenerateModal(true);
    setTimeout(() => generateOrderNumber(), 100);
  };

  const handleCommitTransaction = async () => {
    try {
      const response = await fetch('/api/transaction-generator/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: browserSessionId }),
      });
      const result = await response.json();
      if (result.success) {
        messageApi.success(t.prompts.committed);
        if (transactionSession?.transactionCode) {
          setTransactionSession(null);
          form.resetFields();
          setShowGenerateModal(false);
          router.push(`/sales/orders/create/${encodeURIComponent(transactionSession.transactionCode)}`);
        } else {
          fetchTransactions();
        }
      } else {
        messageApi.error(result.error || t.prompts.failedCommit);
      }
    } catch (error) {
      console.error('Error committing transaction:', error);
      messageApi.error(t.prompts.errorCommit);
    }
  };

  const handleDiscardTransaction = async () => {
    try {
      const response = await fetch('/api/transaction-generator/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: browserSessionId }),
      });
      const result = await response.json();
      if (result.success) {
        messageApi.success(t.prompts.discarded);
        setTransactionSession(null);
        form.resetFields();
        setShowGenerateModal(false);
        fetchTransactions();
      } else {
        messageApi.error(result.error || t.prompts.failedDiscard);
      }
    } catch (error) {
      console.error('Error discarding transaction:', error);
      messageApi.error(t.prompts.errorDiscard);
    }
  };

  const handleConfirmSalesOrder = useCallback(
    (record: OrderTransaction) => {
      const transCode = record.transaction_id;
      if (!transCode || record.transaction_type !== 'SO' || record.status === 'Settled' || record.status === 'Void' || voidingId === record.uid)
        return;
      const confirmContent =
        typeof t.prompts.confirmContent === 'function'
          ? t.prompts.confirmContent(transCode)
          : String(t.prompts.confirmContent);

      modal.confirm({
        title: t.prompts.confirmTitle,
        icon: <ExclamationCircleOutlined />,
        content: confirmContent,
        okText: t.prompts.confirmOk,
        cancelText: t.prompts.confirmCancel,
        okButtonProps: { type: 'primary' },
        maskClosable: false,
        onOk: async () => {
          setConfirmingId(record.uid);
          try {
            const res = await fetchWithAuth('/api/transactions/confirm-sales-order', token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transCode }),
            });
            const result = await res.json();
            if (result.success) {
              messageApi.success(result.message || t.prompts.orderConfirmed);
              fetchTransactions(pagination.current, pagination.pageSize);
            } else {
              messageApi.error(result.error || t.prompts.confirmFailed);
            }
          } catch {
            messageApi.error(t.prompts.confirmFailed);
          } finally {
            setConfirmingId(null);
          }
        },
      });
    },
    [modal, messageApi, t, fetchTransactions, pagination.current, pagination.pageSize, token, voidingId]
  );

  const handleVoidSalesOrder = useCallback(
    (record: OrderTransaction) => {
      const transCode = record.transaction_id;
      if (!transCode || record.transaction_type !== 'SO' || record.status === 'Void' || record.status === 'Settled' || confirmingId === record.uid) return;
      const hasQta = !!(record.quotation_code && String(record.quotation_code).trim());
      modal.confirm({
        title: t.prompts.voidTitle,
        content: hasQta ? t.prompts.voidContentWithQuotation : t.prompts.voidContent,
        okText: t.prompts.voidOk,
        okButtonProps: { danger: true },
        cancelText: t.prompts.voidCancel,
        onOk: async () => {
          setVoidingId(record.uid);
          try {
            const res = await fetchWithAuth('/api/transactions/void-sales-order', token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transCode }),
            });
            const result = await res.json();
            if (result.success) {
              messageApi.success(result.message || t.prompts.orderVoided);
              fetchTransactions(pagination.current, pagination.pageSize);
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
    [modal, messageApi, t, fetchTransactions, pagination.current, pagination.pageSize, token, confirmingId]
  );

  const handleCreateInvoiceFromSo = useCallback(
    async (record: OrderTransaction) => {
      const transCode = record.transaction_id;
      if (
        !transCode ||
        record.transaction_type !== 'SO' ||
        record.status !== 'Settled' ||
        creatingInvoiceId === record.uid
      ) {
        return;
      }
      if (!can('create_invoice')) return;
      const sessionId = getOrCreateInvoiceBrowserSessionId();
      if (!sessionId) {
        messageApi.error(t.prompts.invoiceSessionNotReady);
        return;
      }
      setCreatingInvoiceId(record.uid);
      messageApi.loading({ content: t.prompts.createInvoiceStarted, key: 'createInvoiceFromSo', duration: 0 });
      try {
        const newCode = await createInvoiceFromSalesOrder({
          salesOrderCode: transCode,
          token,
          browserSessionId: sessionId,
        });
        messageApi.destroy('createInvoiceFromSo');
        router.push(`/sales/invoices/create/${encodeURIComponent(newCode)}`);
      } catch (e) {
        messageApi.destroy('createInvoiceFromSo');
        messageApi.error(
          e instanceof Error ? e.message : t.prompts.createInvoiceFailed
        );
      } finally {
        setCreatingInvoiceId(null);
      }
    },
    [can, creatingInvoiceId, messageApi, router, t, token]
  );

  const displayColumns = useMemo(
    () => [
    {
      title: '',
      key: 'actions',
      width: 168,
      align: 'left' as const,
      fixed: 'left' as const,
      render: (_: unknown, record: OrderTransaction) => {
        const canConfirm =
          record.transaction_type === 'SO' &&
          record.status !== 'Settled' &&
          record.status !== 'Void' &&
          can('edit_sales_order');
        const canVoid =
          record.transaction_type === 'SO' &&
          record.status !== 'Void' &&
          record.status !== 'Settled' &&
          can('void_sales_order');
        const canCreateInvoice =
          record.transaction_type === 'SO' &&
          record.status === 'Settled' &&
          can('create_invoice');
        return (
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltip title={t.actions.viewOrder}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                  aria-label={t.actions.viewOrder}
                  onClick={() =>
                    record.transaction_id
                      ? router.push(`/sales/orders/detail/${encodeURIComponent(record.transaction_id)}`)
                      : messageApi.error(t.prompts.errorLoadList)
                  }
                  style={{ verticalAlign: 'middle' }}
                >
                  <EyeOutlined />
                </button>
              </span>
            </Tooltip>
            {canConfirm && (
              <Tooltip title={t.actions.confirmOrder}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 text-green-600 hover:text-green-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.confirmOrder}
                    onClick={() => handleConfirmSalesOrder(record)}
                    disabled={
                      confirmingId === record.uid ||
                      voidingId === record.uid ||
                      creatingInvoiceId === record.uid
                    }
                    style={{ verticalAlign: 'middle' }}
                  >
                    {confirmingId === record.uid ? (
                      <span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircleOutlined />
                    )}
                  </button>
                </span>
              </Tooltip>
            )}
            {canVoid && (
              <Tooltip title={t.actions.voidOrder}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.voidOrder}
                    onClick={() => handleVoidSalesOrder(record)}
                    disabled={voidingId === record.uid || confirmingId === record.uid || creatingInvoiceId === record.uid}
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
            {canCreateInvoice && (
              <Tooltip title={t.actions.createInvoice}>
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition disabled:opacity-50 disabled:pointer-events-none"
                    aria-label={t.actions.createInvoice}
                    onClick={() => void handleCreateInvoiceFromSo(record)}
                    disabled={
                      creatingInvoiceId === record.uid ||
                      voidingId === record.uid ||
                      confirmingId === record.uid
                    }
                    style={{ verticalAlign: 'middle' }}
                  >
                    {creatingInvoiceId === record.uid ? (
                      <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FileAddOutlined />
                    )}
                  </button>
                </span>
              </Tooltip>
            )}
          </div>
        );
      }
    },
    {
      title: t.columns.orderId,
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.transaction_id || '').localeCompare(b.transaction_id || ''),
      width: 160,
      fixed: 'left' as const,
      ellipsis: true,
    },
    {
      title: t.columns.type,
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.transaction_type || '').localeCompare(b.transaction_type || ''),
      width: 80,
      render: (type: string) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          type === 'SO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {type}
        </span>
      )
    },
    {
      title: t.columns.customer,
      dataIndex: 'customer_code',
      key: 'customer_code',
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.customer_code || '').localeCompare(b.customer_code || ''),
      width: 280,
      ellipsis: true,
      render: (code: string, record: OrderTransaction) => (
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
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.total_amount || 0) - (b.total_amount || 0),
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
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.shop_code || '').localeCompare(b.shop_code || ''),
      width: 200,
      ellipsis: true,
      render: (code: string, record: OrderTransaction) => (
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
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.payment_method || '').localeCompare(b.payment_method || ''),
      width: 160,
      ellipsis: true,
    },
    {
      title: t.columns.reference,
      dataIndex: 'reference_no',
      key: 'reference_no',
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.reference_no || '').localeCompare(b.reference_no || ''),
      width: 160,
      ellipsis: true,
    },
    {
      title: t.columns.status,
      dataIndex: 'status',
      key: 'status',
      sorter: (a: OrderTransaction, b: OrderTransaction) => (a.status || '').localeCompare(b.status || ''),
      width: 100,
      render: (status: string) => {
        const rowMap = t.rowStatus as Record<string, string>;
        const label = rowMap[status] ?? status;
        return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          status === 'Draft' ? 'bg-amber-100 text-amber-800' :
          status === 'Active' ? 'bg-green-100 text-green-800' :
          status === 'Settled' ? 'bg-blue-100 text-blue-800' :
          status === 'Void' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {label}
        </span>
        );
      }
    },
    {
      title: t.columns.created,
      dataIndex: 'create_date',
      key: 'create_date',
      sorter: (a: OrderTransaction, b: OrderTransaction) => new Date(a.create_date || '').getTime() - new Date(b.create_date || '').getTime(),
      width: 180,
      render: (date: string) =>
        date ? formatDisplayDateTime(date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB') : t.detailLabels.na,
    }
  ],
    [t, lang, confirmingId, voidingId, creatingInvoiceId, router, handleConfirmSalesOrder, handleVoidSalesOrder, handleCreateInvoiceFromSo, can, messageApi]
  );

  const handleRefresh = () => fetchTransactions();

  const OrdersButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {can('create_sales_order') && (
      <Button icon={<PlusOutlined />} type="primary" onClick={handleModalOpen}>
        {t.listPage.generate}
      </Button>
      )}
      <Button icon={<FileTextOutlined />} onClick={() => router.push('/sales/invoices')}>
        {t.listPage.invoices}
      </Button>
      <Button icon={<FileTextOutlined />} onClick={() => router.push('/sales/quotations')}>
        {t.listPage.quotations}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
        {t.listPage.refresh}
      </Button>
      <Button icon={<FilterOutlined />} onClick={() => setShowFilters(!showFilters)}>
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
            { label: t.breadcrumb.salesOrders, current: true }
          ]}
        />
      }
      buttonBar={OrdersButtonBar}
      title={t.listPage.title}
      description={t.listPage.description}
    >
      {!can('view_sales_order') ? (
        <div className="px-8 py-6 text-gray-600">{t.listPage.noPermission}</div>
      ) : (
      <>
      {pageMessage.type && pageMessage.text && (
        <div className="px-8 py-4">
          <div className={`p-4 rounded-md border ${
            pageMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex justify-between items-center">
              <span className="font-medium">{pageMessage.type === 'success' ? `✅ ${t.listPage.successPrefix}` : `❌ ${t.listPage.errorPrefix}`}</span>
              <span className="ml-2">{pageMessage.text}</span>
              <button onClick={() => setPageMessage({ type: null, text: null })} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
          </div>
        </div>
      )}

      <Spin spinning={loading}>
      <div className="px-8 py-6 bg-white w-full max-w-full overflow-x-auto">
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">{t.listPage.filterOptions}</h4>
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <label className="font-bold text-gray-700 min-w-32">{t.listPage.dateRange}</label>
                <Space>
                  <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
                    format="YYYY-MM-DD"
                    placeholder={[t.listPage.startDate, t.listPage.endDate]}
                  />
                  <Button type="primary" onClick={() => { fetchTransactions(); messageApi.success(t.listPage.filterApplied); }}>{t.listPage.applyFilter}</Button>
                  <Button onClick={() => { setDateRange([null, null]); setSearchText(''); setPagination(prev => ({ ...prev, current: 1 })); fetchTransactions(1, pagination.pageSize); messageApi.success(t.listPage.filtersCleared); }}>{t.listPage.clearFilter}</Button>
                </Space>
              </div>
              <div className="flex gap-4 items-center">
                <label className="font-bold text-gray-700 min-w-32">{t.listPage.searchLabel}</label>
                <input
                  type="text"
                  placeholder={t.listPage.searchPlaceholder}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button type="primary" onClick={handleSearch}>{t.listPage.search}</Button>
              </div>
            </div>
          </div>
        )}

        {!loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p>{t.listPage.noData}</p>
            {searchText && <p>{t.listPage.adjustSearch}</p>}
            {pagination.total > 0 && searchText && (
              <Button type="link" onClick={() => { setSearchText(''); setPagination(prev => ({ ...prev, current: 1 })); fetchTransactions(1, pagination.pageSize); }}>
                {t.listPage.clearSearchToShowAll(pagination.total)}
              </Button>
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
                onChange: (page, pageSize) => { setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || 20 })); fetchTransactions(page, pageSize || 20); },
                onShowSizeChange: (_, size) => { setPagination(prev => ({ ...prev, current: 1, pageSize: size })); fetchTransactions(1, size); }
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

      <Modal
        title={t.generateModal.title}
        open={showGenerateModal}
        onCancel={() => {}}
        closable={false}
        maskClosable={false}
        footer={[
          <Button key="discard" danger onClick={handleDiscardTransaction} disabled={!transactionSession}>{t.generateModal.discard}</Button>,
          <Button key="create" type="primary" onClick={handleCommitTransaction} disabled={!transactionSession}>{t.generateModal.createOrder}</Button>
        ]}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="order_number" rules={[{ required: true, message: t.generateModal.requiredGenerate }]}>
            <Input placeholder={isGenerating ? t.generateModal.generatingPlaceholder : t.generateModal.generatedPlaceholder} disabled style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }} />
          </Form.Item>
          {isGenerating && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <span className="text-yellow-600 font-medium">{t.generateModal.generating}</span>
              <p className="text-sm text-yellow-700 mt-1">{t.generateModal.pleaseWait}</p>
            </div>
          )}
          {transactionSession && !isGenerating && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded flex items-center gap-2">
              <CheckCircleOutlined className="text-green-600 text-lg" />
              <span className="text-sm text-green-700 font-medium">{t.generateModal.generatedSuccessful}</span>
            </div>
          )}
        </Form>
      </Modal>
    </BasicPageLayout>
  );
}
