'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Spin, Table } from 'antd';
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

function EditRolePageContent() {
  const params = useParams();
  const roleCodeParam = params?.role_code as string;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [protectedRole, setProtectedRole] = useState(false);
  const [roleName, setRoleName] = useState('');
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
    if (!token || !roleCodeParam || !isAdministrator) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(
          `/api/administration/roles/${encodeURIComponent(roleCodeParam)}`,
          token,
          { cache: 'no-store', signal: controller.signal }
        );
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (!json.success || !json.data) {
          messageApi.error(json.error || t.failedLoadRole);
          setLoading(false);
          return;
        }
        const data = json.data as {
          role_code: number;
          role_key: string;
          role_name: string;
          description: string | null;
          status: number;
          sort_order: number;
          permissions: string[];
          protected: boolean;
        };
        setProtectedRole(!!data.protected);
        setRoleName(data.role_name);
        identityForm.setFieldsValue({
          role_key: data.role_key,
          role_name: data.role_name,
          description: data.description ?? '',
          status: data.status,
          sort_order: data.sort_order,
        });
        const initial: Record<string, boolean> = {};
        TRANSACTION_PERMISSIONS.forEach((p) => {
          initial[p.key] = (data.permissions || []).includes(p.key);
        });
        accessForm.setFieldsValue(initial);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        messageApi.error(t.failedLoadRole);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [
    token,
    roleCodeParam,
    isAdministrator,
    identityForm,
    accessForm,
    messageApi,
    t.failedLoadRole,
  ]);

  const handleSave = async () => {
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
    const name = (values.role_name ?? '').trim();
    if (!roleKey || !name) {
      messageApi.error(t.requiredFields);
      return;
    }
    const permValues = accessForm.getFieldsValue(true) as Record<string, boolean>;
    const permissions = TRANSACTION_PERMISSIONS.filter((p) => permValues[p.key]).map((p) => p.key);

    setSaving(true);
    try {
      const res = await fetchWithAuth(
        `/api/administration/roles/${encodeURIComponent(roleCodeParam)}`,
        token,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role_key: roleKey,
            role_name: name,
            description: values.description ?? '',
            status: values.status != null ? Number(values.status) : 1,
            sort_order: values.sort_order != null ? Number(values.sort_order) : undefined,
            permissions,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        messageApi.error(json.error || t.failedUpdate);
        return;
      }
      messageApi.success(t.updated);
      setRoleName(name);
    } catch {
      messageApi.error(t.failedUpdate);
    } finally {
      setSaving(false);
    }
  };

  if (permissionsLoading || !isAdministrator) {
    return (
      <BasicPageLayout breadcrumb={null} title={t.title}>
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
            { label: roleName || roleCodeParam, current: true },
          ]}
        />
      }
      title={roleName ? t.editTitle(roleName) : t.title}
      description={t.editDescription}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2 flex-wrap">
          <Button icon={<ArrowLeftOutlined />} onClick={goBack}>
            {t.backToList}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={loading}
            onClick={handleSave}
          >
            {t.saveEdit}
          </Button>
          <Button
            disabled={loading}
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
      <Spin spinning={loading}>
        <div className="px-8 py-6 bg-white space-y-6">
          {protectedRole ? (
            <Alert type="info" showIcon className="max-w-3xl" message={t.protectedHint} />
          ) : null}
          <Card title={t.cardIdentity} size="small" className="max-w-3xl">
            <p className="text-neutral-500 text-sm mb-3">{t.cardIdentityHint}</p>
            <Form form={identityForm} layout="vertical" className="max-w-md">
              <Form.Item
                name="role_key"
                label={t.labelRoleKey}
                extra={t.roleKeyHint}
                rules={[{ required: true, message: t.requiredFields }]}
              >
                <Input placeholder={t.phRoleKey} disabled={protectedRole} autoComplete="off" />
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
                  disabled={protectedRole}
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
      </Spin>
    </BasicPageLayout>
  );
}

export default function EditRolePage() {
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
      <EditRolePageContent />
    </Suspense>
  );
}
