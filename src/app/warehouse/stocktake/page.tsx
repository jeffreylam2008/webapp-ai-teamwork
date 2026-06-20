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

interface StkItem {
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
  stk_no: string;
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

const STK_PREFIX = 'ST';
const ADJ_PREFIX = 'ADJ';

function StocktakePageContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const w = useMemo(() => getWarehouseTexts(lang), [lang]);
  const s = w.stocktake;
  const editTransCode = searchParams.get('transCode') || '';
  const isEditMode = !!editTransCode;
  const { can, loading: permissionsLoading } = usePermissions();

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<StkItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  const [transactionSession, setTransactionSession] = useState<TransactionSession | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(true);
  const [isCreateReady, setIsCreateReady] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [sendingToAdj, setSendingToAdj] = useState(false);
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [generatingNumber, setGeneratingNumber] = useState(false);
  const itemSearchInputRef = useRef<InputRef>(null);
  const pendingNavigateRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);

  const generateBrowserSessionId = (): string => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `browser_stk_${timestamp}${randomStr}`;
  };

  useEffect(() => {
    if (permissionsLoading) return;
    const denied =
      !can('view_stocktake') ||
      (!isEditMode && !can('create_stocktake')) ||
      (isEditMode && !can('edit_stocktake'));
    if (denied) {
      router.replace('/warehouse/stock');
    }
  }, [permissionsLoading, can, isEditMode, router]);

  useEffect(() => {
    if (isEditMode) return;
    let existingSessionId = sessionStorage.getItem('stocktake_session_id');
    if (!existingSessionId) {
      existingSessionId = generateBrowserSessionId();
      sessionStorage.setItem('stocktake_session_id', existingSessionId);
    }
    setBrowserSessionId(existingSessionId);
  }, [isEditMode]);

  const generateStkNumber = useCallback(async () => {
    if (!browserSessionId) return;
    setGeneratingNumber(true);
    try {
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: STK_PREFIX,
          suffix: getCurrentSuffix(),
          sessionId: browserSessionId,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || s.failedGen);
      }
      const session: TransactionSession = {
        sessionId: browserSessionId,
        prefix: STK_PREFIX,
        suffix: getCurrentSuffix(),
        lastNumber: result.lastNumber,
        transactionCode: result.transactionCode,
      };
      setTransactionSession(session);
      form.setFieldsValue({ stk_no: session.transactionCode });
    } catch (error) {
      message.error(error instanceof Error ? error.message : s.failedGen);
    } finally {
      setGeneratingNumber(false);
    }
  }, [browserSessionId, form, s]);

  useEffect(() => {
    if (isEditMode || !browserSessionId) return;
    setIsCreateReady(false);
    setShowGenerateModal(true);
    setTransactionSession(null);
    form.setFieldsValue({ stk_no: undefined });
    generateStkNumber();
  }, [isEditMode, browserSessionId, generateStkNumber, form]);

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
        message.error(result.error || s.commitFailed);
        return;
      }
      message.success(s.numberGenerated);
      setShowGenerateModal(false);
      setIsCreateReady(true);
    } catch (error) {
      console.error('Error committing transaction:', error);
      message.error(s.commitError);
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
      setTransactionSession(null);
      setIsCreateReady(false);
      setShowGenerateModal(false);
      form.resetFields();
      sessionStorage.removeItem('stocktake_session_id');
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
        throw new Error(result.error || s.loadFailed);
      }
      const header = (result.header || {}) as TransactionHeaderResponse;
      const details = (result.details || []) as TransactionDetailResponse[];
      if (header.prefix && String(header.prefix).toUpperCase() !== STK_PREFIX) {
        throw new Error(s.notStk(editTransCode));
      }
      form.setFieldsValue({
        stk_no: header.trans_code,
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
      message.error(error instanceof Error ? error.message : s.loadFailed);
      setLoading(false);
    }
  }, [editTransCode, form, isEditMode, s, token]);

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
    const newItem: StkItem = {
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
    message.success(s.itemChanged(product.item_code, increase ? s.increased : s.decreased));
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
      const response = await fetchWithAuth('/api/transactions/delete-stocktake', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transCode: editTransCode,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || s.deleteFailed);
      message.success(s.deleted);
      setShowVoidModal(false);
      allowNavigationRef.current = true;
      router.push('/warehouse/stock');
    } catch (error) {
      message.error(error instanceof Error ? error.message : s.deleteFailed);
    } finally {
      setVoiding(false);
    }
  };

  const handleSendToAdjustment = async () => {
    if (!isEditMode || !editTransCode || items.length === 0) {
      message.warning(s.saveFirstAdj);
      return;
    }
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSendingToAdj(true);
    try {
      const itemCodes = items.map((i) => i.item_code).filter(Boolean);
      const res = await fetchWithAuth(
        `/api/warehouse/current-stock?item_codes=${encodeURIComponent(itemCodes.join(','))}`,
        token,
        { cache: 'no-store' }
      );
      const stockResult = await res.json();
      if (!stockResult.success || !Array.isArray(stockResult.data)) {
        throw new Error(stockResult.error || s.failedLoadCurrentStock);
      }
      const currentStockMap = new Map<string, number>();
      for (const row of stockResult.data as { item_code: string; current_stock: number }[]) {
        currentStockMap.set(row.item_code, Number(row.current_stock ?? 0));
      }
      const varianceItems: StkItem[] = [];
      for (const item of items) {
        const currentStock = currentStockMap.get(item.item_code) ?? 0;
        const variance = Number(item.quantity) - currentStock;
        if (variance !== 0) {
          varianceItems.push({
            ...item,
            key: `${item.item_code}-var-${varianceItems.length}`,
            quantity: variance,
          });
        }
      }
      if (varianceItems.length === 0) {
        message.info(s.noVariance);
        return;
      }
      const sessionId = `stk2adj_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const nextRes = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: ADJ_PREFIX,
          suffix: getCurrentSuffix(),
          sessionId,
        }),
      });
      const nextResult = await nextRes.json();
      if (!nextResult.success || !nextResult.transactionCode) {
        throw new Error(nextResult.error || s.failedGenAdj);
      }
      const adjTransCode = nextResult.transactionCode as string;
      const totalAmount = varianceItems.reduce((sum, i) => sum + i.quantity * i.price, 0);
      const authShop = (user?.selected_shopcode || user?.default_shopcode || '').trim();
      const shop_code = authShop || values.wh_code || '';
      const payload = {
        transCode: adjTransCode,
        headerData: {
          prefix: ADJ_PREFIX,
          shop_code,
          wh_code: values.wh_code || '',
          refer_code: editTransCode,
          total: totalAmount,
          quotation_date: dayjs(values.transaction_date).format('YYYY-MM-DD 00:00:00'),
          remark: values.remark ? `From stocktake ${editTransCode}: ${values.remark}` : `From stocktake ${editTransCode}`,
          is_void: 0,
        },
        detailsData: varianceItems.map((item) => ({
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
      const updateRes = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const updateResult = await updateRes.json();
      if (!updateResult.success) {
        throw new Error(updateResult.error || s.failedCreateAdj);
      }
      await fetch('/api/transaction-generator/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      message.success(s.adjCreated(adjTransCode, varianceItems.length));
      allowNavigationRef.current = true;
      router.push(`/warehouse/adjustment?transCode=${encodeURIComponent(adjTransCode)}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : s.sendAdjFailed);
    } finally {
      setSendingToAdj(false);
    }
  };

  const handleSave = async (values: FormValues) => {
    if (items.length === 0) {
      message.error(s.addOneItem);
      return;
    }
    const transCode = isEditMode ? editTransCode : values.stk_no;
    if (!transCode) {
      message.error(s.stkMissing);
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
          prefix: STK_PREFIX,
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
        throw new Error(result.error || s.saveFailed);
      }
      if (!isEditMode && transactionSession) {
        await fetch('/api/transaction-generator/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: transactionSession.sessionId }),
        });
      }
      message.success(isEditMode ? s.updated : s.saved);
      allowNavigationRef.current = true;
      router.push(`/warehouse/stock/detail/${encodeURIComponent(transCode)}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : s.saveFailed);
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
      sessionStorage.removeItem('stocktake_session_id');
      setTransactionSession(null);
      form.resetFields();
      setBrowserSessionId(null);
      message.success(s.discarded);
      setShowDiscardModal(false);
      allowNavigationRef.current = true;
      setTimeout(() => router.push(target), 500);
    } catch {
      message.error(s.discardFailed);
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

  const handleLoadAllItems = () => {
    const byCode = new Map<string, StkItem>();
    items.forEach((i) => byCode.set(i.item_code, i));
    const merged: StkItem[] = products.map((p) => {
      const existing = byCode.get(p.item_code);
      if (existing) return existing;
      return {
        key: `${p.item_code}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        item_code: p.item_code,
        item_name: p.eng_name,
        chi_name: p.chi_name || '',
        quantity: 0,
        price: Number(p.price ?? 0),
        unit: p.unit,
      };
    });
    setItems(merged);
    message.success(s.loadedItems(merged.length));
  };

  const itemColumns = [
    { title: s.itemCode, dataIndex: 'item_code', key: 'item_code', width: 140 },
    { title: s.itemName, dataIndex: 'item_name', key: 'item_name', width: 200 },
    {
      title: s.quantity,
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
      render: (qty: number, record: StkItem) => (
        <InputNumber
          value={qty}
          onChange={(value) => handleQuantityChange(record.key, value)}
          style={{ width: '100%' }}
          min={-999999}
        />
      ),
    },
    { title: s.unit, dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: s.action,
      key: 'actions',
      width: 80,
      render: (_: unknown, record: StkItem) => (
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
            { label: bc.stocktake, href: '/warehouse/stocktake' },
            { label: isEditMode ? s.breadcrumbEdit : s.breadcrumbCreate, current: true },
          ]}
        />
      }
      buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button onClick={handleBackToStock}>{s.backToStock}</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => form.submit()}
            disabled={(!isCreateReady && !isEditMode) || (isEditMode && loading)}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          {isEditMode && (
            <Button
              type="default"
              loading={sendingToAdj}
              onClick={handleSendToAdjustment}
              disabled={saving || voiding || loading || items.length === 0}
            >
              {s.sendToAdj}
            </Button>
          )}
          {isEditMode && can('void_stocktake') ? (
            <Button danger icon={<CloseOutlined />} onClick={showVoidConfirm} disabled={saving || voiding}>
              {s.void}
            </Button>
          ) : !isEditMode ? (
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={showDiscardConfirm}
              disabled={(!isCreateReady && !isEditMode) || saving}
            >
              {s.discard}
            </Button>
          ) : null}
        </div>
      }
      title={isEditMode ? s.titleEdit(editTransCode) : s.titleCreate}
      description={s.description}
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled:
          saving ||
          voiding ||
          sendingToAdj ||
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
                  <div className="text-lg text-gray-600">{s.generatingTitle}</div>
                  <div className="text-sm text-gray-500 mt-2">{s.generatingHint}</div>
                </>
              )}
            </div>
          ) : (
            <>
              <Row gutter={24}>
                <Col xs={24}>
                  <Card title={s.basicInfo} size="small" className="mb-6">
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">
                          {s.stkNumber} <span className="text-gray-500 text-sm">{s.stkSuffix}</span>
                        </label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="stk_no" rules={[{ required: true, message: s.stkRequired }]} style={{ marginBottom: 0 }}>
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
                        <label className="font-medium text-gray-700">{s.reference}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="reference_no" style={{ marginBottom: 0 }}>
                          <Input placeholder={s.optionalRef} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{s.date}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="transaction_date" style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle" className="mb-4">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{s.shop}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="wh_code" rules={[{ required: true, message: s.shopRequired }]} style={{ marginBottom: 0 }}>
                          <Select
                            placeholder={s.selectShop}
                            options={shops.map((s) => ({ value: s.shop_code, label: `${s.shop_code} - ${s.name}` }))}
                            showSearch
                            optionFilterProp="label"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} align="middle">
                      <Col span={6}>
                        <label className="font-medium text-gray-700">{s.remark}</label>
                      </Col>
                      <Col span={18}>
                        <Form.Item name="remark" style={{ marginBottom: 0 }}>
                          <Input placeholder={s.optionalRemark} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>

              <Card
                title={s.itemsCardTitle}
                size="small"
                className="mb-6"
                extra={
                  <span className="flex gap-2">
                    <Button type="default" onClick={handleLoadAllItems} disabled={products.length === 0}>
                      {s.loadAllItems}
                    </Button>
                    <Button type="primary" icon={<SearchOutlined />} onClick={() => setShowItemModal(true)}>
                      {s.addItems}
                    </Button>
                  </span>
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
          title={s.modalGenTitle}
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
              {s.discardTransaction}
            </Button>,
            <Button
              key="create"
              type="primary"
              onClick={handleCommitGeneratedTransaction}
              disabled={!transactionSession || generatingNumber}
            >
              {s.createStk}
            </Button>,
          ]}
          width={600}
        >
          <div className="space-y-4">
            <div>
              <Input
                value={transactionSession?.transactionCode || ''}
                placeholder={generatingNumber ? s.generating : s.willGenerate}
                disabled
                style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
              />
            </div>
            {generatingNumber && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-sm text-yellow-700">{s.generatingWait}</div>
              </div>
            )}
            {transactionSession && !generatingNumber && (
              <div className="p-3 bg-green-50 border border-green-200 rounded flex items-center gap-2">
                <CheckCircleOutlined className="text-green-600 text-lg" />
                <span className="text-sm text-green-700 font-medium">{s.generatedOk}</span>
              </div>
            )}
          </div>
        </Modal>

        <Modal
          title={s.modalDiscardTitle}
          open={showDiscardModal}
          onOk={handleDiscard}
          onCancel={() => setShowDiscardModal(false)}
          okText={s.modalDiscardOk}
          okType="danger"
        >
          <p>{s.modalDiscardBody}</p>
        </Modal>

        <Modal
          title={s.modalVoidTitle}
          open={showVoidModal}
          onOk={handleVoid}
          onCancel={() => setShowVoidModal(false)}
          okText={s.modalVoidOk}
          okType="danger"
        >
          <p>{s.modalVoidBody}</p>
        </Modal>

        <Modal
          title={s.selectItem}
          open={showItemModal}
          onCancel={() => { setShowItemModal(false); setItemSearchText(''); }}
          footer={
            <Button onClick={() => { setShowItemModal(false); setItemSearchText(''); }}>
              {s.close}
            </Button>
          }
          width={600}
        >
          <Input
            ref={itemSearchInputRef}
            placeholder={s.itemSearchPh}
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
                <span>{p.item_code} – {p.eng_name}</span>
                <Space>
                  <Button size="small" type="primary" onClick={() => handleSelectItem(p, false)}>−</Button>
                  <Button size="small" type="primary" onClick={() => handleSelectItem(p, true)}>+</Button>
                </Space>
              </div>
            ))}
            {filteredProducts.length === 0 && <p className="text-gray-500">{s.noMatch}</p>}
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

export default function StocktakePage() {
  return (
    <Suspense fallback={<WarehouseSuspenseLoading />}>
      <StocktakePageContent />
    </Suspense>
  );
}
