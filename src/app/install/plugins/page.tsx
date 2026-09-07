'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Switch, Table, Tag, Typography } from 'antd';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { usePlugins } from '@install/plugins';
import type { AppPluginDefinition, PluginCategory } from '@install/plugins';
import { getPluginsLabTexts } from './i18n';

const { Text, Paragraph } = Typography;

export default function PluginsLabPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getPluginsLabTexts(lang), [lang]);
  const { message } = App.useApp();
  const { ready, plugins, enabled, setEnabled, resetDefaults } = usePlugins();

  const categoryLabel = (category: PluginCategory) => t.categories[category];

  const columns = useMemo(
    () => [
      {
        title: t.table.name,
        key: 'name',
        render: (_: unknown, row: AppPluginDefinition) => (
          <div>
            <div className="font-semibold text-gray-900">{row.name[lang]}</div>
            <div className="text-xs text-gray-500 font-mono">{row.id}</div>
            <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
              {row.description[lang]}
            </Paragraph>
          </div>
        ),
      },
      {
        title: t.table.category,
        dataIndex: 'category',
        key: 'category',
        width: 120,
        render: (category: PluginCategory) => <Tag>{categoryLabel(category)}</Tag>,
      },
      {
        title: t.table.version,
        dataIndex: 'version',
        key: 'version',
        width: 100,
      },
      {
        title: t.table.enabled,
        key: 'enabled',
        width: 110,
        render: (_: unknown, row: AppPluginDefinition) => (
          <Switch
            checked={enabled(row.id)}
            disabled={!ready}
            onChange={(checked) => {
              setEnabled(row.id, checked);
              message.success(
                checked ? t.messages.enabled(row.name[lang]) : t.messages.disabled(row.name[lang])
              );
            }}
          />
        ),
      },
      {
        title: t.table.notes,
        key: 'notes',
        render: (_: unknown, row: AppPluginDefinition) =>
          row.notes ? <Text type="secondary">{row.notes[lang]}</Text> : '—',
      },
    ],
    [t, lang, enabled, ready, setEnabled, message, categoryLabel]
  );

  return (
    <BasicPageLayout
      title={t.page.title}
      description={t.page.description}
      buttonBar={
        <div className="px-8 py-3 border-b flex flex-wrap gap-2">
          <Button
            onClick={() => {
              resetDefaults();
              message.success(t.messages.resetOk);
            }}
          >
            {t.actions.resetDefaults}
          </Button>
          <Button type="default" onClick={() => router.push('/install/project-setup')}>
            {t.actions.openProjectSetup}
          </Button>
        </div>
      }
    >
      <div className="px-8 py-6 bg-white space-y-4">
        <Alert type="info" showIcon message={t.hint.storage} />
        <Alert type="warning" showIcon message={t.hint.monthly} />
        <Table
          rowKey="id"
          loading={!ready}
          columns={columns}
          dataSource={[...plugins]}
          pagination={false}
          size="middle"
        />
      </div>
    </BasicPageLayout>
  );
}
