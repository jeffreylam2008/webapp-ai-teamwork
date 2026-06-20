'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Form, Input, InputNumber, Select, message, Spin, Typography } from 'antd';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSystemSettingsTexts } from './i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { DEFAULT_TIMEZONE, SYSTEM_TIMEZONE_OPTIONS } from '@/lib/systemTimezone';

const { Text } = Typography;

export default function SystemSettingsPage() {
  const { token, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSystemSettingsTexts(lang), [lang]);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();

  const loadSettings = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nameRes, idleRes, qtaRes, pgRes, langRes, tzRes] = await Promise.all([
        fetch('/api/system/name', { cache: 'no-store' }),
        fetchWithAuth('/api/system/idle', token, { cache: 'no-store' }),
        fetchWithAuth('/api/system/quotation-valid-days', token, { cache: 'no-store' }),
        fetchWithAuth('/api/system/pagination', token, { cache: 'no-store' }),
        fetchWithAuth('/api/system/language', token, { cache: 'no-store' }),
        fetch('/api/system/timezone', { cache: 'no-store' }),
      ]);
      const [nameResult, idleResult, qtaResult, pgResult, langResult, tzResult] = await Promise.all([
        nameRes.json(),
        idleRes.json(),
        qtaRes.json(),
        pgRes.json(),
        langRes.json(),
        tzRes.json(),
      ]);

      if (nameResult?.success && nameResult?.data) {
        form.setFieldsValue({
          system_name: nameResult.data.system_name ?? '',
          logo: nameResult.data.logo ?? '',
          shop_logo: nameResult.data.shop_logo ?? '',
        });
      }
      if (idleResult?.success) {
        form.setFieldsValue({ idle: idleResult.data?.idle ?? 10 });
      }
      if (qtaResult?.success) {
        form.setFieldsValue({ quotation_valid_days: qtaResult.data?.quotation_valid_days ?? 30 });
      }
      if (pgResult?.success) {
        form.setFieldsValue({
          page_size_default: pgResult.data?.page_size_default ?? 100,
          page_size_max: pgResult.data?.page_size_max ?? 500,
        });
      }
      if (langResult?.success) {
        form.setFieldsValue({ language: langResult.data?.language ?? 'en' });
      }
      if (tzResult?.success) {
        form.setFieldsValue({ timezone: tzResult.data?.timezone ?? DEFAULT_TIMEZONE });
      }

      if (!idleResult?.success || !qtaResult?.success || !pgResult?.success) {
        messageApi.error(
          idleResult?.error || qtaResult?.error || pgResult?.error || t.messages.loadFailed
        );
      }
    } catch (err) {
      console.error('Failed to load idle setting', err);
      messageApi.error(t.messages.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading]);

  const onResetDefault = async () => {
    if (!token) return;
    try {
      const res = await fetchWithAuth('/api/system/defaults', token, { cache: 'no-store' });
      const result = await res.json();
      if (result?.success && result?.data) {
        const d = result.data;
        form.setFieldsValue({
          system_name: d.system_name ?? 'ERP System',
          logo: d.logo ?? '',
          shop_logo: d.shop_logo ?? '',
          idle: d.idle ?? 10,
          quotation_valid_days: d.quotation_valid_days ?? 30,
          page_size_default: d.page_size_default ?? 100,
          page_size_max: d.page_size_max ?? 500,
          language: d.language === 'zh-Hant' ? 'zh-Hant' : 'en',
          timezone: d.timezone ?? DEFAULT_TIMEZONE,
        });
        messageApi.success(t.messages.loadDefaultsSuccess);
      } else {
        messageApi.error(result?.error || t.messages.loadDefaultsFailed);
      }
    } catch (err) {
      console.error('Failed to load defaults', err);
      messageApi.error(t.messages.loadDefaultsFailed);
    }
  };

  const onSave = async (values: {
    system_name?: string;
    logo?: string;
    shop_logo?: string;
    idle: number;
    quotation_valid_days: number;
    page_size_default: number;
    page_size_max: number;
    language: 'en' | 'zh-Hant';
    timezone: string;
  }) => {
    if (!token) return;
    setSaving(true);
    try {
      const [nameRes, idleRes, qtaRes, pgRes, langRes, tzRes] = await Promise.all([
        fetchWithAuth('/api/system/name', token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_name: values.system_name ?? '',
            logo: values.logo ?? '',
            shop_logo: values.shop_logo ?? '',
          }),
        }),
        fetchWithAuth('/api/system/idle', token, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ idle: values.idle }),
        }),
        fetchWithAuth('/api/system/quotation-valid-days', token, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ quotation_valid_days: values.quotation_valid_days }),
        }),
        fetchWithAuth('/api/system/pagination', token, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ page_size_default: values.page_size_default, page_size_max: values.page_size_max }),
        }),
        fetchWithAuth('/api/system/language', token, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ language: values.language }),
        }),
        fetchWithAuth('/api/system/timezone', token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: values.timezone }),
        }),
      ]);

      const [nameResult, idleResult, qtaResult, pgResult, langResult, tzResult] = await Promise.all([
        nameRes.json(),
        idleRes.json(),
        qtaRes.json(),
        pgRes.json(),
        langRes.json(),
        tzRes.json(),
      ]);

      const errors: string[] = [];
      if (!nameResult?.success) errors.push(nameResult?.error || t.errors.systemNameSaveFailed);
      if (!idleResult?.success) errors.push(idleResult?.error || t.errors.idleSaveFailed);
      if (!qtaResult?.success) errors.push(qtaResult?.error || t.errors.quotationValiditySaveFailed);
      if (!pgResult?.success) errors.push(pgResult?.error || t.errors.paginationSaveFailed);
      if (!langResult?.success) errors.push(langResult?.error || t.errors.languageSaveFailed);
      if (!tzResult?.success) errors.push(tzResult?.error || t.errors.timezoneSaveFailed);

      if (errors.length === 0) {
        messageApi.success(t.messages.saved);
        form.setFieldsValue({
          system_name: nameResult?.data?.system_name ?? values.system_name,
          logo: nameResult?.data?.logo ?? values.logo,
          shop_logo: nameResult?.data?.shop_logo ?? values.shop_logo,
          idle: idleResult.data?.idle ?? values.idle,
          quotation_valid_days: qtaResult.data?.quotation_valid_days ?? values.quotation_valid_days,
          page_size_default: pgResult.data?.page_size_default ?? values.page_size_default,
          page_size_max: pgResult.data?.page_size_max ?? values.page_size_max,
          language: langResult.data?.language ?? values.language,
          timezone: tzResult.data?.timezone ?? values.timezone,
        });

        // Update client cache so all pages pick it up quickly
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(
            '__system_pagination',
            JSON.stringify({
              page_size_default: pgResult.data?.page_size_default ?? values.page_size_default,
              page_size_max: pgResult.data?.page_size_max ?? values.page_size_max,
              ts: Date.now(),
            })
          );
          const nextTz = tzResult.data?.timezone ?? values.timezone;
          sessionStorage.setItem(
            '__system_timezone',
            JSON.stringify({ timezone: nextTz, ts: Date.now() })
          );
          window.dispatchEvent(
            new CustomEvent('app-language-changed', {
              detail: langResult.data?.language ?? values.language,
            })
          );
          window.dispatchEvent(
            new CustomEvent('app-timezone-changed', { detail: nextTz })
          );
          window.dispatchEvent(
            new CustomEvent('app-idle-changed', {
              detail: idleResult.data?.idle ?? values.idle,
            })
          );
        }
      } else {
        messageApi.error(errors.join(' | '));
      }
    } catch (err) {
      console.error('Failed to save idle setting', err);
      messageApi.error(t.messages.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, href: '/' },
            { label: t.breadcrumb.manage, href: '/administration' },
            { label: t.breadcrumb.system, current: true },
          ]}
        />
      }
      title={t.page.title}
      description={t.page.description}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2">
          <Button type="primary" onClick={() => form.submit()} loading={saving} disabled={loading}>
            {saveWithShortcutLabel(lang)}
          </Button>
          <Button danger onClick={onResetDefault} disabled={saving || loading}>
            {t.page.resetDefault}
          </Button>
        </div>
      }
      actionBarSaveShortcut={{ onSave: () => form.submit(), disabled: saving || loading }}
    >
      <div className="px-8 py-6 bg-white">
        {messageContextHolder}
        <Card title={t.cards.title} size="small">
          <Form
            form={form}
            layout="vertical"
            onFinish={onSave}
            disabled={loading}
            initialValues={{
              system_name: 'ERP System',
              logo: '',
              shop_logo: '',
              idle: 10,
              quotation_valid_days: 30,
              page_size_default: 100,
              page_size_max: 500,
              language: 'en',
              timezone: DEFAULT_TIMEZONE,
            }}
          >
            <div className="relative">
              {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                  <Spin />
                </div>
              ) : null}
              <div className="space-y-4">
                {/* System name */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.systemName.title}</div>
                    <Text type="secondary">
                      {t.sections.systemName.hint}
                    </Text>
                  </div>
                  <div className="md:w-80 flex-1">
                    <Form.Item name="system_name" style={{ marginBottom: 0 }}>
                      <Input placeholder={t.sections.systemName.placeholder} maxLength={255} showCount />
                    </Form.Item>
                  </div>
                </div>

                {/* Logo */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.logo.title}</div>
                    <Text type="secondary">
                      {t.sections.logo.hint}
                    </Text>
                  </div>
                  <div className="md:w-80 flex-1">
                    <Form.Item name="logo" style={{ marginBottom: 0 }}>
                      <Input placeholder={t.sections.logo.placeholder} maxLength={512} />
                    </Form.Item>
                  </div>
                </div>

                {/* Shop logo */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.shopLogo.title}</div>
                    <Text type="secondary">{t.sections.shopLogo.hint}</Text>
                  </div>
                  <div className="md:w-80 flex-1">
                    <Form.Item name="shop_logo" style={{ marginBottom: 0 }}>
                      <Input placeholder={t.sections.shopLogo.placeholder} maxLength={512} />
                    </Form.Item>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Language */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.language.title}</div>
                    <Text type="secondary">
                      {t.sections.language.hint}
                    </Text>
                  </div>
                  <div className="md:w-60">
                    <Form.Item name="language" style={{ marginBottom: 0 }}>
                      <Select
                        options={[
                          { value: 'en', label: t.sections.language.options.en },
                          { value: 'zh-Hant', label: t.sections.language.options.zhHant },
                        ]}
                      />
                    </Form.Item>
                  </div>
                  <div className="flex-1">
                    <Text type="secondary">
                      {t.sections.language.rolloutHint}
                    </Text>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Timezone */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.timezone.title}</div>
                    <Text type="secondary">{t.sections.timezone.hint}</Text>
                  </div>
                  <div className="md:w-80">
                    <Form.Item name="timezone" style={{ marginBottom: 0 }}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={SYSTEM_TIMEZONE_OPTIONS}
                      />
                    </Form.Item>
                  </div>
                  <div className="flex-1">
                    <Text type="secondary">{t.sections.timezone.rolloutHint}</Text>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Idle timeout */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.idle.title}</div>
                    <Text type="secondary">
                      {t.sections.idle.hint}
                    </Text>
                  </div>
                  <div className="md:w-60">
                    <Form.Item
                      name="idle"
                      rules={[
                        { required: true, message: t.sections.idle.required },
                        {
                          validator: async (_, value) => {
                            const num = typeof value === 'number' ? value : parseInt(String(value), 10);
                            if (!Number.isFinite(num)) throw new Error(t.sections.idle.invalidNumber);
                            if (num < 1 || num > 1440) throw new Error(t.sections.idle.range);
                          },
                        },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={1} max={1440} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <div className="flex-1">
                    <Text type="secondary">
                      {t.sections.idle.hint2}
                    </Text>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Quotation defaults */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.quotationValidity.title}</div>
                    <Text type="secondary">
                      {t.sections.quotationValidity.hint}
                    </Text>
                  </div>
                  <div className="md:w-60">
                    <Form.Item
                      name="quotation_valid_days"
                      rules={[
                        { required: true, message: t.sections.quotationValidity.required },
                        {
                          validator: async (_, value) => {
                            const num = typeof value === 'number' ? value : parseInt(String(value), 10);
                            if (!Number.isFinite(num)) throw new Error(t.sections.quotationValidity.invalidNumber);
                            if (num < 1 || num > 3650) throw new Error(t.sections.quotationValidity.range);
                          },
                        },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={1} max={3650} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <div className="flex-1">
                    <Text type="secondary">
                      {t.sections.quotationValidity.hint2}
                    </Text>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100" />

                {/* Pagination defaults */}
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-6">
                  <div className="md:w-80">
                    <div className="font-semibold text-gray-900">{t.sections.pagination.title}</div>
                    <Text type="secondary">
                      {t.sections.pagination.hint}
                    </Text>
                  </div>
                  <div className="md:w-60">
                    <div className="flex gap-2">
                      <Form.Item
                        name="page_size_default"
                        rules={[
                          { required: true, message: t.sections.pagination.required },
                          {
                            validator: async (_, value) => {
                              const num = typeof value === 'number' ? value : parseInt(String(value), 10);
                              if (!Number.isFinite(num)) throw new Error(t.sections.pagination.invalidNumber);
                              if (num < 1 || num > 500) throw new Error(t.sections.pagination.defaultRange);
                            },
                          },
                        ]}
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <InputNumber
                          min={1}
                          max={500}
                          style={{ width: '100%' }}
                          placeholder={t.sections.pagination.placeholderDefault}
                        />
                      </Form.Item>
                      <Form.Item
                        name="page_size_max"
                        rules={[
                          { required: true, message: t.sections.pagination.required },
                          {
                            validator: async (_, value) => {
                              const num = typeof value === 'number' ? value : parseInt(String(value), 10);
                              if (!Number.isFinite(num)) throw new Error(t.sections.pagination.invalidNumber);
                              if (num < 1 || num > 500) throw new Error(t.sections.pagination.maxRange);
                            },
                          },
                        ]}
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <InputNumber
                          min={1}
                          max={500}
                          style={{ width: '100%' }}
                          placeholder={t.sections.pagination.placeholderMax}
                        />
                      </Form.Item>
                    </div>
                  </div>
                  <div className="flex-1">
                    <Text type="secondary">
                      {t.sections.pagination.hint2}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </Form>
        </Card>
      </div>
    </BasicPageLayout>
  );
}

