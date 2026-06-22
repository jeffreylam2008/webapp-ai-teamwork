'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Card, Col, Row, Spin, Table, Typography } from 'antd';
import { ArrowLeftOutlined, CloseCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getInvoiceTexts } from '@/app/sales/invoices/i18n';
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
import { isMonthlyInvoiceSubtype, normalizeInvoiceSubtype } from '@/config/invoiceSubtypes';
import {
  getInvoiceModuleConfig,
  invoicePrintPath,
  type InvoiceModuleMode,
} from '@/features/invoices/invoiceModule';

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
  invoice_subtype?: string;
  billing_period_from?: string;
  billing_period_to?: string;
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

export default function InvoiceDetailPageContent({ mode }: { mode: InvoiceModuleMode }) {
  const config = getInvoiceModuleConfig(mode);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getInvoiceTexts(lang), [lang]);
  const { token } = useAuth();
  const { can } = usePermissions();
  const { modal, message: messageApi } = App.useApp();

  const transCode = String((params?.transCode as string | undefined) || '').trim();

  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<HeaderRow | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const load = useCallback(async () => {
    if (!transCode) {
      setError(t.detailPage.notFoundDetail || 'Missing invoice code');
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
        throw new Error(json.error || t.fetchErrors?.loadFailed || 'Failed to load invoice');
      }
      setHeader(json.header ?? null);
      setDetails(Array.isArray(json.details) ? json.details : []);
      setPayments(Array.isArray(json.paymentTotals) ? json.paymentTotals : []);
    } catch (e) {
      setHeader(null);
      setDetails([]);
      setPayments([]);
      setError(e instanceof Error ? e.message : (t.fetchErrors?.loadError ?? 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [t, token, transCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVoidInvoice = useCallback(() => {
    if (!transCode || !header || header.is_void === 1 || header.is_settle === 1) return;
    modal.confirm({
      title: t.detailPage.voidConfirmTitle,
      content: t.detailPage.voidConfirmBody,
      okText: t.detailPage.voidOk,
      okButtonProps: { danger: true },
      cancelText: t.detailPage.voidCancel,
      onOk: async () => {
        setVoiding(true);
        try {
          const res = await fetchWithAuth('/api/transactions/void-invoice', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transCode }),
          });
          const json = (await res.json()) as { success?: boolean; error?: string; message?: string };
          if (!res.ok || !json.success) {
            throw new Error(json.error || t.detailPage.voidFailed);
          }
          messageApi.success(json.message || t.detailPage.voidSuccess);
          await load();
        } catch (e) {
          messageApi.error(e instanceof Error ? e.message : t.detailPage.voidFailed);
        } finally {
          setVoiding(false);
        }
      },
    });
  }, [header, load, modal, messageApi, t, token, transCode]);

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

  const invoiceStatus = useMemo(() => {
    if (!header) return { key: 'Active' as const, label: t.statusTags.active };
    const key = getTransactionDetailStatusKey(header);
    const map: Record<string, string> = {
      Void: t.statusTags.void,
      Settled: t.statusTags.settled,
      Converted: t.statusTags.converted,
      Active: t.statusTags.active,
    };
    return { key, label: map[key] ?? key };
  }, [header, t]);

  const pageTitle =
    typeof t.detailPage.title === 'function'
      ? t.detailPage.title(transCode)
      : `${t.detailPage.titleStatic ?? 'Invoice'}: ${transCode}`;

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: t.breadcrumb.home, href: '/' },
        { label: t.breadcrumb.sales, href: '/sales' },
        { label: t.breadcrumb[config.breadcrumbKey], href: config.basePath },
        { label: transCode || t.detailPage.titleStatic, current: true },
      ]}
    />
  );

  const buttonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(config.basePath)}>
        {t.detailPage.back}
      </Button>
      <Button
        icon={<PrinterOutlined />}
        onClick={() => {
          if (!transCode) return;
          window.open(
            invoicePrintPath(config, transCode),
            '_blank',
            'width=820,height=900,scrollbars=yes'
          );
        }}
      >
        {t.detailPage.print}
      </Button>
      <Button onClick={() => void load()} disabled={loading}>
        {t.detailPage.refresh}
      </Button>
      {header && header.is_void !== 1 && header.is_settle !== 1 && can('void_invoice') && (
        <Button
          danger
          type="primary"
          ghost
          icon={<CloseCircleOutlined />}
          loading={voiding}
          disabled={loading || voiding}
          onClick={() => handleVoidInvoice()}
        >
          {t.detailPage.voidInvoice}
        </Button>
      )}
    </div>
  );

  return (
    <BasicPageLayout breadcrumb={breadcrumb} buttonBar={buttonBar} title={pageTitle} description={t.detailPage.description}>
      <div className="px-8 py-6 bg-white">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : error ? (
          <Alert
            type="error"
            showIcon
            message={t.detailPage.error}
            description={error}
            action={
              <Button type="primary" onClick={() => void load()}>
                {t.detailPage.retry}
              </Button>
            }
          />
        ) : !header ? (
          <Alert type="warning" showIcon message={t.detailPage.notFound} description={t.detailPage.notFoundDetail} />
        ) : (
          <>
            <Row gutter={[24, 24]} className="mb-6">
              <Col xs={24} lg={12}>
                <TransactionDetailInfoCard title={t.detailPage.transactionInformation}>
                  <TransactionDetailBorderedDescriptions>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.transCode}>
                      <Text strong>{String(header.trans_code || transCode)}</Text>
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.prefix}>
                      {String(header.prefix || 'INV')}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.invoiceSubtype}>
                      {normalizeInvoiceSubtype(header.invoice_subtype) === 'monthly'
                        ? t.invoiceSubtype.monthly
                        : t.invoiceSubtype.standard}
                    </TransactionDetailBorderedDescriptions.Item>
                    {isMonthlyInvoiceSubtype(header.invoice_subtype) && (
                      <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.billingPeriod}>
                        {header.billing_period_from
                          ? formatDisplayDateTime(header.billing_period_from, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB').slice(0, 10)
                          : '-'}
                        {' – '}
                        {header.billing_period_to
                          ? formatDisplayDateTime(header.billing_period_to, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB').slice(0, 10)
                          : '-'}
                      </TransactionDetailBorderedDescriptions.Item>
                    )}
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.referenceCode}>
                      {transactionDetailReferenceLink(header.refer_code as string | undefined)}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.quotationCode}>
                      {String(header.quotation_code || '').trim()
                        ? transactionDetailReferenceLink(String(header.quotation_code))
                        : '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.status}>
                      <span className={transactionDetailStatusBadgeClassName(invoiceStatus.key)}>{invoiceStatus.label}</span>
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.totalAmount}>
                      <Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                        {formatCurrency(total)}
                      </Text>
                    </TransactionDetailBorderedDescriptions.Item>
                  </TransactionDetailBorderedDescriptions>
                </TransactionDetailInfoCard>
              </Col>
              <Col xs={24} lg={12}>
                <TransactionDetailInfoCard title={t.detailPage.shopEmployeeInformation}>
                  <TransactionDetailBorderedDescriptions>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.customer}>
                      {String(header.cust_code || '')}{' '}
                      {header.customer_name ? `- ${String(header.customer_name)}` : ''}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.shop}>
                      {String(header.shop_code || '')}{' '}
                      {header.shop_name ? `- ${String(header.shop_name)}` : ''}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.paymentMethod}>
                      {String(header.payment_method || '') || t.detailLabels.na}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.dateCreated}>
                      {header.create_date
                        ? formatDisplayDateTime(header.create_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                        : '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                    <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.remarks}>
                      {String(header.remark || '') || '-'}
                    </TransactionDetailBorderedDescriptions.Item>
                  </TransactionDetailBorderedDescriptions>
                </TransactionDetailInfoCard>
              </Col>
            </Row>

            <Card title={t.detailPage.lineItems} size="small" className="mb-6">
              <Table<DetailRow>
                dataSource={details}
                rowKey={(r) => String(r.uid ?? r.item_code ?? Math.random())}
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
                columns={[
                  { title: t.detailLabels.itemCode, dataIndex: 'item_code', key: 'item_code', width: 140 },
                  {
                    title: t.detailLabels.description,
                    key: 'desc',
                    render: (_: unknown, r: DetailRow) => [r.eng_name, r.chi_name].filter(Boolean).join(' / ') || '-',
                    width: 260,
                  },
                  { title: t.detailLabels.quantity, dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
                  { title: t.detailLabels.unit, dataIndex: 'unit', key: 'unit', width: 80 },
                  {
                    title: t.detailLabels.unitPrice,
                    dataIndex: 'price',
                    key: 'price',
                    width: 100,
                    align: 'right',
                    render: (v: unknown) => formatCurrency(n(v)),
                  },
                  {
                    title: t.detailLabels.discount,
                    dataIndex: 'discount',
                    key: 'discount',
                    width: 90,
                    align: 'right',
                    render: (v: unknown) => `${n(v).toFixed(0)}%`,
                  },
                  {
                    title: t.detailLabels.lineTotal,
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
              <Card title={t.detailPage.paymentInformation} size="small">
                <Table<PaymentRow>
                  dataSource={payments}
                  rowKey={(r) => String(r.uid ?? r.pm_code ?? Math.random())}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: t.detailLabels.paymentCode, dataIndex: 'pm_code', key: 'pm_code', width: 120 },
                    { title: t.detailLabels.paymentMethod, dataIndex: 'payment_method', key: 'payment_method' },
                    {
                      title: t.detailLabels.amount,
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
