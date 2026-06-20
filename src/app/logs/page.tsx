'use client';

import { useSearchParams } from 'next/navigation';
import LogViewer from '@/components/LogViewer';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getLogsPageTexts } from '@/lib/i18n/logsPage';

export default function LogsPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getLogsPageTexts(lang);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.pageTitle}</h1>
        <p className="text-gray-600 mt-2">{t.pageDescription}</p>
      </div>

      <LogViewer texts={t} />
    </div>
  );
}
