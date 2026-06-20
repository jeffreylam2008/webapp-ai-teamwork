'use client';
import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getWarehouseTexts } from '@/app/warehouse/i18n';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { DeleteOutlined, SaveOutlined, CloseOutlined, SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Form, Input, type InputRef, DatePicker, Select, Button, Table, message, Card, Row, Col, Typography, Modal, Spin, InputNumber, Space, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { TransactionGenerator, TransactionSession } from '@/services/transactionGenerator';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const { Title, Text } = Typography;
const { Option } = Select;

interface DeliveryNoteItem {
  key: string;
  item_code: string;
  item_name: string;
  quantity: number;
}

interface Shop {
  uid: number;
  shop_code: string;
  name: string;
  phone: string;
  address1: string;
  address2: string;
}

interface Customer {
  cust_code: string;
  name: string;
  attn_1: string;
  phone_1: string;
  delivery_addr: string;
  pm_code?: string | null;
}

interface PaymentMethod {
  pm_code: string;
  payment_method: string;
}

interface SalesOrderSummary {
  transaction_id: string;
  customer_name?: string;
  status: string;
  transaction_date?: string;
  is_settle?: number;
}

function isConfirmedSalesOrder(row: { is_settle?: number; status?: string }): boolean {
  return Number(row.is_settle ?? 0) === 1 || String(row.status || '').trim() === 'Settled';
}

interface Product {
  uid: number;
  item_code: string;
  chi_name: string;
  eng_name: string;
  price: number;
  unit: string;
}

interface FormValues {
  delivery_note_no: string;
  reference_no: string;
  transaction_date: dayjs.Dayjs;
  wh_code: string;
  cust_code: string;
  pm_code: string;
}

function DeliveryNotePageContent() {
  const router = useRouter();
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const w = useMemo(() => getWarehouseTexts(lang), [lang]);
  const d = w.deliveryNote;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ cust_code: string; name: string } | null>(null);
  const [customerSearchText, setCustomerSearchText] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<DeliveryNoteItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');
  const [transactionSession, setTransactionSession] = useState<TransactionSession | null>(null);
  const [isCreateReady, setIsCreateReady] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [generatingNumber, setGeneratingNumber] = useState(false);
  const [showSalesOrderModal, setShowSalesOrderModal] = useState(true);
  const [salesOrders, setSalesOrders] = useState<SalesOrderSummary[]>([]);
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<string | undefined>(undefined);
  const itemSearchInputRef = useRef<InputRef>(null);
  const pendingNavigateRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  /** SO header shop: required for t_warehouse_stage when DN references a Sales Order */
  const salesOrderShopCodeRef = useRef<string | null>(null);

  const itemsLockedFromConfirmedSo = useMemo(
    () => Boolean(selectedSalesOrder?.trim()),
    [selectedSalesOrder]
  );

  const goBackToStock = useBackNavigation(() => router.push('/warehouse/stock'));

  // Initialize browser session ID
  useEffect(() => {
    const initializeBrowserSession = () => {
      try {
        // Check if we already have a session ID in sessionStorage
        let existingSessionId = sessionStorage.getItem('delivery_note_session_id');
        
        if (!existingSessionId) {
          // Generate new browser session ID
          existingSessionId = generateBrowserSessionId();
          sessionStorage.setItem('delivery_note_session_id', existingSessionId);
          console.log('Generated new browser session ID:', existingSessionId);
        } else {
          console.log('Using existing browser session ID:', existingSessionId);
        }
        
        setBrowserSessionId(existingSessionId);
      } catch (error) {
        console.error('Error initializing browser session:', error);
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

  const getCurrentSuffix = (): string => {
    // Generate suffix in format YYMM (e.g., 2509 for September 2025)
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month with leading zero
    return `${year}${month}`;
  };

  const generateDeliveryNoteNumber = useCallback(async () => {
    if (!browserSessionId) return;

    setGeneratingNumber(true);
    try {
      const response = await fetch('/api/transaction-generator/next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: 'DN',
          suffix: getCurrentSuffix(),
          sessionId: browserSessionId,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || d.failedGenNumber);
      }

      const session: TransactionSession = {
        sessionId: browserSessionId,
        prefix: 'DN',
        suffix: getCurrentSuffix(),
        lastNumber: result.lastNumber,
        transactionCode: result.transactionCode,
      };

      setTransactionSession(session);
      form.setFieldsValue({ delivery_note_no: session.transactionCode });
      setIsCreateReady(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : d.failedGenNumber;
      message.error(errorMessage);
    } finally {
      setGeneratingNumber(false);
    }
  }, [browserSessionId, form, d]);

  // Load non-void, confirmed Sales Orders for DN reference
  const loadSalesOrdersForDelivery = useCallback(async () => {
    setSalesOrdersLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/delivery-notes/sales-orders?_=${Date.now()}`,
        token,
        {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }
      );
      const rawText = await response.text();
      let result: { success?: boolean; data?: SalesOrderSummary[]; error?: string };
      try {
        result = rawText ? (JSON.parse(rawText) as typeof result) : {};
      } catch {
        throw new Error(
          response.ok ? 'Invalid response from server' : `Failed to load sales orders (${response.status})`
        );
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to load sales orders (${response.status})`);
      }
      const list = Array.isArray(result.data) ? result.data : [];
      const confirmedOnly = list
        .map((row) => ({
          transaction_id: String(row.transaction_id || '').trim(),
          customer_name: row.customer_name,
          status: String(row.status || (Number(row.is_settle) === 1 ? 'Settled' : 'Draft')),
          transaction_date: row.transaction_date,
          is_settle: Number(row.is_settle ?? 0) === 1 ? 1 : 0,
        }))
        .filter((row) => row.transaction_id && isConfirmedSalesOrder(row));
      setSalesOrders(confirmedOnly);
      setSelectedSalesOrder((prev) =>
        prev && confirmedOnly.some((row) => row.transaction_id === prev) ? prev : undefined
      );
    } catch (error) {
      console.error('Error loading Sales Orders:', error);
      message.error(error instanceof Error ? error.message : d.errorLoadSO);
      setSalesOrders([]);
    } finally {
      setSalesOrdersLoading(false);
    }
  }, [d.errorLoadSO, token]);

  // Step 1: ask user to select a Sales Order before generating DN number
  useEffect(() => {
    if (!browserSessionId) return;
    setIsCreateReady(false);
    setTransactionSession(null);
    form.setFieldsValue({ delivery_note_no: undefined });
    setShowSalesOrderModal(true);
  }, [browserSessionId, form]);

  // Load reference data on mount
  useEffect(() => {
    loadShops();
    loadCustomers();
    loadPaymentMethods();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  // Reload SO list when modal opens (auth cookie/token may not be ready on first mount)
  useEffect(() => {
    if (!showSalesOrderModal) return;
    void loadSalesOrdersForDelivery();
  }, [showSalesOrderModal, token, loadSalesOrdersForDelivery]);

  // Note: Automatic discard on page unload has been removed
  // Transaction sessions will persist until manually discarded or committed

  // Load shops
  const loadShops = useCallback(async () => {
    try {
      const response = await fetch('/api/shops?warehouseOnly=1');
      const result = await response.json();
      if (!result.success) return;

      const list = (result.data || []) as Shop[];
      setShops(list);

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
    } catch (error) {
      console.error('Error loading shops:', error);
    }
  }, [form, user]);

  // Load customers
  const loadCustomers = useCallback(async () => {
    try {
      const response = await fetchWithAuth(
        '/api/customers?limit=1000&offset=0&fields=cust_code,name,attn_1,phone_1,delivery_addr,pm_code',
        token,
        { cache: 'no-store' }
      );
      const result = await response.json();

      if (result.success) {
        setCustomers(result.data || []);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  }, [token]);

  // Load payment methods
  const loadPaymentMethods = useCallback(async () => {
    try {
      const response = await fetch('/api/payment-methods');
      const result = await response.json();
      if (result.success) {
        setPaymentMethods(result.data);
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    }
  }, []);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer({ cust_code: customer.cust_code, name: customer.name });
    const formValues: { cust_code: string; pm_code?: string } = { cust_code: customer.cust_code };
    if (customer.pm_code != null && String(customer.pm_code).trim() !== '') {
      formValues.pm_code = String(customer.pm_code).trim();
    } else {
      formValues.pm_code = undefined;
    }
    form.setFieldsValue(formValues);
    setShowCustomerModal(false);
    setCustomerSearchText('');
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    form.setFieldsValue({ cust_code: undefined, pm_code: undefined });
  };

  const loadProducts = async () => {
    try {
      // Load all products by setting a very high limit
      const response = await fetch('/api/products?limit=1000');
      const result = await response.json();
      if (result.success) {
        setProducts(result.data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const addOrIncrementItem = (product: Product) => {
    if (itemsLockedFromConfirmedSo) {
      message.warning(d.itemsLockedFromSo);
      return false;
    }
    const existingItemIndex = items.findIndex(item => item.item_code === product.item_code);
    if (existingItemIndex !== -1) {
      const updatedItems = [...items];
      const existingItem = updatedItems[existingItemIndex];
      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + 1
      };
      setItems(updatedItems);
      return true;
    }

    const newItem: DeliveryNoteItem = {
      key: `${product.item_code}-${Date.now()}`,
      item_code: product.item_code,
      item_name: product.eng_name,
      quantity: 1
    };
    setItems([...items, newItem]);
    return false;
  };

  const handleSelectItem = (product: Product) => {
    if (itemsLockedFromConfirmedSo) {
      message.warning(d.itemsLockedFromSo);
      return;
    }
    const alreadyExists = addOrIncrementItem(product);
    if (alreadyExists) {
      message.success(`${product.item_code} ${d.itemQtyIncreased}`);
    } else {
      message.success(`${product.item_code} ${d.itemAdded}`);
    }
    // Keep modal open to allow continuous selection like invoice flow.
    setTimeout(() => itemSearchInputRef.current?.focus?.({ cursor: 'all' }), 0);
  };

  const handleRemoveItem = (key: string) => {
    if (itemsLockedFromConfirmedSo) {
      message.warning(d.itemsLockedFromSo);
      return;
    }
    setItems(items.filter(item => item.key !== key));
  };

  const handleQuantityChange = (key: string, quantity: number | null) => {
    if (itemsLockedFromConfirmedSo) return;
    const nextQty = Number(quantity || 0);
    if (nextQty <= 0) return;
    setItems(prev =>
      prev.map(item => (item.key === key ? { ...item, quantity: nextQty } : item))
    );
  };

  const handleSave = async (values: FormValues) => {
    if (items.length === 0) {
      message.error(d.addOneItem);
      return;
    }

    const authShop = (user?.selected_shopcode || user?.default_shopcode || '').trim();
    const shop_code =
      salesOrderShopCodeRef.current?.trim() ||
      authShop ||
      values.wh_code;

    setSaving(true);
    try {
      const deliveryNoteData = {
        ...values,
        shop_code,
        wh_code: values.wh_code,
        transaction_date: values.transaction_date ? dayjs(values.transaction_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        items: items,
        total_amount: 0
      };

      const response = await fetchWithAuth('/api/delivery-notes', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deliveryNoteData),
      });

      const rawText = await response.text();
      let result: { success?: boolean; error?: string; message?: string };
      try {
        result = rawText ? (JSON.parse(rawText) as typeof result) : {};
      } catch {
        const preview = rawText.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(
          response.ok
            ? 'Invalid response from server'
            : `Server error (${response.status})${preview ? `: ${preview}` : ''}`
        );
      }

      if (!response.ok && !result.error) {
        throw new Error(result.error || `Server error (${response.status})`);
      }

      if (result.success) {
        // Commit the transaction session
        if (transactionSession) {
          await TransactionGenerator.commitTransaction(
            transactionSession.sessionId,
            transactionSession.transactionCode
          );
          console.log('Transaction session committed successfully');
        }
        
        message.success(d.createdSuccess);
        // Small delay to show success message before navigation
        allowNavigationRef.current = true;
        setTimeout(() => {
          router.push('/warehouse/stock');
        }, 500);
      } else {
        message.error(result.error || d.createFailed);
      }
    } catch (error) {
      console.error('Error saving delivery note:', error);
      message.error(error instanceof Error ? error.message : d.errorCreate);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    try {
      if (transactionSession && browserSessionId) {
        console.log('handleDiscard called - Discarding transaction session:', transactionSession.sessionId);
        console.log('Full transaction session object:', transactionSession);
        
        // Use the improved discard API
        const discardResponse = await fetch('/api/transaction-generator/discard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: browserSessionId }),
        });

        const discardResult = await discardResponse.json();
        
        if (!discardResult.success) {
          throw new Error(discardResult.error || 'Failed to discard transaction');
        }
        
        console.log('Transaction session discarded successfully in handleDiscard');
        
        // Clear the transaction session state
        setTransactionSession(null);
        form.resetFields();
        
        // Clear browser session storage
        sessionStorage.removeItem('delivery_note_session_id');
        setBrowserSessionId(null);
        
        console.log('Transaction session state cleared');
      } else {
        console.log('No transaction session to discard');
      }
      
      message.success(d.discardSuccess);
      setShowDiscardModal(false);
      const target = pendingNavigateRef.current || '/warehouse/stock';
      pendingNavigateRef.current = null;
      allowNavigationRef.current = true;
      setTimeout(() => {
        router.push(target);
      }, 500);
    } catch (error) {
      console.error('Error in handleDiscard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      message.error(`${d.discardFailedPrefix} ${errorMessage}`);
    }
  };

  const showDiscardConfirm = () => {
    console.log('showDiscardConfirm called');
    console.log('Current transaction session:', transactionSession);
    setShowDiscardModal(true);
  };


  const itemColumns = useMemo(
    () => [
      {
        title: d.itemCode,
        dataIndex: 'item_code',
        key: 'item_code',
        width: 120,
      },
      {
        title: d.itemName,
        dataIndex: 'item_name',
        key: 'item_name',
        width: 200,
      },
      {
        title: d.quantity,
        dataIndex: 'quantity',
        key: 'quantity',
        width: 100,
        render: (quantity: number, record: DeliveryNoteItem) =>
          itemsLockedFromConfirmedSo ? (
            <span>{quantity}</span>
          ) : (
            <InputNumber
              min={1}
              value={quantity}
              onChange={(value) => handleQuantityChange(record.key, value)}
              style={{ width: '100%' }}
            />
          ),
      },
      ...(itemsLockedFromConfirmedSo
        ? []
        : [
            {
              title: d.actions,
              key: 'actions',
              width: 100,
              render: (_: unknown, record: DeliveryNoteItem) => (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveItem(record.key)}
                />
              ),
            },
          ]),
    ],
    [d, itemsLockedFromConfirmedSo, handleQuantityChange, handleRemoveItem]
  );

  const filteredItems = useMemo(() => {
    const searchLower = itemSearchText.toLowerCase();
    return products.filter(item => (
      item.item_code.toLowerCase().includes(searchLower) ||
      item.eng_name.toLowerCase().includes(searchLower) ||
      item.chi_name.toLowerCase().includes(searchLower)
    ));
  }, [products, itemSearchText]);

  const filteredCustomers = useMemo(() => {
    const searchLower = customerSearchText.toLowerCase();
    return customers.filter(customer => (
      customer.cust_code.toLowerCase().includes(searchLower) ||
      customer.name.toLowerCase().includes(searchLower) ||
      customer.phone_1.toLowerCase().includes(searchLower)
    ));
  }, [customers, customerSearchText]);

  useEffect(() => {
    if (showItemModal) {
      setTimeout(() => itemSearchInputRef.current?.focus?.({ cursor: 'all' }), 0);
    }
  }, [showItemModal]);

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

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: bc.home, href: '/' },
            { label: bc.warehouse, href: '/warehouse' },
            { label: bc.stock, href: '/warehouse/stock' },
            { label: bc.deliveryNote, current: true }
          ]} 
        />
      }
              buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button onClick={goBackToStock}>
            {d.backToStock}
          </Button>
            <Button 
              danger
              icon={<CloseOutlined />}
              onClick={showDiscardConfirm}
              disabled={!isCreateReady || saving}
            >
              {d.discard}
            </Button>
            <Button 
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => form.submit()}
              disabled={!isCreateReady}
            >
              {saveWithShortcutLabel(lang)}
            </Button>
          </div>
        }
              title={d.titleCreate}
        description={d.descriptionCreate}
        actionBarSaveShortcut={{
          onSave: () => form.submit(),
          disabled: saving || !isCreateReady,
        }}
    >
              <div className="px-8 py-6 bg-white">
          {!isCreateReady ? (
            <div className="text-center py-8">
              <div className="text-lg text-gray-600">{d.preparingTitle}</div>
              <div className="text-sm text-gray-500 mt-2">{d.preparingHint}</div>
            </div>
          ) : (
            <>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            initialValues={{
              transaction_date: dayjs()
            }}
          >
          <Row gutter={24}>
            {/* Basic Information */}
            <Col xs={24}>
              <Card title={d.basicInfo} size="small" className="mb-6">
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.deliveryNoteNumber} <span className="text-gray-500 text-sm">{d.autoGenerated}</span></label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="delivery_note_no"
                      rules={[{ required: true, message: d.dnNumberRequired }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input 
                        placeholder={d.autoGenPlaceholder}
                        disabled={true}
                        suffix={generatingNumber ? <Spin size="small" /> : null}
                        style={{ 
                          backgroundColor: '#f5f5f5', 
                          color: '#666',
                          cursor: 'not-allowed'
                        }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.referenceNumber}</label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="reference_no"
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder={d.enterReference} disabled={itemsLockedFromConfirmedSo} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.date}</label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="transaction_date"
                      style={{ marginBottom: 0 }}
                    >
                      <DatePicker 
                        style={{ width: '100%' }}
                        format="YYYY-MM-DD"
                        disabled
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>

            {/* Company and Customer Information */}
            <Col xs={24}>
              <Card title={d.companyCustomer} size="small" className="mb-6">
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.companyShop}</label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="wh_code"
                      rules={[{ required: true, message: d.companyRequired }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select 
                        placeholder={d.selectCompany}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                      >
                        {shops.map(shop => (
                          <Option key={shop.shop_code} value={shop.shop_code}>
                            {shop.shop_code} — {shop.name}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.customer}</label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="cust_code"
                      rules={[{ required: true, message: d.customerRequired }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          placeholder={d.customerPlaceholder}
                          value={selectedCustomer ? `${selectedCustomer.cust_code} - ${selectedCustomer.name}` : ''}
                          readOnly
                          style={{ cursor: 'pointer' }}
                          onClick={() => setShowCustomerModal(true)}
                        />
                        <Button icon={<SearchOutlined />} onClick={() => setShowCustomerModal(true)}>
                          {d.select}
                        </Button>
                        {selectedCustomer && (
                          <Button danger onClick={handleClearCustomer}>
                            {d.clear}
                          </Button>
                        )}
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16} align="middle" className="mb-4">
                  <Col span={6}>
                    <label className="font-medium text-gray-700">{d.paymentMethod}</label>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      name="pm_code"
                      rules={[{ required: true, message: d.pmRequired }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select placeholder={d.selectPm}>
                        {paymentMethods.map(method => (
                          <Option key={method.pm_code} value={method.pm_code}>
                            {method.payment_method}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          {/* Items Section */}
          <Card
            title={d.items}
            size="small"
            className="mb-6"
            extra={
              <Tooltip title={itemsLockedFromConfirmedSo ? d.itemsLockedFromSo : undefined}>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  disabled={itemsLockedFromConfirmedSo}
                  onClick={() => {
                    if (itemsLockedFromConfirmedSo) {
                      message.warning(d.itemsLockedFromSo);
                      return;
                    }
                    setShowItemModal(true);
                  }}
                >
                  {d.items}
                </Button>
              </Tooltip>
            }
          >
            {itemsLockedFromConfirmedSo && (
              <p className="text-sm text-amber-700 mb-3">{d.itemsLockedFromSoHint}</p>
            )}

            <Table
              columns={itemColumns}
              dataSource={items}
              pagination={false}
              size="small"
              scroll={{ x: 800 }}
              showHeader={true}
            />

            <div className="mt-4 text-right">
              <Title level={4}>
                {d.totalItems} <Text type="success">{items.length}</Text>
              </Title>
            </div>
          </Card>
        </Form>
        </>
        )}

        {/* Discard Confirmation Modal */}
        <Modal
          title={d.modalDiscardTitle}
          open={showDiscardModal}
          onOk={() => {
            console.log('Modal OK button clicked');
            handleDiscard();
          }}
          onCancel={() => {
            console.log('Modal Cancel button clicked');
            setShowDiscardModal(false);
          }}
          okText={d.modalDiscardOk}
          cancelText={d.cancel}
          okButtonProps={{ danger: true }}
        >
          <p>{d.modalDiscardBody}</p>
          <p><strong>{d.modalDiscardIrreversible}</strong></p>
          {transactionSession && (
            <p><strong>{d.transactionCode}</strong> {transactionSession.transactionCode}</p>
          )}
        </Modal>

        {/* Item Selection Modal */}
        <Modal
          title={d.modalSelectCustomer}
          open={showCustomerModal}
          onCancel={() => {
            setShowCustomerModal(false);
            setCustomerSearchText('');
          }}
          footer={null}
          width={800}
        >
          <div className="mb-4">
            <Input
              placeholder={d.customerSearchPh}
              prefix={<SearchOutlined />}
              value={customerSearchText}
              onChange={(e) => setCustomerSearchText(e.target.value)}
              allowClear
            />
          </div>
          <Table
            columns={[
              { title: d.customerCode, dataIndex: 'cust_code', key: 'cust_code', width: '25%' },
              { title: d.customerName, dataIndex: 'name', key: 'name', width: '45%' },
              { title: d.phone, dataIndex: 'phone_1', key: 'phone_1', width: '30%' },
            ]}
            dataSource={filteredCustomers}
            rowKey="cust_code"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            onRow={(record) => ({
              onClick: () => handleSelectCustomer(record),
              style: { cursor: 'pointer' },
            })}
            rowClassName="hover:bg-blue-50"
            size="small"
          />
        </Modal>

        {/* Sales Order selection before generating DN number */}
        <Modal
          title={d.salesOrderTitle}
          open={showSalesOrderModal}
          onCancel={() => {
            setShowSalesOrderModal(false);
            allowNavigationRef.current = true;
            router.push('/warehouse/stock');
          }}
          maskClosable={false}
          footer={[
            <Button
              key="cancel"
              onClick={() => {
                setShowSalesOrderModal(false);
                allowNavigationRef.current = true;
                router.push('/warehouse/stock');
              }}
            >
              {d.cancel}
            </Button>,
            <Button
              key="skip"
              onClick={async () => {
                try {
                  salesOrderShopCodeRef.current = null;
                  setSelectedSalesOrder(undefined);
                  setShowSalesOrderModal(false);
                  await generateDeliveryNoteNumber();
                } catch {
                  // error already handled in generator
                }
              }}
            >
              {d.skip}
            </Button>,
            <Button
              key="next"
              type="primary"
              loading={salesOrdersLoading}
              onClick={async () => {
                if (!selectedSalesOrder) {
                  message.error(d.selectSORequired);
                  return;
                }
                try {
                  // Load Sales Order details: header (customer, shop, payment) + line items
                  const detailRes = await fetchWithAuth(
                    `/api/transactions/detail/${encodeURIComponent(selectedSalesOrder)}`,
                    token,
                    { cache: 'no-store' }
                  );
                  const detailResult = await detailRes.json();
                  if (!detailResult.success) {
                    throw new Error(detailResult.error || d.failedLoadSODetail);
                  }

                  const soHeader = detailResult.header as {
                    cust_code?: string;
                    customer_name?: string;
                    shop_code?: string;
                    wh_code?: string;
                    pm_code?: string;
                    is_settle?: number;
                    is_void?: number;
                  };
                  if (Number(soHeader.is_void ?? 0) === 1) {
                    throw new Error(d.soVoidCannotUse);
                  }
                  if (Number(soHeader.is_settle ?? 0) !== 1) {
                    throw new Error(d.soDraftCannotUse);
                  }
                  const paymentTotals = (detailResult.paymentTotals || []) as Array<{ pm_code?: string }>;

                  const custCode =
                    soHeader.cust_code != null ? String(soHeader.cust_code).trim() : '';
                  const customerName =
                    soHeader.customer_name != null ? String(soHeader.customer_name).trim() : '';
                  const shopCode =
                    soHeader.shop_code != null ? String(soHeader.shop_code).trim() : '';
                  const whFromSo =
                    soHeader.wh_code != null && String(soHeader.wh_code).trim() !== ''
                      ? String(soHeader.wh_code).trim()
                      : shopCode;

                  salesOrderShopCodeRef.current = shopCode || null;

                  let pmCode =
                    soHeader.pm_code != null && String(soHeader.pm_code).trim() !== ''
                      ? String(soHeader.pm_code).trim()
                      : '';
                  if (!pmCode && paymentTotals.length > 0) {
                    const firstPm = paymentTotals[0]?.pm_code;
                    if (firstPm != null && String(firstPm).trim() !== '') {
                      pmCode = String(firstPm).trim();
                    }
                  }
                  if (!pmCode && custCode) {
                    const custRow = customers.find((c) => c.cust_code === custCode);
                    if (custRow?.pm_code != null && String(custRow.pm_code).trim() !== '') {
                      pmCode = String(custRow.pm_code).trim();
                    }
                  }

                  if (custCode) {
                    setSelectedCustomer({
                      cust_code: custCode,
                      name: customerName || custCode,
                    });
                  } else {
                    setSelectedCustomer(null);
                    message.warning(d.warningNoCustCode);
                  }

                  form.setFieldsValue({
                    reference_no: selectedSalesOrder,
                    ...(custCode ? { cust_code: custCode } : {}),
                    ...(pmCode ? { pm_code: pmCode } : {}),
                    ...(whFromSo ? { wh_code: whFromSo } : {}),
                  });

                  if (custCode && !pmCode) {
                    message.warning(d.warningNoPm);
                  }

                  const soDetails = (detailResult.details || []) as {
                    item_code: string;
                    eng_name: string;
                    chi_name?: string;
                    qty: number;
                  }[];
                  const clonedItems: DeliveryNoteItem[] = soDetails.map((d, idx) => ({
                    key: `${d.item_code}-${idx}`,
                    item_code: d.item_code,
                    item_name: d.eng_name || d.chi_name || d.item_code,
                    quantity: Number(d.qty || 0),
                  })).filter((i) => i.quantity > 0);
                  if (clonedItems.length === 0) {
                    message.warning(d.warningNoItems);
                  }
                  setItems(clonedItems);

                  setShowSalesOrderModal(false);
                  await generateDeliveryNoteNumber();
                } catch (error) {
                  const msg =
                    error instanceof Error ? error.message : d.failedPrepare;
                  message.error(msg);
                }
              }}
              disabled={salesOrders.length === 0}
            >
              {d.continue}
            </Button>,
          ]}
          width={600}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {d.salesOrderHint}
            </p>
            <Select
              showSearch
              placeholder={salesOrdersLoading ? d.loadingSO : d.selectSO}
              optionFilterProp="label"
              loading={salesOrdersLoading}
              value={selectedSalesOrder}
              onChange={(value) => setSelectedSalesOrder(value)}
              className="w-full"
              options={salesOrders
                .filter((so) => isConfirmedSalesOrder(so))
                .map((so) => ({
                  value: so.transaction_id,
                  label: `${so.transaction_id} - ${so.customer_name || d.unknownCustomer} [${d.soStatusSettled}]${so.transaction_date ? ` (${dayjs(so.transaction_date).format('YYYY-MM-DD')})` : ''}`,
                }))}
            />
            {!salesOrdersLoading && salesOrders.length === 0 && (
              <p className="text-xs text-red-500">
                {d.noSettledSO}
              </p>
            )}
          </div>
        </Modal>

        {/* Item Selection Modal */}
        <Modal
          title={d.modalSelectItem}
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
              {d.close}
            </Button>,
          ]}
          width={900}
        >
          <div className="mb-4">
            <Input
              ref={itemSearchInputRef}
              placeholder={d.itemSearchPh}
              prefix={<SearchOutlined />}
              value={itemSearchText}
              onChange={(e) => setItemSearchText(e.target.value)}
              allowClear
            />
          </div>
          <Table<Product>
            columns={[
              {
                title: d.itemCode,
                dataIndex: 'item_code',
                key: 'item_code',
                width: '20%',
              },
              {
                title: d.englishName,
                dataIndex: 'eng_name',
                key: 'eng_name',
                width: '30%',
              },
              {
                title: d.chineseName,
                dataIndex: 'chi_name',
                key: 'chi_name',
                width: '25%',
              },
              {
                title: d.unit,
                dataIndex: 'unit',
                key: 'unit',
                width: '10%',
              },
            ]}
            dataSource={filteredItems}
            rowKey="item_code"
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => d.showTotalItems(total),
            }}
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

export default function DeliveryNotePage() {
  return (
    <Suspense fallback={<WarehouseSuspenseLoading />}>
      <DeliveryNotePageContent />
    </Suspense>
  );
}
