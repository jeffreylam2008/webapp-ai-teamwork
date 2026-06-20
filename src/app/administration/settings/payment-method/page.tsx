'use client';
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { Modal, Form, Input, Table, Button, Spin } from 'antd';
import { useDataTable } from '@/hooks/useDataTable';

interface PaymentMethod {
  pm_code: string;
  payment_method: string;
  create_date?: string;
  modify_date?: string;
  [key: string]: string | number | null | undefined;
}


function PaymentMethodPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const pl = useMemo(() => getAdminPagesTexts(lang).paymentMethodList, [lang]);

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
  } = useDataTable<PaymentMethod>({
    apiEndpoint: '/api/payment-methods',
    defaultPageSize: 10
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PaymentMethod | null>(null);
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

  // Create payment method handler
  const handleCreate = () => {
    setCreateModalOpen(true);
    createForm.resetFields();
    setModalError(null);
  };

  const handleCreateSubmit = async (values: Record<string, string>) => {
    setCreating(true);
    try {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();

      if (result.success) {
        setPageMessage({ 
          type: 'success', 
          text: result.message || 'Payment method created successfully' 
        });
        setCreateModalOpen(false);
        createForm.resetFields();
        refreshData();
      } else {
        setPageMessage({ 
          type: 'error', 
          text: result.error || 'Failed to create payment method' 
        });
      }
    } catch {
      setPageMessage({ 
        type: 'error', 
        text: 'Error creating payment method' 
      });
    } finally {
      setCreating(false);
    }
  };

  // Delete handler
  const handleDelete = useCallback((paymentMethod: PaymentMethod) => {
    setItemToDelete(paymentMethod);
    setDeleteModalOpen(true);
  }, []);

  const displayColumns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 100,
        align: 'left' as const,
        render: (_: unknown, record: PaymentMethod) => (
          <div className="flex flex-row items-center justify-start gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
              title={pl.titleEdit}
              type="button"
              onClick={() =>
                router.push(
                  `/administration/settings/payment-method/detail/${encodeURIComponent(record.pm_code || '')}`
                )
              }
              style={{ verticalAlign: 'middle' }}
            >
              <EyeOutlined />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
              title={pl.titleDelete}
              type="button"
              onClick={() => handleDelete(record)}
              style={{ verticalAlign: 'middle' }}
            >
              <DeleteOutlined />
            </button>
          </div>
        ),
      },
      {
        title: pl.colPmCode,
        dataIndex: 'pm_code',
        key: 'pm_code',
        sorter: (a: PaymentMethod, b: PaymentMethod) => (a.pm_code || '').localeCompare(b.pm_code || ''),
        width: 200,
      },
      {
        title: pl.colPmDesc,
        dataIndex: 'payment_method',
        key: 'payment_method',
        sorter: (a: PaymentMethod, b: PaymentMethod) =>
          (a.payment_method || '').localeCompare(b.payment_method || ''),
        width: 300,
      },
      {
        title: pl.colCreated,
        dataIndex: 'create_date',
        key: 'create_date',
        width: 180,
        sorter: (a: PaymentMethod, b: PaymentMethod) => {
          if (!a.create_date && !b.create_date) return 0;
          if (!a.create_date) return -1;
          if (!b.create_date) return 1;
          return new Date(a.create_date).getTime() - new Date(b.create_date).getTime();
        },
        render: (date: string) => (date ? new Date(date).toLocaleString() : '-'),
      },
      {
        title: pl.colModified,
        dataIndex: 'modify_date',
        key: 'modify_date',
        width: 180,
        sorter: (a: PaymentMethod, b: PaymentMethod) => {
          if (!a.modify_date && !b.modify_date) return 0;
          if (!a.modify_date) return -1;
          if (!b.modify_date) return 1;
          return new Date(a.modify_date).getTime() - new Date(b.modify_date).getTime();
        },
        render: (date: string) => (date ? new Date(date).toLocaleString() : '-'),
      },
    ],
    [router, pl, handleDelete]
  );

  // Button bar for payment methods actions
  const PaymentMethodsButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button 
        type="primary"
        icon={<PlusOutlined />}
        onClick={handleCreate}
      >
        {pl.add}
      </Button>
      <Button 
        icon={<FilterOutlined />}
        type={filters.search ? "primary" : "default"}
        onClick={() => setShowFilters(!showFilters)}
      >
        {pl.filters}
      </Button>
      <Button 
        icon={<ReloadOutlined />}
        onClick={refreshData}
        loading={loading}
      >
        {pl.refresh}
      </Button>
      <Button 
        onClick={() => {
          setFilters({});
        }}
      >
        {pl.clearAll}
      </Button>
    </div>
  );

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
            { label: bc.settings, href: '/administration/settings' },
            { label: bc.paymentMethods, current: true }
          ]} 
        />
      }
      buttonBar={PaymentMethodsButtonBar}
      title={pl.title}
      description={pl.description}
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
                  {pageMessage.type === 'success' ? pl.labelSuccess : pl.labelError}
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
            <h4 className="text-lg font-semibold text-gray-900 mb-4">{pl.filterOptions}</h4>
            <div className="flex gap-4 items-center flex-wrap mb-4">
              <div className="flex gap-2 items-center">
                <label className="font-bold text-gray-700 min-w-20">{pl.searchLabel}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={pl.searchPh}
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}

                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    type="primary"
                    onClick={() => {}}
                  >
                    {pl.search}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md text-red-800">
            <strong>{pl.errorLabel}</strong> {error}
          </div>
        )}

        {/* Data Display */}
        <Spin spinning={loading}>
          {!loading && data.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>{pl.noData}</p>
              {filters.search && <p>{pl.tryAdjustSearch}</p>}
            </div>
          ) : (
            <Table
              columns={displayColumns}
              dataSource={data}
              rowKey="pm_code"
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
        title={pl.deleteTitle}
        onOk={async () => {
          if (!itemToDelete) return;
          try {
            const res = await fetch('/api/payment-methods', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                pm_code: itemToDelete.pm_code
              }),
            });
            const result = await res.json();
            
            if (result.success) {
              setPageMessage({
                type: 'success',
                text: result.message || 'Payment method deleted successfully'
              });
              setItemToDelete(null);
              setDeleteModalOpen(false);
              refreshData();
            } else {
              setPageMessage({
                type: 'error',
                text: result.error || 'Failed to delete payment method'
              });
            }
          } catch (err) {
            setPageMessage({
              type: 'error',
              text: 'Error deleting payment method'
            });
          }
        }}
        onCancel={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        okText={pl.okYes}
        cancelText={pl.cancel}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{itemToDelete ? pl.deleteConfirm(itemToDelete.pm_code) : ''}</span>
        </div>
      </Modal>

      {/* Create Payment Method Modal */}
      <Modal
        open={createModalOpen}
        title={pl.createTitle}
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
                <span className="text-red-600 font-medium">{pl.labelError}</span>
                <span className="ml-2 text-red-700">{modalError}</span>
              </div>
            </div>
          )}

          <Form.Item
            label={pl.labelPmCode}
            name="pm_code"
            rules={[{ required: true, message: pl.rulePmCode }]}
          >
            <Input placeholder={pl.phPmCode} />
          </Form.Item>

          <Form.Item
            label={pl.labelPmDesc}
            name="payment_method"
            rules={[{ required: true, message: pl.rulePmDesc }]}
          >
            <Input placeholder={pl.phPmDesc} />
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
              {pl.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {creating ? pl.creating : pl.createPm}
            </button>
          </div>
        </Form>
      </Modal>
    </BasicPageLayout>
  );
}

export default function PaymentMethodPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} buttonBar={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <PaymentMethodPageContent />
    </Suspense>
  );
}
