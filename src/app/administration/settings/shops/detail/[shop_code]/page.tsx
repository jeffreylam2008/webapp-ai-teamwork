'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use } from 'react';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { Form, Input, Button, message, Switch, Select } from 'antd';

interface Shop {
  uid: number;
  shop_code: string;
  name: string;
  phone: string;
  address1: string;
  address2: string;
  is_warehouse?: number | boolean;
  default_whcode?: string | null;
  create_date?: string;
  modify_date?: string;
}

// Small in-memory cache to avoid duplicate GETs in dev (React strict mode),
// and to reduce immediate re-fetches when navigating back and forth.
const SHOP_CACHE_TTL_MS = 5_000;
const shopCache = new Map<string, { ts: number; data: Shop }>();
const shopInFlight = new Map<string, Promise<Shop>>();

function ShopDetailPageContent({ params }: { params: Promise<{ shop_code: string }> }) {
  const { shop_code } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const sd = useMemo(() => getAdminPagesTexts(lang).shopDetail, [lang]);
  const goBackToShops = useBackNavigation(() => router.push('/administration/settings/shops'));
  const [form] = Form.useForm();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ shop_code: string; name: string }>>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    alive.current = true;
    void fetchShopDetails();
    return () => {
      // Don't abort fetch here; in React dev/StrictMode, effects are mounted/unmounted immediately,
      // and aborting would force a second GET. Instead, we ignore state updates after unmount.
      alive.current = false;
    };
  }, [shop_code]);

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

  const fetchShopDetails = async () => {
    try {
      const cached = shopCache.get(shop_code);
      if (cached && Date.now() - cached.ts < SHOP_CACHE_TTL_MS) {
        const d = cached.data;
        if (alive.current) {
          setShop(d);
          form.setFieldsValue({
            ...d,
            is_warehouse: Number(d.is_warehouse) === 1 || d.is_warehouse === true,
            default_whcode: typeof d.default_whcode === 'string' ? d.default_whcode : undefined,
          });
          setLoading(false);
        }
        return;
      }

      if (alive.current) setLoading(true);

      // Dedupe in-flight GETs (e.g. React strict mode double-invoke)
      let p = shopInFlight.get(shop_code);
      if (!p) {
        p = (async () => {
          const response = await fetch(`/api/shops/${encodeURIComponent(shop_code)}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || sd.fetchFailed);
          }

          const d = result.data as Shop;
          shopCache.set(shop_code, { ts: Date.now(), data: d });
          return d;
        })().finally(() => {
          shopInFlight.delete(shop_code);
        });
        shopInFlight.set(shop_code, p);
      }

      const d = await p;
      if (alive.current) {
        setShop(d);
        form.setFieldsValue({
          ...d,
          is_warehouse: Number(d.is_warehouse) === 1 || d.is_warehouse === true,
          default_whcode: typeof d.default_whcode === 'string' ? d.default_whcode : undefined,
        });
      }
    } catch (error) {
      console.error('Error fetching shop details:', error);
      message.error(error instanceof Error ? error.message : sd.fetchFailed);
      router.push('/administration/settings/shops');
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const response = await fetch(`/api/shops/${encodeURIComponent(shop_code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          is_warehouse: values.is_warehouse === true,
          default_whcode: typeof values.default_whcode === 'string' && values.default_whcode ? values.default_whcode : null,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(sd.updateOk);
        setEditMode(false);
        const d = result.data as Shop;
        shopCache.set(shop_code, { ts: Date.now(), data: d });
        setShop(d);
        form.setFieldsValue({
          ...d,
          is_warehouse: Number(d.is_warehouse) === 1 || d.is_warehouse === true,
          default_whcode: typeof d.default_whcode === 'string' ? d.default_whcode : undefined,
        });
      } else {
        message.error(result.error || sd.updateFailed);
      }
    } catch (error) {
      console.error('Error updating shop:', error);
      message.error(sd.updateError);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    if (shop) {
      form.setFieldsValue({
        ...shop,
        is_warehouse: Number(shop.is_warehouse) === 1 || shop.is_warehouse === true,
        default_whcode: typeof shop.default_whcode === 'string' ? shop.default_whcode : undefined,
      });
    }
  };

  const FunctionBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button 
        icon={<ArrowLeftOutlined />}
        onClick={goBackToShops}
      >
        {sd.back}
      </Button>
      {!editMode ? (
        <Button 
          type="primary"
          icon={<EditOutlined />}
          onClick={() => setEditMode(true)}
        >
          {sd.editShop}
        </Button>
      ) : (
        <>
          <Button 
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          <Button 
            icon={<CloseOutlined />}
            onClick={handleCancel}
          >
            {sd.cancel}
          </Button>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <BasicPageLayout
        title={sd.loadingTitle}
        description={sd.loadingDescription}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: bc.home, href: '/' },
              {
                label: bc.administration,
                href: '/administration',
                menuItems: [
                  { label: bc.users, href: '/administration/users' },
                  { label: bc.settings, href: '/administration/settings' },
                  { label: bc.importExport, href: '/administration/master-data' },
                ],
              },
              { label: bc.settings, href: '/administration/settings' },
              { label: bc.shops, href: '/administration/settings/shops' },
              { label: bc.loading, current: true },
            ]}
          />
        }
      >
        <Form form={form} layout="vertical">
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">{sd.loadingShop}</p>
          </div>
        </Form>
      </BasicPageLayout>
    );
  }

  if (!shop) {
    return (
      <BasicPageLayout
        title={sd.notFoundTitle}
        description={sd.notFoundDescription}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: bc.home, href: '/' },
              {
                label: bc.administration,
                href: '/administration',
                menuItems: [
                  { label: bc.users, href: '/administration/users' },
                  { label: bc.settings, href: '/administration/settings' },
                  { label: bc.importExport, href: '/administration/master-data' },
                ],
              },
              { label: bc.settings, href: '/administration/settings' },
              { label: bc.shops, href: '/administration/settings/shops' },
              { label: bc.notFound, current: true },
            ]}
          />
        }
      >
        <div className="text-center py-8">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-gray-600">{sd.notFoundBody}</p>
        </div>
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      title={sd.titleShop(shop.name)}
      description={sd.descriptionShop(shop.shop_code)}
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: bc.home, href: '/' },
              {
                label: bc.administration,
                href: '/administration',
                menuItems: [
                  { label: bc.users, href: '/administration/users' },
                  { label: bc.settings, href: '/administration/settings' },
                  { label: bc.importExport, href: '/administration/master-data' },
                ],
              },
              { label: bc.settings, href: '/administration/settings' },
              { label: bc.shops, href: '/administration/settings/shops' },
              { label: shop.name, current: true },
          ]} 
        />
      }
      buttonBar={FunctionBar}
      actionBarSaveShortcut={{
        onSave: handleSave,
        disabled: saving || !editMode,
      }}
    >
      <div className="px-8 py-6 bg-white">
        <Form
          form={form}
          layout="vertical"
          disabled={!editMode}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Form.Item
              label={sd.labelShopCode}
              name="shop_code"
              rules={[{ required: true, message: sd.ruleShopCode }]}
            >
              <Input placeholder={sd.phShopCode} />
            </Form.Item>

            <Form.Item
              label={sd.labelShopName}
              name="name"
              rules={[{ required: true, message: sd.ruleShopName }]}
            >
              <Input placeholder={sd.phShopName} />
            </Form.Item>

            <Form.Item
              label={sd.labelPhone}
              name="phone"
              rules={[{ required: true, message: sd.rulePhone }]}
            >
              <Input placeholder={sd.phPhone} />
            </Form.Item>

            <Form.Item
              label={sd.labelAddress1}
              name="address1"
              rules={[{ required: true, message: sd.ruleAddress1 }]}
            >
              <Input placeholder={sd.phAddress1} />
            </Form.Item>

            <Form.Item
              label={sd.labelAddress2}
              name="address2"
            >
              <Input placeholder={sd.phAddress2} />
            </Form.Item>

            <Form.Item label={sd.labelDefaultWhcode} name="default_whcode">
              <Select
                placeholder={sd.phDefaultWhcode}
                allowClear
                showSearch
                optionFilterProp="label"
                options={warehouseOptions.map((w) => ({ value: w.shop_code, label: `${w.shop_code} - ${w.name}` }))}
              />
            </Form.Item>

            <div className="md:col-span-2">
              <Form.Item
                label={sd.labelIsWarehouse}
                name="is_warehouse"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </div>
          </div>



          {!editMode && (
            <div className="mt-6 p-4 bg-gray-50 rounded-md">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">{sd.additionalInfo}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{sd.labelCreated}</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {shop.create_date ? (mounted ? new Date(shop.create_date).toLocaleString() : shop.create_date) : sd.na}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{sd.labelModified}</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {shop.modify_date ? (mounted ? new Date(shop.modify_date).toLocaleString() : shop.modify_date) : sd.na}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Form>
      </div>
    </BasicPageLayout>
  );
}

export default function ShopDetailPage({ params }: { params: Promise<{ shop_code: string }> }) {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <ShopDetailPageContent params={params} />
    </Suspense>
  );
}
