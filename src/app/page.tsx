'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spin } from 'antd';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getHubPagesTexts } from '@/lib/i18n/hubPages';

function HomeContent() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const h = getHubPagesTexts(lang).home;

  return (
    <div className="max-w-7xl mx-auto my-8 p-6 bg-gray-50 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{h.title}</h2>
      <p className="text-gray-600 mb-2">{h.line1}</p>
      <p className="text-gray-600">{h.line2}</p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto my-8 p-6 flex justify-center">
          <Spin size="large" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
