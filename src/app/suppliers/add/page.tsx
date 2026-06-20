'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSupplierTexts } from '../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { Form, Input, Select, Button, Card, Space, Row, Col, Spin } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';

interface Supplier {
  supp_code: string;
  name: string;
  mail_addr: string;
  attn_1: string;
  phone_1: string;
  fax_1?: string;
  email_1?: string;
  pm_code: string;
  pt_code?: string;
  remark?: string;
  status: string;
}

const AddSupplierContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSupplierTexts(lang), [lang]);
  const goBackToSuppliers = useBackNavigation(() => router.push('/suppliers'));
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const submitRef = useRef<boolean>(false);
  const { options: paymentMethodOptions, loading: loadingMethods } = usePaymentMethods();
  const { options: paymentTermOptions, loading: loadingTerms } = usePaymentTerms();

  // Function Bar Component
  const FunctionBar = () => (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4">
      <Space>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={goBackToSuppliers}
        >
          {t.add.back}
        </Button>
        <Button 
          type="primary"
          icon={<SaveOutlined />}
          loading={loading || isSubmitting}
          disabled={loading || isSubmitting}
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

  const handleSubmit = async (values: Supplier) => {
    // Prevent duplicate submissions using multiple checks
    if (loading || isSubmitting || submitRef.current) {
      console.log('Duplicate submission prevented - loading:', loading, 'isSubmitting:', isSubmitting, 'submitRef:', submitRef.current);
      return;
    }

    // Set ref to prevent duplicate submissions
    submitRef.current = true;

    // Generate unique submission ID
    const currentSubmissionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setSubmissionId(currentSubmissionId);

    console.log('Form submission started - ID:', currentSubmissionId, 'loading:', loading, 'isSubmitting:', isSubmitting);
    console.log('Form values before submission:', JSON.stringify(values, null, 2));
    setLoading(true);
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      console.log('API response received - ID:', currentSubmissionId, 'success:', result.success);

      if (result.success) {
        // Redirect with success message
        router.push('/suppliers?message=' + encodeURIComponent(result.message || t.add.created) + '&type=success');
      } else {
        setPageMessage({ 
          type: 'error', 
          text: result.error || t.add.failedCreate 
        });
      }
    } catch (error) {
      console.log('API error - ID:', currentSubmissionId, 'error:', error);
      setPageMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : t.add.errorCreate 
      });
    } finally {
      console.log('Form submission completed - ID:', currentSubmissionId);
      setLoading(false);
      setIsSubmitting(false);
      setSubmissionId(null);
      submitRef.current = false;
    }
  };

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.list.breadcrumbHome, href: '/' },
            { label: t.list.breadcrumbSuppliers, href: '/suppliers' },
            { label: t.add.breadcrumbAdd, current: true }
          ]} 
        />
      }
      buttonBar={<FunctionBar />}
      title={t.add.title}
      description={t.add.description}
      actionBarSaveShortcut={{ onSave: () => form.submit(), disabled: loading || isSubmitting }}
      message={
        pageMessage.type && pageMessage.text ? (
          <div className={`p-4 mb-4 rounded-md ${
            pageMessage.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {pageMessage.text}
            <Button 
              type="text" 
              size="small" 
              onClick={() => setPageMessage({ type: null, text: null })}
              style={{ float: 'right', marginTop: '-4px' }}
            >
              ×
            </Button>
          </div>
        ) : null
      }
    >
      <div className="px-8 py-6 bg-white">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            status: 'Active'
          }}
        >
          <Row gutter={[24, 0]}>
            {/* Basic Information */}
            <Col xs={24} lg={12}>
              <Card title={t.add.cardBasic} size="small">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="supp_code"
                      label={t.add.labels.suppCode}
                      rules={[
                        { required: true, message: t.add.rules.suppCode }
                      ]}
                    >
                      <Input placeholder={t.add.placeholders.suppCode} />
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
                      label={t.add.labels.contact}
                      rules={[{ required: true, message: t.add.rules.contact }]}
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
                        { pattern: /^\d{8}$/, message: t.add.rules.phoneDigits }
                      ]}
                    >
                      <Input 
                        placeholder={t.add.placeholders.phone}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (!/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="fax_1"
                      label={t.add.labels.fax}
                      rules={[
                        { pattern: /^\d{8}$/, message: t.add.rules.faxDigits }
                      ]}
                    >
                      <Input 
                        placeholder={t.add.placeholders.fax}
                        maxLength={8}
                        onKeyPress={(e) => {
                          if (!/[0-9]/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="email_1"
                      label={t.add.labels.email}
                      rules={[
                        { type: 'email', message: t.add.rules.email }
                      ]}
                    >
                      <Input placeholder={t.add.placeholders.email} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      name="mail_addr"
                      label={t.add.labels.mailAddr}
                      rules={[{ required: true, message: t.add.rules.mailAddr }]}
                    >
                      <Input.TextArea 
                        rows={3} 
                        placeholder={t.add.placeholders.mailAddr}
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
                      rules={[{ required: true, message: t.add.rules.pm }]}
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
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="status"
                      label={t.add.labels.status}
                      rules={[{ required: true, message: t.add.rules.status }]}
                    >
                      <Select
                        options={[
                          { value: 'Active', label: t.status.active },
                          { value: 'Closed', label: t.status.closed }
                        ]}
                        placeholder={t.add.placeholders.status}
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

const AddSupplierPage = () => (
  <Suspense
    fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    }
  >
    <AddSupplierContent />
  </Suspense>
);

export default AddSupplierPage;
