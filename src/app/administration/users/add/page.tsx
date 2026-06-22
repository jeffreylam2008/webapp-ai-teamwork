'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Spin } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface FormOptions {
  roles: Array<{ role_code: number; name: string }>;
  shops: Array<{ shop_code: string; name: string }>;
  currentShop: string | null;
}

interface CreateUserFormValues {
  employee_code: string;
  username: string;
  password: string;
  confirm_password: string;
  default_shopcode: string;
  role_code: number;
  status: number;
}

function AddUserPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const hub = useMemo(() => getHubPagesTexts(lang).administrationHub, [lang]);
  const a = useMemo(() => getAdminPagesTexts(lang).usersList, [lang]);
  const ua = useMemo(() => getAdminPagesTexts(lang).userAdd, [lang]);
  const { token } = useAuth();
  const [form] = Form.useForm<CreateUserFormValues>();
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const goBackToUsers = useBackNavigation(() => router.push('/administration/users'));

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    (async () => {
      setOptionsLoading(true);
      try {
        const res = await fetchWithAuth('/api/administration/users/form-options', token, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (!json.success || !json.data) {
          setPageMessage({ type: 'error', text: ua.failedLoadOptions });
          return;
        }
        const data = json.data as FormOptions;
        setOptions(data);
        form.setFieldsValue({
          default_shopcode: data.currentShop || data.shops[0]?.shop_code,
          role_code: data.roles[0]?.role_code,
          status: 1,
        });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setPageMessage({ type: 'error', text: ua.failedLoadOptions });
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [token, form, ua.failedLoadOptions]);

  useEffect(() => {
    if (!pageMessage) return;
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = setTimeout(() => setPageMessage(null), 10000);
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, [pageMessage]);

  const shopOptions = useMemo(
    () =>
      (options?.shops ?? []).map((s) => ({
        value: s.shop_code,
        label: `${s.shop_code} — ${s.name}`,
      })),
    [options]
  );

  const roleOptions = useMemo(
    () =>
      (options?.roles ?? []).map((r) => ({
        value: r.role_code,
        label: r.name,
      })),
    [options]
  );

  const lockedShop = options?.currentShop?.trim() || null;

  const handleSubmit = async (values: CreateUserFormValues) => {
    if (!token) return;
    setLoading(true);
    setPageMessage(null);
    try {
      const res = await fetchWithAuth('/api/administration/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: String(values.employee_code).trim(),
          username: values.username.trim(),
          password: values.password,
          default_shopcode: values.default_shopcode,
          role_code: values.role_code,
          status: values.status,
        }),
      });
      const result = await res.json();
      if (result.success) {
        const employeeCode = result.data?.employee_code;
        if (employeeCode != null) {
          router.push(
            `/administration/users/detail/${encodeURIComponent(String(employeeCode))}?message=${encodeURIComponent(result.message || ua.created)}&type=success`
          );
        } else {
          router.push(
            `/administration/users?message=${encodeURIComponent(result.message || ua.created)}&type=success`
          );
        }
      } else {
        setPageMessage({ type: 'error', text: result.error || ua.failedCreate });
      }
    } catch {
      setPageMessage({ type: 'error', text: ua.failedCreate });
    } finally {
      setLoading(false);
    }
  };

  const buttonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button icon={<ArrowLeftOutlined />} onClick={goBackToUsers}>
        {ua.backToUsers}
      </Button>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={loading}
        disabled={optionsLoading || !options}
        onClick={() => form.submit()}
      >
        {saveWithShortcutLabel(lang)}
      </Button>
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
                { label: hub.usersTitle, href: '/administration/users' },
                { label: hub.settingsTitle, href: '/administration/settings' },
                { label: hub.importTitle, href: '/administration/master-data' },
              ],
            },
            { label: a.breadcrumbUsers, href: '/administration/users' },
            { label: ua.title, current: true },
          ]}
        />
      }
      title={ua.title}
      description={ua.description}
      buttonBar={buttonBar}
    >
      <div className="px-8 py-6 bg-white">
        {pageMessage && (
          <Alert
            className="mb-4"
            type={pageMessage.type}
            showIcon
            message={pageMessage.text}
            closable
            onClose={() => setPageMessage(null)}
          />
        )}
        <Spin spinning={optionsLoading}>
          <Card title={ua.cardUserInfo} size="small">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              disabled={optionsLoading || !options}
              initialValues={{ status: 1 }}
            >
              <Row gutter={24}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelEmployeeCode}
                    name="employee_code"
                    rules={[
                      { required: true, message: ua.ruleEmployeeCode },
                      { pattern: /^\d+$/, message: ua.ruleEmployeeCode },
                    ]}
                  >
                    <Input placeholder={ua.phEmployeeCode} inputMode="numeric" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelUsername}
                    name="username"
                    rules={[{ required: true, message: ua.ruleUsername }]}
                  >
                    <Input placeholder={ua.phUsername} autoComplete="off" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelPassword}
                    name="password"
                    rules={[
                      { required: true, message: ua.rulePassword },
                      { min: 6, message: ua.rulePasswordMin },
                    ]}
                  >
                    <Input.Password placeholder={ua.phPassword} autoComplete="new-password" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelConfirmPassword}
                    name="confirm_password"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: ua.ruleConfirmPassword },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error(ua.validatorPasswordMatch));
                        },
                      }),
                    ]}
                  >
                    <Input.Password placeholder={ua.phConfirmPassword} autoComplete="new-password" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelDefaultShop}
                    name="default_shopcode"
                    rules={[{ required: true, message: ua.ruleDefaultShop }]}
                  >
                    <Select
                      placeholder={ua.phDefaultShop}
                      options={shopOptions}
                      disabled={!!lockedShop}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label={ua.labelRole}
                    name="role_code"
                    rules={[{ required: true, message: ua.ruleRole }]}
                  >
                    <Select placeholder={ua.phRole} options={roleOptions} showSearch optionFilterProp="label" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label={ua.labelStatus} name="status">
                    <Select
                      options={[
                        { value: 1, label: ua.statusActive },
                        { value: 0, label: ua.statusInactive },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
        </Spin>
      </div>
    </BasicPageLayout>
  );
}

export default function AddUserPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      }
    >
      <AddUserPageContent />
    </Suspense>
  );
}
