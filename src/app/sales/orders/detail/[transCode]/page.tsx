'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Card, Col, Row, Spin, Table, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import {
  createInvoiceFromSalesOrder,
} from '@/lib/createInvoiceFromSalesOrder';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesOrderTexts } from '../../i18n';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDisplayDateTime } from '@/lib/datetime';
import {
  getTransactionDetailStatusKey,
  transactionDetailReferenceLink,
  transactionDetailStatusBadgeClassName,
  TransactionDetailBorderedDescriptions,
  TransactionDetailInfoCard,
} from '@/components/transactionDetailInfo';
import { formatCurrency } from '@/utils/formatCurrency';

const { Text } = Typography;

type HeaderRow = Record<string, unknown> & {
  trans_code?: string;
  prefix?: string;
  cust_code?: string;
  customer_name?: string;
  shop_code?: string;
  shop_name?: string;
  refer_code?: string;
  quotation_code?: string;
  total?: number | string;
  remark?: string;
  create_date?: string;
  modify_date?: string;
  is_void?: number;
  is_settle?: number;
  is_convert?: number;
};

type DetailRow = Record<string, unknown> & {
  uid?: number;
  item_code?: string;
  eng_name?: string;
  chi_name?: string;
  qty?: number;
  unit?: string;
  price?: number;
  discount?: number;
};

type PaymentRow = Record<string, unknown> & {
  uid?: number;
  pm_code?: string;
  payment_method?: string;
  payment_amount?: number;
  total?: number;
};

type ApiResponse = {
  success: boolean;
  header?: HeaderRow;
  details?: DetailRow[];
  paymentTotals?: PaymentRow[];
  error?: string;
};

function n(v: unknown): number {
  const num = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

export default function SalesOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSalesOrderTexts(lang), [lang]);
  const { token } = useAuth();
  const { can } = usePermissions();
  const { modal, message: messageApi } = App.useApp();

  const transCode = String((params?.transCode as string | undefined) || '').trim();

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<HeaderRow | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const load = useCallback(async () => {
    if (!transCode) {
      setError(t?.detailPage?.missingTransCode ?? 'Missing transaction code');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(transCode)}`, token, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || t?.detailPage?.failedToLoad || 'Failed to load sales order');
      }
      setHeader(json.header ?? null);
      setDetails(Array.isArray(json.details) ? json.details : []);
      setPayments(Array.isArray(json.paymentTotals) ? json.paymentTotals : []);
    } catch (e) {
      setHeader(null);
      setDetails([]);
      setPayments([]);
      setError(e instanceof Error ? e.message : 'Failed to load sales order');
    } finally {
      setLoading(false);
    }
  }, [t, token, transCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirmSalesOrder = useCallback(() => {
    if (!transCode || !header || header.is_void === 1 || header.is_settle === 1) return;
    const confirmContent =
      typeof t?.prompts?.confirmContent === 'function'
        ? t.prompts.confirmContent(transCode)
        : String(t?.prompts?.confirmContent ?? '');

    modal.confirm({
      title: t?.prompts?.confirmTitle ?? 'Confirm sales order?',
      icon: <ExclamationCircleOutlined />,
      content: confirmContent,
      okText: t?.prompts?.confirmOk ?? 'Confirm order',
      cancelText: t?.prompts?.confirmCancel ?? 'Cancel',
      okButtonProps: { type: 'primary' },
      maskClosable: false,
      onOk: async () => {
        setConfirming(true);
        try {
          const res = await fetchWithAuth('/api/transactions/confirm-sales-order', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transCode }),
          });
          const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
          if (!res.ok || !json.success) {
            throw new Error(json.error || t?.prompts?.confirmFailed || 'Failed to confirm sales order');
          }
          messageApi.success(json.message || t?.prompts?.orderConfirmed || 'Sales order confirmed');
          await load();
        } catch (e) {
          messageApi.error(e instanceof Error ? e.message : (t?.prompts?.confirmFailed ?? 'Failed to confirm sales order'));
        } finally {
          setConfirming(false);
        }
      },
    });
  }, [header, load, modal, messageApi, t, token, transCode]);

  const handleVoidSalesOrder = useCallback(() => {
    if (!transCode || !header || header.is_void === 1 || header.is_settle === 1) return;
    const hasQta = !!(header.quotation_code && String(header.quotation_code).trim());
    modal.confirm({
      title: t?.detailPage?.voidConfirmTitle ?? 'Void this sales order?',
      content: hasQta
        ? (t?.detailPage?.voidConfirmWithQuotation ??
          'The order will be voided. If it was converted from a quotation, the quotation will be unlocked for conversion again.')
        : (t?.detailPage?.voidConfirmBody ??
          'This order will be marked void and cannot be used for fulfilment.'),
      okText: t?.detailPage?.voidOk ?? 'Void order',
      okButtonProps: { danger: true },
      cancelText: t?.detailPage?.voidCancel ?? 'Cancel',
      onOk: async () => {
        setVoiding(true);
        try {
          const res = await fetchWithAuth('/api/transactions/void-sales-order', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transCode }),
          });
          const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
          if (!res.ok || !json.success) {
            throw new Error(json.error || t?.detailPage?.voidFailed || 'Failed to void sales order');
          }
          messageApi.success(json.message || t?.detailPage?.voidSuccess || 'Sales order voided');
          await load();
        } catch (e) {
          messageApi.error(e instanceof Error ? e.message : (t?.detailPage?.voidFailed ?? 'Failed to void sales order'));
        } finally {
          setVoiding(false);
        }
      },
    });
  }, [header, load, modal, messageApi, t, token, transCode]);

  const handleCreateInvoice = useCallback(async () => {
    if (!transCode || !header || header.is_void === 1 || header.is_settle !== 1) return;
    if (!can('create_invoice')) return;
    setCreatingInvoice(true);
    messageApi.loading({
      content: t?.prompts?.createInvoiceStarted ?? 'Preparing invoice from sales order…',
      key: 'createInvoiceFromSo',
      duration: 0,
    });
    try {
      const newCode = await createInvoiceFromSalesOrder({
        salesOrderCode: transCode,
        token,
      });
      messageApi.destroy('createInvoiceFromSo');
      router.push(`/sales/invoices/create/${encodeURIComponent(newCode)}`);
    } catch (e) {
      messageApi.destroy('createInvoiceFromSo');
      const msg =
        e instanceof Error
          ? e.message
          : (t?.prompts?.createInvoiceFailed ?? 'Failed to create invoice from sales order');
      messageApi.error(msg);
    } finally {
      setCreatingInvoice(false);
    }
  }, [can, header, messageApi, router, t, token, transCode]);

  const total = useMemo(() => {
    const headerTotal = n(header?.total);
    if (headerTotal > 0) return headerTotal;
    return details.reduce((sum, d) => {
      const qty = n(d.qty);
      const price = n(d.price);
      const discount = n(d.discount) / 100;
      const subtotal = qty * price;
      return sum + (subtotal - subtotal * discount);
    }, 0);
  }, [details, header?.total]);

  const orderStatus = useMemo(() => {
    if (!header) return { key: 'Active' as const, label: 'Active' };
    const key = getTransactionDetailStatusKey(header);
    const rowMap = (t?.detailPage?.statusText ?? {}) as Record<string, string>;
    return { key, label: rowMap[key] ?? key };
  }, [header, t]);

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: t?.breadcrumb?.home ?? 'Home', href: '/' },
        { label: t?.breadcrumb?.sales ?? 'Sales', href: '/sales' },
        { label: t?.breadcrumb?.salesOrders ?? 'Sales Orders', href: '/sales/orders' },
        { label: transCode || 'Detail', current: true },
      ]}
    />
  );

  const buttonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/sales/orders')}>
        {t?.detailPage?.back ?? 'Back'}
      </Button>
      <Button
        icon={<PrinterOutlined />}
        onClick={() => {
          if (!transCode) return;
          window.open(
            `/sales/orders/print/${encodeURIComponent(transCode)}`,
            '_blank',
            'width=820,height=900,scrollbars=yes'
          );
        }}
      >
        {t?.detailPage?.print ?? 'Print'}
      </Button>
      <Button onClick={() => void load()} disabled={loading}>
        {t?.detailPage?.refresh ?? 'Refresh'}
      </Button>
      {header && header.is_void !== 1 && header.is_settle !== 1 && can('edit_sales_order') && (
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={confirming}
          disabled={loading || confirming || voiding || creatingInvoice}
          onClick={() => handleConfirmSalesOrder()}
        >
          {t?.actions?.confirmOrder ?? 'Confirm order'}
        </Button>
      )}
      {header && header.is_void !== 1 && header.is_settle !== 1 && can('void_sales_order') && (
        <Button
          danger
          type="primary"
          ghost
          icon={<CloseCircleOutlined />}
          loading={voiding}
          disabled={loading || confirming || voiding}
          onClick={() => handleVoidSalesOrder()}
        >
          {t?.detailPage?.voidOrder ?? 'Void order'}
        </Button>
      )}
      {header && header.is_void !== 1 && header.is_settle === 1 && can('create_invoice') && (
        <Button
          type="primary"
          icon={<FileAddOutlined />}
          loading={creatingInvoice}
          disabled={loading || confirming || voiding || creatingInvoice}
          onClick={() => void handleCreateInvoice()}
        >
          {t?.detailPage?.createInvoice ?? 'Create Invoice'}
        </Button>
      )}
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={breadcrumb}
      buttonBar={buttonBar}
      title={`${t?.detailPage?.title ?? 'Sales Order'}: ${transCode}`}
      description=""
    >
      <div className="px-8 py-6 bg-white">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : error ? (
          <Alert
            type="error"
            showIcon
            message={t?.detailPage?.failedToLoad ?? 'Failed to load'}
            description={error}
            action={
              <Button type="primary" onClick={() => void load()}>
                {t?.detailPage?.retry ?? 'Retry'}
              </Button>
            }
          />
        ) : !header ? (
          <Alert
            type="warning"
            showIcon
            message={t?.detailPage?.notFound ?? 'Not found'}
            description={t?.detailPage?.notFoundDesc ?? 'Sales order not found.'}
          />
        ) : (
          <>
            <Row gutter={[24, 24]} className="mb-6">
              <Col xs={24} lg={12}>
                <TransactionDetailInfoCard title={t?.detailPage?.sections?.orderInfo ?? 'Order Information'}>
                  <TransactionDetailBorderedDescriptions>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.transCode ?? 'Transaction no.'}>
                      <Text strong>{String(header.trans_code || transCode)}</Text>
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.prefix ?? 'Prefix'}>
                      {String(header.prefix || 'SO')}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.reference ?? 'Reference'}>
                      {transactionDetailReferenceLink(header.refer_code as string | undefined)}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.quotation ?? 'Quotation'}>
                      {String(header.quotation_code || '').trim()
                        ? transactionDetailReferenceLink(String(header.quotation_code))
                        : '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.status ?? 'Status'}>
                      <span className={transactionDetailStatusBadgeClassName(orderStatus.key)}>{orderStatus.label}</span>
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.total ?? 'Total'}>
                      <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                        {formatCurrency(total)}
                      </Text>
                    </TransactionDetailBorderedDescriptions.Item>
                  </TransactionDetailBorderedDescriptions>
                </TransactionDetailInfoCard>
              </Col>
              <Col xs={24} lg={12}>
                <TransactionDetailInfoCard title={t?.detailPage?.sections?.partyInfo ?? 'Customer & dates'}>
                  <TransactionDetailBorderedDescriptions>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.customer ?? 'Customer'}>
                      {String(header.cust_code || '')}{' '}
                      {header.customer_name ? `- ${String(header.customer_name)}` : ''}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.shop ?? 'Shop'}>
                      {String(header.shop_code || '')}{' '}
                      {header.shop_name ? `- ${String(header.shop_name)}` : ''}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.created ?? 'Created'}>
                      {header.create_date
                        ? formatDisplayDateTime(header.create_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                        : '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t?.detailPage?.labels?.remarks ?? 'Remarks'}>
                      {String(header.remark || '') || '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                  </TransactionDetailBorderedDescriptions>
                </TransactionDetailInfoCard>
              </Col>
            </Row>

            <Card title={t?.detailPage?.sections?.lineItems ?? 'Line Items'} size="small" className="mb-6">
              <Table<DetailRow>
                dataSource={details}
                rowKey={(r) => String(r.uid ?? r.item_code ?? Math.random())}
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
                columns={[
                  { title: t?.detailPage?.table?.item ?? 'Item', dataIndex: 'item_code', key: 'item_code', width: 140 },
                  {
                    title: t?.detailPage?.table?.description ?? 'Description',
                    key: 'desc',
                    render: (_: unknown, r: DetailRow) => [r.eng_name, r.chi_name].filter(Boolean).join(' / ') || '-',
                    width: 260,
                  },
                  { title: t?.detailPage?.table?.qty ?? 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
                  { title: t?.detailPage?.table?.unit ?? 'Unit', dataIndex: 'unit', key: 'unit', width: 80 },
                  {
                    title: t?.detailPage?.table?.price ?? 'Price',
                    dataIndex: 'price',
                    key: 'price',
                    width: 100,
                    align: 'right',
                    render: (v: unknown) => formatCurrency(n(v)),
                  },
                  {
                    title: t?.detailPage?.table?.discount ?? 'Disc %',
                    dataIndex: 'discount',
                    key: 'discount',
                    width: 90,
                    align: 'right',
                    render: (v: unknown) => `${n(v).toFixed(0)}%`,
                  },
                  {
                    title: t?.detailPage?.table?.amount ?? 'Amount',
                    key: 'amount',
                    width: 120,
                    align: 'right',
                    render: (_: unknown, r: DetailRow) => {
                      const qty = n(r.qty);
                      const price = n(r.price);
                      const discount = n(r.discount) / 100;
                      const subtotal = qty * price;
                      return formatCurrency(subtotal - subtotal * discount);
                    },
                  },
                ]}
              />
            </Card>

            {payments.length > 0 && (
              <Card title={t?.detailPage?.sections?.payments ?? 'Payments'} size="small">
                <Table<PaymentRow>
                  dataSource={payments}
                  rowKey={(r) => String(r.uid ?? r.pm_code ?? Math.random())}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: t?.detailPage?.table?.pmCode ?? 'PM Code', dataIndex: 'pm_code', key: 'pm_code', width: 120 },
                    { title: t?.detailPage?.table?.method ?? 'Method', dataIndex: 'payment_method', key: 'payment_method' },
                    {
                      title: t?.detailPage?.table?.amount ?? 'Amount',
                      key: 'amount',
                      width: 140,
                      align: 'right',
                      render: (_: unknown, r: PaymentRow) => formatCurrency(n(r.payment_amount ?? r.total)),
                    },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </BasicPageLayout>
  );
}

