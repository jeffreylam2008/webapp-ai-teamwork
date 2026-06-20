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
import { Form, Input, type InputRef, DatePicker, Select, Button, Table, message, Card, Row, Col, Typography, Modal, Spin, InputNumber, Space } from 'antd';
import dayjs from 'dayjs';
import { TransactionSession } from '@/services/transactionGenerator';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatCurrency } from '@/utils/formatCurrency';

const { Title, Text } = Typography;
const { Option } = Select;

interface GRNItem {
  key: string;
  item_code: string;
  item_name: string;
  chi_name?: string;
  quantity: number;
  price: number;
  unit?: string;
  discount?: number;
  /** When from PO: order qty from PO */
  order_qty?: number;
  /** When from PO: remaining to receive (order - already received) */
  remaining?: number;
}

interface Shop {
  shop_code: string;
  name: string;
}

interface Supplier {
  supp_code: string;
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
  grn_no: string;
  reference_no?: string;
  transaction_date: dayjs.Dayjs;
  wh_code: string;
  supp_code: string;
  remark?: string;
}

interface TransactionHeaderResponse {
  trans_code: string;
  refer_code?: string;
  shop_code?: string;
  wh_code?: string;
  supp_code?: string;
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
  discount?: number;
}

function GRNPageContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const w = useMemo(() => getWarehouseTexts(lang), [lang]);
  const g = w.grn;
  const editTransCode = searchParams.get('transCode') || '';
  const poTransCode = searchParams.get('po') || '';
  const isEditMode = !!editTransCode;
  const isFromPO = !!poTransCode && !isEditMode;

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [items, setItems] = useState<GRNItem[]>([]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<{ supp_code: string; name: string } | null>(null);
  const [supplierSearchText, setSupplierSearchText] = useState('');
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
  /** Avoid duplicate /transaction-generator/next for the same browser session (e.g. Strict Mode double mount). */
  const grnGenerateInitializedRef = useRef<string | null>(null);

  // When creating GRN from PO: PO header, details, and received qty per item
  const [poHeader, setPoHeader] = useState<TransactionHeaderResponse | null>(null);
  const [poDetails, setPoDetails] = useState<TransactionDetailResponse[]>([]);
  const [receivedPerItem, setReceivedPerItem] = useState<Record<string, number>>({});
  const [poReceivedLoaded, setPoReceivedLoaded] = useState(false);

  const getCurrentSuffix = (): string => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}`;
  };

  const generateBrowserSessionId = (): string => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `browser_${timestamp}${randomStr}`;
  };

  // Initialize browser session (create flow only)
  useEffect(() => {
    if (isEditMode) return;
    // PO→GRN: always start a new generator session so we never reuse a stale reservation / same code as last draft.
    if (poTransCode) {
      sessionStorage.removeItem('grn_session_id');
      grnGenerateInitializedRef.current = null;
    }
    let existingSessionId = sessionStorage.getItem('grn_session_id');
    if (!existingSessionId) {
      existingSessionId = generateBrowserSessionId();
      sessionStorage.setItem('grn_session_id', existingSessionId);
    }
    setBrowserSessionId(existingSessionId);
  }, [isEditMode, poTransCode]);

  const generateGRNNumber = useCallback(async () => {
    if (!browserSessionId) return;
    setGeneratingNumber(true);
    try {
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'GRN',
          suffix: getCurrentSuffix(),
          sessionId: browserSessionId,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || g.failedGen);
      }
      const session: TransactionSession = {
        sessionId: browserSessionId,
        prefix: 'GRN',
        suffix: getCurrentSuffix(),
        lastNumber: result.lastNumber,
        transactionCode: result.transactionCode,
      };
      setTransactionSession(session);
      form.setFieldsValue({ grn_no: session.transactionCode });
    } catch (error) {
      grnGenerateInitializedRef.current = null;
      message.error(error instanceof Error ? error.message : g.failedGen);
    } finally {
      setGeneratingNumber(false);
    }
  }, [browserSessionId, form, g]);

  // Create flow: show generate modal and generate number (like delivery-note)
  useEffect(() => {
    if (isEditMode || !browserSessionId) return;
    if (grnGenerateInitializedRef.current === browserSessionId) return;
    grnGenerateInitializedRef.current = browserSessionId;
    setIsCreateReady(false);
    setShowGenerateModal(true);
    setTransactionSession(null);
    form.setFieldsValue({ grn_no: undefined });
    void generateGRNNumber();
  }, [isEditMode, browserSessionId, generateGRNNumber, form]);

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
        message.error(result.error || g.commitFailed);
        return;
      }
      message.success(g.numberGenerated);
      setShowGenerateModal(false);
      setIsCreateReady(true);
    } catch (error) {
      console.error('Error committing transaction:', error);
      message.error(g.commitError);
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
      sessionStorage.removeItem('grn_session_id');
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
    const originalPush = router.push.bind(router) as typeof router.push;
    const originalReplace = router.replace.bind(router) as typeof router.replace;

    router.push = (href: string | { pathname: string }, options?: { scroll?: boolean }) => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return originalPush(href as Parameters<typeof originalPush>[0], options);
      }
      const hrefString = typeof href === 'string' ? href : (href as { pathname: string }).pathname;
      if (typeof window === 'undefined' || hrefString === window.location.pathname || hrefString.startsWith('#')) {
        return originalPush(href as Parameters<typeof originalPush>[0], options);
      }
      pendingNavigateRef.current = hrefString;
      setShowDiscardModal(true);
      return Promise.resolve(undefined as void);
    };

    router.replace = (href: string | { pathname: string }, options?: { scroll?: boolean }) => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return originalReplace(href as Parameters<typeof originalReplace>[0], options);
      }
      const hrefString = typeof href === 'string' ? href : (href as { pathname: string }).pathname;
      if (typeof window === 'undefined' || hrefString === window.location.pathname || hrefString.startsWith('#')) {
        return originalReplace(href as Parameters<typeof originalReplace>[0], options);
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

  const loadSuppliers = useCallback(async () => {
    const response = await fetch('/api/suppliers?limit=1000&offset=0');
    const result = await response.json();
    if (result.success) {
      setSuppliers(result.data || []);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    const response = await fetch('/api/products?limit=1000');
    const result = await response.json();
    if (result.success) {
      setProducts(result.data || []);
    }
  }, []);

  const loadPOData = useCallback(async (signal?: AbortSignal) => {
    if (!poTransCode) return;
    try {
      const [detailRes, receivedRes] = await Promise.all([
        fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(poTransCode)}`, token, {
          cache: 'no-store',
          signal,
        }),
        fetchWithAuth(`/api/transactions/po-received/${encodeURIComponent(poTransCode)}`, token, {
          cache: 'no-store',
          signal,
        }),
      ]);
      const detailResult = await detailRes.json();
      const receivedResult = await receivedRes.json();
      if (detailResult.success && detailResult.header) {
        const header = detailResult.header as TransactionHeaderResponse;
        if (header.prefix !== 'PO') {
          message.warning(g.notPO);
          return;
        }
        setPoHeader(header);
        setPoDetails(detailResult.details || []);
      } else {
        message.error(detailResult.error || g.failedLoadPO);
        return;
      }
      if (receivedResult.success) {
        setReceivedPerItem(receivedResult.receivedPerItem || {});
      }
      setPoReceivedLoaded(true);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      message.error(g.failedLoadPOData);
      console.error(e);
    }
  }, [poTransCode, g, token]);

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
        throw new Error(result.error || g.failedLoad);
      }

      const header = (result.header || {}) as TransactionHeaderResponse;
      const details = (result.details || []) as TransactionDetailResponse[];

      if (header.prefix && String(header.prefix).toUpperCase() !== 'GRN') {
        throw new Error(g.notGrn(editTransCode));
      }

      form.setFieldsValue({
        grn_no: header.trans_code,
        reference_no: header.refer_code || '',
        transaction_date: header.create_date ? dayjs(header.create_date) : dayjs(),
        wh_code: (header.wh_code || header.shop_code || undefined) as string | undefined,
        supp_code: header.supp_code || undefined,
        remark: header.remark || '',
      });

      if (header.supp_code) {
        setSelectedSupplier({ supp_code: header.supp_code, name: header.supp_code });
      }

      setItems(
        details.map((d, idx) => ({
          key: `${d.item_code}-${idx}`,
          item_code: d.item_code,
          item_name: d.eng_name,
          chi_name: d.chi_name || '',
          quantity: Number(d.qty || 0),
          price: Number(d.price || 0),
          unit: d.unit || '',
          discount: Number(d.discount || 0),
        }))
      );
      setLoading(false);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      message.error(error instanceof Error ? error.message : g.loadFailed);
      setLoading(false);
    }
  }, [editTransCode, form, isEditMode, g, token]);

  useEffect(() => {
    loadShops();
    loadSuppliers();
    loadProducts();
    form.setFieldsValue({ transaction_date: dayjs() });
  }, [form, loadProducts, loadShops, loadSuppliers]);

  useEffect(() => {
    const ac = new AbortController();
    void loadEditTransaction(ac.signal);
    return () => ac.abort();
  }, [loadEditTransaction]);

  useEffect(() => {
    if (!isFromPO || !poTransCode) return;
    const ac = new AbortController();
    void loadPOData(ac.signal);
    return () => ac.abort();
  }, [isFromPO, poTransCode, loadPOData]);

  // Pre-fill form and items from PO when create is ready and PO data is loaded
  useEffect(() => {
    if (!isCreateReady || !isFromPO || !poHeader || !poDetails.length) return;
    form.setFieldsValue({
      reference_no: poTransCode,
      wh_code: (poHeader.wh_code || poHeader.shop_code || undefined) as string | undefined,
      supp_code: poHeader.supp_code || undefined,
    });
    if (poHeader.supp_code) {
      setSelectedSupplier({ supp_code: poHeader.supp_code, name: poHeader.supp_code });
    }
    const rows = poDetails
      .map((d, idx) => {
        const orderQty = Number(d.qty || 0);
        const received = receivedPerItem[d.item_code] || 0;
        const remaining = Math.max(0, orderQty - received);
        return {
          key: `po-${d.item_code}-${idx}-${Date.now()}`,
          item_code: d.item_code,
          item_name: d.eng_name || '',
          chi_name: (d as { chi_name?: string }).chi_name || '',
          quantity: remaining,
          price: Number(d.price || 0),
          unit: d.unit || '',
          discount: Number(d.discount || 0),
          order_qty: orderQty,
          remaining,
        };
      })
      .filter((r) => r.remaining > 0);
    setItems(rows);
  }, [isCreateReady, isFromPO, poHeader, poDetails, receivedPerItem, poTransCode, form]);

  // Sync supplier display name when suppliers load (e.g. after edit load)
  useEffect(() => {
    if (!selectedSupplier || selectedSupplier.name !== selectedSupplier.supp_code) return;
    const supp = suppliers.find((s) => s.supp_code === selectedSupplier.supp_code);
    if (supp) {
      setSelectedSupplier({ supp_code: supp.supp_code, name: supp.name });
    }
  }, [suppliers, selectedSupplier?.supp_code]);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier({ supp_code: supplier.supp_code, name: supplier.name });
    form.setFieldsValue({ supp_code: supplier.supp_code });
    setShowSupplierModal(false);
    setSupplierSearchText('');
  };

  const handleClearSupplier = () => {
    setSelectedSupplier(null);
    form.setFieldsValue({ supp_code: undefined });
  };

  const filteredSuppliers = useMemo(() => {
    const searchLower = supplierSearchText.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.supp_code.toLowerCase().includes(searchLower) ||
        s.name.toLowerCase().includes(searchLower)
    );
  }, [suppliers, supplierSearchText]);

  const addOrIncrementItem = (product: Product): boolean => {
    const existingIdx = items.findIndex((i) => i.item_code === product.item_code);
    if (existingIdx >= 0) {
      const next = [...items];
      next[existingIdx] = {
        ...next[existingIdx],
        quantity: next[existingIdx].quantity + 1,
      };
      setItems(next);
      return true;
    }
    const newItem: GRNItem = {
      key: `${product.item_code}-${Date.now()}`,
      item_code: product.item_code,
      item_name: product.eng_name,
      chi_name: product.chi_name || '',
      quantity: 1,
      price: Number(product.price || 0),
      unit: product.unit,
      discount: 0,
    };
    setItems([...items, newItem]);
    return false;
  };

  const handleSelectItem = (product: Product) => {
    const alreadyExists = addOrIncrementItem(product);
    if (alreadyExists) {
      message.success(`${product.item_code} ${g.itemQtyIncreased}`);
    } else {
      message.success(`${product.item_code} ${g.itemAdded}`);
    }
    setTimeout(() => itemSearchInputRef.current?.focus?.({ cursor: 'all' }), 0);
  };

  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleQuantityChange = (key: string, quantity: number | null) => {
    const nextQty = Number(quantity || 0);
    if (nextQty <= 0) return;
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
          headerData: { prefix: 'GRN', is_void: 1 },
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || g.voidFailed);
      message.success(g.voided);
      setShowVoidModal(false);
      allowNavigationRef.current = true;
      router.push('/warehouse/stock');
    } catch (error) {
      message.error(error instanceof Error ? error.message : g.voidFailed);
    } finally {
      setVoiding(false);
    }
  };

  const handleSave = async (values: FormValues) => {
    if (items.length === 0) {
      message.error(g.addOneItem);
      return;
    }

    const transCode = isEditMode ? editTransCode : values.grn_no;
    if (!transCode) {
      message.error(g.grnMissing);
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
          prefix: 'GRN',
          supp_code: values.supp_code,
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
          discount: Number(item.discount || 0),
        })),
        paymentTotalsData: [],
        ...(isFromPO && poTransCode ? { poTransCode } : {}),
      };

      const response = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || g.saveFailed);
      }

      if (!isEditMode && transactionSession) {
        try {
          const commitResponse = await fetch('/api/transaction-generator/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: transactionSession.sessionId }),
          });
          const commitResult = await commitResponse.json();
          if (!commitResult.success) {
            console.error('[GRN] Generator commit after save failed:', commitResult.error);
            message.warning(commitResult.error || g.commitFailed);
          }
        } catch (e) {
          console.error('[GRN] Generator commit after save:', e);
          message.warning(g.commitError);
        }
      }

      sessionStorage.removeItem('grn_session_id');
      grnGenerateInitializedRef.current = null;

      message.success(isEditMode ? g.updated : g.created);
      allowNavigationRef.current = true;
      router.push(`/warehouse/stock/detail/${encodeURIComponent(transCode)}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : g.saveFailed);
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
      sessionStorage.removeItem('grn_session_id');
      setTransactionSession(null);
      form.resetFields();
      setBrowserSessionId(null);
      message.success(g.discarded);
      setShowDiscardModal(false);
      allowNavigationRef.current = true;
      setTimeout(() => router.push(target), 500);
    } catch {
      message.error(g.discardFailed);
    } finally {
      setShowDiscardModal(false);
    }
  };

  const filteredItems = useMemo(() => {
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

  const itemColumns = useMemo(() => {
    const base = [
      { title: g.itemCode, dataIndex: 'item_code', key: 'item_code', width: 140 },
      { title: g.itemName, dataIndex: 'item_name', key: 'item_name', width: 200 },
      ...(isFromPO
        ? [
            { title: g.orderQty, dataIndex: 'order_qty', key: 'order_qty', width: 90, render: (v: number) => v ?? '—' },
            { title: g.remaining, dataIndex: 'remaining', key: 'remaining', width: 90, render: (v: number) => v ?? '—' },
          ]
        : []),
      {
        title: g.quantity,
        dataIndex: 'quantity',
        key: 'quantity',
        width: 120,
        render: (qty: number, record: GRNItem) => (
          <InputNumber
            min={1}
            max={record.remaining != null ? record.remaining : undefined}
            value={qty}
            onChange={(value) => handleQuantityChange(record.key, value)}
            style={{ width: '100%' }}
          />
        ),
      },
      { title: g.unit, dataIndex: 'unit', key: 'unit', width: 80 },
      {
        title: g.price,
        dataIndex: 'price',
        key: 'price',
        width: 120,
        render: (price: number) => (
          <InputNumber
            min={0}
            value={price}
            disabled
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title: g.action,
        key: 'actions',
        width: 80,
        render: (_: unknown, record: GRNItem) => (
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)} />
        ),
      },
    ];
    return base;
  }, [isFromPO, g]);

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            { label: bc.warehouse, href: '/warehouse' },
            { label: bc.stock, href: '/warehouse/stock' },
            { label: isEditMode ? g.breadcrumbEdit : g.breadcrumbCreate, current: true },
          ]}
        />
      }
      buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button onClick={handleBackToStock}>
            {g.backToStock}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => form.submit()}
            disabled={(!isCreateReady && !isEditMode) || (isEditMode && loading)}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          {isEditMode ? (
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={showVoidConfirm}
              disabled={saving || voiding}
            >
              {g.void}
            </Button>
          ) : (
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={showDiscardConfirm}
              disabled={(!isCreateReady && !isEditMode) || saving}
            >
              {g.discard}
            </Button>
          )}
        </div>
      }
      title={isEditMode ? g.titleEdit(editTransCode) : g.titleCreate}
      description={g.description}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ transaction_date: dayjs() }}
        >
          {(!isCreateReady && !isEditMode) || (isEditMode && loading) ? (
            <div className="text-center py-8">
              {isEditMode && loading ? (
                <Spin />
              ) : (
                <>
                  <div className="text-lg text-gray-600">{g.generatingTitle}</div>
                  <div className="text-sm text-gray-500 mt-2">{g.generatingHint}</div>
                </>
              )}
            </div>
          ) : (
            <>
            <Row gutter={24}>
              <Col xs={24}>
                <Card title={g.basicInfo} size="small" className="mb-6">
                  <Row gutter={16} align="middle" className="mb-4">
                    <Col span={6}>
                      <label className="font-medium text-gray-700">
                        {g.grnNumber} <span className="text-gray-500 text-sm">{g.autoGenerated}</span>
                      </label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="grn_no" rules={[{ required: true, message: g.grnRequired }]} style={{ marginBottom: 0 }}>
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
                      <label className="font-medium text-gray-700">{g.referenceNumber}</label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="reference_no" style={{ marginBottom: 0 }}>
                        <Input placeholder={g.refPlaceholder} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16} align="middle">
                    <Col span={6}>
                      <label className="font-medium text-gray-700">{g.date}</label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="transaction_date" style={{ marginBottom: 0 }}>
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>

              <Col xs={24}>
                <Card title={g.supplierWarehouse} size="small" className="mb-6">
                  <Row gutter={16} align="middle" className="mb-4">
                    <Col span={6}>
                      <label className="font-medium text-gray-700">{g.shop}</label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="wh_code" rules={[{ required: true, message: g.shopRequired }]} style={{ marginBottom: 0 }}>
                        <Select
                          placeholder={g.selectShop}
                          options={shops.map((s) => ({ value: s.shop_code, label: `${s.shop_code} - ${s.name}` }))}
                          showSearch
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16} align="middle" className="mb-4">
                    <Col span={6}>
                      <label className="font-medium text-gray-700">{g.supplier}</label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="supp_code" rules={[{ required: true, message: g.supplierRequired }]} style={{ marginBottom: 0 }}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder={g.supplierPlaceholder}
                            value={selectedSupplier ? `${selectedSupplier.supp_code} - ${selectedSupplier.name}` : ''}
                            readOnly
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowSupplierModal(true)}
                          />
                          <Button icon={<SearchOutlined />} onClick={() => setShowSupplierModal(true)}>
                            {g.select}
                          </Button>
                          {selectedSupplier && (
                            <Button danger onClick={handleClearSupplier}>
                              {g.clear}
                            </Button>
                          )}
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16} align="middle">
                    <Col span={6}>
                      <label className="font-medium text-gray-700">{g.remark}</label>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="remark" style={{ marginBottom: 0 }}>
                        <Input placeholder={g.optionalRemark} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>

            <Card
              title={g.items}
              size="small"
              className="mb-6"
              extra={
                <Button type="primary" icon={<SearchOutlined />} onClick={() => setShowItemModal(true)}>
                  {g.items}
                </Button>
              }
            >
              <Table columns={itemColumns} dataSource={items} pagination={false} size="small" scroll={{ x: 800 }} showHeader />
              <div className="mt-4 text-right">
                <Title level={5}>
                  {g.totalItems} <Text type="success">{items.length}</Text>
                </Title>
              </div>
            </Card>
            </>
          )}
        </Form>

        {/* Discard Confirmation Modal */}
        <Modal
          title={isEditMode ? g.modalDiscardEdit : g.modalDiscardCreate}
          open={showDiscardModal}
          onOk={handleDiscard}
          onCancel={() => setShowDiscardModal(false)}
          okText={isEditMode ? g.modalDiscardOkEdit : g.modalDiscardOkCreate}
          cancelText={g.cancel}
          okButtonProps={{ danger: !isEditMode }}
        >
          {isEditMode ? (
            <p>{g.leaveUnsaved}</p>
          ) : (
            <>
              <p>{g.modalDiscardBody}</p>
              <p><strong>{g.modalDiscardIrreversible}</strong></p>
              {transactionSession && (
                <p><strong>{g.transactionCode}</strong> {transactionSession.transactionCode}</p>
              )}
            </>
          )}
        </Modal>

        {/* Void Confirmation Modal (edit mode only) */}
        <Modal
          title={g.modalVoidTitle}
          open={showVoidModal}
          onOk={handleVoid}
          onCancel={() => setShowVoidModal(false)}
          okText={g.modalVoidOk}
          cancelText={g.cancel}
          okButtonProps={{ danger: true }}
          confirmLoading={voiding}
        >
          <p>{g.voidBody}</p>
          <p><strong>{g.modalDiscardIrreversible}</strong></p>
        </Modal>

        {/* Supplier Selection Modal */}
        <Modal
          title={g.selectSupplier}
          open={showSupplierModal}
          onCancel={() => {
            setShowSupplierModal(false);
            setSupplierSearchText('');
          }}
          footer={null}
          width={700}
        >
          <div className="mb-4">
            <Input
              placeholder={g.supplierSearchPh}
              prefix={<SearchOutlined />}
              value={supplierSearchText}
              onChange={(e) => setSupplierSearchText(e.target.value)}
              allowClear
            />
          </div>
          <Table
            columns={[
              { title: g.supplierCode, dataIndex: 'supp_code', key: 'supp_code', width: '35%' },
              { title: g.supplierName, dataIndex: 'name', key: 'name', width: '65%' },
            ]}
            dataSource={filteredSuppliers}
            rowKey="supp_code"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            onRow={(record) => ({
              onClick: () => handleSelectSupplier(record),
              style: { cursor: 'pointer' },
            })}
            rowClassName="hover:bg-blue-50"
            size="small"
          />
        </Modal>

        {/* GRN Code Generation Modal (delivery-note style) */}
        {!isEditMode && (
          <Modal
            title={g.modalGenTitle}
            open={showGenerateModal}
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
                {g.discardTransaction}
              </Button>,
              <Button
                key="create"
                type="primary"
                onClick={handleCommitGeneratedTransaction}
                disabled={!transactionSession || generatingNumber}
              >
                {g.createGrn}
              </Button>,
            ]}
            width={600}
          >
            <div className="space-y-4">
              <div>
                <Input
                  value={transactionSession?.transactionCode || ''}
                  placeholder={generatingNumber ? g.generating : g.willGenerate}
                  disabled
                  style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
                />
              </div>
              {generatingNumber && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <div className="text-sm text-yellow-700">{g.generatingWait}</div>
                </div>
              )}
              {transactionSession && !generatingNumber && (
                <div className="p-3 bg-green-50 border border-green-200 rounded flex items-center gap-2">
                  <CheckCircleOutlined className="text-green-600 text-lg" />
                  <span className="text-sm text-green-700 font-medium">{g.generatedOk}</span>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* Item Selection Modal */}
        <Modal
          title={g.selectItem}
          open={showItemModal}
          onCancel={() => {
            setShowItemModal(false);
            setItemSearchText('');
          }}
          footer={[
            <Button
              key="exit"
              onClick={() => {
                setShowItemModal(false);
                setItemSearchText('');
              }}
            >
              {g.close}
            </Button>,
          ]}
          width={900}
          afterOpenChange={(open) => {
            if (open) setTimeout(() => itemSearchInputRef.current?.focus(), 0);
          }}
        >
          <div className="mb-4">
            <Input
              ref={itemSearchInputRef}
              placeholder={g.itemSearchPh}
              prefix={<SearchOutlined />}
              value={itemSearchText}
              onChange={(e) => setItemSearchText(e.target.value)}
              allowClear
            />
          </div>
          <Table
            columns={[
              { title: g.itemCode, dataIndex: 'item_code', key: 'item_code', width: '20%' },
              { title: g.englishName, dataIndex: 'eng_name', key: 'eng_name', width: '30%' },
              { title: g.chineseName, dataIndex: 'chi_name', key: 'chi_name', width: '25%' },
              { title: g.unit, dataIndex: 'unit', key: 'unit', width: '10%' },
              {
                title: g.price,
                dataIndex: 'price',
                key: 'price',
                width: '15%',
                render: (price: number | undefined) =>
                  typeof price === 'number' ? formatCurrency(price) : '-',
              },
            ]}
            dataSource={filteredItems}
            rowKey="item_code"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            onRow={(record) => ({
              onClick: () => handleSelectItem(record),
              style: { cursor: 'pointer' },
            })}
            rowClassName="hover:bg-blue-50"
            size="small"
          />
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

export default function GRNPage() {
  return (
    <Suspense fallback={<WarehouseSuspenseLoading />}>
      <GRNPageContent />
    </Suspense>
  );
}
