'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Typography } from 'antd';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';

const { Paragraph, Text } = Typography;

const copy = {
  en: {
    title: 'Install',
    description: 'Project install tools (not shown in the main menu). Open by URL only.',
    pluginsTitle: 'Plugin Lab',
    pluginsDesc: 'Enable or disable feature plugins for this browser session.',
    setupTitle: 'Project Setup',
    setupDesc: 'Planned: save plugin selections as a deployment profile.',
    open: 'Open',
    docs: 'See install/README.md in the repo for the entry URLs.',
  },
  'zh-Hant': {
    title: '安裝',
    description: '專案安裝工具（不會出現在主選單）。請直接以網址開啟。',
    pluginsTitle: '外掛測試',
    pluginsDesc: '為此瀏覽器工作階段啟用或停用功能外掛。',
    setupTitle: '專案設定',
    setupDesc: '規劃中：將外掛選擇存成部署設定檔。',
    open: '開啟',
    docs: '入口網址請見專案內 install/README.md。',
  },
} as const;

export default function InstallHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => (lang === 'zh-Hant' ? copy['zh-Hant'] : copy.en), [lang]);

  return (
    <BasicPageLayout title={t.title} description={t.description}>
      <div className="px-8 py-6 bg-white space-y-4">
        <Paragraph type="secondary">{t.docs}</Paragraph>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title={t.pluginsTitle} size="small">
            <Paragraph>{t.pluginsDesc}</Paragraph>
            <Text code>/install/plugins</Text>
            <div className="mt-3">
              <Button type="primary" onClick={() => router.push('/install/plugins')}>
                {t.open}
              </Button>
            </div>
          </Card>
          <Card title={t.setupTitle} size="small">
            <Paragraph>{t.setupDesc}</Paragraph>
            <Text code>/install/project-setup</Text>
            <div className="mt-3">
              <Button onClick={() => router.push('/install/project-setup')}>{t.open}</Button>
            </div>
          </Card>
        </div>
      </div>
    </BasicPageLayout>
  );
}
