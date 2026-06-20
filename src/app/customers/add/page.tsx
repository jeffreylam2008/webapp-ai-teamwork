'use client';
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCustomerTexts } from '../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useDistricts } from '@/hooks/useDistricts';
import { Card, Space, Typography, Row, Col, Button, Form, Input, Select, Spin } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const { Title } = Typography;

/** Only allow same-app relative paths (no open redirects). */
function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(trimmed)) return null;
  return trimmed;
}

interface Customer {
  cust_code: string;
  name: string;
  attn_1: string;
  delivery_addr: string;
  phone_1: string;
  pm_code: string;
  pt_code: string;
  status: string;
  email_1?: string;
  email_2?: string;
  district_code?: string;
  from_time?: string;
  to_time?: string;
  delivery_remark?: string;
  remark?: string;
  fax_1?: string;
  fax_2?: string;
  attn_2?: string;
  phone_2?: string;
  statement_remark?: string;
}

const AddCustomerContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getCustomerTexts(lang), [lang]);
  const { token } = useAuth();
  const goBackToCustomers = useBackNavigation(() => router.push('/customers'));
  const returnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { options: paymentTermOptions, loading: loadingTerms } = usePaymentTerms();
  const { options: paymentMethodOptions, loading: loadingMethods } = usePaymentMethods();
  const { options: districtOptions, loading: districtsLoading } = useDistricts();

  // Function Bar Component
  const FunctionBar = () => (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4">
      <Space>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            if (returnTo) {
              router.push(returnTo);
            } else {
              goBackToCustomers();
            }
          }}
        >
          {returnTo ? t.add.backToPrevious : t.add.back}
        </Button>
        <Button 
          type="primary"
          icon={<SaveOutlined />}
          loading={loading}
          onClick={() => form.submit()}
        >
          {saveWithShortcutLabel(lang)}
        </Button>
      </Space>
    </div>
  );

  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear pageMessage after 10 seconds
  useEffect(() => {
    if (pageMessage.type && pageMessage.text) {
      // Clear any existing timeout
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      
      // Set new timeout to clear message after 10 seconds
      messageTimeoutRef.current = setTimeout(() => {
        setPageMessage({ type: null, text: null });
      }, 10000); // 10 seconds
    }

    // Cleanup function
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [pageMessage.type, pageMessage.text]);

  const handleSubmit = async (values: Customer) => {
    console.log('Form values before submission:', JSON.stringify(values, null, 2));
    setLoading(true);
    try {
      const response = await fetchWithAuth('/api/customers', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        const cust = (result as { customer?: { cust_code?: string } }).customer;
        const custCode = typeof cust?.cust_code === 'string' ? cust.cust_code.trim() : '';
        if (returnTo && custCode) {
          const sep = returnTo.includes('?') ? '&' : '?';
          router.push(`${returnTo}${sep}selectCust=${encodeURIComponent(custCode)}`);
        } else {
          router.push('/customers?message=' + encodeURIComponent(result.message || t.add.created) + '&type=success');
        }
      } else {
        setPageMessage({ 
          type: 'error', 
          text: result.error || t.add.failedCreate 
        });
      }
    } catch (error) {
      setPageMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : t.add.errorCreate 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
            items={[
            { label: t.list.breadcrumbHome, href: '/' },
            { label: t.list.breadcrumbCustomers, href: '/customers' },
            { label: t.add.breadcrumbAdd, current: true }
          ]} 
        />
      }
      buttonBar={<FunctionBar />}
      title={t.add.title}
      description={t.add.description}
      actionBarSaveShortcut={{ onSave: () => form.submit(), disabled: loading }}
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
                  {pageMessage.type === 'success' ? `✅ ${t.add.successPrefix}` : `❌ ${t.add.errorPrefix}`}
                </span>
                <span className="ml-2">{pageMessage.text}</span>
              </div>
              <button
                onClick={() => {
                  // Clear the timeout when manually closing
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

      <div className="px-8 py-6 bg-white">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            status: 'Active'
          }}
        >
          <Row gutter={[24, 24]}>
            {/* Basic Information */}
            <Col xs={24} lg={12}>
              <Card title={t.add.cardBasic} size="small">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="cust_code"
                      label={t.add.labels.custCode}
                      rules={[
                        { required: true, message: t.add.rules.custCode },
                        { pattern: /^[A-Za-z0-9-]+$/, message: t.add.rules.custCodePattern }
                      ]}
                    >
                      <Input placeholder={t.add.placeholders.custCode} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="name"
                      label={t.add.labels.name}
                      rules={[{ required: true, message: t.add.rules.name }]}
                    >
                      <Input placeholder={t.add.placeholders.name} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="attn_1"
                      label={t.add.labels.attn1}
                    >
                      <Input placeholder={t.add.placeholders.contact} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="phone_1"
                      label={t.add.labels.phone}
                      rules={[
                        { required: true, message: t.add.rules.phone },
                        { pattern: /^\d+$/, message: t.add.rules.phoneDigits }
                      ]}
                    >
                      <Input 
                        placeholder={t.add.placeholders.phone}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (e.target && !/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          if (e.target) {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                            form.setFieldValue('phone_1', value);
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="email_1"
                      label={t.add.labels.email1}
                    >
                      <Input placeholder={t.add.placeholders.email1} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="email_2"
                      label={t.add.labels.email2}
                    >
                      <Input placeholder={t.add.placeholders.email2} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="fax_1"
                      label={t.add.labels.fax}
                    >
                      <Input 
                        placeholder={t.add.placeholders.fax}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (e.target && !/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          if (e.target) {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                            form.setFieldValue('fax_1', value);
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="fax_2"
                      label={t.add.labels.altFax}
                    >
                      <Input 
                        placeholder={t.add.placeholders.altFax}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (e.target && !/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          if (e.target) {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                            form.setFieldValue('fax_2', value);
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      name="remark"
                      label={t.add.labels.remark}
                    >
                      <Input.TextArea 
                        rows={2} 
                        placeholder={t.add.placeholders.remark}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="status"
                      label={t.add.labels.status}
                    >
                      <Select
                        options={[
                          { value: 'Active', label: t.status.active },
                          { value: 'Closed', label: t.status.closed }
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>

            {/* Delivery Information */}
            <Col xs={24} lg={12}>
              <Card title={t.add.cardDelivery} size="small">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="attn_2"
                      label={t.add.labels.attn2}
                    >
                      <Input placeholder={t.add.placeholders.contact2} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="phone_2"
                      label={t.add.labels.altPhone}
                    >
                      <Input 
                        placeholder={t.add.placeholders.altPhone}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (!/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          if (e.target) {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                            form.setFieldValue('phone_2', value);
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      name="delivery_addr"
                      label={t.add.labels.deliveryAddr}
                    >
                      <Input.TextArea 
                        rows={4} 
                        placeholder={t.add.placeholders.deliveryAddr}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="district_code"
                      label={t.add.labels.district}
                    >
                      <Select
                        loading={districtsLoading}
                        options={districtOptions}
                        placeholder={t.add.placeholders.district}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="from_time"
                      label={t.add.labels.fromTime}
                    >
                      <Input type="time" placeholder={t.add.placeholders.from} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="to_time"
                      label={t.add.labels.toTime}
                    >
                      <Input type="time" placeholder={t.add.placeholders.to} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      name="delivery_remark"
                      label={t.add.labels.deliveryRemark}
                    >
                      <Input.TextArea 
                        rows={2} 
                        placeholder={t.add.placeholders.deliveryRemark}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>

            {/* Payment Information */}
            <Col xs={24} lg={12}>
              <Card title={t.add.cardPayment} size="small">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="pm_code"
                      label={t.add.labels.pm}
                    >
                      <Select
                        loading={loadingMethods}
                        options={paymentMethodOptions}
                        placeholder={t.add.placeholders.pm}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="pt_code"
                      label={t.add.labels.pt}
                    >
                      <Select
                        loading={loadingTerms}
                        options={paymentTermOptions}
                        placeholder={t.add.placeholders.pt}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      name="statement_remark"
                      label={t.add.labels.statementRemark}
                    >
                      <Input.TextArea 
                        rows={2} 
                        placeholder={t.add.placeholders.paymentRemark}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </Form>
      </div>
    </BasicPageLayout>
  );
};

const AddCustomerPage = () => (
  <Suspense
    fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    }
  >
    <AddCustomerContent />
  </Suspense>
);

export default AddCustomerPage; 