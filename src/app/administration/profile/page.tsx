'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { UserOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons';
import { Card, Form, Input, Select, Button, message, Spin } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface ProfileData {
  uid: number;
  employee_code: string | number;
  username: string;
  default_shopcode: string;
  shops: Array<{ shop_code: string; name: string; is_warehouse?: number | boolean }>;
}

export default function AdministrationProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const hub = getHubPagesTexts(lang).administrationHub;
  const p = getAdminPagesTexts(lang).profile;
  const { token, isAuthenticated, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      router.replace('/login');
      return;
    }
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    fetchWithAuth('/api/profile/me', token, { cache: 'no-store' })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setProfile(result.data);
          form.setFieldsValue({
            employee_code: result.data.employee_code != null ? String(result.data.employee_code) : '',
            username: result.data.username,
            default_shopcode: result.data.default_shopcode || undefined,
          });
        } else {
          message.error(result.error || p.failedLoad);
        }
      })
      .catch(() => {
        if (!cancelled) message.error(p.failedLoad);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading, token, form, router]);

  const onFinish = async (values: Record<string, string>) => {
    if (!token) return;
    const { default_shopcode, current_password, new_password, confirm_password } = values;
    if (new_password && new_password !== confirm_password) {
      message.error(p.passwordMismatch);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        default_shopcode: default_shopcode || '',
      };
      if (new_password && new_password.trim()) {
        body.current_password = current_password || '';
        body.new_password = new_password.trim();
      }
      const res = await fetchWithAuth('/api/profile/me', token, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        message.success(p.saved);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                default_shopcode: body.default_shopcode ?? prev.default_shopcode,
              }
            : null
        );
        form.setFieldsValue({ current_password: '', new_password: '', confirm_password: '' });
      } else {
        message.error(result.error || p.saveFailed);
      }
    } catch {
      message.error(p.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (!isAuthenticated && !profile)) {
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
                  { label: hub.systemTitle, href: '/administration/settings/system' },
                  { label: hub.profileTitle, href: '/administration/profile' },
                ],
              },
              { label: p.breadcrumbProfile, current: true },
            ]}
          />
        }
        title={p.titleLoading}
      >
        <div className="flex justify-center items-center py-20">
          <Spin size="large" />
        </div>
      </BasicPageLayout>
    );
  }

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
                { label: hub.systemTitle, href: '/administration/settings/system' },
                { label: hub.profileTitle, href: '/administration/profile' },
              ],
            },
            { label: p.breadcrumbProfile, current: true },
          ]}
        />
      }
      title={p.title}
      description={p.description}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => form.submit()}
            disabled={loading}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
        </div>
      }
      actionBarSaveShortcut={{ onSave: () => form.submit(), disabled: saving || loading }}
    >
      <div className="px-8 py-6 bg-white max-w-2xl">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spin size="large" />
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Card title={p.cardProfile} size="small" className="mb-6">
              <Form.Item label={p.labelEmployeeId} name="employee_code">
                <Input prefix={<UserOutlined />} disabled />
              </Form.Item>
              <Form.Item label={p.labelUsername} name="username">
                <Input prefix={<UserOutlined />} disabled />
              </Form.Item>
              <Form.Item label={p.labelDefaultShop} name="default_shopcode">
                <Select
                  placeholder={p.labelPlaceholderShop}
                  allowClear
                  options={
                    profile?.shops?.map((s) => ({ value: s.shop_code, label: `${s.shop_code} - ${s.name}` })) ?? []
                  }
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Card>
            <Card title={p.cardChangePassword} size="small" className="mb-6">
              <Form.Item label={p.currentPassword} name="current_password">
                <Input.Password prefix={<LockOutlined />} placeholder={p.placeholderLeaveBlank} />
              </Form.Item>
              <Form.Item label={p.newPassword} name="new_password">
                <Input.Password prefix={<LockOutlined />} placeholder={p.placeholderLeaveBlank} />
              </Form.Item>
              <Form.Item
                label={p.confirmPassword}
                name="confirm_password"
                dependencies={['new_password']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const newP = getFieldValue('new_password');
                      if (!newP) return Promise.resolve();
                      if (value && value !== newP) return Promise.reject(new Error(p.validatorPasswordMatch));
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder={p.placeholderConfirm} />
              </Form.Item>
            </Card>
          </Form>
        )}
      </div>
    </BasicPageLayout>
  );
}

