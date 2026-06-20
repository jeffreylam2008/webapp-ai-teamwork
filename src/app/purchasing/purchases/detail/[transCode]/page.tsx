'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getPurchaseOrderTexts } from '../../i18n';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { ArrowLeftOutlined, EditOutlined, PrinterOutlined, SaveOutlined, CloseOutlined, PlusOutlined, DeleteOutlined, SearchOutlined, ImportOutlined } from '@ant-design/icons';
import { Button, Table, Card, Row, Col, Tag, Spin, Alert, Form, Input, Select, InputNumber, message, Space, Modal, Typography } from 'antd';
import { usePermissions } from '@/hooks/usePermissions';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
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

interface TransactionHeader {
  uid: number;
  trans_code: string;
  cust_code: string;
  supp_code: string;
  quotation_code: string;
  refer_code: string;
  prefix: string;
  total: number;
  employee_code: string;
  shop_code: string;
  wh_code?: string;
  remark: string;
  is_void: number;
  is_convert: number;
  is_settle: number;
  create_date: string;
  modify_date: string;
  customer_name?: string;
  payment_method_code?: string;
  customer_phone?: string;
  customer_email?: string;
  shop_name?: string;
  shop_phone?: string;
  shop_address?: string;
  payment_method?: string;
  wh_name?: string;
}

interface TransactionDetail {
  uid: number;
  trans_code: string;
  item_code: string;
  eng_name: string;
  chi_name: string;
  qty: number;
  pstock: number;
  unit: string;
  price: number;
  discount: number;
  create_date: string;
  modify_date: string;
}

interface TransactionPaymentTotal {
  uid: number;
  trans_code: string;
  pm_code: string;
  payment_amount: number;
  payment_method: string;
  create_date: string;
  modify_date: string;
}

interface FormData {
  customers: Array<{ cust_code: string; name: string; phone_1: string; email_1: string }>;
  products: Array<{ item_code: string; eng_name: string; chi_name: string; unit: string; price: number }>;
  shops: Array<{ shop_code: string; name: string }>;
  employees: Array<{ employee_code: string; name: string }>;
  paymentMethods: Array<{ pm_code: string; payment_method: string }>;
  suppliers: Array<{ supp_code: string; name: string; phone_1: string; email_1: string }>;
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState<TransactionHeader | null>(null);
  const [details, setDetails] = useState<TransactionDetail[]>([]);
  const [paymentTotals, setPaymentTotals] = useState<TransactionPaymentTotal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingDetails, setEditingDetails] = useState<TransactionDetail[]>([]);
  const [editingPaymentTotals, setEditingPaymentTotals] = useState<TransactionPaymentTotal[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');
  const [relatedGRNs, setRelatedGRNs] = useState<Array<{ transaction_id: string }>>([]);
  const [receivedPerItem, setReceivedPerItem] = useState<Record<string, number>>({});
  const [poReceivedLoading, setPoReceivedLoading] = useState(true);
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ shop_code: string; name: string }>>([]);
  const [defaultWarehouseCode, setDefaultWarehouseCode] = useState<string>('');

  // Refs so handleSave always sends the latest editing state (avoids stale closure after async validateFields)
  const editingDetailsRef = useRef<TransactionDetail[]>(editingDetails);
  const editingPaymentTotalsRef = useRef<TransactionPaymentTotal[]>(editingPaymentTotals);
  useEffect(() => {
    editingDetailsRef.current = editingDetails;
    editingPaymentTotalsRef.current = editingPaymentTotals;
  }, [editingDetails, editingPaymentTotals]);

  const transCode = params?.transCode as string;
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getPurchaseOrderTexts(lang);
  const tRef = useRef(t);
  tRef.current = t;
  const { can } = usePermissions();
  const { token } = useAuth();
  const goBackToList = useBackNavigation(() => router.push('/purchasing/purchases'));

  const supplier = formData?.suppliers?.find(s => s.supp_code === header?.supp_code);
  const watchedShopCode = Form.useWatch('shop_code', form) as string | undefined;
  const effectiveShopCode = (isEditing ? watchedShopCode : header?.shop_code) || '';
  const defaultWarehouseName =
    defaultWarehouseCode && warehouseOptions.length > 0
      ? warehouseOptions.find((w) => w.shop_code === defaultWarehouseCode)?.name ?? ''
      : '';

  useEffect(() => {
    if (warehouseOptions.length > 0) return;
    fetch('/api/shops?warehouseOnly=1&limit=1000&offset=0&sortColumn=name&sortDirection=asc', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j?.data)) {
          setWarehouseOptions(j.data as Array<{ shop_code: string; name: string }>);
        }
      })
      .catch(() => {});
  }, [warehouseOptions.length]);

  useEffect(() => {
    if (!effectiveShopCode) {
      setDefaultWarehouseCode('');
      return;
    }
    fetch(`/api/shops/${encodeURIComponent(effectiveShopCode)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j?.data) {
          const v = j.data.default_whcode;
          setDefaultWarehouseCode(typeof v === 'string' ? v.trim() : '');
        } else {
          setDefaultWarehouseCode('');
        }
      })
      .catch(() => setDefaultWarehouseCode(''));
  }, [effectiveShopCode]);

  const filteredItems = useMemo(() => {
    if (!formData?.products) return [];
    const searchLower = itemSearchText.toLowerCase();
    return formData.products.filter(
      (item) =>
        item.item_code.toLowerCase().includes(searchLower) ||
        item.eng_name.toLowerCase().includes(searchLower) ||
        (item.chi_name && item.chi_name.toLowerCase().includes(searchLower))
    );
  }, [formData?.products, itemSearchText]);

  // PO payment amount = sum of line item totals (calculated from items)
  const calculatedOrderTotal = useMemo(
    () =>
      editingDetails.reduce((sum, record) => {
        const qty = record.qty || 0;
        const price = record.price || 0;
        const discount = record.discount || 0;
        return sum + qty * price * (1 - discount / 100);
      }, 0),
    [editingDetails]
  );

  const fetchTransactionDetails = useCallback(
    async (
      signal?: AbortSignal
    ): Promise<{ success: boolean; header?: TransactionHeader; details?: TransactionDetail[]; paymentTotals?: TransactionPaymentTotal[]; error?: string } | null> => {
      const texts = tRef.current;
      setLoading(true);
      setError(null);

      try {
        const response = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(transCode)}`, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
          signal,
        });
        const result = await response.json();

        if (result.success) {
          const headerData = result.header;
          const detailsData = result.details || [];
          const paymentTotalsData = (result.paymentTotals || []).map((p: TransactionPaymentTotal) => ({
            ...p,
            pm_code: p.pm_code != null && p.pm_code !== '' && Number(p.pm_code) !== -1 ? String(p.pm_code) : '',
            payment_method: p.payment_method ?? ''
          }));
          setHeader(headerData);
          setDetails(detailsData);
          setPaymentTotals(paymentTotalsData);
          setLoading(false);
          return { success: true, header: headerData, details: detailsData, paymentTotals: paymentTotalsData };
        } else {
          const errMsg = result.error || texts.fetchErrors.loadFailed;
          setError(errMsg);
          setLoading(false);
          return { success: false, error: errMsg };
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }
        console.error('Error fetching transaction details:', err);
        setError(texts.fetchErrors.loadError);
        setLoading(false);
        return null;
      }
    },
    [transCode, token]
  );

  const fetchRelatedGRNs = useCallback(async (signal?: AbortSignal) => {
    if (!transCode) return;
    try {
      const res = await fetchWithAuth(
        `/api/transactions?prefix=GRN&refer_code=${encodeURIComponent(transCode)}&pageSize=50`,
        token,
        { cache: 'no-store', signal }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRelatedGRNs(data.data.map((r: { transaction_id: string }) => ({ transaction_id: r.transaction_id })));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setRelatedGRNs([]);
    }
  }, [transCode, token]);

  const fetchPoReceivedTotals = useCallback(
    async (signal?: AbortSignal) => {
      if (!transCode) return;
      setPoReceivedLoading(true);
      try {
        const res = await fetchWithAuth(
          `/api/transactions/po-received/${encodeURIComponent(transCode)}`,
          token,
          { cache: 'no-store', signal }
        );
        const data = await res.json();
        if (data.success) {
          setReceivedPerItem(data.receivedPerItem || {});
        } else {
          setReceivedPerItem({});
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setReceivedPerItem({});
      } finally {
        if (!signal?.aborted) {
          setPoReceivedLoading(false);
        }
      }
    },
    [transCode, token]
  );

  const fetchFormData = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchWithAuth('/api/transactions/form-data', token, {
        signal,
      });
      const result = await response.json();

      if (result.success) {
        setFormData(result.data);
      } else {
        console.error('Failed to fetch form data:', result.error);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Error fetching form data:', err);
    }
  }, [token]);

  useEffect(() => {
    if (!transCode) return;
    const ac = new AbortController();
    const { signal } = ac;
    void fetchTransactionDetails(signal);
    void fetchFormData(signal);
    void fetchRelatedGRNs(signal);
    void fetchPoReceivedTotals(signal);
    return () => ac.abort();
  }, [transCode, fetchTransactionDetails, fetchFormData, fetchRelatedGRNs, fetchPoReceivedTotals]);

  /** True when every PO line item (aggregated by item_code) has GRN received qty >= order qty */
  const poFullyReceivedByGrn = useMemo(() => {
    const orderByItem: Record<string, number> = {};
    for (const d of details) {
      const code = String(d.item_code || '').trim();
      if (!code) continue;
      orderByItem[code] = (orderByItem[code] ?? 0) + (Number(d.qty) || 0);
    }
    const codes = Object.keys(orderByItem).filter((k) => orderByItem[k] > 0);
    if (codes.length === 0) return false;
    const eps = 1e-6;
    for (const itemCode of codes) {
      const ordered = orderByItem[itemCode];
      const received = receivedPerItem[itemCode] ?? 0;
      if (received + eps < ordered) return false;
    }
    return true;
  }, [details, receivedPerItem]);

  const handleEdit = () => {
    if (header?.is_settle === 1) {
      message.warning(t.detailPage.cannotEditSettledPo);
      return;
    }
    setIsEditing(true);
    setEditingDetails([...details]);
    setEditingPaymentTotals(
      paymentTotals.map(p => ({
        ...p,
        pm_code: p.pm_code != null && p.pm_code !== '' && Number(p.pm_code) !== -1 ? String(p.pm_code) : '',
        payment_method: p.payment_method ?? ''
      }))
    );

    form.setFieldsValue({
      cust_code: header?.cust_code,
      supp_code: header?.supp_code,
      refer_code: header?.refer_code,
      quotation_code: header?.quotation_code,
      total: header?.total,
      employee_code: header?.employee_code,
      shop_code: header?.shop_code,
      wh_code: (header?.wh_code || header?.shop_code || '').toString() || undefined,
      remark: header?.remark,
      is_void: header?.is_void,
      is_convert: header?.is_convert,
      is_settle: header?.is_settle
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingDetails([...details]);
    setEditingPaymentTotals([...paymentTotals]);
    form.resetFields();
  };

  const handleSave = async () => {
    if (header?.is_settle === 1) {
      message.warning(t.detailPage.cannotEditSettledPo);
      return;
    }
    try {
      setSaving(true);

      const formValues = await form.validateFields();

      // Use refs so we send the latest editing state (state can be stale after async validateFields)
      const latestDetails = editingDetailsRef.current;
      const latestPaymentTotals = editingPaymentTotalsRef.current;

      const orderTotal = latestDetails.reduce((sum, record) => {
        const qty = record.qty || 0;
        const price = record.price || 0;
        const discount = record.discount || 0;
        return sum + qty * price * (1 - discount / 100);
      }, 0);

      const headerData = {
        ...formValues,
        // Ensure header warehouse code is persisted (and used by /api/transactions/update for detail.wh_code)
        wh_code: (formValues as { wh_code?: string }).wh_code || header?.wh_code || header?.shop_code,
        total: orderTotal,
      };
      const paymentTotalsPayload =
        latestPaymentTotals.length > 0
          ? [{ pm_code: latestPaymentTotals[0].pm_code != null && latestPaymentTotals[0].pm_code !== '' ? String(latestPaymentTotals[0].pm_code) : null, total: orderTotal }]
          : [];

      const updateData = {
        transCode,
        headerData,
        detailsData: latestDetails,
        paymentTotalsData: paymentTotalsPayload
      };

      const response = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (result.success) {
        message.success(t.detailPage.updated);
        setIsEditing(false);
        const refetched = await fetchTransactionDetails();
        void fetchPoReceivedTotals();
        // Sync editing state from refetched data so view and next Edit show updated items
        if (refetched?.success && refetched.details && refetched.paymentTotals) {
          setEditingDetails([...refetched.details]);
          setEditingPaymentTotals(refetched.paymentTotals.map(p => ({ ...p })));
        }
      } else {
        message.error(result.error || t.detailPage.updateFailed);
      }
    } catch (err) {
      console.error('Error saving purchase order:', err);
      message.error(t.detailPage.saveError);
    } finally {
      setSaving(false);
    }
  };

  const removeDetailRow = (index: number) => {
    const newDetails = editingDetails.filter((_, i) => i !== index);
    setEditingDetails(newDetails);
  };

  const updateDetailRow = (index: number, field: keyof TransactionDetail, value: string | number) => {
    const newDetails = [...editingDetails];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setEditingDetails(newDetails);
  };

  const addOrIncrementItem = (product: { item_code: string; eng_name: string; chi_name: string; unit: string; price: number }) => {
    const existingIdx = editingDetails.findIndex((d) => String(d.item_code) === String(product.item_code));
    if (existingIdx >= 0) {
      setEditingDetails((prev) => {
        const next = [...prev];
        const curr = next[existingIdx];
        const nextQty = (curr.qty || 0) + 1;
        next[existingIdx] = { ...curr, qty: nextQty };
        return next;
      });
      return;
    }
    const newDetail: TransactionDetail = {
      uid: Date.now(),
      trans_code: transCode,
      item_code: product.item_code,
      eng_name: product.eng_name,
      chi_name: product.chi_name,
      qty: 1,
      pstock: 0,
      unit: product.unit,
      price: Number(product.price || 0),
      discount: 0,
      create_date: new Date().toISOString(),
      modify_date: new Date().toISOString()
    };
    setEditingDetails((prev) => [...prev, newDetail]);
  };

  const addPaymentTotalRow = () => {
    const newPaymentTotal: TransactionPaymentTotal = {
      uid: Date.now(),
      trans_code: transCode,
      pm_code: '',
      payment_amount: 0,
      payment_method: '',
      create_date: new Date().toISOString(),
      modify_date: new Date().toISOString()
    };
    setEditingPaymentTotals([...editingPaymentTotals, newPaymentTotal]);
  };

  const removePaymentTotalRow = (index: number) => {
    const newPaymentTotals = editingPaymentTotals.filter((_, i) => i !== index);
    setEditingPaymentTotals(newPaymentTotals);
  };

  const updatePaymentTotalRow = (index: number, field: keyof TransactionPaymentTotal, value: string | number) => {
    const newPaymentTotals = [...editingPaymentTotals];
    newPaymentTotals[index] = { ...newPaymentTotals[index], [field]: value };
    setEditingPaymentTotals(newPaymentTotals);
  };

  const setPaymentMethodForRow = (index: number, pmCode: string) => {
    const paymentMethod = formData?.paymentMethods?.find(pm => String(pm.pm_code) === pmCode);
    setEditingPaymentTotals(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        pm_code: pmCode,
        payment_method: paymentMethod?.payment_method ?? ''
      };
      return next;
    });
  };

  const formatPrice = (price: number | string) => formatCurrency(price);

  const poStatusView = useMemo(() => {
    if (!header) return { key: 'Active' as const, label: t.statusTags.Active };
    const key = getTransactionDetailStatusKey(header);
    const map: Record<string, string> = {
      Void: t.statusTags.Void,
      Settled: t.statusTags.Settled,
      Converted: t.statusTags.Converted,
      Active: t.statusTags.Active,
    };
    return { key, label: map[key] ?? key };
  }, [header, t]);

  const detailColumns = useMemo(() => [
    {
      title: t.detailLabels.itemCode,
      dataIndex: 'item_code',
      key: 'item_code',
      width: 120,
    },
    {
      title: t.detailLabels.description,
      key: 'description',
      render: (_: unknown, record: TransactionDetail) => (
        <div>
          <div className="font-medium">{record.eng_name}</div>
          {record.chi_name && (
            <div className="text-sm text-gray-600">{record.chi_name}</div>
          )}
        </div>
      ),
      width: 200,
    },
    {
      title: t.detailLabels.quantity,
      dataIndex: 'qty',
      key: 'qty',
      width: 100,
      align: 'right' as const,
      render: (qty: number) => {
        const numQty = typeof qty === 'number' ? qty : parseFloat(String(qty)) || 0;
        return numQty.toFixed(2);
      },
    },
    {
      title: t.detailLabels.unit,
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: t.detailLabels.unitPrice,
      dataIndex: 'price',
      key: 'price',
      width: 120,
      align: 'right' as const,
      render: (price: number) => formatPrice(price),
    },
    {
      title: t.detailLabels.discount,
      dataIndex: 'discount',
      key: 'discount',
      width: 100,
      align: 'right' as const,
      render: (discount: number) => `${discount || 0}%`,
    },
    {
      title: t.detailLabels.lineTotal,
      key: 'line_total',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, record: TransactionDetail) => {
        const qty = record.qty || 0;
        const price = record.price || 0;
        const discount = record.discount || 0;
        const subtotal = qty * price;
        const discountAmount = subtotal * (discount / 100);
        const total = subtotal - discountAmount;
        return formatPrice(total);
      },
    },
  ], [t, formatPrice]);

  const paymentTotalColumns = useMemo(() => [
    {
      title: t.detailLabels.paymentMethod,
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 150,
    },
    {
      title: t.detailLabels.paymentCode,
      dataIndex: 'pm_code',
      key: 'pm_code',
      width: 100,
    },
    {
      title: t.detailLabels.amount,
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => formatPrice(amount),
    },
  ], [t, formatPrice]);

  const breadcrumbItems = [
    { label: t.breadcrumb.home, href: '/' },
    { label: t.breadcrumb.purchasing, href: '/purchasing' },
    { label: t.breadcrumb.purchaseOrders, href: '/purchasing/purchases' },
    { label: (header?.trans_code) ?? t.breadcrumb.detail, current: true }
  ];

  const FunctionBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex flex-wrap justify-start items-center gap-2">
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={goBackToList}
      >
        {t.detailPage.back}
      </Button>

      {!isEditing ? (
        <>
          {can('edit_po') && (
            <Button
              icon={<EditOutlined />}
              type="primary"
              onClick={handleEdit}
              disabled={!header || header.is_settle === 1}
              title={header?.is_settle === 1 ? t.detailPage.cannotEditSettledPo : undefined}
            >
              {t.detailPage.edit}
            </Button>
          )}
          <Button
            icon={<ImportOutlined />}
            onClick={() => router.push(`/warehouse/stock/grn?po=${encodeURIComponent(transCode)}`)}
            disabled={
              !header ||
              header.is_settle === 1 ||
              poFullyReceivedByGrn ||
              poReceivedLoading
            }
            title={
              header?.is_settle === 1 || poFullyReceivedByGrn
                ? t.detailPage.poFullyReceived
                : t.detailPage.createGrnFromPo
            }
          >
            {t.detailPage.grn}
          </Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => {
              if (header?.trans_code) {
                window.open(
                  `/purchasing/purchases/print/${encodeURIComponent(header.trans_code)}`,
                  '_blank',
                  'width=820,height=900,scrollbars=yes'
                );
              } else {
                message.info(t.detailPage.poDataNotLoaded);
              }
            }}
          >
            {t.detailPage.print}
          </Button>
        </>
      ) : (
        <>
          <Button
            icon={<SaveOutlined />}
            type="primary"
            onClick={handleSave}
            loading={saving}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          <Button
            icon={<CloseOutlined />}
            onClick={handleCancel}
            disabled={saving}
          >
            {t.detailPage.cancel}
          </Button>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <BasicPageLayout
        breadcrumb={<Breadcrumb items={breadcrumbItems} />}
        buttonBar={FunctionBar}
        title={t.detailPage.titleStatic}
        description={t.detailPage.loadingDescription}
        actionBarSaveShortcut={{ onSave: handleSave, disabled: !isEditing || saving || header?.is_settle === 1 }}
      >
        <div className="flex justify-center items-center py-20">
          <Spin size="large" />
        </div>
      </BasicPageLayout>
    );
  }

  if (error) {
    return (
      <BasicPageLayout
        breadcrumb={<Breadcrumb items={breadcrumbItems} />}
        buttonBar={FunctionBar}
        title={t.detailPage.titleStatic}
        description={t.detailPage.errorDescription}
        actionBarSaveShortcut={{ onSave: handleSave, disabled: !isEditing || saving || header?.is_settle === 1 }}
      >
        <div className="px-8 py-6">
          <Alert
            message={t.detailPage.error}
            description={error}
            type="error"
            showIcon
            action={
              <Button
                size="small"
                onClick={() => {
                  void fetchTransactionDetails();
                  void fetchPoReceivedTotals();
                  void fetchRelatedGRNs();
                }}
              >
                {t.detailPage.retry}
              </Button>
            }
          />
        </div>
      </BasicPageLayout>
    );
  }

  if (!header) {
    return (
      <BasicPageLayout
        breadcrumb={<Breadcrumb items={breadcrumbItems} />}
        buttonBar={FunctionBar}
        title={t.detailPage.titleStatic}
        description={t.detailPage.notFoundDescription}
        actionBarSaveShortcut={{ onSave: handleSave, disabled: !isEditing || saving }}
      >
        <div className="px-8 py-6">
          <Alert
            message={t.detailPage.notFound}
            description={t.detailPage.notFoundDetail}
            type="warning"
            showIcon
          />
        </div>
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={breadcrumbItems} />}
      buttonBar={FunctionBar}
      title={t.detailPage.title(header.trans_code)}
      description={t.detailPage.description}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: !isEditing || saving || header?.is_settle === 1 }}
    >
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
            <TransactionDetailInfoCard title={t.detailPage.poInformation}>
              {!isEditing ? (
                <TransactionDetailBorderedDescriptions>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.transCode}>
                    <Text strong>{header.trans_code}</Text>
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.prefix}>
                    {String(header.prefix || 'PO')}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.supplier}>
                    <div>
                      <div>
                        <Text strong>{header.supp_code}</Text> - {supplier?.name ?? t.detailLabels.na}
                      </div>
                      {supplier?.phone_1 && <div className="text-sm text-gray-600">📞 {supplier.phone_1}</div>}
                      {supplier?.email_1 && <div className="text-sm text-gray-600">✉️ {supplier.email_1}</div>}
                    </div>
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.paymentMethod}>
                    {header.payment_method || t.detailLabels.na}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.referenceCode}>
                    {transactionDetailReferenceLink(header.refer_code || undefined)}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.quotationCode}>
                    {String(header.quotation_code || '').trim()
                      ? transactionDetailReferenceLink(String(header.quotation_code))
                      : '-'}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.status}>
                    <span className={transactionDetailStatusBadgeClassName(poStatusView.key)}>{poStatusView.label}</span>
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.totalAmount}>
                    <Text strong className="text-lg">
                      {formatPrice(header.total)}
                    </Text>
                  </TransactionDetailBorderedDescriptions.Item>
                </TransactionDetailBorderedDescriptions>
              ) : (
                <Form form={form} layout="vertical">
                  <Form.Item label={t.detailLabels.poNumber}>
                    <Input value={header.trans_code} disabled />
                  </Form.Item>
                  <Form.Item label={t.detailLabels.supplierCode} name="supp_code">
                    <Select
                      placeholder={t.detailLabels.selectSupplier}
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                      options={formData?.suppliers?.map(s => ({
                        value: s.supp_code,
                        label: `${s.supp_code} - ${s.name}`
                      }))}
                    />
                  </Form.Item>
                  <Form.Item label={t.detailLabels.referenceCode} name="refer_code">
                    <Input placeholder={t.detailLabels.enterReferenceCode} />
                  </Form.Item>
                  <Form.Item label={t.detailLabels.quotationCode} name="quotation_code">
                    <Input placeholder={t.detailLabels.enterQuotationCode} />
                  </Form.Item>
                  <Form.Item label={t.detailLabels.totalAmount} name="total">
                    <InputNumber
                      style={{ width: '100%' }}
                      formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={value => parseFloat(value!.replace(/\$\s?|(,*)/g, '')) || 0}
                      placeholder="0.00"
                    />
                  </Form.Item>
                </Form>
              )}
            </TransactionDetailInfoCard>
          </Col>

          <Col xs={24} lg={12}>
            <TransactionDetailInfoCard title={t.detailPage.shopEmployeeInformation}>
              {!isEditing ? (
                <TransactionDetailBorderedDescriptions>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.shop}>
                    <div>
                      <div>
                        <Text strong>{header.shop_code}</Text> - {header.shop_name || t.detailLabels.na}
                      </div>
                      {header.shop_phone && <div className="text-sm text-gray-600">📞 {header.shop_phone}</div>}
                      {header.shop_address && <div className="text-sm text-gray-600">📍 {header.shop_address}</div>}
                    </div>
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.warehouse}>
                    {header.wh_code
                      ? header.wh_name
                        ? `${header.wh_code} - ${header.wh_name}`
                        : header.wh_code
                      : defaultWarehouseCode
                        ? defaultWarehouseName
                          ? `${defaultWarehouseCode} - ${defaultWarehouseName}`
                          : defaultWarehouseCode
                        : t.detailLabels.na}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.employeeCode}>
                    {header.employee_code || t.detailLabels.na}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.dateCreated}>
                    {header.create_date
                      ? formatDisplayDateTime(header.create_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                      : t.detailLabels.na}
                  </TransactionDetailBorderedDescriptions.Item>
                  <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.dateModified}>
                    {header.modify_date
                      ? formatDisplayDateTime(header.modify_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                      : t.detailLabels.na}
                  </TransactionDetailBorderedDescriptions.Item>
                </TransactionDetailBorderedDescriptions>
              ) : (
                <Form form={form} layout="vertical">
                  <Form.Item label={t.detailLabels.status}>
                    <Space>
                      {can('void_po') && (
                        <>
                          <Form.Item name="is_void" valuePropName="checked" noStyle>
                            <input
                              type="checkbox"
                              disabled={header?.is_settle === 1}
                              title={header?.is_settle === 1 ? t.detailPage.cannotVoidSettledPo : undefined}
                            />
                          </Form.Item>
                          {' '}
                          {t.detailPage.void}
                        </>
                      )}
                      <Form.Item name="is_settle" valuePropName="checked" noStyle>
                        <input type="checkbox" /> {t.detailPage.settled}
                      </Form.Item>
                      <Form.Item name="is_convert" valuePropName="checked" noStyle>
                        <input type="checkbox" /> {t.detailPage.converted}
                      </Form.Item>
                    </Space>
                  </Form.Item>
                  <Form.Item label={t.detailLabels.shopCode} name="shop_code">
                    <Select
                      placeholder={t.detailLabels.selectShop}
                      options={formData?.shops.map(s => ({
                        value: s.shop_code,
                        label: `${s.shop_code} - ${s.name}`
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label={t.detailLabels.warehouse}
                    name="wh_code"
                    rules={[{ required: true, message: t.detailLabels.selectShop }]}
                  >
                    <Select
                      placeholder={t.detailLabels.selectShop}
                      options={warehouseOptions.map((w) => ({
                        value: w.shop_code,
                        label: `${w.shop_code} - ${w.name}`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item label={t.detailLabels.employeeCode} name="employee_code">
                    <Select
                      placeholder={t.detailLabels.selectEmployee}
                      options={formData?.employees.map(e => ({
                        value: e.employee_code,
                        label: `${e.employee_code} - ${e.name}`
                      }))}
                    />
                  </Form.Item>
                </Form>
              )}
            </TransactionDetailInfoCard>
          </Col>

          <Col xs={24}>
            <Card title={t.detailPage.remarkCard} size="small">
              {!isEditing ? (
                <div className="text-gray-700 whitespace-pre-wrap">{header.remark || t.detailLabels.na}</div>
              ) : (
                <Form form={form} layout="vertical">
                  <Form.Item name="remark" noStyle>
                    <Input.TextArea rows={3} placeholder={t.detailLabels.enterRemarks} />
                  </Form.Item>
                </Form>
              )}
            </Card>
          </Col>

          {relatedGRNs.length > 0 && (
            <Col xs={24}>
              <Card title={t.detailPage.relatedGrns} size="small">
                <Space size="middle" wrap>
                  {relatedGRNs.map((grn) => (
                    <Link
                      key={grn.transaction_id}
                      href={`/warehouse/stock/detail/${encodeURIComponent(grn.transaction_id)}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {grn.transaction_id}
                    </Link>
                  ))}
                </Space>
              </Card>
            </Col>
          )}

          <Col xs={24}>
            <Card
              title={t.detailPage.lineItems}
              size="small"
              extra={isEditing && (
                <Button type="primary" icon={<SearchOutlined />} onClick={() => { setShowItemModal(true); setItemSearchText(''); }} size="small">
                  {t.detailPage.itemsButton}
                </Button>
              )}
            >
              {!isEditing ? (
                <Table
                  columns={detailColumns}
                  dataSource={details}
                  rowKey="uid"
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                  summary={(pageData) => {
                    const subtotal = pageData.reduce((sum, record) => {
                      const qty = record.qty || 0;
                      const price = record.price || 0;
                      const discount = record.discount || 0;
                      const lineSubtotal = qty * price;
                      const discountAmount = lineSubtotal * (discount / 100);
                      return sum + (lineSubtotal - discountAmount);
                    }, 0);

                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6}>
                          <strong>{t.detailPage.subtotal}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <strong>{formatPrice(subtotal)}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                />
              ) : (
                <div className="space-y-4">
                  {editingDetails.map((detail, index) => (
                    <Card key={detail.uid} size="small" className="border border-gray-200">
                      <Row gutter={[16, 16]} align="middle">
                        <Col xs={24} sm={12} md={5}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.itemCode}</label>
                          <span className="block py-1.5 px-3 bg-gray-50 border border-gray-200 rounded min-h-[32px] flex items-center">{detail.item_code || '—'}</span>
                        </Col>
                        <Col xs={24} sm={12} md={7}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.description}</label>
                          <span className="block py-1.5 px-3 bg-gray-50 border border-gray-200 rounded min-h-[32px] flex items-center">{detail.eng_name || '—'}</span>
                        </Col>
                        <Col xs={12} sm={6} md={2}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.qty}</label>
                          <InputNumber
                            value={detail.qty}
                            onChange={(value) => updateDetailRow(index, 'qty', value || 0)}
                            min={0}
                            style={{ width: '100%', maxWidth: 90 }}
                          />
                        </Col>
                        <Col xs={12} sm={6} md={2}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.unit}</label>
                          <Input value={detail.unit} disabled style={{ maxWidth: 64 }} />
                        </Col>
                        <Col xs={12} sm={6} md={2}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.price}</label>
                          <InputNumber
                            value={detail.price}
                            onChange={(value) => updateDetailRow(index, 'price', value || 0)}
                            min={0}
                            formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => parseFloat(value!.replace(/\$\s?|(,*)/g, '')) || 0}
                            style={{ width: '100%', maxWidth: 100 }}
                          />
                        </Col>
                        <Col xs={12} sm={6} md={2}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.discount}</label>
                          <InputNumber
                            value={detail.discount}
                            onChange={(value) => updateDetailRow(index, 'discount', value || 0)}
                            min={0}
                            max={100}
                            style={{ width: '100%', maxWidth: 72 }}
                          />
                        </Col>
                        <Col xs={12} sm={6} md={2}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.lineTotal}</label>
                          <Input
                            value={formatPrice((detail.qty || 0) * (detail.price || 0) * (1 - (detail.discount || 0) / 100))}
                            disabled
                            style={{ textAlign: 'right', fontWeight: 'bold', maxWidth: 100 }}
                          />
                        </Col>
                        <Col xs={24} sm={6} md={1}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => removeDetailRow(index)}
                            size="small"
                          />
                        </Col>
                      </Row>
                    </Card>
                  ))}

                  {editingDetails.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>{t.detailPage.noLineItems}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24}>
            <Card
              title={t.detailPage.paymentInformation}
              size="small"
              extra={isEditing && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addPaymentTotalRow}
                  size="small"
                >
                  {t.detailPage.addPayment}
                </Button>
              )}
            >
              {!isEditing ? (
                paymentTotals.length > 0 ? (
                  <Table
                    columns={paymentTotalColumns}
                    dataSource={paymentTotals}
                    rowKey="uid"
                    pagination={false}
                    size="small"
                    scroll={{ x: 400 }}
                    summary={(pageData) => {
                      const totalPayment = pageData.reduce((sum, record) => sum + (record.payment_amount || 0), 0);

                      return (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}>
                            <strong>{t.detailPage.totalPayment}</strong>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} />
                          <Table.Summary.Cell index={2} align="right">
                            <strong>{formatPrice(totalPayment)}</strong>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <p>{t.detailPage.noPaymentView}</p>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {editingPaymentTotals.map((payment, index) => (
                    <Card key={payment.uid} size="small" className="border border-gray-200">
                      <Row gutter={[16, 16]} align="middle">
                        <Col span={8}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.paymentMethod}</label>
                          <Select
                            value={payment.pm_code != null && payment.pm_code !== '' ? String(payment.pm_code) : undefined}
                            onChange={(value) => setPaymentMethodForRow(index, value != null ? String(value) : '')}
                            placeholder={t.detailLabels.selectPaymentMethod}
                            allowClear
                            style={{ width: '100%' }}
                            options={formData?.paymentMethods?.map(pm => ({
                              value: String(pm.pm_code),
                              label: `${pm.pm_code} - ${pm.payment_method}`
                            }))}
                          />
                        </Col>
                        <Col span={6}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.paymentCode}</label>
                          <Input
                            value={payment.pm_code != null && payment.pm_code !== '' ? String(payment.pm_code) : '—'}
                            disabled
                            style={{ backgroundColor: '#f5f5f5' }}
                          />
                        </Col>
                        <Col span={6}>
                          <label className="block text-sm font-medium mb-1">{t.detailLabels.amount}</label>
                          <InputNumber
                            value={calculatedOrderTotal}
                            readOnly
                            formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            style={{ width: '100%' }}
                          />
                        </Col>
                        <Col span={4}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => removePaymentTotalRow(index)}
                            size="small"
                          />
                        </Col>
                      </Row>
                    </Card>
                  ))}

                  {editingPaymentTotals.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>{t.detailPage.noPaymentEdit}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24}>
            <TransactionDetailInfoCard title={t.detailPage.transactionInformation}>
              <TransactionDetailBorderedDescriptions>
                <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.createdDate}>
                  {header.create_date
                    ? formatDisplayDateTime(header.create_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                    : t.detailLabels.na}
                </TransactionDetailBorderedDescriptions.Item>
                <TransactionDetailBorderedDescriptions.Item label={t.detailLabels.modifiedDate}>
                  {header.modify_date
                    ? formatDisplayDateTime(header.modify_date, lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-GB')
                    : t.detailLabels.na}
                </TransactionDetailBorderedDescriptions.Item>
              </TransactionDetailBorderedDescriptions>
            </TransactionDetailInfoCard>
          </Col>
        </Row>
      </div>

      <Modal
        title={t.detailPage.itemModalTitle}
        open={showItemModal}
        onCancel={() => { setShowItemModal(false); setItemSearchText(''); }}
        width={900}
        footer={
          <Button type="default" onClick={() => { setShowItemModal(false); setItemSearchText(''); }}>{t.detailPage.close}</Button>
        }
      >
        <div className="mb-4">
          <Input
            placeholder={t.detailPage.itemSearchPlaceholder}
            prefix={<SearchOutlined />}
            value={itemSearchText}
            onChange={(e) => setItemSearchText(e.target.value)}
            allowClear
          />
        </div>
        <Table
          columns={[
            { title: t.detailLabels.itemCode, dataIndex: 'item_code', key: 'item_code', width: '20%' },
            { title: t.detailLabels.englishName, dataIndex: 'eng_name', key: 'eng_name', width: '30%' },
            { title: t.detailLabels.chineseName, dataIndex: 'chi_name', key: 'chi_name', width: '25%' },
            { title: t.detailLabels.unit, dataIndex: 'unit', key: 'unit', width: '10%' },
            {
              title: t.detailLabels.price,
              dataIndex: 'price',
              key: 'price',
              width: '15%',
              render: (price: number | string | null | undefined) => {
                const priceNum = typeof price === 'number' ? price : parseFloat(String(price || 0));
                return <span>{formatCurrency(priceNum)}</span>;
              }
            }
          ]}
          dataSource={filteredItems}
          rowKey="item_code"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({ onClick: () => addOrIncrementItem(record), style: { cursor: 'pointer' } })}
          size="small"
        />
      </Modal>
    </BasicPageLayout>
  );
}
