'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Card, Space, Button, Form, Input, Select } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getDistrictTexts } from '../../i18n';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface District {
  district_code: string;
  district_eng: string;
  district_chi: string;
  region: string;
  create_date?: string;
}

const DistrictDetailPage = () => {
  const router = useRouter();
  const goBackToList = useBackNavigation(() => router.push('/administration/settings/district'));
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getDistrictTexts(lang), [lang]);
  const { token } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [district, setDistrict] = useState<District | null>(null);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear pageMessage after 10 seconds
  useEffect(() => {
    if (pageMessage.type && pageMessage.text) {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      messageTimeoutRef.current = setTimeout(() => {
        setPageMessage({ type: null, text: null });
      }, 10000);
    }
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [pageMessage.type, pageMessage.text]);

  // Fetch district data
  const fetchDistrict = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/districts?search=${params.district_code}`,
        token,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
      );
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        const districtData = result.data[0];
        setDistrict(districtData);
        form.setFieldsValue(districtData);
      } else {
        setPageMessage({
          type: 'error',
          text: t.detailPage.notFound
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detailPage.fetchFailed
      });
    } finally {
      setLoading(false);
    }
  }, [params.district_code, form, t.detailPage.fetchFailed, t.detailPage.notFound, token]);

  useEffect(() => {
    fetchDistrict();
  }, [params.district_code, fetchDistrict]);

  const handleSubmit = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/districts', token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          district_code: params.district_code,
          ...values,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to list page with success message
        router.push(
          `/administration/settings/district?message=${encodeURIComponent(
            t.detailPage.updatedSuccess
          )}&type=success`
        );
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detailPage.updateFailed
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detailPage.updateError
      });
    } finally {
      setSaving(false);
    }
  };

  // Function Bar Component
  const FunctionBar = () => (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4">
      <Space>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={goBackToList}
        >
          {t.detailPage.back}
        </Button>
        <Button 
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={() => form.submit()}
        >
          {saveWithShortcutLabel(lang)}
        </Button>
      </Space>
    </div>
  );

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
            { label: t.breadcrumb.districts, href: '/administration/settings/district' },
            { label: district?.district_code || t.detailPage.loadingBreadcrumb, current: true }
          ]} 
        />
      }
      buttonBar={<FunctionBar />}
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled: saving || loading || !district,
      }}
      title={t.detailPage.title(district?.district_code || t.detailPage.loadingTitle)}
      description={t.detailPage.description}
    >
      {/* Message Section */}
      {pageMessage.type && pageMessage.text && (
        <div className="px-8 py-4">
          <div className={`p-4 rounded-md border ${
            pageMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="font-medium">
                  {pageMessage.type === 'success' ? `✅ ${t.messages.successPrefix}` : `❌ ${t.messages.errorPrefix}`}
                </span>
                <span className="ml-2">{pageMessage.text}</span>
              </div>
              <button
                onClick={() => {
                  if (messageTimeoutRef.current) {
                    clearTimeout(messageTimeoutRef.current);
                  }
                  setPageMessage({ type: null, text: null });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">{t.detailPage.loadingData}</p>
          </div>
        ) : district ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title={t.detailPage.informationCard} size="small">
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
              >
                <Form.Item
                  label={t.form.districtCode}
                >
                  <Input value={district.district_code} disabled />
                </Form.Item>

                <Form.Item
                  name="district_eng"
                  label={t.form.englishName}
                  rules={[{ required: true, message: t.detailPage.englishNameRequired }]}
                >
                  <Input placeholder={t.form.englishNamePlaceholder} />
                </Form.Item>

                <Form.Item
                  name="district_chi"
                  label={t.form.chineseName}
                  rules={[{ required: true, message: t.detailPage.chineseNameRequired }]}
                >
                  <Input placeholder={t.form.chineseNamePlaceholder} />
                </Form.Item>

                <Form.Item
                  name="region"
                  label={t.form.region}
                  rules={[{ required: true, message: t.detailPage.regionRequired }]}
                >
                  <Select
                    placeholder={t.form.regionPlaceholder}
                    options={[
                      { value: 'HK', label: t.regions.HK },
                      { value: 'KLN', label: t.regions.KLN },
                      { value: 'NT', label: t.regions.NT }
                    ]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Form>
            </Card>

            <Card title={t.detailPage.additionalInfoCard} size="small">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.detailPage.createDate}</label>
                  <div className="mt-1 text-gray-900">
                    {district.create_date ? new Date(district.create_date).toLocaleString() : '-'}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600">
            <p>District not found.</p>
          </div>
        )}
      </div>
    </BasicPageLayout>
  );
};

export default DistrictDetailPage;
