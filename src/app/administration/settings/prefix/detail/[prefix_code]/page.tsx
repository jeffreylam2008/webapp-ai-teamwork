'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Form, Input, Button, Select, App } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getPrefixTexts } from '../../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface Prefix {
  uid: number;
  prefix_code: string;
  prefix_name: string;
  status: number;
  [key: string]: string | number | boolean | undefined;
}

const PrefixDetailPage = () => {
  const router = useRouter();
  const goBackToPrefixes = useBackNavigation(() => router.push('/administration/settings/prefix'));
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getPrefixTexts(lang), [lang]);
  const [form] = Form.useForm();
  const [prefix, setPrefix] = useState<Prefix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { message: messageApi } = App.useApp();
  const { token } = useAuth();

  const STATUS_OPTIONS = useMemo(
    () => [
      { value: 'Active', label: t.statusOptions.active },
      { value: 'Inactive', label: t.statusOptions.inactive },
    ],
    [t]
  );

  // Fetch prefix data
  const fetchPrefix = useCallback(async () => {
    try {
      const response = await fetchWithAuth(
        `/api/prefixes?search=${params.prefix_code}`,
        token,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
      );
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        const prefixData = result.data[0];
        setPrefix(prefixData);
        form.setFieldsValue(prefixData);
      } else {
        messageApi.error(t.detailPage.notFound);
        router.push('/administration/settings/prefix');
      }
    } catch {
      messageApi.error(t.detailPage.fetchFailed);
      router.push('/administration/settings/prefix');
    } finally {
      setLoading(false);
    }
  }, [params.prefix_code, form, router, messageApi, t, token]);

  useEffect(() => {
    fetchPrefix();
  }, [params.prefix_code, fetchPrefix]);

  const handleSave = async (values: Partial<Prefix>) => {
    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/prefixes', token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix_code: params.prefix_code,
          ...values
        }),
      });
      const result = await response.json();

      if (result.success) {
        messageApi.success(t.detailPage.saved);
        router.push(
          `/administration/settings/prefix?message=${encodeURIComponent(t.detailPage.saved)}&type=success`
        );
      } else {
        messageApi.error(result.error || t.detailPage.updateFailed);
      }
    } catch {
      messageApi.error(t.detailPage.updateError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: t.breadcrumb.home, href: '/' },
              {
                label: t.breadcrumb.administration,
                href: '/administration',
                menuItems: [
                  { label: 'Users', href: '/administration/users' },
                  { label: 'Settings', href: '/administration/settings' },
                  { label: 'Import/Export', href: '/administration/master-data' },
                ],
              },
              { label: t.breadcrumb.settings, href: '/administration/settings' },
              { label: t.breadcrumb.prefixes, href: '/administration/settings/prefix' },
              { label: t.breadcrumb.loading, current: true }
            ]} 
          />
        }
        title={t.detailPage.titleLoading}
        description={t.detailPage.descriptionLoading}
      >
        <div className="px-8 py-6 bg-white">
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">{t.detailPage.loadingData}</p>
          </div>
        </div>
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.breadcrumb.home, href: '/' },
            {
              label: t.breadcrumb.administration,
              href: '/administration',
              menuItems: [
                { label: 'Users', href: '/administration/users' },
                { label: 'Settings', href: '/administration/settings' },
                { label: 'Import/Export', href: '/administration/master-data' },
              ],
            },
            { label: t.breadcrumb.settings, href: '/administration/settings' },
            { label: t.breadcrumb.prefixes, href: '/administration/settings/prefix' },
            { label: prefix?.prefix_code || t.breadcrumb.loading, current: true }
          ]} 
        />
      }
      buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button 
            icon={<ArrowLeftOutlined />}
            onClick={goBackToPrefixes}
          >
            {t.detailPage.backToPrefixes}
          </Button>
        </div>
      }
      title={t.detailPage.title(prefix?.prefix_name || t.detailPage.defaultTitle)}
      description={t.detailPage.description(prefix?.prefix_code || '')}
    >
      <div className="px-8 py-6 bg-white">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            label={t.form.prefixCode}
            name="prefix_code"
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            label={t.form.prefixName}
            name="prefix_name"
            rules={[{ required: true, message: t.form.prefixNameRequired }]}
          >
            <Input placeholder={t.form.prefixNamePlaceholder} />
          </Form.Item>



          <Form.Item
            label={t.form.status}
            name="status"
            rules={[{ required: true, message: t.form.statusRequired }]}
          >
            <Select
              placeholder={t.form.statusPlaceholder}
              options={STATUS_OPTIONS}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item>
            <div className="flex gap-2">
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                {saving ? t.detailPage.saving : saveWithShortcutLabel(lang)}
              </Button>
              <Button onClick={goBackToPrefixes}>
                {t.detailPage.cancel}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
    </BasicPageLayout>
  );
};

export default PrefixDetailPage;
