'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  StopOutlined,
  SearchOutlined,
  DeleteOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, type InputRef, Select, InputNumber, Card, Row, Col, message, Space, Divider, DatePicker, Modal, Table } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { TransactionGenerator } from '@/services/transactionGenerator';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useTransactionFormData } from '@/hooks/useTransactionFormData';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { getQuotationCreateTexts } from './i18n';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { formatCurrency } from '@/utils/formatCurrency';
import QuickItemCodeSearchBar from '@/components/QuickItemCodeSearchBar';
import { calcLineTotal, normalizeItemCode, type QuickItemProduct } from '@/lib/transactionLineItems';
import {
  CustomerTipsActionButton,
  CustomerTipsModal,
  getCustomerTipsTexts,
  useCustomerTipsToggle,
} from '@/customizations/quotations/customer-tips';
import {
  isQuotationDraftTransCode,
  reserveQuotationNumber,
  QUOTATION_SESSION_KEY,
  QUOTATION_CLONE_KEY_PREFIX,
  QUOTATION_BASE_PATH,
} from '@/features/quotations/quotationModule';
import { ensureBrowserSessionId } from '@/lib/transactionDraft';

interface QuotationLineItem {
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

export default function CreateQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getQuotationCreateTexts(lang);
  const { user, token } = useAuth();
  const [form] = Form.useForm();

  const transCode = params?.transCode as string;
  const isDraft = isQuotationDraftTransCode(transCode);

  const [saving, setSaving] = useState(false);
  const { formData, error: formDataError, refresh: refreshFormData } = useTransactionFormData(token);
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const [browserSessionId, setBrowserSessionId] = useState('');
  const [reservedTransCode, setReservedTransCode] = useState('');
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [generatingNumber, setGeneratingNumber] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const pendingNavigateRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  const warehouseManuallySetRef = useRef(false);
  const selectCustRefetchAttempted = useRef(false);

  const requestBackOrDiscard = useBackNavigation(() => setShowDiscardModal(true));

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ cust_code: string; name: string; pm_code?: string | null } | null>(null);
  const [customerSearchText, setCustomerSearchText] = useState('');

  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');
  const itemSearchInputRef = useRef<InputRef>(null);

  const shopWatch = Form.useWatch('shop_code', form);
  const custCodeWatch = Form.useWatch('cust_code', form);
  const { tipsOpen, openTips, closeTips } = useCustomerTipsToggle();
  const tipsT = getCustomerTipsTexts(lang);

  const activeCustCode = String(custCodeWatch || selectedCustomer?.cust_code || '').trim();
  const activeCustomerName = selectedCustomer?.name || '';

  const handleOpenTips = () => {
    if (!activeCustCode) {
      message.warning(tipsT.selectCustomerFirst);
      return;
    }
    openTips();
  };

  useEffect(() => {
    if (!transCode) {
      message.error(t.createPage.invalidAccess);
      allowNavigationRef.current = true;
      router.push('/sales/quotations');
      return;
    }

    const sessionId = ensureBrowserSessionId(QUOTATION_SESSION_KEY);
    setBrowserSessionId(sessionId);

    form.setFieldsValue({
      ...(isDraft ? {} : { trans_code: transCode }),
      prefix: 'QTA',
      transaction_date: dayjs(),
      valid_until_date: dayjs().add(30, 'day'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transCode, isDraft]);

  useEffect(() => {
    if (formData && user) {
      const shopCode = user.selected_shopcode || user.default_shopcode;
      if (shopCode && formData.shops.some((shop) => shop.shop_code === shopCode)) {
        warehouseManuallySetRef.current = false;
        form.setFieldsValue({ shop_code: shopCode });
      }
    }
  }, [formData, user, form]);

  useEffect(() => {
    if (!formData?.shops?.length || !shopWatch) return;
    const shop = formData.shops.find((s) => s.shop_code === shopWatch);
    const defaultWh = String(shop?.default_whcode || '').trim();
    const currentWh = String((form.getFieldValue('wh_code') as string | undefined) || '').trim();
    if (!warehouseManuallySetRef.current) {
      if (defaultWh) form.setFieldsValue({ wh_code: defaultWh });
    } else if (!currentWh && defaultWh) {
      form.setFieldsValue({ wh_code: defaultWh });
    }
  }, [formData, shopWatch, form]);

  useEffect(() => {
    if (!transCode || !formData) return;
    const key = `${QUOTATION_CLONE_KEY_PREFIX}${transCode}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const clone = JSON.parse(raw) as {
        header?: Record<string, unknown>;
        details?: Array<{
          item_code?: string;
          eng_name?: string;
          chi_name?: string;
          qty?: number;
          unit?: string;
          price?: number;
          discount?: number;
        }>;
      };
      sessionStorage.removeItem(key);

      const h = clone.header || {};
      const cust = String(h.cust_code || '');
      if (cust) {
        const c = formData.customers.find((x) => x.cust_code === cust);
        if (c) setSelectedCustomer({ cust_code: c.cust_code, name: c.name, pm_code: c.pm_code ?? null });
      }

      form.setFieldsValue({
        cust_code: h.cust_code ?? undefined,
        refer_code: h.refer_code ?? undefined,
        remark: h.remark ?? undefined,
        pm_code: h.pm_code ?? undefined,
      });

      const vu = h.valid_until_date ?? h.valid_until;
      if (vu) {
        form.setFieldsValue({ valid_until_date: dayjs(String(vu)) });
      }

      if (clone.details?.length) {
        setLineItems(
          clone.details.map((d, i) => {
            const qty = Number(d.qty || 0);
            const price = Number(d.price || 0);
            const discount = Number(d.discount || 0);
            const lineSubtotal = qty * price;
            const line_total = lineSubtotal - lineSubtotal * (discount / 100);
            return {
              uid: Date.now() + i,
              item_code: String(d.item_code || ''),
              eng_name: String(d.eng_name || ''),
              chi_name: String(d.chi_name || ''),
              qty,
              unit: String(d.unit || ''),
              price,
              discount,
              line_total,
            };
          })
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, [transCode, formData, form]);

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

  useEffect(() => {
    if (formDataError) {
      message.error(formDataError || t.createPage.failedFormData);
    }
  }, [formDataError, t.createPage.failedFormData]);

  const buildQuotationReturnPath = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('selectCust');
    const qs = p.toString();
    return `/sales/quotations/create/${encodeURIComponent(transCode)}${qs ? `?${qs}` : ''}`;
  }, [searchParams, transCode]);

  const goToCreateCustomer = useCallback(() => {
    allowNavigationRef.current = true;
    const returnTo = buildQuotationReturnPath();
    const langParam = searchParams.get('lang');
    const langPart =
      langParam != null && langParam !== ''
        ? `&lang=${encodeURIComponent(langParam)}`
        : '';
    router.push(`/customers/add?returnTo=${encodeURIComponent(returnTo)}${langPart}`);
  }, [buildQuotationReturnPath, router, searchParams]);

  useEffect(() => {
    const code = searchParams.get('selectCust')?.trim();
    if (!code || !transCode) {
      selectCustRefetchAttempted.current = false;
      return;
    }
    if (!formData?.customers?.length) return;

    const cleanSelectCustFromUrl = () => {
      allowNavigationRef.current = true;
      const p = new URLSearchParams(searchParams.toString());
      p.delete('selectCust');
      const qs = p.toString();
      router.replace(`/sales/quotations/create/${encodeURIComponent(transCode)}${qs ? `?${qs}` : ''}`);
    };

    const match = formData.customers.find((x) => x.cust_code === code);
    if (match) {
      selectCustRefetchAttempted.current = false;
      setSelectedCustomer({ cust_code: match.cust_code, name: match.name, pm_code: match.pm_code ?? null });
      const values: { cust_code: string; pm_code?: string } = { cust_code: match.cust_code };
      if (match.pm_code && String(match.pm_code).trim() !== '') {
        values.pm_code = String(match.pm_code);
      }
      form.setFieldsValue(values);
      message.success(t.createPage.customerSelectedAfterCreate);
      cleanSelectCustFromUrl();
      return;
    }

    if (!selectCustRefetchAttempted.current) {
      selectCustRefetchAttempted.current = true;
      void refreshFormData();
      return;
    }

    selectCustRefetchAttempted.current = false;
    message.warning(t.createPage.customerNotFoundAfterCreate);
    cleanSelectCustFromUrl();
  }, [searchParams, formData, transCode, form, router, t, refreshFormData]);

  const addLineItem = (product?: QuickItemProduct) => {
    if (!product) return;

    const itemCode = String(product.item_code ?? '').trim();
    if (!itemCode) return;
    const codeKey = normalizeItemCode(itemCode);

    setLineItems((prev) => {
      const catalogProduct = formData?.products?.find(
        (p) => normalizeItemCode(p.item_code) === codeKey
      );
      const resolvedPrice =
        Number(product.price || 0) > 0
          ? Number(product.price)
          : Number(catalogProduct?.price || 0);

      const existingIdx = prev.findIndex((item) => normalizeItemCode(item.item_code) === codeKey);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const curr = updated[existingIdx];
        const nextQty = curr.qty + 1;
        const unitPrice = curr.price > 0 ? curr.price : resolvedPrice;
        updated[existingIdx] = {
          ...curr,
          qty: nextQty,
          price: unitPrice,
          line_total: calcLineTotal(nextQty, unitPrice, curr.discount),
        };
        return updated;
      }

      return [
        ...prev,
        {
          uid: Date.now(),
          item_code: itemCode,
          eng_name: product.eng_name,
          chi_name: product.chi_name,
          qty: 1,
          unit: product.unit || catalogProduct?.unit || '',
          price: resolvedPrice,
          discount: 0,
          line_total: calcLineTotal(1, resolvedPrice, 0),
        },
      ];
    });
  };

  const updateLineItem = (index: number, field: keyof QuotationLineItem, value: string | number) => {
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
        String(customer.cust_code ?? '').toLowerCase().includes(searchLower) ||
        String(customer.name ?? '').toLowerCase().includes(searchLower) ||
        String(customer.phone_1 ?? '').toLowerCase().includes(searchLower) ||
        String(customer.email_1 ?? '').toLowerCase().includes(searchLower)
      );
    });
  }, [formData?.customers, customerSearchText]);

  const filteredItems = useMemo(() => {
    if (!formData?.products) return [];
    const searchLower = itemSearchText.toLowerCase();
    return formData.products.filter((item) => {
      return (
        String(item.item_code ?? '').toLowerCase().includes(searchLower) ||
        String(item.eng_name ?? '').toLowerCase().includes(searchLower) ||
        String(item.chi_name ?? '').toLowerCase().includes(searchLower)
      );
    });
  }, [formData?.products, itemSearchText]);

  const warehouseOptions = useMemo(() => {
    return (formData?.shops || [])
      .filter((s) => Number(s.is_warehouse) === 1)
      .map((w) => ({ value: w.shop_code, label: `${w.shop_code} - ${w.name}` }));
  }, [formData?.shops]);

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
        message.error(t.createPage.needLineItem);
        return;
      }

      const incomplete = lineItems.filter((item) => !item.item_code || item.qty <= 0 || item.price <= 0);
      if (incomplete.length > 0) {
        message.error(t.createPage.completeLineItems);
        return;
      }

      if (isDraft) {
        if (reservedTransCode) {
          setShowSaveConfirmModal(true);
          return;
        }
        setGeneratingNumber(true);
        try {
          const code = await reserveQuotationNumber(browserSessionId);
          setReservedTransCode(code);
          setShowSaveConfirmModal(true);
        } catch (error) {
          message.error(error instanceof Error ? error.message : t.createPage.failedCreate);
        } finally {
          setGeneratingNumber(false);
        }
        return;
      }

      await persistQuotation(transCode, formValues);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      console.error(error);
      message.error(t.createPage.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const persistQuotation = async (
    saveCode: string,
    formValues: Awaited<ReturnType<typeof form.validateFields>>
  ) => {
    try {
      setSaving(true);
      const totalAmount = lineItems.reduce((sum, item) => sum + item.line_total, 0);
      const fv = formValues as Record<string, unknown>;
      const transactionDate = fv.transaction_date
        ? dayjs.isDayjs(fv.transaction_date)
          ? (fv.transaction_date as Dayjs).format('YYYY-MM-DD HH:mm:ss')
          : String(fv.transaction_date)
        : undefined;
      const validUntilDate = fv.valid_until_date
        ? dayjs.isDayjs(fv.valid_until_date)
          ? (fv.valid_until_date as Dayjs).format('YYYY-MM-DD HH:mm:ss')
          : String(fv.valid_until_date)
        : undefined;

      const { transaction_date: _tx, valid_until_date: _vu, ...restHeader } = fv;

      const payload = {
        transCode: saveCode,
        headerData: {
          ...restHeader,
          prefix: 'QTA',
          total: totalAmount,
          employee_code: user ? String(user.employee_code) : undefined,
          quotation_date: transactionDate,
          valid_until_date: validUntilDate,
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
        message.error(result.error || t.createPage.failedCreate);
        return;
      }

      if (browserSessionId || saveCode) {
        await TransactionGenerator.commitTransaction(browserSessionId, saveCode);
      }

      setShowSaveConfirmModal(false);
      message.success(t.createPage.createdSuccess);
      allowNavigationRef.current = true;
      router.push(QUOTATION_BASE_PATH);
    } catch (error) {
      console.error(error);
      message.error(t.createPage.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSaveWithNumber = async () => {
    const code = isDraft ? reservedTransCode : transCode;
    if (!code) return;
    try {
      const formValues = await form.validateFields();
      await persistQuotation(code, formValues);
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      console.error(error);
      message.error(t.createPage.errorSave);
    }
  };

  const handleConfirmDiscard = async () => {
    try {
      const codeToDiscard = isDraft ? reservedTransCode : transCode;
      if (codeToDiscard) {
        await TransactionGenerator.discardTransaction(browserSessionId, codeToDiscard);
      }
      sessionStorage.removeItem(QUOTATION_SESSION_KEY);
      setShowDiscardModal(false);
      const target = pendingNavigateRef.current || QUOTATION_BASE_PATH;
      pendingNavigateRef.current = null;
      allowNavigationRef.current = true;
      router.push(target);
    } catch (error) {
      console.error(error);
      message.error(t.createPage.failedDiscard);
    }
  };

  const functionBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button icon={<ArrowLeftOutlined />} onClick={requestBackOrDiscard}>
        {t.createPage.back}
      </Button>
      <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving || generatingNumber}>
        {saveWithShortcutLabel(lang)}
      </Button>
      <CustomerTipsActionButton active={tipsOpen} onClick={handleOpenTips} lang={lang} disabled={saving} />
      <Button icon={<StopOutlined />} danger onClick={() => setShowDiscardModal(true)} disabled={saving}>
        {t.createPage.discard}
      </Button>
    </div>
  );

  if (!transCode) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.breadcrumb.home, href: '/' },
              { label: t.breadcrumb.sales, href: '/sales' },
              { label: t.breadcrumb.quotations, href: '/sales/quotations' },
              { label: t.breadcrumb.create, current: true },
            ]}
          />
        }
        buttonBar={functionBar}
        title={t.createPage.invalidTitle}
        description={t.createPage.invalidAccess}
        actionBarSaveShortcut={{
          onSave: handleSave,
          disabled: saving || !transCode,
        }}
      >
        <div className="px-8 py-6">
          <div className="text-center py-8 text-gray-600">
            <p>{t.createPage.invalidAccess}</p>
            <Button
              type="primary"
              onClick={() => {
                allowNavigationRef.current = true;
                router.push('/sales/quotations');
              }}
            >
              {t.createPage.goToList}
            </Button>
          </div>
        </div>
      </BasicPageLayout>
    );
  }

  const pageTitle = isDraft ? t.createPage.title : `${t.createPage.title}: ${transCode}`;
  const displayTransCode = isDraft ? reservedTransCode : transCode;

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, href: '/' },
            { label: t.breadcrumb.sales, href: '/sales' },
            { label: t.breadcrumb.quotations, href: '/sales/quotations' },
            { label: t.breadcrumb.create, current: true },
          ]}
        />
      }
      buttonBar={functionBar}
      title={pageTitle}
      description={t.createPage.description}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: saving || generatingNumber }}
    >
      <div className="px-8 py-6 bg-white" style={{ textAlign: 'left' }}>
        <Form form={form} layout="horizontal" labelCol={{ span: 8, style: { textAlign: 'left' } }} wrapperCol={{ span: 16, style: { textAlign: 'left' } }} className="space-y-6">
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
              <Card title={t.createPage.quotationInfo} size="small">
                <Form.Item label={t.detailLabels.quotationNumber}>
                  <Input
                    disabled
                    value={displayTransCode}
                    placeholder={isDraft && !displayTransCode ? t.createPage.assignedOnSave : undefined}
                    style={{ backgroundColor: '#f5f5f5', color: '#666', cursor: 'not-allowed' }}
                  />
                </Form.Item>

                <Form.Item label={t.createPage.quotationDate} name="transaction_date" rules={[{ required: true, message: t.createPage.quotationDateRequired }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label={t.createPage.validUntil} name="valid_until_date" rules={[{ required: true, message: t.createPage.validUntilRequired }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="cust_code" hidden rules={[{ required: true, message: t.createPage.customerRequired }]}>
                  <Input />
                </Form.Item>

                <Form.Item label={t.createPage.customer} required>
                  <div className="flex flex-wrap gap-2 items-stretch">
                    <Space.Compact className="flex-1 min-w-[200px]">
                      <Input
                        placeholder={t.createPage.customerHint}
                        value={selectedCustomer ? `${selectedCustomer.cust_code} - ${selectedCustomer.name ?? ''}` : ''}
                        readOnly
                        style={{ cursor: 'pointer' }}
                        onClick={() => setShowCustomerModal(true)}
                      />
                      <Button icon={<SearchOutlined />} onClick={() => setShowCustomerModal(true)}>
                        {t.createPage.select}
                      </Button>
                    </Space.Compact>
                    <Button type="default" icon={<UserAddOutlined />} onClick={goToCreateCustomer}>
                      {t.createPage.createNewCustomer}
                    </Button>
                  </div>
                </Form.Item>

                <Form.Item label={t.createPage.referenceCode} name="refer_code">
                  <Input placeholder={t.detailLabels.enterReferenceCode} />
                </Form.Item>

                <Form.Item name="shop_code" hidden rules={[{ required: true, message: t.createPage.shopRequired }]}>
                  <Input />
                </Form.Item>

                <Form.Item label={t.createPage.warehouse} name="wh_code" rules={[{ required: true, message: t.createPage.warehouseRequired }]}>
                  <Select
                    placeholder={t.detailLabels.selectWarehouse}
                    options={warehouseOptions}
                    showSearch
                    optionFilterProp="label"
                    onChange={() => {
                      warehouseManuallySetRef.current = true;
                    }}
                  />
                </Form.Item>

                <Form.Item label={t.createPage.paymentMethod} name="pm_code">
                  <Select
                    placeholder={t.detailLabels.selectPaymentMethod}
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
              <Card title={t.createPage.additionalInfo} size="small">
                <Form.Item label={t.createPage.remarks} name="remark">
                  <Input.TextArea rows={4} placeholder={t.detailLabels.enterRemarks} />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24}>
              <Card
                title={t.createPage.lineItemsTitle}
                size="small"
                extra={
                  <QuickItemCodeSearchBar
                    products={formData?.products || []}
                    placeholder={t.createPage.quickItemCodePlaceholder}
                    itemsButtonLabel={t.createPage.items}
                    productsAvailable={Boolean(formData?.products)}
                    formDataUnavailableMessage={t.createPage.failedFormData}
                    itemNotFoundMessage={t.createPage.itemNotFound}
                    onAdd={addLineItem}
                    onOpenItemModal={() => setShowItemModal(true)}
                    onError={(msg) => message.error(msg)}
                  />
                }
              >
                {lineItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>{t.createPage.emptyLineItems}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Row gutter={[16, 16]} className="pb-2 border-b border-gray-300">
                      <Col span={4}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.itemCode}</div>
                      </Col>
                      <Col span={6}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.description}</div>
                      </Col>
                      <Col span={3}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.qty}</div>
                      </Col>
                      <Col span={2}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.unit}</div>
                      </Col>
                      <Col span={3}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.price}</div>
                      </Col>
                      <Col span={2}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.discount}</div>
                      </Col>
                      <Col span={3}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.lineTotal}</div>
                      </Col>
                      <Col span={1}>
                        <div className="text-sm font-semibold text-gray-700">{t.detailLabels.action}</div>
                      </Col>
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
                      <div className="text-lg font-bold">
                        {t.createPage.total}: {formatCurrency(lineItems.reduce((sum, item) => sum + item.line_total, 0))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Form>
      </div>

      <Modal
        title={t.createPage.saveConfirmTitle}
        open={showSaveConfirmModal}
        onOk={() => void handleConfirmSaveWithNumber()}
        onCancel={() => setShowSaveConfirmModal(false)}
        okText={t.createPage.saveConfirmOk}
        cancelText={t.createPage.saveConfirmCancel}
        confirmLoading={saving}
        okButtonProps={{ disabled: !reservedTransCode }}
      >
        <p>{reservedTransCode ? t.createPage.saveConfirmBody(reservedTransCode) : t.createPage.generatingNumber}</p>
        {reservedTransCode && (
          <Input
            value={reservedTransCode}
            disabled
            style={{ marginTop: 12, backgroundColor: '#f5f5f5', color: '#333', fontWeight: 600 }}
          />
        )}
      </Modal>

      <Modal
        title={t.createPage.discardModalTitle}
        open={showDiscardModal}
        onOk={handleConfirmDiscard}
        onCancel={() => setShowDiscardModal(false)}
        okText={t.createPage.discardOk}
        cancelText={t.createPage.discardCancel}
        okButtonProps={{ danger: true }}
      >
        <p>{t.createPage.discardLine1}</p>
        <p>
          {isDraft && !reservedTransCode ? (
            t.createPage.discardLine2Draft
          ) : (
            <>
              {t.createPage.discardLine2} <strong>{displayTransCode}</strong>
            </>
          )}
        </p>
      </Modal>

      <CustomerTipsModal
        open={tipsOpen}
        onClose={closeTips}
        custCode={activeCustCode}
        customerName={activeCustomerName}
        transCode={transCode}
        token={token}
        lang={lang}
        onAddItem={addLineItem}
        detailLabels={{
          itemCode: t.detailLabels.itemCode,
          englishName: t.detailLabels.englishName,
          chineseName: t.detailLabels.chineseName,
          unit: t.detailLabels.unit,
          price: t.detailLabels.price,
          qty: t.detailLabels.qty,
          discount: t.detailLabels.discount,
        }}
      />

      <Modal
        title={t.createPage.customerModalTitle}
        open={showCustomerModal}
        onCancel={() => setShowCustomerModal(false)}
        footer={
          <Space>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => {
                setShowCustomerModal(false);
                goToCreateCustomer();
              }}
            >
              {t.createPage.createNewCustomer}
            </Button>
            <Button onClick={() => setShowCustomerModal(false)}>{t.createPage.close}</Button>
          </Space>
        }
        width={800}
      >
        <div className="mb-4">
          <Input placeholder={t.createPage.customerSearchPlaceholder} prefix={<SearchOutlined />} value={customerSearchText} onChange={(e) => setCustomerSearchText(e.target.value)} allowClear />
        </div>
        <Table
          columns={[
            { title: t.createPage.customerCode, dataIndex: 'cust_code', key: 'cust_code', width: '25%' },
            { title: t.createPage.customerName, dataIndex: 'name', key: 'name', width: '35%' },
            { title: t.createPage.phone, dataIndex: 'phone_1', key: 'phone_1', width: '20%' },
            { title: t.createPage.email, dataIndex: 'email_1', key: 'email_1', width: '20%' },
          ]}
          dataSource={filteredCustomers}
          rowKey="cust_code"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({ onClick: () => handleSelectCustomer(record), style: { cursor: 'pointer' } })}
          size="small"
        />
      </Modal>

      <Modal
        title={t.createPage.itemModalTitle}
        open={showItemModal}
        onCancel={() => setShowItemModal(false)}
        width={900}
        afterOpenChange={(open) => {
          if (open) setTimeout(() => itemSearchInputRef.current?.focus(), 0);
        }}
        footer={
          <Button type="default" onClick={() => setShowItemModal(false)}>
            {t.createPage.close}
          </Button>
        }
      >
        <div className="mb-4">
          <Input
            ref={itemSearchInputRef}
            placeholder={t.createPage.itemSearchPlaceholder}
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
