'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getDebugPagesTexts } from '@/lib/i18n/debugPages';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { Card, Button, Switch, Divider, Typography, Space, Alert, Tag } from 'antd';
import { BugOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';

const { Text, Paragraph } = Typography;

interface DebugSettings {
  deliveryNoteDebug: boolean;
  showSessionInfo: boolean;
  showTechnicalDetails: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export default function DebugPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getDebugPagesTexts(lang);
  const bc = getBreadcrumbLabels(lang);
  const [debugSettings, setDebugSettings] = useState<DebugSettings>({
    deliveryNoteDebug: false,
    showSessionInfo: false,
    showTechnicalDetails: false,
    logLevel: 'info'
  });

  const [currentSession, setCurrentSession] = useState<{ sessionId: string; prefix: string; timestamp: string; type?: string; path?: string } | null>(null);

  // Load debug settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('debugSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setDebugSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Error loading debug settings:', error);
      }
    }
  }, []);

  // Save debug settings to localStorage
  const updateDebugSetting = (key: keyof DebugSettings, value: boolean | string) => {
    const newSettings = { ...debugSettings, [key]: value };
    setDebugSettings(newSettings);
    localStorage.setItem('debugSettings', JSON.stringify(newSettings));
    
    // Broadcast debug mode changes to other components
    window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: newSettings }));
  };

  // Check if there's an active delivery note session
  useEffect(() => {
    const checkActiveSession = () => {
      // This would check if there's an active session in the current tab
      // For now, we'll simulate it
      const hasActiveSession = window.location.pathname.includes('/delivery-note');
      if (hasActiveSession) {
        setCurrentSession({
          sessionId: 'debug-session',
          prefix: 'DN',
          type: 'Delivery Note',
          path: window.location.pathname,
          timestamp: new Date().toISOString()
        });
      }
    };

    checkActiveSession();
    const interval = setInterval(checkActiveSession, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'orange';
      case 'info': return 'blue';
      case 'debug': return 'green';
      default: return 'default';
    }
  };

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: bc.home, href: '/' },
            { label: bc.debug, current: true }
          ]} 
        />
      }
      title={t.pageTitle}
      description={t.pageDescription}
    >
      <div className="px-8 py-6 bg-white">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          
          {/* Debug Mode Toggle */}
          <Card title={t.cardDebugMode} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div className="flex items-center justify-between">
                <div>
                  <Text strong>{t.dnDebugTitle}</Text>
                  <br />
                  <Text type="secondary">{t.dnDebugDesc}</Text>
                </div>
                <Switch
                  checked={debugSettings.deliveryNoteDebug}
                  onChange={(checked) => updateDebugSetting('deliveryNoteDebug', checked)}
                  checkedChildren={<EyeOutlined />}
                  unCheckedChildren={<EyeInvisibleOutlined />}
                />
              </div>
              
              <Divider />
              
              <div className="flex items-center justify-between">
                <div>
                  <Text strong>{t.showSessionTitle}</Text>
                  <br />
                  <Text type="secondary">{t.showSessionDesc}</Text>
                </div>
                <Switch
                  checked={debugSettings.showSessionInfo}
                  onChange={(checked) => updateDebugSetting('showSessionInfo', checked)}
                  disabled={!debugSettings.deliveryNoteDebug}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Text strong>{t.showTechTitle}</Text>
                  <br />
                  <Text type="secondary">{t.showTechDesc}</Text>
                </div>
                <Switch
                  checked={debugSettings.showTechnicalDetails}
                  onChange={(checked) => updateDebugSetting('showTechnicalDetails', checked)}
                  disabled={!debugSettings.deliveryNoteDebug}
                />
              </div>
              
              <Divider />
              
              <div className="flex items-center justify-between">
                <div>
                  <Text strong>{t.logLevelTitle}</Text>
                  <br />
                  <Text type="secondary">{t.logLevelDesc}</Text>
                </div>
                <Space>
                  {(['error', 'warn', 'info', 'debug'] as const).map(level => (
                    <Tag
                      key={level}
                      color={debugSettings.logLevel === level ? getLogLevelColor(level) : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => updateDebugSetting('logLevel', level)}
                    >
                      {level.toUpperCase()}
                    </Tag>
                  ))}
                </Space>
              </div>
            </Space>
          </Card>

          {/* Current Session Info */}
          {currentSession && (
            <Card title={t.cardActiveSession} size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div className="flex items-center justify-between">
                  <Text strong>{t.sessionType}</Text>
                  <Tag color="blue">{currentSession.type}</Tag>
                </div>
                <div className="flex items-center justify-between">
                  <Text strong>{t.currentPath}</Text>
                  <Text code>{currentSession.path}</Text>
                </div>
                <div className="flex items-center justify-between">
                  <Text strong>{t.startedAt}</Text>
                  <Text>{new Date(currentSession.timestamp).toLocaleString()}</Text>
                </div>
              </Space>
            </Card>
          )}

          {/* Debug Information */}
          <Card title={t.cardDebugInfo} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message={t.alertStatusTitle}
                description={
                  <div>
                    <Paragraph>
                      <Text strong>{t.dnDebugLabel}</Text> {debugSettings.deliveryNoteDebug ? t.on : t.off}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>{t.sessionInfoLabel}</Text> {debugSettings.showSessionInfo ? t.visible : t.hidden}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>{t.techDetailsLabel}</Text> {debugSettings.showTechnicalDetails ? t.visible : t.hidden}
                    </Paragraph>
                    <Paragraph>
                      <Text strong>{t.logLevelLabel}</Text> <Tag color={getLogLevelColor(debugSettings.logLevel)}>{debugSettings.logLevel.toUpperCase()}</Tag>
                    </Paragraph>
                  </div>
                }
                type={debugSettings.deliveryNoteDebug ? 'success' : 'info'}
                showIcon
                icon={<BugOutlined />}
              />
              
              <Divider />
              
              <div className="text-center">
                <Text type="secondary">
                  {t.footerNote}
                </Text>
              </div>
            </Space>
          </Card>

          {/* Database Tools */}
          <Card title={t.cardDbTools} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>{t.dbToolsTitle}</Text>
                <br />
                <Text type="secondary">{t.dbToolsDesc}</Text>
              </div>
              <Button 
                type="primary"
                onClick={() => window.location.href = '/debug/test-db'}
                style={{ width: '100%' }}
              >
                {t.dbToolsButton}
              </Button>
            </Space>
          </Card>

          {/* Quick Actions */}
          <Card title={t.cardQuickActions} size="small">
            <Space wrap>
              <Button 
                icon={<BugOutlined />}
                onClick={() => {
                  const newSettings = { ...debugSettings, deliveryNoteDebug: !debugSettings.deliveryNoteDebug };
                  setDebugSettings(newSettings);
                  localStorage.setItem('debugSettings', JSON.stringify(newSettings));
                  window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: newSettings }));
                }}
                type={debugSettings.deliveryNoteDebug ? 'primary' : 'default'}
              >
                {debugSettings.deliveryNoteDebug ? t.disableDebug : t.enableDebug}
              </Button>
              
              <Button 
                onClick={() => {
                  const defaultSettings = {
                    deliveryNoteDebug: false,
                    showSessionInfo: false,
                    showTechnicalDetails: false,
                    logLevel: 'info' as const
                  };
                  setDebugSettings(defaultSettings);
                  localStorage.setItem('debugSettings', JSON.stringify(defaultSettings));
                  window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: defaultSettings }));
                }}
              >
                {t.resetDefaults}
              </Button>
              
              <Button 
                onClick={() => {
                  localStorage.removeItem('debugSettings');
                  window.location.reload();
                }}
                danger
              >
                {t.clearAll}
              </Button>
            </Space>
          </Card>
        </Space>
      </div>
    </BasicPageLayout>
  );
} 