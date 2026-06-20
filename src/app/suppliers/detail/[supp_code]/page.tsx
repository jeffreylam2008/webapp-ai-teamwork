'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Form, Input, Select, Button, App, Card, Space, Alert, Spin } from 'antd';
import { ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSupplierTexts } from '../../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';

interface Supplier {
  supp_code: string;
  name: string;
  attn_1: string;
  mail_addr: string;
  phone_1: string;
  fax_1?: string;
  email_1?: string;
  pm_code: string;
  pt_code?: string;
  remark?: string;
  status: string;
  [key: string]: string | number | boolean | undefined;
}

// Function Bar Component
type SupplierPageTexts = ReturnType<typeof getSupplierTexts>;

interface FunctionBarProps {
  editMode: boolean;
  handleEdit: () => void;
  handleSave: () => void;
  handleCancelEdit: () => void;
  onBack: () => void;
  saving: boolean;
  texts: SupplierPageTexts;
  saveLabel: string;
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  handleEdit,
  handleSave,
  handleCancelEdit,
  onBack,
  saving,
  texts,
  saveLabel,
}) => {
  const d = texts.detail;
  return (
  <div className="px-8 py-4 bg-white border-b border-gray-200 mb-4">
    <Space size="middle">
      <Button 
        type="default"
        icon={<ArrowLeftOutlined />} 
        onClick={onBack}
      >
        {d.back}
      </Button>
      {!editMode && (
        <Button 
          type="primary"
          icon={<EditOutlined />} 
          onClick={handleEdit}
        >
          {d.editSupplier}
        </Button>
      )}
      {editMode && (
        <Space size="small">
          <Button 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            {saveLabel}
          </Button>
          <Button 
            icon={<CloseOutlined />}
            onClick={handleCancelEdit}
          >
            {d.cancel}
          </Button>
        </Space>
      )}
    </Space>
  </div>
  );
};

function SupplierDetailContent({ supp_code }: { supp_code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSupplierTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const goBackToSuppliers = useBackNavigation(() => router.push('/suppliers'));
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Get payment methods and terms
  const { options: paymentMethodOptions } = usePaymentMethods();
  const { options: paymentTermOptions } = usePaymentTerms();

  // Fetch supplier data
  useEffect(() => {
    const fetchSupplier = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/suppliers?search=${supp_code}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const result = await response.json();

        if (result.success && result.data.length > 0) {
          const supplierData = result.data[0];
          setSupplier(supplierData);
          form.setFieldsValue(supplierData);
        } else {
          setError(t.detail.notFound);
        }
      } catch (err) {
        setError(t.detail.fetchError);
        console.error('Error fetching supplier:', err);
      } finally {
        setLoading(false);
      }
    };

    if (supp_code) {
      fetchSupplier();
    }
  }, [supp_code, form, t.detail.fetchError, t.detail.notFound]);

  const handleSubmit = async (values: Partial<Supplier>) => {
    setSaving(true);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          supp_code: supp_code
        }),
      });

      const result = await response.json();

      if (result.success) {
        messageApi.success(t.detail.updatedRedirect);
        router.push('/suppliers');
      } else {
        messageApi.error(result.error || t.detail.updateFailed);
      }
    } catch (err) {
      console.error('Error updating supplier:', err);
      messageApi.error(t.detail.updateError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <div className="text-gray-600">{t.detail.loading}</div>
        </Space>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert
          message={t.detail.errorTitle}
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  return (
    <BasicPageLayout
      title={t.detail.titleEdit(supplier?.name || t.detail.titleLoading)}
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.detail.breadcrumbHome, href: '/' },
            { label: t.detail.breadcrumbSuppliers, href: '/suppliers' },
            { label: supplier?.name || t.detail.titleLoading, current: true }
          ]} 
        />
      }
      buttonBar={
        <FunctionBar
          editMode={editMode}
          handleEdit={() => setEditMode(true)}
          handleSave={() => form.submit()}
          handleCancelEdit={() => {
            setEditMode(false);
            if (supplier) form.setFieldsValue(supplier);
          }}
          onBack={goBackToSuppliers}
          saving={saving}
          texts={t}
          saveLabel={saveWithShortcutLabel(lang)}
        />
      }
      actionBarSaveShortcut={{
        onSave: () => form.submit(),
        disabled: saving || !editMode,
      }}
    >

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            status: 'Active'
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label={t.detail.labels.suppCode}
            >
              <Input value={supp_code} disabled />
            </Form.Item>

            <Form.Item
              name="name"
              label={t.detail.labels.name}
              rules={[{ required: true, message: t.detail.rules.name }]}
            >
              <Input disabled={!editMode} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="attn_1" label={t.detail.labels.contact}>
              <Input disabled={!editMode} />
            </Form.Item>

            <Form.Item
              name="phone_1"
              label={t.detail.labels.phone}
              rules={[
                {
                  validator: (_, value) => {
                    const v = typeof value === 'string' ? value.trim() : '';
                    if (!v) return Promise.resolve();
                    return /^\d{8}$/.test(v)
                      ? Promise.resolve()
                      : Promise.reject(new Error(t.detail.rules.phoneDigits));
                  },
                },
              ]}
            >
              <Input disabled={!editMode} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="fax_1"
              label={t.detail.labels.fax}
              rules={[
                { pattern: /^\d{8}$/, message: t.detail.rules.faxDigits }
              ]}
            >
              <Input disabled={!editMode} />
            </Form.Item>

            <Form.Item
              name="email_1"
              label={t.detail.labels.email}
              rules={[
                { type: 'email', message: t.detail.rules.email }
              ]}
            >
              <Input disabled={!editMode} />
            </Form.Item>
          </div>

          <Form.Item
            name="mail_addr"
            label={t.detail.labels.mailAddr}
          >
            <Input.TextArea rows={3} disabled={!editMode} />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="pm_code"
              label={t.detail.labels.pm}
              rules={[{ required: true, message: t.detail.rules.pm }]}
            >
              <Select options={paymentMethodOptions} disabled={!editMode} />
            </Form.Item>

            <Form.Item
              name="pt_code"
              label={t.detail.labels.pt}
            >
              <Select 
                options={paymentTermOptions}
                placeholder={t.detail.placeholders.pt}
                showSearch
                optionFilterProp="label"
                disabled={!editMode}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </div>

          <Form.Item
            name="remark"
            label={t.detail.labels.remark}
          >
            <Input.TextArea rows={3} disabled={!editMode} />
          </Form.Item>

          <Form.Item
            name="status"
            label={t.detail.labels.status}
            rules={[{ required: true, message: t.detail.rules.status }]}
          >
            <Select disabled={!editMode}>
              <Select.Option value="Active">{t.status.active}</Select.Option>
              <Select.Option value="Closed">{t.status.closed}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Card>
    </BasicPageLayout>
  );
}

export default function SupplierDetailPage({ params }: { params: Promise<{ supp_code: string }> }) {
  const { supp_code } = React.use(params);
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Spin size="large" />
        </div>
      }
    >
      <SupplierDetailContent supp_code={supp_code} />
    </Suspense>
  );
}
