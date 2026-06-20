'use client';
import { useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { Card, Col, message, Row, Space, Typography, Upload, Button, Spin } from 'antd';
import { DownloadOutlined, UploadOutlined, DatabaseOutlined } from '@ant-design/icons';

import type { RcFile, UploadChangeParam, UploadFile } from 'antd/es/upload/interface';

import type { MasterDataType } from '@/lib/masterDataImportExport';

const { Title, Paragraph } = Typography;

type ImportExportTypeConfig = {
  type: MasterDataType;
  title: string;
  description: string;
  sampleFileName: string;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function MasterDataImportExportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const md = useMemo(() => getAdminPagesTexts(lang).masterData, [lang]);
  const TYPE_CONFIG = useMemo((): ImportExportTypeConfig[] => {
    const m = md;
    return [
      { type: 'customers', title: m.typeCustomers, description: m.typeCustomersDesc, sampleFileName: 'customers.json' },
      { type: 'suppliers', title: m.typeSuppliers, description: m.typeSuppliersDesc, sampleFileName: 'suppliers.json' },
      { type: 'districts', title: m.typeDistricts, description: m.typeDistrictsDesc, sampleFileName: 'districts.json' },
      { type: 'prefixes', title: m.typePrefixes, description: m.typePrefixesDesc, sampleFileName: 'prefixes.json' },
      { type: 'payment-methods', title: m.typePaymentMethods, description: m.typePaymentMethodsDesc, sampleFileName: 'payment-methods.json' },
      { type: 'payment-terms', title: m.typePaymentTerms, description: m.typePaymentTermsDesc, sampleFileName: 'payment-terms.json' },
    ];
  }, [md]);
  const goBackToSettings = useBackNavigation(() => router.push('/administration/settings'));
  const { token } = useAuth();

  const [filesByType, setFilesByType] = useState<Record<MasterDataType, File | null>>({
    customers: null,
    suppliers: null,
    districts: null,
    prefixes: null,
    'payment-methods': null,
    'payment-terms': null,
  });

  const [loadingType, setLoadingType] = useState<MasterDataType | null>(null);
  const [importingAll, setImportingAll] = useState(false);

  const onFileChange = (type: MasterDataType) => (info: UploadChangeParam<UploadFile>) => {
    const f = info.file;
    const origin = f?.originFileObj as RcFile | undefined;
    if (!origin) {
      setFilesByType((prev) => ({ ...prev, [type]: null }));
      return;
    }
    setFilesByType((prev) => ({ ...prev, [type]: origin as unknown as File }));
  };

  const doExport = async (type: MasterDataType) => {
    if (!token) {
      message.error(md.notAuthenticated);
      return;
    }
    try {
      setLoadingType(type);
        const res = await fetchWithAuth(
        `/api/administration/master-data/export?type=${encodeURIComponent(type)}`,
        token,
        { cache: 'no-store' }
      );
      const result = await res.json();
      if (!result?.success) {
        message.error(result?.error || md.exportFailed);
        return;
      }

      const safe = type.replace(/[^a-z0-9-]/gi, '');
      const filename = `${safe}-master-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(filename, result.data ?? []);
      const label = TYPE_CONFIG.find((c) => c.type === type)?.title ?? type;
      message.success(md.exported(label));
    } catch {
      message.error(md.exportFailed);
    } finally {
      setLoadingType(null);
    }
  };

  const doImport = async (type: MasterDataType, file: File | null) => {
    if (!token) {
      message.error(md.notAuthenticated);
      return;
    }
    if (!file) {
      message.warning(md.selectFileFirst);
      return;
    }

    const exec = async () => {
      try {
        setLoadingType(type);
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetchWithAuth(
          `/api/administration/master-data/import?type=${encodeURIComponent(type)}&mode=upsert`,
          token,
          {
            method: 'POST',
            body: formData,
          }
        );
        const result = await res.json();
        if (!result?.success) {
          message.error(result?.error || md.importFailed);
          return;
        }

        const summary = result?.summary;
        const label = TYPE_CONFIG.find((c) => c.type === type)?.title ?? type;
        message.success(
          md.importedSummary(
            label,
            summary?.inserted ?? 0,
            summary?.updated ?? 0,
            summary?.skipped ?? 0
          )
        );
        setFilesByType((prev) => ({ ...prev, [type]: null }));
      } catch {
        message.error(md.importFailed);
      } finally {
        setLoadingType(null);
      }
    };

    await exec();
  };

  const importAll = async () => {
    if (!token) {
      message.error(md.notAuthenticated);
      return;
    }

    const typesWithFiles = TYPE_CONFIG.filter((c) => filesByType[c.type]).map((c) => c.type);
    if (typesWithFiles.length === 0) {
      message.warning(md.importAllNeedFile);
      return;
    }

    setImportingAll(true);
    try {
      // Import sequentially to keep DB load predictable and show readable progress.
      for (const type of typesWithFiles) {
        await doImport(type, filesByType[type]);
      }
    } finally {
      setImportingAll(false);
    }
  };

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            {
              label: bc.administration,
              href: '/administration',
              menuItems: [
                { label: bc.users, href: '/administration/users' },
                { label: bc.settings, href: '/administration/settings' },
                { label: bc.importExport, href: '/administration/master-data' },
              ],
            },
            { label: bc.importExport, current: true },
          ]}
        />
      }
      title={md.title}
      description={md.description}
    >
      <div className="px-4 py-6 bg-white">
        <div className="mb-4 flex flex-wrap gap-3 items-center justify-between">
          <Space wrap>
            <Button onClick={goBackToSettings} type="default">
              {md.backToSettings}
            </Button>
          </Space>
          <Space>
            <Button
              type="primary"
              onClick={importAll}
              loading={importingAll}
              disabled={importingAll}
            >
              {md.importAllSelected}
            </Button>
          </Space>
        </div>

        <div className="mb-5 p-4 rounded-md bg-gray-50 border border-gray-200">
          <Title level={5} style={{ marginBottom: 4 }}>
            {md.expectedFormatTitle}
          </Title>
          <Paragraph style={{ marginBottom: 0, color: '#555' }}>
            {md.expectedFormatBody}
          </Paragraph>
        </div>

        <Row gutter={[16, 16]}>
          {TYPE_CONFIG.map((cfg) => {
            const file = filesByType[cfg.type];
            const isBusy = loadingType === cfg.type;
            return (
              <Col key={cfg.type} xs={24} md={12} lg={8}>
                <Card
                  size="small"
                  title={cfg.title}
                  extra={
                    <Space>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={() => doExport(cfg.type)}
                        disabled={isBusy}
                      >
                        {md.export}
                      </Button>
                    </Space>
                  }
                >
                  <Spin spinning={isBusy} tip={md.processingFor(cfg.title)}>
                    <div className="mb-3">
                      <Paragraph style={{ marginBottom: 12 }}>{cfg.description}</Paragraph>
                      <Upload
                        accept=".json,.csv"
                        multiple={false}
                        showUploadList={false}
                        beforeUpload={() => false}
                        onChange={onFileChange(cfg.type)}
                      >
                        <Button icon={<UploadOutlined />} disabled={isBusy}>
                          {md.selectFile}
                        </Button>
                      </Upload>
                      <div className="text-xs text-gray-500 mt-2">
                        {file ? md.selectedFile(file.name) : md.noFileSelected(cfg.sampleFileName)}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="primary"
                        icon={<DatabaseOutlined />}
                        onClick={() => doImport(cfg.type, file)}
                        disabled={!file || isBusy}
                        loading={isBusy}
                        block
                      >
                        {md.import}
                      </Button>
                    </div>
                  </Spin>
                </Card>
              </Col>
            );
          })}
        </Row>

        <div className="mt-6">
          {loadingType ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Spin />
              {md.processingFor(
                TYPE_CONFIG.find((c) => c.type === loadingType)?.title ?? String(loadingType)
              )}
            </div>
          ) : null}
        </div>
      </div>
    </BasicPageLayout>
  );
}

export default function MasterDataImportExportPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} title="" description="">
          <div className="px-4 py-12 flex justify-center">
            <Spin size="large" />
          </div>
        </BasicPageLayout>
      }
    >
      <MasterDataImportExportContent />
    </Suspense>
  );
}

