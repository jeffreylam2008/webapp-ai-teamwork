'use client';
import React, { Suspense } from 'react';
import { ConfigProvider } from 'antd';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';

const StyleProfileProvider = dynamic(
  () => import('@/providers/StyleProfileProvider').then(mod => mod.StyleProfileProvider),
  { 
    ssr: false,
    loading: () => <div className="p-8">Loading style provider...</div>
  }
);

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider>
      <ErrorBoundary>
        <Suspense fallback={<div className="p-8">Loading application...</div>}>
          <StyleProfileProvider>
            <div suppressHydrationWarning>
              {children}
            </div>
          </StyleProfileProvider>
        </Suspense>
      </ErrorBoundary>
    </ConfigProvider>
  );
}