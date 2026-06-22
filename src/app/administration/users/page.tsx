'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Table, Button, message, Tag, Spin, Space } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

interface AdminUser {
  uid: number;
  employee_code: string;
  username: string;
  default_shopcode: string;
  role_code: number;
  status: number;
}

export default function AdministrationUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = getBreadcrumbLabels(lang);
  const hub = getHubPagesTexts(lang).administrationHub;
  const a = getAdminPagesTexts(lang).usersList;
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

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
          message.error(a.supervisorRequired);
          router.push('/');
          return;
        }
        message.error(result.error || a.failedLoad);
      }
    } catch {
      message.error(a.failedLoad);
    } finally {
      setLoading(false);
    }
  }, [token, a.supervisorRequired, a.failedLoad, router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const messageText = params.get('message');
    const type = params.get('type') as 'success' | 'error' | null;
    if (messageText && type) {
      if (type === 'success') message.success(messageText);
      else message.error(messageText);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleAddUser = useCallback(() => {
    router.push('/administration/users/add');
  }, [router]);

  const columns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 100,
        align: 'left' as const,
        render: (_: unknown, record: AdminUser) => (
          <div className="flex flex-row items-center justify-start gap-2">
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
              title={a.actionViewUser}
              aria-label={`${a.colUsername}: ${record.username}`}
              onClick={() =>
                router.push('/administration/users/detail/' + encodeURIComponent(record.employee_code))
              }
            >
              <EyeOutlined />
            </button>
          </div>
        ),
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
        sorter: (x: AdminUser, y: AdminUser) => x.employee_code.localeCompare(y.employee_code),
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
        dataIndex: 'role_code',
        key: 'role_code',
        sorter: (x: AdminUser, y: AdminUser) => x.role_code - y.role_code,
        width: 100,
        render: (code: number) =>
          code === 1 ? <Tag color="blue">{a.roleSupervisor}</Tag> : <Tag>{a.roleUser}</Tag>,
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
    [a, router]
  );

  const UsersButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4">
      <Space wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          title={a.actionAddUser}
          onClick={handleAddUser}
        >
          {a.add}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
          {a.refresh}
        </Button>
      </Space>
    </div>
  );

  const pageTitle =
    users.length > 0 ? a.titleWithCount(users.length) : a.title;

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
