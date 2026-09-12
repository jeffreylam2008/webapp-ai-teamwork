'use client';

import React, { useEffect, useState } from 'react';
import { warmAppLanguageCache } from '@/lib/i18n/language';
import { Alert, Card, Spin, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

type EnvStatusResponse = {
  success?: boolean;
  locked?: boolean;
  message?: string;
  missingFile?: boolean;
  missingVars?: string[];
};

function EnvLockScreen({ message, missingFile, missingVars }: {
  message: string;
  missingFile?: boolean;
  missingVars?: string[];
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-6">
      <Card className="w-full max-w-xl shadow-2xl rounded-lg">
        <div className="text-center mb-6">
          <LockOutlined style={{ fontSize: 48, color: '#cf1322' }} />
          <Title level={3} style={{ marginTop: 16, marginBottom: 8 }}>
            Application Locked
          </Title>
          <Paragraph type="secondary">{message}</Paragraph>
        </div>

        <Alert
          type="error"
          showIcon
          message="Database environment is not configured"
          description={
            <div className="space-y-2">
              {missingFile ? (
                <Text>
                  Create a <Text code>.env.local</Text> file in the project root.
                </Text>
              ) : null}
              {missingVars && missingVars.length > 0 ? (
                <div>
                  Missing variables: <Text code>{missingVars.join(', ')}</Text>
                </div>
              ) : null}
              <pre className="mt-3 rounded bg-gray-100 p-3 text-left text-sm overflow-x-auto">
{`DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database
DB_HOST=192.168.1.32
DB_PORT=3306`}
              </pre>
            </div>
          }
        />
      </Card>
    </div>
  );
}

export default function ApplicationEnvGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [missingFile, setMissingFile] = useState(false);
  const [missingVars, setMissingVars] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/system/env-status', { cache: 'no-store' });
        const data = (await res.json()) as EnvStatusResponse;
        if (cancelled) return;

        if (data.locked) {
          setLocked(true);
          setMessage(data.message || 'Application locked.');
          setMissingFile(Boolean(data.missingFile));
          setMissingVars(data.missingVars ?? []);
        } else {
          setLocked(false);
          await warmAppLanguageCache();
        }
      } catch {
        if (!cancelled) {
          setLocked(true);
          setMessage('Application locked: unable to verify environment configuration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spin size="large" />
      </div>
    );
  }

  if (locked) {
    return <EnvLockScreen message={message} missingFile={missingFile} missingVars={missingVars} />;
  }

  return <>{children}</>;
}
