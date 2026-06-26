'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  StopOutlined,
  SearchOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, type InputRef, Select, InputNumber, Card, Row, Col, App, Space, Divider, DatePicker, Modal, Table } from 'antd';
import dayjs from 'dayjs';
import { TransactionGenerator } from '@/services/transactionGenerator';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { getSalesOrderCreateTexts } from './i18n';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCommonLanguageTexts } from '@/lib/i18n/common';
import { formatCurrency } from '@/utils/formatCurrency';
import QuickItemCodeSearchBar from '@/components/QuickItemCodeSearchBar';
import { calcLineTotal, normalizeItemCode } from '@/lib/transactionLineItems';
import {
  isOrderDraftTransCode,
  reserveOrderNumber,
  ORDER_SESSION_KEY,
  ORDER_BASE_PATH,
} from '@/features/orders/orderModule';
import { ensureBrowserSessionId } from '@/lib/transactionDraft';

interface FormData {
  customers: Array<{ cust_code: string; name: string; phone_1: string; email_1: string; pm_code?: string | null }>;
  products: Array<{ item_code: string; eng_name: string; chi_name: string; unit: string; price: number }>;
  shops: Array<{ shop_code: string; name: string }>;
  employees: Array<{ employee_code: string; name: string }>;
  paymentMethods: Array<{ pm_code: string; payment_method: string }>;
}

interface OrderLineItem {
  uid: number;
  item_code: string;
  eng_name: string;
  chi_name: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  line_total: number;
}

export default function CreateOrderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();

  const transCode = params?.transCode as string;
  const isDraft = isOrderDraftTransCode(transCode);

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [browserSessionId, setBrowserSessionId] = useState('');
  const [reservedTransCode, setReservedTransCode] = useState('');
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [generatingNumber, setGeneratingNumber] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const pendingNavigateRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);

  const requestBackOrDiscard = useBackNavigation(() => setShowDiscardModal(true));
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getSalesOrderCreateTexts(lang);
  const commonT = getCommonLanguageTexts(lang);

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ cust_code: string; name: string; pm_code?: string | null } | null>(null);
  const [customerSearchText, setCustomerSearchText] = useState('');

  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');
  const itemSearchInputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (!transCode) {
      messageApi.error(t.page.invalidHint);
      allowNavigationRef.current = true;
      router.push(ORDER_BASE_PATH);
      return;
    }

    const sessionId = ensureBrowserSessionId(ORDER_SESSION_KEY);
    setBrowserSessionId(sessionId);
    fetchFormData();

    form.setFieldsValue({
      ...(isDraft ? {} : { trans_code: transCode }),
      prefix: 'SO',
      transaction_date: dayjs(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transCode, isDraft]);

  useEffect(() => {
    if (formData && user) {
      const shopCode = user.selected_shopcode || user.default_shopcode;
      if (shopCode && formData.shops.some((shop) => shop.shop_code === shopCode)) {
        form.setFieldsValue({ shop_code: shopCode });
      }
    }
  }, [formData, user, form]);

  // Show leave warning when side menu navigates away
  useEffect(() => {
    const handler = (e: Event) => {
      const { href } = (e as CustomEvent<{ href: string }>).detail;
      pendingNavigateRef.current = href;
      setShowDiscardModal(true);
    };
    window.addEventListener('app-navigate-request', handler);
    return () => window.removeEventListener('app-navigate-request', handler);
  }, []);

  // Intercept all navigation (breadcrumb, links, etc.) to show leave warning
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

  const fetchFormData = async () => {
    try {
      const response = await fetchWithAuth('/api/transactions/form-data', token, { cache: 'no-store' });
      const result = await response.json();
      if (result.success) {
        setFormData(result.data);
      } else {
        messageApi.error(result.error || 'Failed to load form data');
      }
    } catch (error) {
      console.error(error);
      messageApi.error('Error loading form data');
    }
  };

  const addLineItem = (product?: { item_code: string; eng_name: string; chi_name: string; unit: string; price: number }) => {
    if (!product) return;

    const itemCode = String(product.item_code ?? '').trim();
    if (!itemCode) return;
    const codeKey = normalizeItemCode(itemCode);

    setLineItems((prev) => {
      const existingIdx = prev.findIndex((item) => normalizeItemCode(item.item_code) === codeKey);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const curr = updated[existingIdx];
        const nextQty = curr.qty + 1;
        updated[existingIdx] = {
          ...curr,
          qty: nextQty,
          line_total: calcLineTotal(nextQty, curr.price, curr.discount),
        };
        return updated;
      }

      const price = Number(product.price || 0);
      return [
        ...prev,
        {
          uid: Date.now(),
          item_code: itemCode,
          eng_name: product.eng_name,
          chi_name: product.chi_name,
          qty: 1,
          unit: product.unit,
          price,
          discount: 0,
          line_total: calcLineTotal(1, price, 0),
        },
      ];
    });
  };

  const updateLineItem = (index: number, field: keyof OrderLineItem, value: string | number) => {
    const next = [...lineItems];
    next[index] = { ...next[index], [field]: value };

    if (field === 'qty' || field === 'price' || field === 'discount') {
      const qty = field === 'qty' ? (value as number) : next[index].qty;
      const price = field === 'price' ? (value as number) : next[index].price;
      const discount = field === 'discount' ? (value as number) : next[index].discount;
      next[index].line_total = calcLineTotal(qty, price, discount);
    }

    setLineItems(next);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const filteredCustomers = useMemo(() => {
    if (!formData?.customers) return [];
    const searchLower = customerSearchText.toLowerCase();
    return formData.customers.filter((customer) => {
      return (
        customer.cust_code.toLowerCase().includes(searchLower) ||
        customer.name.toLowerCase().includes(searchLower) ||
        (customer.phone_1 && customer.phone_1.toLowerCase().includes(searchLower)) ||
        (customer.email_1 && customer.email_1.toLowerCase().includes(searchLower))
      );
    });
  }, [formData?.customers, customerSearchText]);

  const filteredItems = useMemo(() => {
    if (!formData?.products) return [];
    const searchLower = itemSearchText.toLowerCase();
    return formData.products.filter((item) => {
      return (
        item.item_code.toLowerCase().includes(searchLower) ||
        item.eng_name.toLowerCase().includes(searchLower) ||
        (item.chi_name && item.chi_name.toLowerCase().includes(searchLower))
      );
    });
  }, [formData?.products, itemSearchText]);

  const handleSelectCustomer = (customer: { cust_code: string; name: string; pm_code?: string | null }) => {
    setSelectedCustomer(customer);
    const values: { cust_code: string; pm_code?: string } = { cust_code: customer.cust_code };
    if (customer.pm_code && customer.pm_code.trim() !== '') {
      values.pm_code = customer.pm_code;
    }
    form.setFieldsValue(values);
    setShowCustomerModal(false);
    setCustomerSearchText('');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const formValues = await form.validateFields();

      if (lineItems.length === 0) {
        messageApi.error(t.page.needLineItem);
        return;
      }

      const incomplete = lineItems.filter((item) => !item.item_code || item.qty <= 0 || item.price <= 0);
      if (incomplete.length > 0) {
        messageApi.error(t.page.completeLineItems);
        return;
      }

      if (isDraft) {
        if (reservedTransCode) {
          setShowSaveConfirmModal(true);
          return;
        }
        setGeneratingNumber(true);
        try {
          const code = await reserveOrderNumber(browserSessionId);
          setReservedTransCode(code);
          setShowSaveConfirmModal(true);
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : t.page.failedCreate);
        } finally {
          setGeneratingNumber(false);
        }
        return;
      }

      await persistOrder(transCode, formValues);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      console.error(error);
      messageApi.error(t.page.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (
    saveCode: string,
    formValues: Awaited<ReturnType<typeof form.validateFields>>
  ) => {
    try {
      setSaving(true);
      const totalAmount = lineItems.reduce((sum, item) => sum + item.line_total, 0);
      const transactionDate = formValues.transaction_date
        ? (dayjs.isDayjs(formValues.transaction_date)
          ? formValues.transaction_date.format('YYYY-MM-DD HH:mm:ss')
          : String(formValues.transaction_date))
        : undefined;
      const payload = {
        transCode: saveCode,
        headerData: {
          ...formValues,
          prefix: 'SO',
          total: totalAmount,
          employee_code: user ? String(user.employee_code) : undefined,
          quotation_date: transactionDate,
          is_settle: 0,
        },
        detailsData: lineItems.map((item) => ({
          trans_code: saveCode,
          item_code: item.item_code,
          eng_name: item.eng_name,
          chi_name: item.chi_name,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          discount: item.discount,
        })),
        paymentTotalsData: formValues.pm_code
          ? [
              {
                pm_code: formValues.pm_code,
                total: totalAmount,
              },
            ]
          : [],
      };

      const response = await fetchWithAuth('/api/transactions/update', token, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!result.success) {
        messageApi.error(result.error || t.page.failedCreate);
        return;
      }

      if (browserSessionId || saveCode) {
        await TransactionGenerator.commitTransaction(browserSessionId, saveCode);
      }

      setShowSaveConfirmModal(false);
      messageApi.success(t.page.createdSuccess);
      allowNavigationRef.current = true;
      router.push(ORDER_BASE_PATH);
    } catch (error) {
      console.error(error);
      messageApi.error(t.page.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSaveWithNumber = async () => {
    const code = isDraft ? reservedTransCode : transCode;
    if (!code) return;
    try {
      const formValues = await form.validateFields();
      await persistOrder(code, formValues);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      console.error(error);
      messageApi.error(t.page.errorSave);
    }
  };

  const handleConfirmDiscard = async () => {
    try {
      const codeToDiscard = isDraft ? reservedTransCode : transCode;
      if (codeToDiscard) {
        await TransactionGenerator.discardTransaction(browserSessionId, codeToDiscard);
      }
      sessionStorage.removeItem(ORDER_SESSION_KEY);
      messageApi.success(t.page.discardedSuccess);
      setShowDiscardModal(false);
      const target = pendingNavigateRef.current || ORDER_BASE_PATH;
      pendingNavigateRef.current = null;
      allowNavigationRef.current = true;
      router.push(target);
    } catch (error) {
      console.error(error);
      messageApi.error(t.page.failedDiscard);
    }
  };

  const functionBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button icon={<ArrowLeftOutlined />} onClick={requestBackOrDiscard}>
        {t.functionBar.back}
      </Button>
      <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving || generatingNumber}>
        {saveWithShortcutLabel(lang)}
      </Button>
      <Button icon={<StopOutlined />} danger onClick={() => setShowDiscardModal(true)} disabled={saving}>
        {t.functionBar.discard}
      </Button>
    </div>
  );

  if (!transCode) {
    return (
      <BasicPageLayout
        breadcrumb={<Breadcrumb items={[{ label: t.breadcrumb.home, href: '/' }, { label: t.breadcrumb.sales, href: '/sales' }, { label: t.breadcrumb.salesOrder, href: '/sales/orders' }, { label: t.breadcrumb.create, current: true }]} />}
        buttonBar={functionBar}
        title={t.page.title}
        description={t.page.invalidDescription}
        actionBarSaveShortcut={{
          onSave: handleSave,
          disabled: saving || !transCode,
        }}
      >
        <div className="px-8 py-6">
          <div className="text-center py-8 text-gray-600">
            <p>{t.page.invalidHint}</p>
            <Button type="primary" onClick={() => { allowNavigationRef.current = true; router.push('/sales/orders'); }}>
              {t.page.goToList}
            </Button>
          </div>
        </div>
      </BasicPageLayout>
    );
  }

  const pageTitle = isDraft ? t.page.title : t.page.titleWithCode(transCode);
  const displayTransCode = isDraft ? reservedTransCode : transCode;

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={[{ label: t.breadcrumb.home, href: '/' }, { label: t.breadcrumb.sales, href: '/sales' }, { label: t.breadcrumb.salesOrder, href: '/sales/orders' }, { label: t.breadcrumb.create, current: true }]} />}
      buttonBar={functionBar}
      title={pageTitle}
      description={t.page.description}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: saving || generatingNumber }}
    >
      <div className="px-8 py-6 bg-white" style={{ textAlign: 'left' }}>
        <Form form={form} layout="horizontal" labelCol={{ span: 8, style: { textAlign: 'left' } }} wrapperCol={{ span: 16, style: { textAlign: 'left' } }} className="space-y-6">
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
              <Card title={t.cards.orderInfo} size="small">
                <Form.Item label={t.fields.orderNumber}>
                  <Input
                    disabled
                    value={displayTransCode}
                    placeholder={isDraft && !displayTransCode ? t.page.assignedOnSave : undefined}
                    style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
                  />
                </Form.Item>

                <Form.Item label={t.fields.orderDate} name="transaction_date" rules={[{ required: true, message: t.fields.orderDate }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label={t.fields.customer} name="cust_code" rules={[{ required: true, message: t.fields.selectCustomerHint }]}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder={t.fields.selectCustomerHint} value={selectedCustomer ? `${selectedCustomer.cust_code} - ${selectedCustomer.name}` : ''} readOnly style={{ cursor: 'pointer' }} onClick={() => setShowCustomerModal(true)} />
                    <Button icon={<SearchOutlined />} onClick={() => setShowCustomerModal(true)}>
                      {t.fields.select}
                    </Button>
                  </Space.Compact>
                </Form.Item>

                <Form.Item label={t.fields.referenceCode} name="refer_code">
                  <Input placeholder={t.fields.referenceCodePlaceholder} />
                </Form.Item>

                <Form.Item label={t.fields.shop} name="shop_code" rules={[{ required: true, message: t.fields.selectShop }]}>
                  <Select
                    placeholder={t.fields.selectShop}
                    options={formData?.shops.map((s) => ({
                      value: s.shop_code,
                      label: `${s.shop_code} - ${s.name}`,
                    }))}
                  />
                </Form.Item>

                <Form.Item label={t.fields.paymentMethod} name="pm_code">
                  <Select
                    placeholder={t.fields.selectPaymentMethod}
                    showSearch
                    optionFilterProp="label"
                    options={formData?.paymentMethods?.map((pm) => ({
                      value: pm.pm_code,
                      label: `${pm.pm_code} - ${pm.payment_method}`,
                    }))}
                  />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title={t.cards.additionalInfo} size="small">
                <Form.Item label={t.fields.remarks} name="remark">
                  <Input.TextArea rows={4} placeholder={t.fields.remarksPlaceholder} />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24}>
              <Card
                title={t.cards.lineItems}
                size="small"
                extra={
                  <QuickItemCodeSearchBar
                    products={formData?.products || []}
                    placeholder={t.lineItemTable.quickItemCodePlaceholder}
                    itemsButtonLabel={t.lineItemTable.itemsButton}
                    productsAvailable={Boolean(formData?.products)}
                    formDataUnavailableMessage={t.page.failedFormData}
                    itemNotFoundMessage={t.lineItemTable.itemNotFound}
                    onAdd={addLineItem}
                    onOpenItemModal={() => setShowItemModal(true)}
                    onError={(msg) => messageApi.error(msg)}
                  />
                }
              >
                {lineItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>{t.lineItemTable.empty}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Row gutter={[16, 16]} className="pb-2 border-b border-gray-300">
                      <Col span={4}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.itemCode}</div></Col>
                      <Col span={6}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.description}</div></Col>
                      <Col span={3}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.qty}</div></Col>
                      <Col span={2}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.unit}</div></Col>
                      <Col span={3}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.price}</div></Col>
                      <Col span={2}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.discount}</div></Col>
                      <Col span={3}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.lineTotal}</div></Col>
                      <Col span={1}><div className="text-sm font-semibold text-gray-700">{t.lineItemTable.action}</div></Col>
                    </Row>
                    {lineItems.map((item, index) => (
                      <Card key={item.uid} size="small" className="border border-gray-200">
                        <Row gutter={[16, 16]} align="middle">
                          <Col span={4}>
                            <span className="block py-1.5 px-3 bg-gray-50 border border-gray-200 rounded min-h-[32px] flex items-center">{item.item_code || '-'}</span>
                          </Col>
                          <Col span={6}>
                            <span className="block py-1.5 px-3 bg-gray-50 border border-gray-200 rounded min-h-[32px] flex items-center">{item.eng_name || '-'}</span>
                          </Col>
                          <Col span={3}>
                            <InputNumber value={item.qty} onChange={(value) => updateLineItem(index, 'qty', value || 0)} min={0} style={{ width: '100%' }} />
                          </Col>
                          <Col span={2}>
                            <Input value={item.unit} disabled style={{ width: '100%' }} />
                          </Col>
                          <Col span={3}>
                            <InputNumber value={item.price} onChange={(value) => updateLineItem(index, 'price', value || 0)} min={0} style={{ width: '100%' }} />
                          </Col>
                          <Col span={2}>
                            <InputNumber value={item.discount} onChange={(value) => updateLineItem(index, 'discount', value || 0)} min={0} max={100} style={{ width: '100%' }} />
                          </Col>
                          <Col span={3}>
                            <Input value={formatCurrency(item.line_total)} disabled style={{ width: '100%', textAlign: 'left', fontWeight: 'bold' }} />
                          </Col>
                          <Col span={1}>
                            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLineItem(index)} size="small" />
                          </Col>
                        </Row>
                      </Card>
                    ))}

                    <Divider />
                    <div className="text-left">
                      <div className="text-lg font-bold">{t.lineItemTable.total}: {formatCurrency(lineItems.reduce((sum, item) => sum + item.line_total, 0))}</div>
                    </div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Form>
      </div>

      <Modal
        title={t.page.saveConfirmTitle}
        open={showSaveConfirmModal}
        onOk={() => void handleConfirmSaveWithNumber()}
        onCancel={() => setShowSaveConfirmModal(false)}
        okText={t.page.saveConfirmOk}
        cancelText={t.page.saveConfirmCancel}
        confirmLoading={saving}
        okButtonProps={{ disabled: !reservedTransCode }}
      >
        <p>{reservedTransCode ? t.page.saveConfirmBody(reservedTransCode) : t.page.generatingNumber}</p>
        {reservedTransCode && (
          <Input
            value={reservedTransCode}
            disabled
            style={{ marginTop: 12, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600 }}
          />
        )}
      </Modal>

      <Modal
        title={commonT.discardModal.title}
        open={showDiscardModal}
        onOk={handleConfirmDiscard}
        onCancel={() => setShowDiscardModal(false)}
        okText={commonT.discardModal.ok}
        cancelText={commonT.discardModal.cancel}
        okButtonProps={{ danger: true }}
      >
        <p>{commonT.discardModal.line1}</p>
        <p>
          {isDraft && !reservedTransCode ? (
            t.page.discardLine2Draft
          ) : (
            <>
              {commonT.discardModal.line2} <strong>{displayTransCode}</strong>
            </>
          )}
        </p>
      </Modal>

      <Modal title={t.customerModal.title} open={showCustomerModal} onCancel={() => setShowCustomerModal(false)} footer={null} width={800}>
        <div className="mb-4">
          <Input placeholder={t.customerModal.searchPlaceholder} prefix={<SearchOutlined />} value={customerSearchText} onChange={(e) => setCustomerSearchText(e.target.value)} allowClear />
        </div>
        <Table
          columns={[
            { title: t.customerModal.customerCode, dataIndex: 'cust_code', key: 'cust_code', width: '25%' },
            { title: t.customerModal.customerName, dataIndex: 'name', key: 'name', width: '35%' },
            { title: t.customerModal.phone, dataIndex: 'phone_1', key: 'phone_1', width: '20%' },
            { title: t.customerModal.email, dataIndex: 'email_1', key: 'email_1', width: '20%' },
          ]}
          dataSource={filteredCustomers}
          rowKey="cust_code"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({ onClick: () => handleSelectCustomer(record), style: { cursor: 'pointer' } })}
          size="small"
        />
      </Modal>

      <Modal
        title={t.itemModal.title}
        open={showItemModal}
        onCancel={() => setShowItemModal(false)}
        width={900}
        afterOpenChange={(open) => {
          if (open) setTimeout(() => itemSearchInputRef.current?.focus(), 0);
        }}
        footer={
          <Button type="default" onClick={() => setShowItemModal(false)}>
            {t.itemModal.close}
          </Button>
        }
      >
        <div className="mb-4">
          <Input
            ref={itemSearchInputRef}
            placeholder={t.itemModal.searchPlaceholder}
            prefix={<SearchOutlined />}
            value={itemSearchText}
            onChange={(e) => setItemSearchText(e.target.value)}
            allowClear
          />
        </div>
        <Table
          columns={[
            { title: t.itemModal.itemCode, dataIndex: 'item_code', key: 'item_code', width: '20%' },
            { title: t.itemModal.englishName, dataIndex: 'eng_name', key: 'eng_name', width: '30%' },
            { title: t.itemModal.chineseName, dataIndex: 'chi_name', key: 'chi_name', width: '25%' },
            { title: t.itemModal.unit, dataIndex: 'unit', key: 'unit', width: '10%' },
            {
              title: t.itemModal.price,
              dataIndex: 'price',
              key: 'price',
              width: '15%',
              render: (price: number | string | null | undefined) => {
                const priceNum = typeof price === 'number' ? price : parseFloat(String(price || 0));
                return <span>{formatCurrency(priceNum)}</span>;
              },
            },
          ]}
          dataSource={filteredItems}
          rowKey="item_code"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({ onClick: () => addLineItem(record), style: { cursor: 'pointer' } })}
          size="small"
        />
      </Modal>
    </BasicPageLayout>
  );
}

