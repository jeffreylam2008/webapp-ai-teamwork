'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Modal, Spin, Table, Tag } from 'antd';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface RoleRow {
  role_code: number;
  role_key: string;
  role_name: string;
  description: string | null;
  status: number;
  sort_order: number;
  employee_count?: number;
  protected?: boolean;
}

export default function RoleTemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const hub = useMemo(() => getHubPagesTexts(lang).administrationHub, [lang]);
  const t = useMemo(() => getAdminPagesTexts(lang).roleTemplates, [lang]);
  const { token } = useAuth();
  const { isAdministrator, loading: permissionsLoading } = usePermissions();
  const { message: messageApi } = App.useApp();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCode, setDeletingCode] = useState<number | null>(null);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isAdministrator) {
      messageApi.error(t.adminRequired);
      router.replace('/administration');
    }
  }, [permissionsLoading, isAdministrator, messageApi, t.adminRequired, router]);

  const fetchRoles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/administration/roles?include_inactive=1', token, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.status === 403) {
        messageApi.error(t.adminRequired);
        router.replace('/administration');
        return;
      }
      if (json.success && Array.isArray(json.data)) {
        setRoles(json.data as RoleRow[]);
      } else {
        messageApi.error(json.error || t.failedLoad);
      }
    } catch {
      messageApi.error(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }, [token, messageApi, t.adminRequired, t.failedLoad, router]);

  useEffect(() => {
    if (!isAdministrator || permissionsLoading) return;
    void fetchRoles();
  }, [isAdministrator, permissionsLoading, fetchRoles]);

  const handleDelete = (role: RoleRow) => {
    if (role.protected) {
      messageApi.error(t.cannotDeleteProtected);
      return;
    }
    Modal.confirm({
      title: t.deleteTitle,
      content: t.deleteConfirm(role.role_name),
      okText: t.deleteOk,
      cancelText: t.deleteCancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!token) return;
        setDeletingCode(role.role_code);
        try {
          const res = await fetchWithAuth(
            `/api/administration/roles/${encodeURIComponent(String(role.role_code))}`,
            token,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (json.success) {
            messageApi.success(t.deleted);
            await fetchRoles();
          } else {
            messageApi.error(json.error || t.failedDelete);
          }
        } catch {
          messageApi.error(t.failedDelete);
        } finally {
          setDeletingCode(null);
        }
      },
    });
  };

  const columns = useMemo(
    () => [
      {
        title: t.colActions,
        key: 'actions',
        width: 100,
        render: (_: unknown, record: RoleRow) => (
          <div className="flex gap-2">
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600"
              title={t.actionEdit}
              onClick={() =>
                router.push(
                  `/administration/roles/detail/${encodeURIComponent(String(record.role_code))}`
                )
              }
            >
              <EditOutlined />
            </button>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 disabled:opacity-40"
              title={t.actionDelete}
              disabled={
                !!record.protected ||
                (record.employee_count ?? 0) > 0 ||
                deletingCode === record.role_code
              }
              onClick={() => handleDelete(record)}
            >
              <DeleteOutlined />
            </button>
          </div>
        ),
      },
      {
        title: t.colRoleCode,
        dataIndex: 'role_code',
        key: 'role_code',
        width: 80,
      },
      {
        title: t.colRoleKey,
        dataIndex: 'role_key',
        key: 'role_key',
        width: 160,
      },
      {
        title: t.colRoleName,
        dataIndex: 'role_name',
        key: 'role_name',
        width: 180,
        render: (name: string, record: RoleRow) => (
          <span>
            {name}
            {record.protected ? (
              <Tag color="blue" className="ml-2">
                Admin
              </Tag>
            ) : null}
          </span>
        ),
      },
      {
        title: t.colDescription,
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: t.colStatus,
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (s: number) =>
          s === 1 ? (
            <Tag color="green">{t.statusActive}</Tag>
          ) : (
            <Tag color="red">{t.statusInactive}</Tag>
          ),
      },
      {
        title: t.colEmployees,
        dataIndex: 'employee_count',
        key: 'employee_count',
        width: 100,
        render: (n: number | undefined) => n ?? 0,
      },
    ],
    // handleDelete uses stable messageApi/token; omit to avoid column churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, router, deletingCode]
  );

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
                { label: hub.importTitle, href: '/administration/master-data' },
              ],
            },
            { label: t.breadcrumb, current: true },
          ]}
        />
      }
      title={roles.length > 0 ? t.titleWithCount(roles.length) : t.title}
      description={t.description}
      buttonBar={
        <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/administration/roles/new')}
          >
            {t.add}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchRoles} loading={loading}>
            {t.refresh}
          </Button>
        </div>
      }
    >
      <Spin spinning={loading}>
        <div className="px-8 py-6 bg-white">
          <p className="text-neutral-500 text-sm mb-3">{t.protectedHint}</p>
          <Table
            rowKey="role_code"
            columns={columns}
            dataSource={roles}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 900 }}
          />
        </div>
      </Spin>
    </BasicPageLayout>
  );
}
