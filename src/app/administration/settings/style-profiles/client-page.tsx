'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Card, Typography } from 'antd';
import { useStyleProfile } from '@/providers/StyleProfileProvider';
import { DEFAULT_APP_LANGUAGE } from '@/lib/i18n/language';

const { Title } = Typography;

const loadingFallbackLabel = getBreadcrumbLabels(DEFAULT_APP_LANGUAGE).loading;

function StyleProfilesInner() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const sp = useMemo(() => getAdminPagesTexts(lang).styleProfiles, [lang]);
  const { currentProfile } = useStyleProfile();

  const adminMenu = useMemo(
    () => [
      { label: bc.users, href: '/administration/users' },
      { label: bc.settings, href: '/administration/settings' },
      { label: bc.importExport, href: '/administration/master-data' },
    ],
    [bc]
  );

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
            { label: bc.settings, href: '/administration/settings' },
            { label: bc.styleProfiles, current: true },
          ]}
        />
      }
      title={sp.title}
      description={sp.description}
    >
      <div className="px-8 py-6 bg-white">
        <Title level={3} className="!mb-4">
          {sp.sectionTitle}
        </Title>
        <p className="text-gray-700 mb-6">{sp.sectionBody}</p>
        <Card style={{ backgroundColor: currentProfile.colors.surface }}>
          <p style={{ color: currentProfile.colors.text.primary }}>
            {sp.currentProfile} {currentProfile.name}
          </p>
          <p style={{ color: currentProfile.colors.text.secondary }}>
            {sp.descriptionLabel} {currentProfile.description}
          </p>
          <div className="flex gap-2 mt-4">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: currentProfile.colors.primary }}
            />
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: currentProfile.colors.secondary }}
            />
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: currentProfile.colors.accent }}
            />
          </div>
        </Card>
      </div>
    </BasicPageLayout>
  );
}

export default function StyleProfilesClientPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <BasicPageLayout breadcrumb={null} title="" description="">
            <div className="px-8 py-12 text-center text-gray-500">
              {loadingFallbackLabel}
            </div>
          </BasicPageLayout>
        }
      >
        <StyleProfilesInner />
      </Suspense>
    </ErrorBoundary>
  );
}
