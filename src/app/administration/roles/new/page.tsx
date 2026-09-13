'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Form, Input, InputNumber, Select, Spin, Table } from 'antd';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import {
  FUNCTION_PERMISSION_ROWS,
  TRANSACTION_PERMISSIONS,
  isViewOnlyPermissionRow,
} from '@/config/transactionPermissions';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

function NewRolePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const hub = useMemo(() => getHubPagesTexts(lang).administrationHub, [lang]);
  const t = useMemo(() => getAdminPagesTexts(lang).roleTemplates, [lang]);
  const ud = useMemo(() => getAdminPagesTexts(lang).userDetail, [lang]);
  const { token } = useAuth();
  const { isAdministrator, loading: permissionsLoading } = usePermissions();
  const { message: messageApi } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [identityForm] = Form.useForm();
  const [accessForm] = Form.useForm();
  const goBack = useBackNavigation(() => router.push('/administration/roles'));

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isAdministrator) {
      messageApi.error(t.adminRequired);
      router.replace('/administration/roles');
    }
  }, [permissionsLoading, isAdministrator, messageApi, t.adminRequired, router]);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    TRANSACTION_PERMISSIONS.forEach((p) => {
      initial[p.key] = false;
    });
    accessForm.setFieldsValue(initial);
    identityForm.setFieldsValue({ status: 1, sort_order: 10 });
  }, [accessForm, identityForm]);

  const handleCreate = async () => {
    if (!token || !isAdministrator) {
      messageApi.error(t.adminRequired);
      return;
    }
    try {
      await identityForm.validateFields();
    } catch {
      return;
    }
    const values = identityForm.getFieldsValue(true) as {
      role_key?: string;
      role_name?: string;
      description?: string;
      status?: number;
      sort_order?: number;
    };
    const roleKey = (values.role_key ?? '').trim();
    const roleName = (values.role_name ?? '').trim();
    if (!roleKey || !roleName) {
      messageApi.error(t.requiredFields);
      return;
    }
    const permValues = accessForm.getFieldsValue(true) as Record<string, boolean>;
    const permissions = TRANSACTION_PERMISSIONS.filter((p) => permValues[p.key]).map((p) => p.key);

    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/administration/roles', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: roleKey,
          role_name: roleName,
          description: values.description ?? '',
          status: values.status != null ? Number(values.status) : 1,
          sort_order: values.sort_order != null ? Number(values.sort_order) : undefined,
          permissions,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        messageApi.error(json.error || t.failedCreate);
        return;
      }
      messageApi.success(t.created);
      const code = json.data?.role?.role_code;
      router.push(
        code != null
          ? `/administration/roles/detail/${encodeURIComponent(String(code))}`
          : '/administration/roles'
      );
    } catch {
      messageApi.error(t.failedCreate);
    } finally {
      setSaving(false);
    }
  };

  if (permissionsLoading || !isAdministrator) {
    return (
      <BasicPageLayout breadcrumb={null} title={t.createTitle}>
        <div className="flex justify-center py-12">
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
                { label: hub.rolesTitle, href: '/administration/roles' },
                { label: hub.settingsTitle, href: '/administration/settings' },
              ],
            },
            { label: bc.roles, href: '/administration/roles' },
            { label: t.add, current: true },
          ]}
        />
      }
      title={t.createTitle}
      description={t.createDescription}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2 flex-wrap">
          <Button icon={<ArrowLeftOutlined />} onClick={goBack}>
            {t.backToList}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleCreate}>
            {t.saveCreate}
          </Button>
          <Button
            onClick={() => {
              const full: Record<string, boolean> = {};
              FUNCTION_PERMISSION_ROWS.forEach((r) => {
                if (isViewOnlyPermissionRow(r)) {
                  full[r.view] = true;
                  full[r.create] = false;
                  full[r.edit] = false;
                  full[r.delete] = false;
                } else {
                  full[r.create] = true;
                  full[r.view] = true;
                  full[r.edit] = true;
                  full[r.delete] = true;
                }
              });
              accessForm.setFieldsValue(full);
            }}
          >
            {ud.grantFull}
          </Button>
        </div>
      }
    >
      <div className="px-8 py-6 bg-white space-y-6">
        <Card title={t.cardIdentity} size="small" className="max-w-3xl">
          <p className="text-neutral-500 text-sm mb-3">{t.cardIdentityHint}</p>
          <Form form={identityForm} layout="vertical" className="max-w-md">
            <Form.Item
              name="role_key"
              label={t.labelRoleKey}
              extra={t.roleKeyHint}
              rules={[{ required: true, message: t.requiredFields }]}
            >
              <Input placeholder={t.phRoleKey} autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="role_name"
              label={t.labelRoleName}
              rules={[{ required: true, message: t.requiredFields }]}
            >
              <Input placeholder={t.phRoleName} autoComplete="off" />
            </Form.Item>
            <Form.Item name="description" label={t.labelDescription}>
              <Input.TextArea rows={2} placeholder={t.phDescription} />
            </Form.Item>
            <Form.Item name="status" label={t.labelStatus}>
              <Select
                options={[
                  { value: 1, label: t.statusActive },
                  { value: 0, label: t.statusInactive },
                ]}
              />
            </Form.Item>
            <Form.Item name="sort_order" label={t.labelSortOrder}>
              <InputNumber className="w-full" min={0} />
            </Form.Item>
          </Form>
        </Card>

        <Card title={t.cardAccess} size="small" className="max-w-3xl">
          <p className="text-neutral-500 text-sm mb-3">{t.cardAccessHint}</p>
          <Form form={accessForm} layout="vertical">
            <Table
              dataSource={[...FUNCTION_PERMISSION_ROWS]}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: ud.colFunction,
                  dataIndex: 'label',
                  key: 'label',
                  width: 220,
                },
                {
                  title: ud.colView,
                  key: 'view',
                  width: 80,
                  align: 'center' as const,
                  render: (_: unknown, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) => (
                    <Form.Item name={row.view} valuePropName="checked" noStyle>
                      <Checkbox />
                    </Form.Item>
                  ),
                },
                {
                  title: ud.colCreate,
                  key: 'create',
                  width: 80,
                  align: 'center' as const,
                  render: (_: unknown, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) =>
                    isViewOnlyPermissionRow(row) ? (
                      <span className="text-neutral-400">—</span>
                    ) : (
                      <Form.Item name={row.create} valuePropName="checked" noStyle>
                        <Checkbox />
                      </Form.Item>
                    ),
                },
                {
                  title: ud.colEdit,
                  key: 'edit',
                  width: 80,
                  align: 'center' as const,
                  render: (_: unknown, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) =>
                    isViewOnlyPermissionRow(row) ? (
                      <span className="text-neutral-400">—</span>
                    ) : (
                      <Form.Item name={row.edit} valuePropName="checked" noStyle>
                        <Checkbox />
                      </Form.Item>
                    ),
                },
                {
                  title: ud.colDelete,
                  key: 'delete',
                  width: 100,
                  align: 'center' as const,
                  render: (_: unknown, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) =>
                    isViewOnlyPermissionRow(row) ? (
                      <span className="text-neutral-400">—</span>
                    ) : (
                      <Form.Item name={row.delete} valuePropName="checked" noStyle>
                        <Checkbox />
                      </Form.Item>
                    ),
                },
              ]}
            />
          </Form>
        </Card>
      </div>
    </BasicPageLayout>
  );
}

export default function NewRolePage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} title="">
          <div className="flex justify-center py-12">
            <Spin size="large" />
          </div>
        </BasicPageLayout>
      }
    >
      <NewRolePageContent />
    </Suspense>
  );
}
