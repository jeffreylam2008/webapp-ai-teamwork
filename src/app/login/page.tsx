'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Form, Input, Button, Card, Alert, Select, Spin } from 'antd';
import { UserOutlined, LockOutlined, ShopOutlined } from '@ant-design/icons';
import { useAuth } from '@/contexts/AuthContext';
import SystemLogo from '@/components/SystemLogo';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getLoginPageTexts } from '@/lib/i18n/loginPage';
import { useLoginShops } from '@/hooks/useLoginShops';
import { fetchSystemBranding, pickLoginLogo } from '@/lib/systemBranding';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const lt = getLoginPageTexts(lang);
  const { message: messageApi } = App.useApp();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { shops, loading: shopsLoading, error: shopsError } = useLoginShops();
  const [systemName, setSystemName] = useState<string>(lt.defaultSystemName);
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [form] = Form.useForm();
  const shopsInitializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchSystemBranding();
        if (cancelled) return;
        if (data.system_name) setSystemName(data.system_name);
        setSystemLogo(pickLoginLogo(data));
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (shopsError) {
      messageApi.error(lt.failedLoadShops);
    }
  }, [shopsError, lt.failedLoadShops, messageApi]);

  useEffect(() => {
    if (shops.length === 0 || shopsInitializedRef.current) return;
    shopsInitializedRef.current = true;
    form.setFieldsValue({ shop_code: shops[0].shop_code });
  }, [shops, form]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (values: { username: string; password: string; shop_code?: string }) => {
    setLoading(true);
    setError(null);
    const shopCode = values.shop_code ?? form.getFieldValue('shop_code');
    try {
      await login(values.username, values.password, shopCode);
    } catch (err) {
      console.error('Login error:', err);
      const errorMessage = err instanceof Error ? err.message : lt.loginFailedGeneric;
      setError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600">{lt.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md px-4">
        <Card className="shadow-2xl rounded-lg">
          <div className="text-center mb-8">
            <div className="mb-4 flex justify-center">
              <SystemLogo logo={systemLogo} iconStyle={{ fontSize: 48 }} imageSize={64} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {systemName}
            </h1>
            <p className="text-gray-600">{lt.signInSubtitle}</p>
          </div>

          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
            {error && (
              <Alert
                message={lt.loginFailed}
                description={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                className="mb-4"
              />
            )}

            <Form.Item
              name="username"
              rules={[{ required: true, message: lt.usernameRequired }]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder={lt.usernamePlaceholder}
                autoComplete="username"
                disabled={loading}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: lt.passwordRequired }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder={lt.passwordPlaceholder}
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Item>

            <Form.Item
              name="shop_code"
              rules={[{ required: true, message: lt.shopRequired }]}
            >
              <Select
                placeholder={lt.shopPlaceholder}
                loading={shopsLoading}
                disabled={loading || shopsLoading}
                suffixIcon={<ShopOutlined className="text-gray-400" />}
                options={shops.map((shop) => ({
                  value: shop.shop_code,
                  label: `${shop.name ?? shop.shop_code} (${shop.shop_code})`,
                }))}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className="h-12 text-lg font-semibold"
              >
                {loading ? lt.signingIn : lt.signIn}
              </Button>
            </Form.Item>
          </Form>

          <div className="text-center text-gray-500 text-sm mt-6">
            <p>{lt.footer('2024', systemName)}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <Spin size="large" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
