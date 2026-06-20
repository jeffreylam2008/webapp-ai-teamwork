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
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface PaymentTerm {
  pt_code: string;
  payment_term: string;
  create_date?: string;
}

const PaymentTermDetailPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const td = useMemo(() => getAdminPagesTexts(lang).paymentTermDetail, [lang]);
  const goBackToList = useBackNavigation(() => router.push('/administration/settings/payment-term'));
  const params = useParams();
  const { token } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm | null>(null);
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

  // Fetch payment term data
  const fetchPaymentTerm = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `/api/payment-terms?search=${params.pt_code}`,
        token,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
      );
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        const paymentTermData = result.data[0];
        setPaymentTerm(paymentTermData);
        form.setFieldsValue(paymentTermData);
      } else {
        setPageMessage({
          type: 'error',
          text: td.notFound
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: td.fetchFailed
      });
    } finally {
      setLoading(false);
    }
  }, [params.pt_code, form, td, token]);

  useEffect(() => {
    fetchPaymentTerm();
  }, [params.pt_code, fetchPaymentTerm]);

  const handleSubmit = async (values: Partial<PaymentTerm>) => {
    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/payment-terms', token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pt_code: params.pt_code,
          ...values,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Redirect to list page with success message
        router.push(
          `/administration/settings/payment-term?message=${encodeURIComponent(td.redirectUpdated)}&type=success`
        );
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || td.updateFailed
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: td.updateError
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
          {td.back}
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
            { label: bc.paymentTerms, href: '/administration/settings/payment-term' },
            { label: paymentTerm?.pt_code || bc.loading, current: true }
          ]} 
        />
      }
      buttonBar={<FunctionBar />}
      title={td.titleEdit(paymentTerm?.pt_code || bc.loading)}
      description={td.description}
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled: saving || loading || !paymentTerm,
      }}
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
                  {pageMessage.type === 'success' ? td.labelSuccess : td.labelError}
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
            <p className="text-gray-600">{td.loading}</p>
          </div>
        ) : paymentTerm ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title={td.cardInfo} size="small">
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
              >
                <Form.Item
                  label={td.labelPtCode}
                >
                  <Input value={paymentTerm.pt_code} disabled />
                </Form.Item>

                <Form.Item
                  name="payment_term"
                  label={td.labelDescription}
                  rules={[{ required: true, message: td.ruleDescription }]}
                >
                  <Input placeholder={td.phDescription} />
                </Form.Item>
              </Form>
            </Card>

            <Card title={td.cardExtra} size="small">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{td.labelCreateDate}</label>
                  <div className="mt-1 text-gray-900">
                    {paymentTerm.create_date ? new Date(paymentTerm.create_date).toLocaleString() : '-'}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600">
            <p>{td.notFound}</p>
          </div>
        )}
      </div>
    </BasicPageLayout>
  );
};

function PaymentTermDetailPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <PaymentTermDetailPageContent />
    </Suspense>
  );
}

export default PaymentTermDetailPage;
