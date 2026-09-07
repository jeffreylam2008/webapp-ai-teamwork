'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, List, Tag } from 'antd';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { usePlugins } from '@install/plugins';
import { getProjectSetupTexts } from './i18n';

export default function ProjectSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getProjectSetupTexts(lang), [lang]);
  const { ready, plugins, enabled } = usePlugins();

  return (
    <BasicPageLayout
      title={t.page.title}
      description={t.page.description}
      buttonBar={
        <div className="px-8 py-3 border-b flex gap-2">
          <Button type="primary" onClick={() => router.push('/install/plugins')}>
            {t.planned.openLab}
          </Button>
        </div>
      }
    >
      <div className="px-8 py-6 bg-white space-y-4">
        <Alert type="info" showIcon message={t.planned.title} description={t.planned.body} />
        <Card
          title={lang === 'zh-Hant' ? '預覽（來自外掛測試）' : 'Preview (from Plugin Lab)'}
          size="small"
          loading={!ready}
        >
          <List
            dataSource={[...plugins]}
            renderItem={(plugin) => (
              <List.Item>
                <List.Item.Meta
                  title={plugin.name[lang]}
                  description={plugin.description[lang]}
                />
                <Tag color={enabled(plugin.id) ? 'green' : 'default'}>
                  {enabled(plugin.id)
                    ? lang === 'zh-Hant'
                      ? '開'
                      : 'ON'
                    : lang === 'zh-Hant'
                      ? '關'
                      : 'OFF'}
                </Tag>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </BasicPageLayout>
  );
}
