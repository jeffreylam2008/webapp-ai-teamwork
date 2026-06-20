'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getDebugPagesTexts } from '@/lib/i18n/debugPages';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import Breadcrumb from '@/components/Breadcrumb';
import { isDebugEnabled } from '@/config/app-config';

interface DbResponse {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  timestamp: string;
}

export default function TestDbPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getDebugPagesTexts(lang);
  const d = t.testDb;
  const bc = getBreadcrumbLabels(lang);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear messages after 10 seconds
  useEffect(() => {
    if (error || result) {
      // Clear any existing timeout
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      
      // Set new timeout to clear messages after 10 seconds
      messageTimeoutRef.current = setTimeout(() => {
        setError(null);
        setResult(null);
      }, 10000); // 10 seconds
    }

    // Cleanup function to clear timeout when component unmounts or messages change
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [error, result]);

  useEffect(() => {
    // Redirect to home if debug is disabled
    // We'll check this by trying to access the debug config
    // If it fails or debug is off, redirect
    try {
      if (!isDebugEnabled()) {
        router.push('/');
        return;
      }
    } catch {
      // If we can't access the config, redirect to be safe
      router.push('/');
      return;
    }
  }, [router]);

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/debug/database');
      const data: DbResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.connectionFailed);
    } finally {
      setLoading(false);
    }
  };

  // Don't render anything if debug is disabled (will redirect)
  try {
    if (!isDebugEnabled()) {
      return null;
    }
  } catch {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb Block */}
      <div className="px-8 py-4 bg-white border-b border-gray-200">
        <Breadcrumb 
          items={[
            { label: bc.home, href: '/' },
            { label: d.breadcrumbDebugCenter, href: '/debug' },
            { label: d.breadcrumbTestDb, current: true }
          ]} 
        />
      </div>

      {/* Page Title Block */}
      <div className="px-8 py-6 bg-gray-50 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{d.title}</h1>
          <p className="text-gray-600 text-lg">{d.subtitle}</p>
        </div>
      </div>

      {/* Main Content Block */}
      <div className="px-8 py-6 bg-white">
        <div className="mb-6">
          <button
            onClick={testConnection}
            disabled={loading}
            className={`px-6 py-3 rounded-md text-white font-medium transition-colors ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? d.testing : d.testButton}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-md text-red-800">
            <strong>{d.errorPrefix}</strong> {error}
          </div>
        )}

        {result && (
          <div className={`p-4 border rounded-md ${
            result.success 
              ? 'bg-green-100 border-green-300 text-green-800' 
              : 'bg-red-100 border-red-300 text-red-800'
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {result.success ? d.successTitle : d.failedTitle}
            </h3>
            <p className="mb-2"><strong>{d.messageLabel}</strong> {result.message}</p>
            <p className="mb-2"><strong>{d.timestampLabel}</strong> {result.timestamp}</p>
            {result.error && (
              <p className="mb-2"><strong>{d.errorLabel}</strong> {result.error}</p>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 border border-blue-300 rounded-md">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">{d.aboutTitle}</h3>
          <p className="text-blue-800 mb-2">
            {d.aboutIntro}
          </p>
          <ul className="text-blue-800 list-disc list-inside space-y-1">
            <li>{d.aboutLi1}</li>
            <li>{d.aboutLi2}</li>
            <li>{d.aboutLi3}</li>
            <li>{d.aboutLi4}</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 