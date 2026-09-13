'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { App, Table, Button, Tag, Spin } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface AdminUser {
  uid: number;
  employee_code: string;
  username: string;
  default_shopcode: string;
  role_code: number;
  role_key?: string | null;
  role_name?: string | null;
  status: number;
}

export default function AdministrationUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const hub = getHubPagesTexts(lang).administrationHub;
  const a = getAdminPagesTexts(lang).usersList;
  const { token, user: currentUser } = useAuth();
  const { isAdministrator, loading: permissionsLoading } = usePermissions();
  const { message: messageApi, modal } = App.useApp();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<string | null>(null);

  const currentEmployeeCode =
    currentUser?.employee_code != null ? String(currentUser.employee_code).trim() : '';

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/administration/users', token, { cache: 'no-store' });
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        setUsers(result.data);
      } else {
        if (res.status === 403) {
          messageApi.error(a.supervisorRequired);
          router.push('/');
          return;
        }
        messageApi.error(result.error || a.failedLoad);
      }
    } catch {
      messageApi.error(a.failedLoad);
    } finally {
      setLoading(false);
    }
  }, [token, a.supervisorRequired, a.failedLoad, router, messageApi]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDelete = useCallback(
    (record: AdminUser) => {
      if (!isAdministrator) return;
      const code = String(record.employee_code);
      if (currentEmployeeCode && code === currentEmployeeCode) {
        messageApi.error(a.cannotDeleteSelf);
        return;
      }
      modal.confirm({
        title: a.deleteTitle,
        content: a.deleteConfirm(record.username, code),
        okText: a.deleteOk,
        cancelText: a.deleteCancel,
        okButtonProps: { danger: true },
        onOk: async () => {
          if (!token) return;
          setDeletingCode(code);
          try {
            const res = await fetchWithAuth(
              `/api/administration/users/${encodeURIComponent(code)}`,
              token,
              { method: 'DELETE' }
            );
            const json = await res.json();
            if (json.success) {
              messageApi.success(a.deleted);
              await fetchUsers();
            } else {
              messageApi.error(json.error || a.failedDelete);
            }
          } catch {
            messageApi.error(a.failedDelete);
          } finally {
            setDeletingCode(null);
          }
        },
      });
    },
    [
      isAdministrator,
      currentEmployeeCode,
      messageApi,
      modal,
      a,
      token,
      fetchUsers,
    ]
  );

  const handleStatusToggle = useCallback(
    async (record: AdminUser) => {
      if (!isAdministrator || !token) return;
      const code = String(record.employee_code);
      const isSelf = currentEmployeeCode !== '' && code === currentEmployeeCode;
      const nextStatus = record.status === 1 ? 0 : 1;
      if (isSelf && nextStatus === 0) {
        messageApi.error(a.cannotDisableSelf);
        return;
      }
      setStatusCode(code);
      try {
        const res = await fetchWithAuth(
          `/api/administration/users/${encodeURIComponent(code)}`,
          token,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus }),
          }
        );
        const json = await res.json();
        if (json.success) {
          messageApi.success(nextStatus === 1 ? a.userEnabled : a.userDisabled);
          setUsers((prev) =>
            prev.map((u) =>
              String(u.employee_code) === code ? { ...u, status: nextStatus } : u
            )
          );
        } else {
          messageApi.error(json.error || a.failedUpdateStatus);
        }
      } catch {
        messageApi.error(a.failedUpdateStatus);
      } finally {
        setStatusCode(null);
      }
    },
    [isAdministrator, token, currentEmployeeCode, messageApi, a]
  );

  const columns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: isAdministrator ? 140 : 100,
        align: 'left' as const,
        render: (_: unknown, record: AdminUser) => {
          const code = String(record.employee_code);
          const isSelf = currentEmployeeCode !== '' && code === currentEmployeeCode;
          const isActive = record.status === 1;
          return (
            <div className="flex flex-row items-center justify-start gap-2">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                title={a.actionViewUser}
                aria-label={`${a.colUsername}: ${record.username}`}
                onClick={() =>
                  router.push('/administration/users/detail/' + encodeURIComponent(code))
                }
              >
                <EyeOutlined />
              </button>
              {isAdministrator && !permissionsLoading ? (
                <>
                  <button
                    type="button"
                    className={`w-8 h-8 flex items-center justify-center rounded bg-gray-100 transition disabled:opacity-40 ${
                      isActive
                        ? 'hover:bg-orange-100 text-orange-600 hover:text-orange-800'
                        : 'hover:bg-green-100 text-green-600 hover:text-green-800'
                    }`}
                    title={isActive ? a.actionDisableUser : a.actionEnableUser}
                    aria-label={isActive ? a.actionDisableUser : a.actionEnableUser}
                    disabled={(isSelf && isActive) || statusCode === code || deletingCode === code}
                    onClick={() => handleStatusToggle(record)}
                  >
                    {isActive ? <StopOutlined /> : <CheckCircleOutlined />}
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition disabled:opacity-40"
                    title={a.actionDeleteUser}
                    aria-label={a.actionDeleteUser}
                    disabled={isSelf || deletingCode === code || statusCode === code}
                    onClick={() => handleDelete(record)}
                  >
                    <DeleteOutlined />
                  </button>
                </>
              ) : null}
            </div>
          );
        },
      },
      {
        title: a.colUsername,
        dataIndex: 'username',
        key: 'username',
        sorter: (x: AdminUser, y: AdminUser) => x.username.localeCompare(y.username),
        width: 160,
      },
      {
        title: a.colEmployeeCode,
        dataIndex: 'employee_code',
        key: 'employee_code',
        sorter: (x: AdminUser, y: AdminUser) =>
          String(x.employee_code).localeCompare(String(y.employee_code)),
        width: 120,
      },
      {
        title: a.colDefaultShop,
        dataIndex: 'default_shopcode',
        key: 'default_shopcode',
        sorter: (x: AdminUser, y: AdminUser) => x.default_shopcode.localeCompare(y.default_shopcode),
        width: 120,
      },
      {
        title: a.colRole,
        dataIndex: 'role_name',
        key: 'role_name',
        sorter: (x: AdminUser, y: AdminUser) =>
          (x.role_name ?? '').localeCompare(y.role_name ?? ''),
        width: 160,
        render: (_: string | null | undefined, record: AdminUser) => {
          const name = record.role_name?.trim();
          if (name) {
            const color =
              record.role_code === 1 ? 'blue' : record.role_code === 2 ? 'green' : 'orange';
            return <Tag color={color}>{name}</Tag>;
          }
          if (record.role_code === 1) {
            return <Tag color="blue">{a.roleSupervisor}</Tag>;
          }
          return <Tag>{a.roleUser}</Tag>;
        },
      },
      {
        title: a.colStatus,
        dataIndex: 'status',
        key: 'status',
        sorter: (x: AdminUser, y: AdminUser) => x.status - y.status,
        width: 90,
        render: (s: number) =>
          s === 1 ? <Tag color="green">{a.statusActive}</Tag> : <Tag color="red">{a.statusInactive}</Tag>,
      },
    ],
    [
      a,
      router,
      isAdministrator,
      permissionsLoading,
      currentEmployeeCode,
      deletingCode,
      statusCode,
      handleDelete,
      handleStatusToggle,
    ]
  );

  const UsersButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      {isAdministrator && !permissionsLoading ? (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/administration/users/add')}
        >
          {a.add}
        </Button>
      ) : null}
      <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
        {a.refresh}
      </Button>
    </div>
  );

  const pageTitle = users.length > 0 ? a.titleWithCount(users.length) : a.title;

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
            { label: a.breadcrumbUsers, current: true },
          ]}
        />
      }
      title={pageTitle}
      description={a.description}
      buttonBar={UsersButtonBar}
    >
      <Spin spinning={loading}>
        <div className="px-8 py-6 bg-white">
          <Table
            rowKey="uid"
            columns={columns}
            dataSource={users}
            loading={false}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 900 }}
          />
        </div>
      </Spin>
    </BasicPageLayout>
  );
}
