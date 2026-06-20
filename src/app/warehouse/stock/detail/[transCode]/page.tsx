'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, Space, Typography, Row, Col, Alert, Button, Spin, Table, Modal, App } from 'antd';
import { ArrowLeftOutlined, CloseCircleOutlined, EditOutlined, PrinterOutlined } from '@ant-design/icons';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getStockTransactionTexts } from '../../i18n';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';
import { buildWarehouseStockPrefixList } from '@/config/transactionPermissions';
import {
  getTransactionDetailStatusKey,
  transactionDetailReferenceLink,
  transactionDetailStatusBadgeClassName,
  TransactionDetailBorderedDescriptions,
  TransactionDetailInfoCard,
} from '@/components/transactionDetailInfo';
import { formatCurrency } from '@/utils/formatCurrency';

const { Text } = Typography;

interface TransactionHeader {
  uid: number;
  trans_code: string;
  cust_code?: string;
  supp_code?: string;
  quotation_code?: string;
  refer_code?: string;
  prefix?: string;
  total?: number;
  employee_code?: string;
  shop_code?: string;
  remark?: string;
  is_void?: number;
  is_convert?: number;
  is_settle?: number;
  create_date?: string;
  modify_date?: string;
}

interface TransactionDetail {
  uid: number;
  trans_code: string;
  item_code: string;
  eng_name: string;
  chi_name?: string;
  qty: string;
  pstock?: number;
  unit?: string;
  price?: number;
  discount?: string;
  create_date?: string;
  modify_date?: string;
}

type DetailTexts = ReturnType<typeof getStockTransactionTexts>['detail'];

interface FunctionBarProps {
  currentIndex: number;
  transactionList: string[];
  handleNavigate: (index: number) => void;
  router: { push: (path: string) => void };
  transCode?: string;
  prefix?: string;
  isVoid?: boolean;
  showEditStocktake?: boolean;
  showEditAdjustment?: boolean;
  showVoidGrn?: boolean;
  onVoidGrn?: () => void;
  voiding?: boolean;
  onBackToStock: () => void;
  showPrint?: boolean;
  onPrint?: () => void;
  t: DetailTexts;
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  currentIndex,
  transactionList,
  handleNavigate,
  router,
  transCode,
  prefix,
  isVoid,
  showEditStocktake,
  showEditAdjustment,
  showVoidGrn,
  onVoidGrn,
  voiding,
  onBackToStock,
  showPrint,
  onPrint,
  t,
}) => (
  <div className="px-8 py-4 bg-white border-b border-gray-200 mb-4">
    <Space size="middle">
      <Button type="default" icon={<ArrowLeftOutlined />} onClick={onBackToStock}>
        {t.backToStock}
      </Button>
      {showPrint && transCode && onPrint && (
        <Button icon={<PrinterOutlined />} onClick={onPrint}>
          {t.print}
        </Button>
      )}
      {showEditStocktake && prefix === 'ST' && transCode && !isVoid && (
        <Button
          type="primary"
          icon={<EditOutlined />}
          onClick={() =>
            router.push(`/warehouse/stocktake?transCode=${encodeURIComponent(transCode)}`)
          }
        >
          {t.editStocktake}
        </Button>
      )}
      {showEditAdjustment && prefix === 'ADJ' && transCode && !isVoid && (
        <Button
          type="primary"
          icon={<EditOutlined />}
          onClick={() =>
            router.push(`/warehouse/adjustment?transCode=${encodeURIComponent(transCode)}`)
          }
        >
          {t.editAdjustment}
        </Button>
      )}
      {transCode && showVoidGrn && onVoidGrn && (
        <Button danger icon={<CloseCircleOutlined />} onClick={onVoidGrn} loading={voiding}>
          {t.void}
        </Button>
      )}
      <Space size="small">
        <Button type="default" disabled={currentIndex <= 0} onClick={() => handleNavigate(currentIndex - 1)}>
          {t.previous}
        </Button>
        <Button
          type="default"
          disabled={currentIndex === -1 || currentIndex >= transactionList.length - 1}
          onClick={() => handleNavigate(currentIndex + 1)}
        >
          {t.next}
        </Button>
      </Space>
    </Space>
  </div>
);

function transactionKindFromPrefix(prefix: string | undefined, t: DetailTexts) {
  if (prefix === 'ADJ') return t.kindAdjustment;
  if (prefix === 'ST') return t.kindStocktake;
  return t.kindGrn;
}

function TransactionDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getStockTransactionTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const { token } = useAuth();
  const { can } = usePermissions();
  const allowedStockPrefixes = useMemo(() => buildWarehouseStockPrefixList(can), [can]);

  const transCode = params.transCode as string;
  const goBackToStock = useBackNavigation(() => router.push('/warehouse/stock'));
  const [modal, contextHolder] = Modal.useModal();

  const [header, setHeader] = useState<TransactionHeader | null>(null);
  const [details, setDetails] = useState<TransactionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionList, setTransactionList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [voiding, setVoiding] = useState(false);

  const fetchTransactionHeader = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(transCode)}`, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
          signal,
        });

        const result = await response.json();

        if (result.success && result.header) {
          setHeader(result.header);
          setDetails(result.details || []);
          setError(null);
        } else {
          setError(result.error || t.detail.notFoundDescription);
        }
        setLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : t.detail.fetchError);
        setLoading(false);
      }
    },
    [transCode, t.detail.notFoundDescription, t.detail.fetchError, token]
  );

  const fetchTransactionList = useCallback(async (signal?: AbortSignal) => {
    try {
      const prefixParam = allowedStockPrefixes || 'GRN';
      const response = await fetchWithAuth(
        `/api/transactions?prefix=${encodeURIComponent(prefixParam)}`,
        token,
        {
          cache: 'no-store',
          signal,
        }
      );
      const result = await response.json();
      if (result.success) {
        const codes = result.data.map((row: { transaction_id: string }) => row.transaction_id);
        setTransactionList(codes);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Error fetching transaction list:', err);
    }
  }, [token, allowedStockPrefixes]);

  useEffect(() => {
    if (transactionList.length > 0 && transCode) {
      setCurrentIndex(transactionList.findIndex((code) => code === transCode));
    }
  }, [transactionList, transCode]);

  useEffect(() => {
    setHeader(null);
    setLoading(true);
  }, [transCode]);

  useEffect(() => {
    const ac = new AbortController();
    void fetchTransactionList(ac.signal);
    return () => ac.abort();
  }, [fetchTransactionList]);

  useEffect(() => {
    if (!transCode) return;
    const ac = new AbortController();
    void fetchTransactionHeader(ac.signal);
    return () => ac.abort();
  }, [transCode, fetchTransactionHeader]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '-';
    return formatCurrency(price);
  };

  const getStatusKey = (h: TransactionHeader) => getTransactionDetailStatusKey(h);

  const statusDisplay = (key: string) => (t.rowStatus as Record<string, string>)[key] ?? key;

  const handleVoidGRN = () => {
    if (
      !header?.trans_code ||
      (header.prefix !== 'GRN' && header.prefix !== 'ADJ' && header.prefix !== 'ST') ||
      header.is_void === 1
    )
      return;
    const prefix = header.prefix as string;
    const kind = transactionKindFromPrefix(prefix, t.detail);
    modal.confirm({
      title: t.detail.voidTitle(kind),
      content: (
        <>
          <p>{t.detail.voidConfirmLine(kind, header.trans_code)}</p>
          {(prefix === 'ADJ' || prefix === 'ST') && <p>{t.detail.voidAdjStkHint}</p>}
          {prefix === 'GRN' && <p>{t.detail.voidGrnHint}</p>}
          <p>
            <strong>{t.detail.voidCannotUndo}</strong>
          </p>
        </>
      ),
      okText: t.detail.voidOk,
      okType: 'danger',
      cancelText: t.detail.voidCancel,
      onOk: async () => {
        setVoiding(true);
        try {
          const response =
            prefix === 'ST'
              ? await fetchWithAuth('/api/transactions/delete-stocktake', token, {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ transCode: header.trans_code }),
                })
              : await fetchWithAuth('/api/transactions/update', token, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    transCode: header.trans_code,
                    headerData: { prefix, is_void: 1 },
                  }),
                });
          const result = await response.json();
          if (!result.success) throw new Error(result.error || t.detail.voidTitle(kind));
          messageApi.success(
            prefix === 'ADJ'
              ? t.detail.voidSuccessAdj
              : prefix === 'ST'
                ? t.detail.voidSuccessStk
                : t.detail.voidSuccessGrn
          );
          if (prefix === 'ST') {
            router.push('/warehouse/stock');
          } else {
            void fetchTransactionHeader();
          }
        } catch (err) {
          messageApi.error(err instanceof Error ? err.message : t.detail.voidTitle(kind));
        } finally {
          setVoiding(false);
        }
      },
    });
  };

  const handleNavigate = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < transactionList.length) {
      setCurrentIndex(newIndex);
      router.replace(`/warehouse/stock/detail/${encodeURIComponent(transactionList[newIndex])}`);
    }
  };

  const hidePricingColumns = header?.prefix === 'GRN' || header?.prefix === 'DN';

  const detailColumns = useMemo(() => {
    const base: Parameters<typeof Table>[0]['columns'] = [
      { title: t.detail.colItemCode, dataIndex: 'item_code', key: 'item_code', width: 120 },
      { title: t.detail.colItemName, dataIndex: 'eng_name', key: 'eng_name', width: 200 },
      { title: t.detail.colChineseName, dataIndex: 'chi_name', key: 'chi_name', width: 150 },
      { title: t.detail.colQty, dataIndex: 'qty', key: 'qty', width: 100 },
      { title: t.detail.colUnit, dataIndex: 'unit', key: 'unit', width: 80 },
    ];
    if (!hidePricingColumns) {
      base.push(
        {
          title: t.detail.colUnitPrice,
          dataIndex: 'price',
          key: 'price',
          width: 120,
          render: (price: number) => formatPrice(price),
        },
        { title: t.detail.colDiscount, dataIndex: 'discount', key: 'discount', width: 100 }
      );
    }
    return base;
  }, [t.detail, hidePricingColumns]);

  if (loading) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.detail.breadcrumbHome, href: '/' },
              { label: t.detail.breadcrumbWarehouse, href: '/warehouse' },
              { label: t.detail.breadcrumbStock, href: '/warehouse/stock' },
              { label: t.detail.breadcrumbLoading, current: true },
            ]}
          />
        }
        buttonBar={null}
      >
        <div className="px-8 py-6 bg-gray-50">
          <div className="text-center py-8">
            <Spin size="large" />
            <p className="text-gray-600 mt-4">{t.detail.loadingMessage}</p>
          </div>
        </div>
      </BasicPageLayout>
    );
  }

  if (error || !header) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.detail.breadcrumbHome, href: '/' },
              { label: t.detail.breadcrumbWarehouse, href: '/warehouse' },
              { label: t.detail.breadcrumbStock, href: '/warehouse/stock' },
              { label: t.detail.breadcrumbError, current: true },
            ]}
          />
        }
        buttonBar={null}
      >
        <Alert
          message={t.detail.notFoundTitle}
          description={error || t.detail.notFoundDescription}
          type="error"
          showIcon
          action={
            <Button type="primary" onClick={goBackToStock}>
              {t.detail.backToStock}
            </Button>
          }
        />
      </BasicPageLayout>
    );
  }

  const statusKey = getStatusKey(header);
  const statusLabel = statusDisplay(statusKey);

  return (
    <>
      {contextHolder}
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.detail.breadcrumbHome, href: '/' },
              { label: t.detail.breadcrumbWarehouse, href: '/warehouse' },
              { label: t.detail.breadcrumbStock, href: '/warehouse/stock' },
              { label: header.trans_code || t.detail.fallbackTransaction, current: true },
            ]}
          />
        }
        buttonBar={
          <FunctionBar
            currentIndex={currentIndex}
            transactionList={transactionList}
            handleNavigate={handleNavigate}
            router={router}
            transCode={header.trans_code}
            prefix={header.prefix}
            isVoid={header.is_void === 1}
            showEditStocktake={
              header.prefix === 'ST' && header.is_void !== 1 && can('edit_stocktake')
            }
            showEditAdjustment={
              header.prefix === 'ADJ' && header.is_void !== 1 && can('edit_adjustment')
            }
            showVoidGrn={
              header.is_void !== 1 &&
              ((header.prefix === 'GRN' && can('void_grn')) ||
                (header.prefix === 'ADJ' && can('void_adjustment')) ||
                (header.prefix === 'ST' && can('void_stocktake')))
            }
            onVoidGrn={handleVoidGRN}
            voiding={voiding}
            onBackToStock={goBackToStock}
            showPrint={header.prefix === 'DN'}
            onPrint={() => {
              if (!header.trans_code) return;
              const langParam = lang ? `?lang=${encodeURIComponent(lang)}` : '';
              window.open(
                `/warehouse/stock/print/${encodeURIComponent(header.trans_code)}${langParam}`,
                '_blank',
                'width=820,height=900,scrollbars=yes'
              );
            }}
            t={t.detail}
          />
        }
        title={t.detail.titleTransaction(header.trans_code)}
        description={`${header.prefix || t.detail.fallbackTransaction} - ${statusLabel}`}
      >
        <div className="px-8 py-6 bg-white">
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
              <TransactionDetailInfoCard title={t.detail.cardTransactionInfo}>
                <TransactionDetailBorderedDescriptions>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelTransCode}>
                    <Text strong>{header.trans_code || '-'}</Text>
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelPrefix}>{header.prefix || '-'}</TransactionDetailBorderedDescriptions.Item>
                  {header.prefix !== 'GRN' && header.prefix !== 'DN' && (
                    <TransactionDetailBorderedDescriptions.Item label={t.detail.labelTotalAmount}>
                      <Text strong style={{ color: '#1890ff', fontSize: '16px' }}>
                        {formatPrice(header.total)}
                      </Text>
                    </TransactionDetailBorderedDescriptions.Item>
                  )}
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelReferenceCode}>
                    {transactionDetailReferenceLink(header.refer_code)}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelQuotationCode}>
                    {header.quotation_code || '-'}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelStatus}>
                    <span className={transactionDetailStatusBadgeClassName(statusKey)}>{statusLabel}</span>
                  </TransactionDetailBorderedDescriptions.Item>
                </TransactionDetailBorderedDescriptions>
              </TransactionDetailInfoCard>
            </Col>

            <Col xs={24} lg={12}>
              <TransactionDetailInfoCard title={t.detail.cardPartyInfo}>
                <TransactionDetailBorderedDescriptions>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelCustCode}>{header.cust_code || '-'}</TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelSuppCode}>{header.supp_code || '-'}</TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelShopCode}>{header.shop_code || '-'}</TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelEmpCode}>{header.employee_code || '-'}</TransactionDetailBorderedDescriptions.Item>
                </TransactionDetailBorderedDescriptions>
              </TransactionDetailInfoCard>
            </Col>

            <Col xs={24}>
              <Card title={t.detail.cardItems} size="small">
                {details.length > 0 ? (
                  <Table
                    columns={detailColumns}
                    dataSource={details}
                    rowKey="uid"
                    pagination={false}
                    size="small"
                    scroll={{ x: 800 }}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-2xl mb-2">📦</div>
                    <div>{t.detail.noItems}</div>
                  </div>
                )}
              </Card>
            </Col>

            {header.remark && (
              <Col xs={24}>
                <Card title={t.detail.cardRemarks} size="small">
                  <Text>{header.remark}</Text>
                </Card>
              </Col>
            )}

            <Col xs={24}>
              <TransactionDetailInfoCard title={t.detail.cardSystemInfo}>
                <TransactionDetailBorderedDescriptions>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelCreateDate}>
                    {formatDate(header.create_date)}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detail.labelModifyDate}>
                    {formatDate(header.modify_date)}
                  </TransactionDetailBorderedDescriptions.Item>
                </TransactionDetailBorderedDescriptions>
              </TransactionDetailInfoCard>
            </Col>
          </Row>
        </div>
      </BasicPageLayout>
    </>
  );
}

export default function TransactionDetailPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} buttonBar={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <TransactionDetailContent />
    </Suspense>
  );
}
