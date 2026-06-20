'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getWarehouseTexts } from '@/app/warehouse/i18n';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { DeleteOutlined, SaveOutlined, CloseOutlined, SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Form, Input, type InputRef, DatePicker, Select, Button, Table, message, Card, Row, Col, Spin, InputNumber, Modal, Space } from 'antd';
import dayjs from 'dayjs';
import { TransactionSession } from '@/services/transactionGenerator';
import { getCurrentSuffix } from '@/utils/transactionUtils';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePermissions } from '@/hooks/usePermissions';

interface AdjItem {
  key: string;
  item_code: string;
  item_name: string;
  chi_name?: string;
  quantity: number;
  price: number;
  unit?: string;
}

interface Shop {
  shop_code: string;
  name: string;
}

interface Product {
  item_code: string;
  eng_name: string;
  chi_name?: string;
  unit?: string;
  price?: number;
}

interface FormValues {
  adj_no: string;
  reference_no?: string;
  transaction_date: dayjs.Dayjs;
  wh_code: string;
  remark?: string;
}

interface TransactionHeaderResponse {
  trans_code: string;
  refer_code?: string;
  shop_code?: string;
  wh_code?: string;
  remark?: string;
  create_date?: string;
  prefix?: string;
  is_void?: number;
}

interface TransactionDetailResponse {
  item_code: string;
  eng_name: string;
  chi_name?: string;
  qty: number;
  unit?: string;
  price?: number;
}

const ADJ_PREFIX = 'ADJ';

function AdjustmentPageContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const w = useMemo(() => getWarehouseTexts(lang), [lang]);
  const a = w.adjustment;
  const editTransCode = searchParams.get('transCode') || '';
  const isEditMode = !!editTransCode;
  const { can, loading: permissionsLoading } = usePermissions();

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<AdjItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  const [transactionSession, setTransactionSession] = useState<TransactionSession | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(true);
  const [isCreateReady, setIsCreateReady] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [generatingNumber, setGeneratingNumber] = useState(false);
  const itemSearchInputRef = useRef<InputRef>(null);
  const pendingNavigateRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  /** Avoid duplicate /transaction-generator/next per session (e.g. React Strict Mode). */
  const adjGenerateInitializedRef = useRef<string | null>(null);

  const generateBrowserSessionId = (): string => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `browser_adj_${timestamp}${randomStr}`;
  };

  useEffect(() => {
    if (permissionsLoading) return;
    const denied =
      !can('view_adjustment') ||
      (!isEditMode && !can('create_adjustment')) ||
      (isEditMode && !can('edit_adjustment'));
    if (denied) {
      router.replace('/warehouse/stock');
    }
  }, [permissionsLoading, can, isEditMode, router]);

  useEffect(() => {
    if (isEditMode) return;
    let existingSessionId = sessionStorage.getItem('adj_session_id');
    if (!existingSessionId) {
      existingSessionId = generateBrowserSessionId();
      sessionStorage.setItem('adj_session_id', existingSessionId);
    }
    setBrowserSessionId(existingSessionId);
  }, [isEditMode]);

  const generateAdjNumber = useCallback(async () => {
    if (!browserSessionId) return;
    setGeneratingNumber(true);
    try {
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: ADJ_PREFIX,
          suffix: getCurrentSuffix(),
          sessionId: browserSessionId,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || a.failedGen);
      }
      const session: TransactionSession = {
        sessionId: browserSessionId,
        prefix: ADJ_PREFIX,
        suffix: getCurrentSuffix(),
        lastNumber: result.lastNumber,
        transactionCode: result.transactionCode,
      };
      setTransactionSession(session);
      form.setFieldsValue({ adj_no: session.transactionCode });
    } catch (error) {
      adjGenerateInitializedRef.current = null;
      message.error(error instanceof Error ? error.message : a.failedGen);
    } finally {
      setGeneratingNumber(false);
    }
  }, [browserSessionId, form, a]);

  useEffect(() => {
    if (isEditMode || !browserSessionId) return;
    if (adjGenerateInitializedRef.current === browserSessionId) return;
    adjGenerateInitializedRef.current = browserSessionId;
    setIsCreateReady(false);
    setShowGenerateModal(true);
    setTransactionSession(null);
    form.setFieldsValue({ adj_no: undefined });
    void generateAdjNumber();
  }, [isEditMode, browserSessionId, generateAdjNumber, form]);

  const handleCommitGeneratedTransaction = async () => {
    if (!browserSessionId || !transactionSession) return;
    try {
      const response = await fetch('/api/transaction-generator/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: browserSessionId }),
      });
      const result = await response.json();
      if (!result.success) {
        message.error(result.error || a.commitFailed);
        return;
      }
      message.success(a.numberGenerated);
      setShowGenerateModal(false);
      setIsCreateReady(true);
    } catch (error) {
      console.error('Error committing transaction:', error);
      message.error(a.commitError);
    }
  };

  const handleDiscardGeneratedTransaction = async () => {
    if (!browserSessionId) return;
    try {
      await fetch('/api/transaction-generator/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: browserSessionId }),
      });
    } catch (error) {
      console.error('Error discarding generated transaction:', error);
    } finally {
      adjGenerateInitializedRef.current = null;
      setTransactionSession(null);
      setIsCreateReady(false);
      setShowGenerateModal(false);
      form.resetFields();
      sessionStorage.removeItem('adj_session_id');
      setBrowserSessionId(null);
      allowNavigationRef.current = true;
      router.push('/warehouse/stock');
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { href } = (e as CustomEvent<{ href: string }>).detail;
      pendingNavigateRef.current = href;
      setShowDiscardModal(true);
    };
    window.addEventListener('app-navigate-request', handler);
    return () => window.removeEventListener('app-navigate-request', handler);
  }, []);

  useEffect(() => {
    const originalPush = router.push.bind(router);
    const originalReplace = router.replace.bind(router);
    router.push = (href: string | { pathname: string }, options?: { scroll?: boolean }) => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return originalPush(href as string, options);
      }
      const hrefString = typeof href === 'string' ? href : (href as { pathname: string }).pathname;
      if (typeof window === 'undefined' || hrefString === window.location.pathname || hrefString.startsWith('#')) {
        return originalPush(href as string, options);
      }
      pendingNavigateRef.current = hrefString;
      setShowDiscardModal(true);
      return Promise.resolve(undefined as void);
    };
    router.replace = (href: string | { pathname: string }, options?: { scroll?: boolean }) => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return originalReplace(href as string, options);
      }
      const hrefString = typeof href === 'string' ? href : (href as { pathname: string }).pathname;
      if (typeof window === 'undefined' || hrefString === window.location.pathname || hrefString.startsWith('#')) {
        return originalReplace(href as string, options);
      }
      pendingNavigateRef.current = hrefString;
      setShowDiscardModal(true);
      return Promise.resolve(undefined as void);
    };
    return () => {
      router.push = originalPush;
      router.replace = originalReplace;
    };
  }, [router]);

  const loadShops = useCallback(async () => {
    const response = await fetch('/api/shops?warehouseOnly=1');
    const result = await response.json();
    if (!result.success) return;

    const list = (result.data || []) as Shop[];
    setShops(list);
    if (isEditMode) return;

    const existing = String((form.getFieldValue('wh_code') ?? '') as string).trim();
    if (existing) return;

    const userShop = String((user?.selected_shopcode || user?.default_shopcode || '') as string).trim();
    if (userShop) {
      try {
        const r = await fetch(`/api/shops/${encodeURIComponent(userShop)}`, { cache: 'no-store' });
        const j = (await r.json()) as { success?: boolean; data?: { default_whcode?: unknown } };
        const dw = typeof j.data?.default_whcode === 'string' ? j.data.default_whcode.trim() : '';
        if (dw) {
          form.setFieldsValue({ wh_code: dw });
          return;
        }
      } catch {
        // fallback below
      }
    }

    if (list.length > 0) {
      form.setFieldsValue({ wh_code: list[0].shop_code });
    }
  }, [form, isEditMode, user]);

  const loadProducts = useCallback(async () => {
    const response = await fetch('/api/products?limit=1000');
    const result = await response.json();
    if (result.success) {
      setProducts(result.data || []);
    }
  }, []);

  const loadEditTransaction = useCallback(async (signal?: AbortSignal) => {
    if (!isEditMode || !editTransCode) return;
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(editTransCode)}`, token, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal,
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || a.loadFailed);
      }
      const header = (result.header || {}) as TransactionHeaderResponse;
      const details = (result.details || []) as TransactionDetailResponse[];
      if (header.prefix && String(header.prefix).toUpperCase() !== ADJ_PREFIX) {
        throw new Error(a.notAdj(editTransCode));
      }
      form.setFieldsValue({
        adj_no: header.trans_code,
        reference_no: header.refer_code || '',
        transaction_date: header.create_date ? dayjs(header.create_date) : dayjs(),
        wh_code: (header.wh_code || header.shop_code || undefined) as string | undefined,
        remark: header.remark || '',
      });
      setItems(
        details.map((d, idx) => ({
          key: `${d.item_code}-${idx}`,
          item_code: d.item_code,
          item_name: d.eng_name,
          chi_name: d.chi_name || '',
          quantity: Number(d.qty || 0),
          price: Number(d.price || 0),
          unit: d.unit || '',
        }))
      );
      setLoading(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      message.error(error instanceof Error ? error.message : a.loadFailed);
      setLoading(false);
    }
  }, [editTransCode, form, isEditMode, a, token]);

  useEffect(() => {
    loadShops();
    loadProducts();
    form.setFieldsValue({ transaction_date: dayjs() });
  }, [form, loadProducts, loadShops]);

  useEffect(() => {
    const ac = new AbortController();
    void loadEditTransaction(ac.signal);
    return () => ac.abort();
  }, [loadEditTransaction]);

  const addOrUpdateItem = (product: Product, qtyDelta: number): boolean => {
    const existingIdx = items.findIndex((i) => i.item_code === product.item_code);
    if (existingIdx >= 0) {
      const next = [...items];
      const newQty = next[existingIdx].quantity + qtyDelta;
      if (newQty === 0) {
        next.splice(existingIdx, 1);
        setItems(next);
        return true;
      }
      next[existingIdx] = { ...next[existingIdx], quantity: newQty };
      setItems(next);
      return true;
    }
    const newItem: AdjItem = {
      key: `${product.item_code}-${Date.now()}`,
      item_code: product.item_code,
      item_name: product.eng_name,
      chi_name: product.chi_name || '',
      quantity: qtyDelta,
      price: Number(product.price || 0),
      unit: product.unit,
    };
    setItems([...items, newItem]);
    return false;
  };

  const handleSelectItem = (product: Product, increase: boolean) => {
    const delta = increase ? 1 : -1;
    addOrUpdateItem(product, delta);
    message.success(a.itemChanged(product.item_code, increase ? a.increased : a.decreased));
    setTimeout(() => itemSearchInputRef.current?.focus?.({ cursor: 'all' }), 0);
  };

  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleQuantityChange = (key: string, quantity: number | null) => {
    const nextQty = Number(quantity ?? 0);
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: nextQty } : item))
    );
  };

  const showDiscardConfirm = () => setShowDiscardModal(true);
  const showVoidConfirm = () => setShowVoidModal(true);

  const handleBackToStock = () => {
    if (isEditMode) {
      allowNavigationRef.current = true;
      router.push('/warehouse/stock');
    } else {
      showDiscardConfirm();
    }
  };

  useBackNavigation(handleBackToStock);

  const handleVoid = async () => {
    if (!isEditMode || !editTransCode) return;
    setVoiding(true);
    try {
      const response = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transCode: editTransCode,
          headerData: { prefix: ADJ_PREFIX, is_void: 1 },
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || a.voidFailed);
      message.success(a.voided);
      setShowVoidModal(false);
      allowNavigationRef.current = true;
      router.push('/warehouse/stock');
    } catch (error) {
      message.error(error instanceof Error ? error.message : a.voidFailed);
    } finally {
      setVoiding(false);
    }
  };

  const handleSave = async (values: FormValues) => {
    if (items.length === 0) {
      message.error(a.addOneItem);
      return;
    }
    const transCode = isEditMode ? editTransCode : values.adj_no;
    if (!transCode) {
      message.error(a.adjMissing);
      return;
    }
    const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    const authShop = (user?.selected_shopcode || user?.default_shopcode || '').trim();
    const shop_code = authShop || values.wh_code;
    setSaving(true);
    try {
      const payload = {
        transCode,
        headerData: {
          prefix: ADJ_PREFIX,
          shop_code,
          wh_code: values.wh_code,
          refer_code: values.reference_no || null,
          total: totalAmount,
          quotation_date: dayjs(values.transaction_date).format('YYYY-MM-DD 00:00:00'),
          remark: values.remark || null,
          is_void: 0,
        },
        detailsData: items.map((item) => ({
          item_code: item.item_code,
          eng_name: item.item_name,
          chi_name: item.chi_name || '',
          qty: Number(item.quantity),
          pstock: 0,
          unit: item.unit || '',
          price: Number(item.price || 0),
          discount: 0,
        })),
        paymentTotalsData: [],
      };
      const response = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || a.saveFailed);
      }
      if (!isEditMode && transactionSession) {
        await fetch('/api/transaction-generator/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: transactionSession.sessionId }),
        });
      }
      sessionStorage.removeItem('adj_session_id');
      adjGenerateInitializedRef.current = null;
      message.success(isEditMode ? a.updated : a.saved);
      allowNavigationRef.current = true;
      router.push(`/warehouse/stock/detail/${encodeURIComponent(transCode)}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : a.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    const target = pendingNavigateRef.current || '/warehouse/stock';
    pendingNavigateRef.current = null;
    if (isEditMode) {
      setShowDiscardModal(false);
      allowNavigationRef.current = true;
      router.push(target);
      return;
    }
    try {
      if (browserSessionId) {
        await fetch('/api/transaction-generator/discard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: browserSessionId }),
        });
      }
      sessionStorage.removeItem('adj_session_id');
      adjGenerateInitializedRef.current = null;
      setTransactionSession(null);
      form.resetFields();
      setBrowserSessionId(null);
      message.success(a.discarded);
      setShowDiscardModal(false);
      allowNavigationRef.current = true;
      setTimeout(() => router.push(target), 500);
    } catch {
      message.error(a.discardFailed);
    } finally {
      setShowDiscardModal(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const searchLower = itemSearchText.toLowerCase();
    return products.filter(
      (p) =>
        (p.item_code || '').toLowerCase().includes(searchLower) ||
        (p.eng_name || '').toLowerCase().includes(searchLower) ||
        ((p as Product & { chi_name?: string }).chi_name || '').toLowerCase().includes(searchLower)
    );
  }, [products, itemSearchText]);

  useEffect(() => {
    if (showItemModal) {
      setTimeout(() => itemSearchInputRef.current?.focus?.({ cursor: 'all' }), 0);
    }
  }, [showItemModal]);

  const itemColumns = [
    { title: a.itemCode, dataIndex: 'item_code', key: 'item_code', width: 140 },
    { title: a.itemName, dataIndex: 'item_name', key: 'item_name', width: 200 },
    {
      title: a.chineseName,
      dataIndex: 'chi_name',
      key: 'chi_name',
      width: 160,
      render: (chi: string | undefined) => chi?.trim() || '—',
    },
    {
      title: a.qtyColTitle,
      dataIndex: 'quantity',
      key: 'quantity',
      width: 180,
      render: (qty: number, record: AdjItem) => (
        <InputNumber
          value={qty}
          onChange={(value) => handleQuantityChange(record.key, value)}
          style={{ width: '100%' }}
        />
      ),
    },
    { title: a.unit, dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: a.price,
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => (
        <InputNumber min={0} value={price} disabled style={{ width: '100%' }} />
      ),
    },
    {
      title: a.action,
      key: 'actions',
      width: 80,
      render: (_: unknown, record: AdjItem) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)} />
      ),
    },
  ];

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            { label: bc.warehouse, href: '/warehouse' },
            { label: bc.adjustment, href: '/warehouse/adjustment' },
            { label: isEditMode ? a.breadcrumbEdit : a.breadcrumbCreate, current: true },
          ]}
        />
      }
      buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button onClick={handleBackToStock}>{a.backToStock}</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => form.submit()}
            disabled={(!isCreateReady && !isEditMode) || (isEditMode && loading)}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          {isEditMode && can('void_adjustment') ? (
            <Button danger icon={<CloseOutlined />} onClick={showVoidConfirm} disabled={saving || voiding}>
              {a.void}
            </Button>
          ) : !isEditMode ? (
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={showDiscardConfirm}
              disabled={(!isCreateReady && !isEditMode) || saving}
            >
              {a.discard}
            </Button>
          ) : null}
        </div>
      }
      title={isEditMode ? a.titleEdit(editTransCode) : a.titleCreate}
      description={a.description}
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled:
          saving ||
          voiding ||
          (!isCreateReady && !isEditMode) ||
          (isEditMode && loading),
      }}
    >
      <div className="px-8 py-6 bg-white">
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ transaction_date: dayjs() }}>
          {(!isCreateReady && !isEditMode) || (isEditMode && loading) ? (
            <div className="text-center py-8">
              {isEditMode && loading ? (
                <Spin />
              ) : (
                <>
                  <div className="text-lg text-gray-600">{a.generatingTitle}</div>
                  <div className="text-sm text-gray-500 mt-2">{a.generatingHint}</div>
                </>
              )}
            </div>
          ) : (
            <>
              <Row gutter={24}>
                <Col xs={24}>
                  <Card title={a.basicInfo} size="small" className="mb-6">
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">
                          {a.adjNumber} <span className="text-gray-500 text-sm">{a.adjSuffix}</span>
                        </label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="adj_no" rules={[{ required: true, message: a.adjRequired }]} style={{ marginBottom: 0 }}>
                          <Input
                            disabled
                            style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
                            suffix={generatingNumber ? <Spin size="small" /> : null}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{a.reference}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="reference_no" style={{ marginBottom: 0 }}>
                          <Input placeholder={a.optionalRef} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{a.date}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="transaction_date" style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{a.shop}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="wh_code" rules={[{ required: true, message: a.shopRequired }]} style={{ marginBottom: 0 }}>
                          <Select
                            placeholder={a.selectShop}
                            options={shops.map((s) => ({ value: s.shop_code, label: `${s.shop_code} - ${s.name}` }))}
                            showSearch
                            optionFilterProp="label"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{a.remark}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="remark" style={{ marginBottom: 0 }}>
                          <Input placeholder={a.optionalRemark} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>

              <Card
                title={a.itemsCardTitle}
                size="small"
                className="mb-6"
                extra={
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => setShowItemModal(true)}>
                    {a.addItems}
                  </Button>
                }
              >
                <Table
                  dataSource={items}
                  columns={itemColumns}
                  pagination={false}
                  size="small"
                  rowKey="key"
                  scroll={{ x: 800 }}
                />
              </Card>
            </>
          )}
        </Form>

        <Modal
          title={a.modalGenTitle}
          open={!isEditMode && showGenerateModal}
          onCancel={() => {}}
          closable={false}
          maskClosable={false}
          footer={[
            <Button
              key="discard"
              danger
              onClick={handleDiscardGeneratedTransaction}
              disabled={!transactionSession || generatingNumber}
            >
              {a.discardTransaction}
            </Button>,
            <Button
              key="create"
              type="primary"
              onClick={handleCommitGeneratedTransaction}
              disabled={!transactionSession || generatingNumber}
            >
              {a.createAdj}
            </Button>,
          ]}
          width={600}
        >
          <div className="space-y-4">
            <div>
              <Input
                value={transactionSession?.transactionCode || ''}
                placeholder={generatingNumber ? a.generating : a.willGenerate}
                disabled
                style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
              />
            </div>
            {generatingNumber && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-sm text-yellow-700">{a.generatingWait}</div>
              </div>
            )}
            {transactionSession && !generatingNumber && (
              <div className="p-3 bg-green-50 border border-green-200 rounded flex items-center gap-2">
                <CheckCircleOutlined className="text-green-600 text-lg" />
                <span className="text-sm text-green-700 font-medium">{a.generatedOk}</span>
              </div>
            )}
          </div>
        </Modal>

        <Modal
          title={a.modalDiscardTitle}
          open={showDiscardModal}
          onOk={handleDiscard}
          onCancel={() => setShowDiscardModal(false)}
          okText={a.modalDiscardOk}
          okType="danger"
        >
          <p>{a.modalDiscardBody}</p>
        </Modal>

        <Modal
          title={a.modalVoidTitle}
          open={showVoidModal}
          onOk={handleVoid}
          onCancel={() => setShowVoidModal(false)}
          okText={a.modalVoidOk}
          okType="danger"
        >
          <p>{a.modalVoidBody}</p>
        </Modal>

        <Modal
          title={a.selectItem}
          open={showItemModal}
          onCancel={() => { setShowItemModal(false); setItemSearchText(''); }}
          footer={
            <Button onClick={() => { setShowItemModal(false); setItemSearchText(''); }}>
              {a.close}
            </Button>
          }
          width={600}
        >
          <Input
            ref={itemSearchInputRef}
            placeholder={a.itemSearchPh}
            value={itemSearchText}
            onChange={(e) => setItemSearchText(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-80 overflow-y-auto">
            {filteredProducts.slice(0, 50).map((p) => (
              <div
                key={p.item_code}
                className="flex items-center justify-between py-2 border-b border-gray-100"
              >
                <span>
                  {p.item_code} – {p.eng_name}
                  {p.chi_name?.trim() ? ` (${p.chi_name.trim()})` : ''}
                </span>
                <Space>
                  <Button size="small" type="primary" onClick={() => handleSelectItem(p, false)}>−</Button>
                  <Button size="small" type="primary" onClick={() => handleSelectItem(p, true)}>+</Button>
                </Space>
              </div>
            ))}
            {filteredProducts.length === 0 && <p className="text-gray-500">{a.noMatch}</p>}
          </div>
        </Modal>
      </div>
    </BasicPageLayout>
  );
}

function WarehouseSuspenseLoading() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const loading = getWarehouseTexts(lang).common.loading;
  return (
    <BasicPageLayout breadcrumb={null} buttonBar={null} title="" description="">
      <div className="px-8 py-12 text-center text-gray-500">{loading}</div>
    </BasicPageLayout>
  );
}

export default function AdjustmentPage() {
  return (
    <Suspense fallback={<WarehouseSuspenseLoading />}>
      <AdjustmentPageContent />
    </Suspense>
  );
}
