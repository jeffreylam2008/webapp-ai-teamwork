'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { Modal, Form, Input, Table, Button, Select, Spin } from 'antd';
import { useDataTable } from '@/hooks/useDataTable';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { getDistrictTexts } from './i18n';

interface District {
  district_code: string;
  district_eng: string;
  district_chi: string;
  region: string;
  [key: string]: string | number | null | undefined;
}

const REGION_CODES = ['HK', 'KLN', 'NT'] as const;






export default function DistrictPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getDistrictTexts(lang), [lang]);

  const REGIONS = useMemo(
    () => [
      { value: 'HK', label: t.regions.HK },
      { value: 'KLN', label: t.regions.KLN },
      { value: 'NT', label: t.regions.NT },
    ],
    [t]
  );

  const getRegionLabel = (code: string) => REGIONS.find((r) => r.value === code)?.label || code;

  // Define the columns we want to display
  const displayColumns = [
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'left' as const,
      render: (_: unknown, record: District) => (
        <div className="flex flex-row items-center justify-start gap-2">
          <button
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
            title={t.actions.edit}
            onClick={() => router.push(`/administration/settings/district/detail/${encodeURIComponent(record.district_code || '')}`)}
            style={{ verticalAlign: 'middle' }}
          >
            <EyeOutlined />
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
            title={t.actions.delete}
            onClick={() => handleDelete(record)}
            style={{ verticalAlign: 'middle' }}
          >
            <DeleteOutlined />
          </button>
        </div>
      )
    },
    {
      title: t.columns.districtCode,
      dataIndex: 'district_code',
      key: 'district_code',
      sorter: (a: District, b: District) => (a.district_code || '').localeCompare(b.district_code || ''),
      width: 140,
    },
    {
      title: t.columns.englishName,
      dataIndex: 'district_eng',
      key: 'district_eng',
      sorter: (a: District, b: District) => (a.district_eng || '').localeCompare(b.district_eng || ''),
      width: 200,
    },
    {
      title: t.columns.chineseName,
      dataIndex: 'district_chi',
      key: 'district_chi',
      sorter: (a: District, b: District) => (a.district_chi || '').localeCompare(b.district_chi || ''),
      width: 200,
    },
    {
      title: t.columns.region,
      dataIndex: 'region',
      key: 'region',
      sorter: (a: District, b: District) => {
        const aLabel = getRegionLabel(a.region) || '';
        const bLabel = getRegionLabel(b.region) || '';
        return aLabel.localeCompare(bLabel);
      },
      width: 180,
      render: (region: string) => getRegionLabel(region)
    }
  ];
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { 
    data, 
    loading, 
    pagination, 
    handleTableChange,
    refreshData,
    filters,
    setFilters 
  } = useDataTable<District>({
    apiEndpoint: '/api/districts',
    defaultPageSize: 10
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<District | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const [modalError, setModalError] = useState<string | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear pageMessage after 10 seconds
  useEffect(() => {
    if (pageMessage.type && pageMessage.text) {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      messageTimeoutRef.current = setTimeout(() => {
        setPageMessage({ type: null, text: null });
      }, 10000);
    }
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [pageMessage.type, pageMessage.text]);

  // Auto-clear error after 10 seconds
  useEffect(() => {
    if (error) {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
      }, 10000);
    }
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [error]);

  // Auto-clear modalError after 10 seconds
  useEffect(() => {
    if (modalError) {
      if (modalErrorTimeoutRef.current) {
        clearTimeout(modalErrorTimeoutRef.current);
      }
      modalErrorTimeoutRef.current = setTimeout(() => {
        setModalError(null);
      }, 10000);
    }
    return () => {
      if (modalErrorTimeoutRef.current) {
        clearTimeout(modalErrorTimeoutRef.current);
      }
    };
  }, [modalError]);



  // Handle URL message parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('message');
    const type = params.get('type') as 'success' | 'error' | null;
    
    if (message && type) {
      setPageMessage({ type, text: message });
      // Remove the message from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Pagination is now handled by the useDataTable hook



  // Create district handler
  const handleCreate = () => {
    setCreateModalOpen(true);
    createForm.resetFields();
    setModalError(null);
  };

  const handleCreateSubmit = async (values: Record<string, string>) => {
    setCreating(true);
    try {
      const res = await fetchWithAuth('/api/districts', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();

      if (result.success) {
        setPageMessage({ 
          type: 'success', 
          text: result.message || t.createModal.created
        });
        setTimeout(() => {
          setCreateModalOpen(false);
          createForm.resetFields();
          refreshData();
        }, 1000);
      } else {
        setPageMessage({ 
          type: 'error', 
          text: result.error || t.createModal.failed
        });
      }
    } catch (err) {
      console.error('Error creating district:', err);
      setPageMessage({ 
        type: 'error', 
        text: t.createModal.error
      });
    } finally {
      setCreating(false);
    }
  };

  // Delete handler
  const handleDelete = async (district: District) => {
    setItemToDelete(district);
    setDeleteModalOpen(true);
  };

  // Button bar for districts actions
  const DistrictsButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button 
        type="primary"
        icon={<PlusOutlined />}
        onClick={handleCreate}
      >
        {t.buttonBar.add}
      </Button>
      <Button 
        icon={<FilterOutlined />}
        type={filters.search ? "primary" : "default"}
        onClick={() => setShowFilters(!showFilters)}
      >
        {t.buttonBar.filters}
      </Button>
      <Button 
        icon={<ReloadOutlined />}
        onClick={refreshData}
        loading={loading}
      >
        {t.buttonBar.refresh}
      </Button>
      <Button 
        onClick={() => {
          setFilters({});
        }}
      >
        {t.buttonBar.clearAll}
      </Button>
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.breadcrumb.home, href: '/' },
            {
              label: t.breadcrumb.administration,
              href: '/administration',
              menuItems: [
                { label: 'Users', href: '/administration/users' },
                { label: 'Settings', href: '/administration/settings' },
                { label: 'Import/Export', href: '/administration/master-data' },
              ],
            },
            { label: t.breadcrumb.settings, href: '/administration/settings' },
            { label: t.breadcrumb.districts, current: true }
          ]} 
        />
      }
      buttonBar={DistrictsButtonBar}
      title={t.page.title}
      description={t.page.description}
    >
      {/* Message Section */}
      {pageMessage.type && pageMessage.text && (
        <div className="px-8 py-4">
          <div className={`p-4 rounded-md border ${
            pageMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="font-medium">
                  {pageMessage.type === 'success' ? `✅ ${t.messages.successPrefix}` : `❌ ${t.messages.errorPrefix}`}
                </span>
                <span className="ml-2">{pageMessage.text}</span>
              </div>
              <button
                onClick={() => {
                  if (messageTimeoutRef.current) {
                    clearTimeout(messageTimeoutRef.current);
                  }
                  setPageMessage({ type: null, text: null });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Block */}
      <div className="px-8 py-6 bg-white">
        {/* Filter Section */}
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">{t.filters.title}</h4>
            <div className="flex gap-4 items-center flex-wrap mb-4">
              <div className="flex gap-2 items-center">
                <label className="font-bold text-gray-700 min-w-20">{t.filters.searchLabel}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t.filters.searchPlaceholder}
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}

                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    type="primary"
                    onClick={() => {}}
                  >
                    {t.filters.search}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md text-red-800">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Data Display */}
        <Spin spinning={loading}>
          {!loading && data.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>{t.messages.noData}</p>
              {filters.search && <p>{t.messages.adjustSearch}</p>}
            </div>
          ) : (
            <Table
              columns={displayColumns}
              dataSource={data}
              rowKey="district_code"
              pagination={pagination}
              loading={false}
              onChange={handleTableChange}
              scroll={{ x: 1200 }}
            />
          )}
        </Spin>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.deleteModal.title}
        onOk={async () => {
          if (!itemToDelete) return;
          try {
            const res = await fetchWithAuth('/api/districts', token, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                district_code: itemToDelete.district_code
              }),
            });
            const result = await res.json();
            
            if (result.success) {
              setPageMessage({
                type: 'success',
                text: result.message || t.deleteModal.deleted
              });
              setItemToDelete(null);
              setDeleteModalOpen(false);
              refreshData();
            } else {
              setPageMessage({
                type: 'error',
                text: result.error || t.deleteModal.failed
              });
            }
          } catch {
            setPageMessage({
              type: 'error',
              text: t.deleteModal.error
            });
          }
        }}
        onCancel={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        okText={t.deleteModal.ok}
        cancelText={t.deleteModal.cancel}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{t.deleteModal.confirm(itemToDelete?.district_code || '')}</span>
        </div>
      </Modal>

      {/* Create District Modal */}
      <Modal
        open={createModalOpen}
        title={t.createModal.title}
        onCancel={() => {
          setCreateModalOpen(false);
          setModalError(null);
        }}
        footer={null}
        width={600}
        maskClosable={false}
        keyboard={false}
        centered
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateSubmit}
        >
          {/* Modal Error Message */}
          {modalError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <span className="text-red-600 font-medium">❌ {t.messages.errorPrefix}</span>
                <span className="ml-2 text-red-700">{modalError}</span>
              </div>
            </div>
          )}

          <Form.Item
            label={t.form.districtCode}
            name="district_code"
            rules={[{ required: true, message: t.form.districtCodeRequired }]}
          >
            <Input placeholder={t.form.districtCodePlaceholder} />
          </Form.Item>

          <Form.Item
            label={t.form.englishName}
            name="district_eng"
            rules={[{ required: true, message: t.form.englishNameRequired }]}
          >
            <Input placeholder={t.form.englishNamePlaceholder} />
          </Form.Item>

          <Form.Item
            label={t.form.chineseName}
            name="district_chi"
            rules={[{ required: true, message: t.form.chineseNameRequired }]}
          >
            <Input placeholder={t.form.chineseNamePlaceholder} />
          </Form.Item>

          <Form.Item
            label={t.form.region}
            name="region"
            rules={[{ required: true, message: t.form.regionRequired }]}
            initialValue="HK"
          >
            <Select
              placeholder={t.form.regionPlaceholder}
              options={REGIONS}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(false);
                setModalError(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {t.createModal.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {creating ? t.createModal.creating : t.createModal.create}
            </button>
          </div>
        </Form>
      </Modal>
    </BasicPageLayout>
  );
}
