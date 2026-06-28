'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { ArrowLeftOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Form, Input, Select, Spin, Table } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { TRANSACTION_PERMISSIONS, FUNCTION_PERMISSION_ROWS, isViewOnlyPermissionRow } from '@/config/transactionPermissions';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
interface AdminUser {
  uid: number;
  employee_code: string;
  username: string;
  default_shopcode: string;
  role_code: number;
  status: number;
}

interface FormOptions {
  shops: Array<{ shop_code: string; name: string }>;
}

function UserDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const ud = useMemo(() => getAdminPagesTexts(lang).userDetail, [lang]);
  const ul = useMemo(() => getAdminPagesTexts(lang).usersList, [lang]);
  const { token, user: currentUser } = useAuth();
  const { message: messageApi } = App.useApp();
  const employeeCode = params?.employee_code as string;
  const [user, setUser] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionFieldValues, setPermissionFieldValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [shopOptions, setShopOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [form] = Form.useForm();
  const [userInfoForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const goBackToUsers = useBackNavigation(() => router.push('/administration/users'));

  useEffect(() => {
    if (!employeeCode || !token) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const usersRes = await fetchWithAuth('/api/administration/users', token, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const usersJson = await usersRes.json();
        if (controller.signal.aborted) return;
        if (!usersJson.success || !Array.isArray(usersJson.data)) {
          messageApi.error(ud.failedLoadUsers);
          setLoading(false);
          return;
        }
        const u = (usersJson.data as AdminUser[]).find(
          (x) => String(x.employee_code) === String(employeeCode)
        );
        if (!u) {
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(u);
        userInfoForm.setFieldsValue({
          default_shopcode: u.default_shopcode,
        });
        const optionsRes = await fetchWithAuth('/api/administration/users/form-options', token, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const optionsJson = await optionsRes.json();
        if (!controller.signal.aborted && optionsJson.success && optionsJson.data) {
          const data = optionsJson.data as FormOptions;
          setShopOptions(
            (data.shops ?? []).map((s) => ({
              value: s.shop_code,
              label: `${s.shop_code} — ${s.name}`,
            }))
          );
        }
        const permRes = await fetchWithAuth(
          `/api/administration/users/${encodeURIComponent(u.employee_code)}/permissions`,
          token,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const permJson = await permRes.json();
        if (controller.signal.aborted) return;
        if (permJson.success && Array.isArray(permJson.data)) {
          setPermissions(permJson.data);
        }
        const initial: Record<string, boolean> = {};
        TRANSACTION_PERMISSIONS.forEach((p) => {
          initial[p.key] = permJson.success && permJson.data.includes(p.key);
        });
        setPermissionFieldValues(initial);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        messageApi.error(ud.failedLoadUser);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [employeeCode, token, ud, userInfoForm]);

  const handleSave = async () => {
    if (!user || !token) return;
    let profileValues: { default_shopcode?: string };
    try {
      profileValues = await userInfoForm.validateFields();
    } catch {
      return;
    }
    const permValues = form.getFieldsValue(true) as Record<string, boolean>;
    const selected = TRANSACTION_PERMISSIONS.filter((p) => permValues[p.key]).map((p) => p.key);
    const pwdValues = passwordForm.getFieldsValue(true) as { new_password?: string; confirm_password?: string };
    const newPwd = (pwdValues.new_password ?? '').trim();
    const confirmPwd = (pwdValues.confirm_password ?? '').trim();
    const nextDefaultShop = String(profileValues.default_shopcode ?? '').trim();
    const shopChanged = nextDefaultShop !== String(user.default_shopcode || '').trim();

    if (newPwd !== '' || confirmPwd !== '') {
      if (newPwd !== confirmPwd) {
        messageApi.error(ud.passwordMismatch);
        return;
      }
    }

    setSaving(true);
    let profileUpdated = false;
    try {
      if (shopChanged) {
        const profileRes = await fetchWithAuth(
          `/api/administration/users/${encodeURIComponent(user.employee_code)}`,
          token,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ default_shopcode: nextDefaultShop }),
          }
        );
        const profileResult = await profileRes.json();
        if (!profileResult.success) {
          messageApi.error(profileResult.error || ud.failedUpdateProfile);
          setSaving(false);
          return;
        }
        setUser((prev) =>
          prev
            ? {
                ...prev,
                default_shopcode: nextDefaultShop,
              }
            : prev
        );
        profileUpdated = true;
      }

      const res = await fetchWithAuth(
        `/api/administration/users/${encodeURIComponent(user.employee_code)}/permissions`,
        token,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ permissions: selected }),
        }
      );
      const result = await res.json();
      if (!result.success) {
        messageApi.error(result.error || ud.failedUpdateAccess);
        setSaving(false);
        return;
      }
      setPermissions(selected);

      // If we saved the current user's permissions, refresh sidebar menu
      const currentCode = currentUser?.employee_code != null ? String(currentUser.employee_code) : '';
      if (currentCode && String(user.employee_code) === currentCode && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('permissions-updated'));
      }

      if (newPwd) {
        const pwdRes = await fetchWithAuth(
          `/api/administration/users/${encodeURIComponent(user.employee_code)}/password`,
          token,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ new_password: newPwd }),
          }
        );
        const pwdResult = await pwdRes.json();
        if (pwdResult.success) {
          messageApi.success(
            profileUpdated ? ud.accessAndProfileUpdated : ud.accessAndPasswordUpdated
          );
          passwordForm.resetFields();
        } else {
          messageApi.success(profileUpdated ? ud.accessAndProfileUpdated : ud.accessUpdated);
          messageApi.error(pwdResult.error || ud.failedUpdatePassword);
        }
      } else {
        messageApi.success(profileUpdated ? ud.accessAndProfileUpdated : ud.accessUpdated);
      }
    } catch (e) {
      messageApi.error(ud.failedUpdate);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!user || !token) return;
    setResetting(true);
    try {
      const res = await fetch(
        `/api/administration/users/${encodeURIComponent(user.employee_code)}/permissions/reset-default`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const result = await res.json();
      if (!result.success) {
        messageApi.error(result.error || ud.failedReset);
        setResetting(false);
        return;
      }
      const keys = Array.isArray(result.data) ? result.data : [];
      setPermissions(keys);
      const initial: Record<string, boolean> = {};
      TRANSACTION_PERMISSIONS.forEach((p) => {
        initial[p.key] = keys.includes(p.key);
      });
      setPermissionFieldValues(initial);
      form.setFieldsValue(initial);
      messageApi.success(ud.resetOk);

      const currentCode = currentUser?.employee_code != null ? String(currentUser.employee_code) : '';
      if (currentCode && String(user.employee_code) === currentCode && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('permissions-updated'));
      }
    } catch (e) {
      messageApi.error(ud.failedReset);
    } finally {
      setResetting(false);
    }
  };

  const adminMenu = useMemo(
    () => [
      { label: bc.users, href: '/administration/users' },
      { label: bc.settings, href: '/administration/settings' },
      { label: bc.importExport, href: '/administration/master-data' },
    ],
    [bc]
  );

  const editingSuffix =
    currentUser?.selected_shopcode != null
      ? ud.editingForShop(String(currentUser.selected_shopcode))
      : '';

  if (loading) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: bc.home, href: '/' },
              {
                label: bc.administration,
                href: '/administration',
                menuItems: adminMenu,
              },
              { label: bc.users, href: '/administration/users' },
              { label: bc.detail, current: true },
            ]}
          />
        }
        title={ud.titleLoading}
      >
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      </BasicPageLayout>
    );
  }

  if (!user) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: bc.home, href: '/' },
              {
                label: bc.administration,
                href: '/administration',
                menuItems: adminMenu,
              },
              { label: bc.users, href: '/administration/users' },
              { label: bc.detail, current: true },
            ]}
          />
        }
        title={ud.titleNotFound}
      >
        <div className="px-8 py-6">
          <Button onClick={goBackToUsers}>{ud.backToUsers}</Button>
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
              menuItems: adminMenu,
            },
            { label: bc.users, href: '/administration/users' },
            { label: user.username, current: true },
          ]}
        />
      }
      title={ud.titleAccess(user.username)}
      description={ud.descriptionAccess(user.employee_code, user.default_shopcode, editingSuffix)}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2 flex-wrap">
          <Button icon={<ArrowLeftOutlined />} onClick={goBackToUsers}>
            {ud.backToUsers}
          </Button>
          <Button
            icon={<PlusOutlined />}
            title={ul.actionAddUser}
            onClick={() => router.push('/administration/users/add')}
          >
            {ul.add}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            {saveWithShortcutLabel(lang)}
          </Button>
          <Button
            type="default"
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
              form.setFieldsValue(full);
            }}
          >
            {ud.grantFull}
          </Button>
          <Button
            type="default"
            danger
            loading={resetting}
            onClick={handleResetToDefault}
          >
            {ud.resetDefault}
          </Button>
        </div>
      }
      actionBarSaveShortcut={{ onSave: handleSave, disabled: saving || resetting }}
    >
      <div className="px-8 py-6 bg-white">
        <Card title={ud.cardUserInfo} size="small" className="max-w-3xl mb-6">
          <p className="text-neutral-500 text-sm mb-3">{ud.cardUserInfoHint}</p>
          <Form form={userInfoForm} layout="vertical" style={{ maxWidth: 480 }}>
            <Form.Item label={ud.labelEmployeeCode}>
              <Input value={user.employee_code} disabled />
            </Form.Item>
            <Form.Item label={ud.labelUsername}>
              <Input value={user.username} disabled />
            </Form.Item>
            <Form.Item
              label={ud.labelDefaultShop}
              name="default_shopcode"
              rules={[{ required: true, message: ud.ruleDefaultShop }]}
            >
              <Select
                placeholder={ud.phDefaultShop}
                options={shopOptions}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title={ud.cardTransactionAccess}
          size="small"
          className="max-w-3xl"
        >
          <p className="text-neutral-500 text-sm mb-3">
            {ud.cardTransactionHint}
          </p>
          <Form
            form={form}
            layout="vertical"
            initialValues={permissionFieldValues}
            key={user.employee_code}
          >
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
                  render: (label: string, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) => (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{label}</span>
                      <Button
                        type="link"
                        size="small"
                        className="p-0 h-auto text-xs"
                        onClick={() => {
                          if (isViewOnlyPermissionRow(row)) {
                            form.setFieldsValue({
                              [row.view]: true,
                              [row.create]: false,
                              [row.edit]: false,
                              [row.delete]: false,
                            });
                          } else {
                            form.setFieldsValue({
                              [row.create]: true,
                              [row.view]: true,
                              [row.edit]: true,
                              [row.delete]: true,
                            });
                          }
                        }}
                      >
                        {ud.linkAll}
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        className="p-0 h-auto text-xs"
                        onClick={() => {
                          form.setFieldsValue({
                            [row.create]: false,
                            [row.view]: false,
                            [row.edit]: false,
                            [row.delete]: false,
                          });
                        }}
                      >
                        {ud.linkNone}
                      </Button>
                    </div>
                  ),
                },
                {
                  title: ud.colView,
                  key: 'view',
                  width: 90,
                  align: 'center',
                  render: (_: unknown, row: (typeof FUNCTION_PERMISSION_ROWS)[number]) => (
                    <Form.Item name={row.view} valuePropName="checked" noStyle>
                      <Checkbox />
                    </Form.Item>
                  ),
                },
                {
                  title: ud.colCreate,
                  key: 'create',
                  width: 90,
                  align: 'center',
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
                  width: 90,
                  align: 'center',
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
                  align: 'center',
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

        <Card title={ud.cardPassword} size="small" className="max-w-3xl mt-6">
          <p className="text-neutral-500 text-sm mb-3">
            {ud.cardPasswordHint}
          </p>
          <Form form={passwordForm} layout="vertical" style={{ maxWidth: 400 }}>
            <Form.Item name="new_password" label={ud.labelNewPassword}>
              <Input.Password placeholder={ud.phNewPassword} autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label={ud.labelConfirmPassword}
              dependencies={['new_password']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const newPwd = getFieldValue('new_password');
                    if (!newPwd || !value) return Promise.resolve();
                    if (newPwd === value) return Promise.resolve();
                    return Promise.reject(new Error(ud.validatorPasswordMatch));
                  },
                }),
              ]}
            >
              <Input.Password placeholder={ud.phConfirmPassword} autoComplete="new-password" />
            </Form.Item>
          </Form>
        </Card>
      </div>
    </BasicPageLayout>
  );
}

export default function UserDetailPage() {
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
      <UserDetailPageContent />
    </Suspense>
  );
}
