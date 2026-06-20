'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getPurchaseOrderTexts } from './i18n';
import { PlusOutlined, ReloadOutlined, FilterOutlined, EyeOutlined, CheckCircleOutlined, ImportOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { App, Modal, Table, Button, DatePicker, Space, Form, Input, Tooltip, Spin } from 'antd';
import { Dayjs } from 'dayjs';
import { getCurrentSuffix } from '@/utils/transactionUtils';
import { useSystemPagination } from '@/hooks/useSystemPagination';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatDisplayDateTime } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';

interface PurchaseOrderTransaction {
  uid: number;
  transaction_id: string;
  transaction_date: string;
  transaction_type: string;
  supp_code: string;
  supplier_name?: string;
  supplier_phone?: string;
  total_amount: number;
  reference_no: string;
  status: string;
  is_settle?: number;
  /** 1 when summed GRN qty per item meets or exceeds PO qty for every line */
  po_fully_grn_received?: number;
  create_date?: string;
  modify_date?: string;
  shop_code?: string;
  shop_name?: string;
  customer_code?: string;
  customer_name?: string;
}

interface TransactionGeneratorResponse {
  success: boolean;
  message?: string;
  error?: string;
  transactionCode?: string;
  lastNumber?: number;
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getPurchaseOrderTexts(lang);
  const { token } = useAuth();
  const { can } = usePermissions();
  const { modal, message } = App.useApp();
  const { pageSizeDefault, pageSizeMax, pageSizeOptions } = useSystemPagination();
  const [transactions, setTransactions] = useState<PurchaseOrderTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState('');

  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  const [browserSessionId, setBrowserSessionId] = useState<string>('');
  const [transactionSession, setTransactionSession] = useState<TransactionGeneratorResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [form] = Form.useForm();
  const [cloningId, setCloningId] = useState<string | null>(null);

  const hasInitialFetch = useRef(false);
  const isMounted = useRef(false);
  const prevDateRange = useRef<[Dayjs | null, Dayjs | null]>([null, null]);
  const prevSearchText = useRef<string>('');

  useEffect(() => {
    let existingSessionId = sessionStorage.getItem('purchase_session_id');
    if (!existingSessionId) {
      existingSessionId = `browser_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
      sessionStorage.setItem('purchase_session_id', existingSessionId);
    }
    setBrowserSessionId(existingSessionId);
  }, []);

  const fetchTransactions = useCallback(
    async (page: number = 1, pageSize: number = 20) => {
      setLoading(true);
      try {
        let url = `/api/transactions?prefix=PO&page=${page}&pageSize=${pageSize}`;
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
          message.error(t.prompts.failedLoadList);
        }
      } catch (error) {
        console.error('Error fetching purchase orders:', error);
        message.error(t.prompts.errorLoadList);
      } finally {
        setLoading(false);
      }
    },
    [dateRange, searchText, t.prompts.failedLoadList, t.prompts.errorLoadList, token]
  );

  useEffect(() => {
    setPagination((prev) => {
      const nextPageSize = Math.min(Math.max(1, pageSizeDefault), pageSizeMax);
      if (prev.pageSize === nextPageSize) return prev;
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
    setPagination((prev) => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
  }, [dateRange, searchText, fetchTransactions, pagination.pageSize]);

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    fetchTransactions(1, pagination.pageSize);
  };

  const generatePONumber = async () => {
    setIsGenerating(true);
    try {
      const suffix = getCurrentSuffix();
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'PO', suffix, sessionId: browserSessionId }),
      });
      const result = await response.json();
      if (result.success) {
        setTransactionSession({
          success: result.success,
          transactionCode: result.transactionCode,
          lastNumber: result.lastNumber,
          message: result.message,
        });
        form.setFieldsValue({ po_number: result.transactionCode });
        message.success(result.message || t.prompts.generatedNumber);
      } else {
        message.error(result.error || t.prompts.failedGenerate);
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
      message.error(t.prompts.errorGenerate);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModalOpen = () => {
    setShowGenerateModal(true);
    setTimeout(() => generatePONumber(), 100);
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
        message.success(t.prompts.committed);
        if (transactionSession?.transactionCode) {
          setTransactionSession(null);
          form.resetFields();
          setShowGenerateModal(false);
          router.push(`/purchasing/purchases/create/${encodeURIComponent(transactionSession.transactionCode)}`);
        } else {
          fetchTransactions(1, pagination.pageSize);
        }
      } else {
        message.error(result.error || t.prompts.failedCommit);
      }
    } catch (error) {
      console.error('Error committing transaction:', error);
      message.error(t.prompts.errorCommit);
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
        message.success(t.prompts.discarded);
        setTransactionSession(null);
        form.resetFields();
        setShowGenerateModal(false);
        fetchTransactions(1, pagination.pageSize);
      } else {
        message.error(result.error || t.prompts.failedDiscard);
      }
    } catch (error) {
      console.error('Error discarding transaction:', error);
      message.error(t.prompts.errorDiscard);
    }
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

  const handleClonePo = async (poId: string) => {
    if (!poId) return;
    if (!browserSessionId) {
      message.error(t.prompts.errorClone);
      return;
    }

    setCloningId(poId);
    message.loading({ content: t.prompts.cloneStarted, key: 'clonePo', duration: 0 });
    try {
      const sourceRes = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(poId)}`, token, {
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

      const suffix = getCurrentSuffix();
      const nextRes = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'PO', suffix, sessionId: browserSessionId }),
      });
      const nextJson = (await nextRes.json()) as { success: boolean; transactionCode?: string; error?: string };
      if (!nextJson.success || !nextJson.transactionCode) {
        throw new Error(nextJson.error || t.prompts.failedGenerate);
      }
      const newCode = nextJson.transactionCode;

      const clonePayload = {
        sourceTransCode: poId,
        header: {
          supp_code: sourceHeader.supp_code ?? undefined,
          shop_code: sourceHeader.shop_code ?? undefined,
          wh_code: sourceHeader.wh_code ?? sourceHeader.shop_code ?? undefined,
          refer_code: sourceHeader.refer_code ?? undefined,
          remark: sourceHeader.remark ?? undefined,
          supplier_name: sourceHeader.supplier_name ?? undefined,
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
      sessionStorage.setItem(`purchase_clone_${newCode}`, JSON.stringify(clonePayload));

      const commitRes = await fetch('/api/transaction-generator/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: browserSessionId }),
      });
      const commitJson = (await commitRes.json()) as { success: boolean; error?: string };
      if (!commitJson.success) {
        throw new Error(commitJson.error || t.prompts.failedCommit);
      }

      message.destroy('clonePo');
      router.push(`/purchasing/purchases/create/${encodeURIComponent(newCode)}`);
    } catch (err) {
      console.error('Error cloning PO:', err);
      message.destroy('clonePo');
      message.error(err instanceof Error ? err.message : t.prompts.errorClone);
    } finally {
      setCloningId(null);
    }
  };

  const handleDeletePo = useCallback(
    (transCode: string) => {
      const code = (transCode || '').toString().trim();
      if (!code) return;

      modal.confirm({
        title: t.confirms.deleteTitle,
        content: t.confirms.deleteBody(code),
        okText: t.confirms.deleteOk,
        cancelText: t.confirms.cancel,
        okButtonProps: { danger: true },
        async onOk() {
          try {
            const res = await fetchWithAuth('/api/transactions/delete-po', token, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ transCode: code }),
            });
            const json = (await res.json()) as { success: boolean; error?: string; message?: string };
            if (!res.ok || !json.success) {
              throw new Error(json.error || t.prompts.failedDelete);
            }
            message.success(json.message || t.prompts.deleteOk);
            fetchTransactions(pagination.current, pagination.pageSize);
          } catch (err) {
            message.error(err instanceof Error ? err.message : t.prompts.failedDelete);
          }
        },
      });
    },
    [t, token, fetchTransactions, pagination.current, pagination.pageSize, modal]
  );

  const displayColumns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 140,
        align: 'left' as const,
        fixed: 'left' as const,
        render: (_: unknown, record: PurchaseOrderTransaction) => (
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltip title={t.actions.viewPo}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                  aria-label={t.actions.viewPo}
                  onClick={() =>
                    router.push(`/purchasing/purchases/detail/${encodeURIComponent(record.transaction_id || '')}`)
                  }
                >
                  <EyeOutlined />
                </button>
              </span>
            </Tooltip>
            <Tooltip title={t.actions.clonePo}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50 disabled:pointer-events-none"
                  aria-label={t.actions.clonePo}
                  onClick={() => handleClonePo(record.transaction_id || '')}
                  disabled={cloningId === (record.transaction_id || '')}
                >
                  <CopyOutlined />
                </button>
              </span>
            </Tooltip>
            <Tooltip
              title={
                record.is_settle === 1 || record.po_fully_grn_received === 1
                  ? t.detailPage.poFullyReceived
                  : t.actions.createGrn
              }
            >
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 text-green-600 hover:text-green-800 transition disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-gray-100"
                  aria-label={t.actions.createGrn}
                  disabled={record.is_settle === 1 || record.po_fully_grn_received === 1}
                  onClick={() =>
                    router.push(`/warehouse/stock/grn?po=${encodeURIComponent(record.transaction_id || '')}`)
                  }
                >
                  <ImportOutlined />
                </button>
              </span>
            </Tooltip>
            {can('void_po') && (
              <Tooltip
                title={
                  record.is_settle === 1 || record.po_fully_grn_received === 1
                    ? t.detailPage.cannotVoidSettledPo
                    : t.actions.deletePo
                }
              >
                <span className="inline-flex">
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-gray-100"
                    aria-label={t.actions.deletePo}
                    disabled={record.is_settle === 1 || record.po_fully_grn_received === 1}
                    onClick={() => handleDeletePo(record.transaction_id || '')}
                  >
                    <DeleteOutlined />
                  </button>
                </span>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        title: t.columns.poId,
        dataIndex: 'transaction_id',
        key: 'transaction_id',
        sorter: (a: PurchaseOrderTransaction, b: PurchaseOrderTransaction) =>
          (a.transaction_id || '').localeCompare(b.transaction_id || ''),
        width: 160,
        fixed: 'left' as const,
        ellipsis: true,
      },
      {
        title: t.columns.type,
        dataIndex: 'transaction_type',
        key: 'transaction_type',
        width: 80,
        render: (type: string) => (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              type === 'PO' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {type}
          </span>
        ),
      },
      {
        title: t.columns.supplier,
        dataIndex: 'supp_code',
        key: 'supp_code',
        sorter: (a: PurchaseOrderTransaction, b: PurchaseOrderTransaction) =>
          (a.supp_code || '').localeCompare(b.supp_code || ''),
        width: 280,
        ellipsis: true,
        render: (code: string, record: PurchaseOrderTransaction) => (
          <div>
            <div>
              <strong>{code}</strong>
            </div>
            {record.supplier_name && <div className="text-sm text-gray-600 truncate">{record.supplier_name}</div>}
            {record.supplier_phone && <div className="text-xs text-gray-500">📞 {record.supplier_phone}</div>}
          </div>
        ),
      },
      {
        title: t.columns.totalAmount,
        dataIndex: 'total_amount',
        key: 'total_amount',
        sorter: (a: PurchaseOrderTransaction, b: PurchaseOrderTransaction) => (a.total_amount || 0) - (b.total_amount || 0),
        width: 120,
        align: 'right' as const,
        render: (amount: number) => {
          const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
          return formatCurrency(numAmount);
        },
      },
      {
        title: t.columns.shop,
        dataIndex: 'shop_code',
        key: 'shop_code',
        width: 200,
        ellipsis: true,
        render: (code: string, record: PurchaseOrderTransaction) => (
          <div>
            <div>
              <strong>{code}</strong>
            </div>
            {record.shop_name && <div className="text-sm text-gray-600 truncate">{record.shop_name}</div>}
          </div>
        ),
      },
      {
        title: t.columns.reference,
        dataIndex: 'reference_no',
        key: 'reference_no',
        width: 160,
        ellipsis: true,
      },
      {
        title: t.columns.status,
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string, record: PurchaseOrderTransaction) => {
          const row = t.rowStatus as Record<string, string>;
          const effective =
            status === 'Void' ? 'Void' : Number(record.is_settle) === 1 ? 'Settled' : status;
          const label = row[effective] ?? effective;
          return (
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                effective === 'Void' ? 'bg-red-100 text-red-800' :
                effective === 'Settled' ? 'bg-green-100 text-green-800' :
                effective === 'Converted' ? 'bg-blue-100 text-blue-800' :
                effective === 'Active' ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-800'
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
        width: 180,
        render: (date: string) =>
          date ? formatDisplayDateTime(date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB') : t.detailLabels.na,
      },
    ],
    [router, t, lang, can, handleClonePo, cloningId, handleDeletePo]
  );

  const [showFilters, setShowFilters] = useState(false);

  const handleRefresh = () => fetchTransactions(pagination.current, pagination.pageSize);

  const ButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {can('create_po') && (
        <Button type="primary" icon={<PlusOutlined />} onClick={handleModalOpen}>
          {t.listPage.generate}
        </Button>
      )}
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
            { label: t.breadcrumb.purchasing, href: '/purchasing' },
            { label: t.breadcrumb.purchaseOrders, current: true },
          ]}
        />
      }
      buttonBar={ButtonBar}
      title={t.listPage.title}
      description={t.listPage.description}
    >
      {!can('view_po') ? (
        <div className="px-8 py-6 text-gray-600">{t.listPage.noPermission}</div>
      ) : (
      <Spin spinning={loading}>
      <div className="px-8 py-6 bg-white w-full max-w-full overflow-x-auto">
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-900">{t.listPage.filterOptions}</h4>
              <span className="text-sm text-blue-600">
                {t.listPage.showingCount(transactions.length, pagination.total)}
              </span>
            </div>
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
                  <Button type="primary" onClick={() => { fetchTransactions(1, pagination.pageSize); message.success(t.listPage.filterApplied); }}>
                    {t.listPage.applyFilter}
                  </Button>
                  <Button
                    onClick={() => {
                      setDateRange([null, null]);
                      setSearchText('');
                      setPagination((prev) => ({ ...prev, current: 1 }));
                      fetchTransactions(1, pagination.pageSize);
                      message.success(t.listPage.filtersCleared);
                    }}
                  >
                    {t.listPage.clearFilter}
                  </Button>
                </Space>
              </div>
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
                  <Button type="primary" onClick={handleSearch}>
                    {t.listPage.search}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p>{t.listPage.noData}</p>
            {searchText && <p>{t.listPage.adjustSearch}</p>}
            {pagination.total > 0 && searchText && (
              <p className="mt-2">
                <Button
                  type="link"
                  onClick={() => {
                    setSearchText('');
                    setPagination((prev) => ({ ...prev, current: 1 }));
                    fetchTransactions(1, pagination.pageSize);
                  }}
                >
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
                  setPagination((prev) => ({ ...prev, current: page, pageSize: pageSize || 20 }));
                  fetchTransactions(page, pageSize || 20);
                },
                onShowSizeChange: (current, size) => {
                  setPagination((prev) => ({ ...prev, current: 1, pageSize: size }));
                  fetchTransactions(1, size);
                },
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
      )}

      <Modal
        title={t.generateModal.title}
        open={showGenerateModal}
        onCancel={() => {}}
        closable={false}
        maskClosable={false}
        footer={[
          <Button key="discard" danger onClick={handleDiscardTransaction} disabled={!transactionSession}>
            {t.generateModal.discard}
          </Button>,
          <Button key="create" type="primary" onClick={handleCommitTransaction} disabled={!transactionSession}>
            {t.generateModal.createPo}
          </Button>,
        ]}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="po_number" rules={[{ required: true, message: t.generateModal.requiredGenerate }]}>
            <Input
              placeholder={isGenerating ? t.generateModal.generatingPlaceholder : t.generateModal.generatedPlaceholder}
              disabled
              style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
            />
          </Form.Item>
          {isGenerating && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <span className="text-yellow-600 font-medium">{t.generateModal.generating}</span>
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
