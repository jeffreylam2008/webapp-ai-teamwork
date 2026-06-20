'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { Card, Space, Button, Form, Input } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';

interface PaymentMethod {
  pm_code: string;
  payment_method: string;
  create_date?: string;
  modify_date?: string;
}

const PaymentMethodDetailPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const pd = useMemo(() => getAdminPagesTexts(lang).paymentMethodDetail, [lang]);
  const goBackToList = useBackNavigation(() => router.push('/administration/settings/payment-method'));
  const params = useParams();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
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

  // Fetch payment method data
  const fetchPaymentMethod = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/payment-methods?search=${params.pm_code}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        const paymentMethodData = result.data[0];
        setPaymentMethod(paymentMethodData);
        form.setFieldsValue(paymentMethodData);
      } else {
        setPageMessage({
          type: 'error',
          text: pd.notFound
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: pd.fetchFailed
      });
    } finally {
      setLoading(false);
    }
  }, [params.pm_code, form, pd]);

  useEffect(() => {
    fetchPaymentMethod();
  }, [params.pm_code, fetchPaymentMethod]);

  const handleSubmit = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const response = await fetch('/api/payment-methods', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pm_code: params.pm_code,
          ...values,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to list page with success message
        router.push(
          `/administration/settings/payment-method?message=${encodeURIComponent(pd.redirectUpdated)}&type=success`
        );
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || pd.updateFailed
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: pd.updateError
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
          {pd.back}
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
            { label: bc.paymentMethods, href: '/administration/settings/payment-method' },
            { label: paymentMethod?.pm_code || bc.loading, current: true }
          ]} 
        />
      }
      buttonBar={<FunctionBar />}
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled: saving || loading || !paymentMethod,
      }}
      title={pd.titleEdit(paymentMethod?.pm_code || bc.loading)}
      description={pd.description}
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
                  {pageMessage.type === 'success' ? pd.labelSuccess : pd.labelError}
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
            <p className="text-gray-600">{pd.loading}</p>
          </div>
        ) : paymentMethod ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title={pd.cardInfo} size="small">
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
              >
                <Form.Item
                  label={pd.labelPmCode}
                >
                  <Input value={paymentMethod.pm_code} disabled />
                </Form.Item>

                <Form.Item
                  name="payment_method"
                  label={pd.labelDescription}
                  rules={[{ required: true, message: pd.ruleDescription }]}
                >
                  <Input placeholder={pd.phDescription} />
                </Form.Item>
              </Form>
            </Card>

            <Card title={pd.cardExtra} size="small">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{pd.labelCreateDate}</label>
                  <div className="mt-1 text-gray-900">
                    {paymentMethod.create_date ? new Date(paymentMethod.create_date).toLocaleString() : '-'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{pd.labelModified}</label>
                  <div className="mt-1 text-gray-900">
                    {paymentMethod.modify_date ? new Date(paymentMethod.modify_date).toLocaleString() : '-'}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600">
            <p>{pd.notFound}</p>
          </div>
        )}
      </div>
    </BasicPageLayout>
  );
};

function PaymentMethodDetailPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <PaymentMethodDetailPageContent />
    </Suspense>
  );
}

export default PaymentMethodDetailPage;
