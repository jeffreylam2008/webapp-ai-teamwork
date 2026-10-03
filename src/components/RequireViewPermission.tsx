'use client';

import { Spin } from 'antd';
import { usePermissions } from '@/hooks/usePermissions';
import type { AppLanguage } from '@/lib/i18n/language';

/** Gates settings (and similar) pages that only have a View permission. */
export function RequireViewPermission({
  permission,
  lang,
  children,
}: {
  permission: string;
  lang: AppLanguage;
  children: React.ReactNode;
}) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <div className="px-8 py-16 flex justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!can(permission)) {
    return (
      <div className="px-8 py-6 text-gray-600">
        {lang === 'zh-Hant' ? '您沒有權限檢視此頁面。' : 'You do not have permission to view this page.'}
      </div>
    );
  }

  return <>{children}</>;
}
