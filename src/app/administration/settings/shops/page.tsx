'use client';
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { getAdminPagesTexts } from '@/lib/i18n/adminPages';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { App, Modal, Form, Input, Table, Button, Spin, Switch, Select } from 'antd';
import { useDataTable } from '@/hooks/useDataTable';

interface Shop {
  uid: number;
  shop_code: string;
  name: string;
  phone: string;
  address1: string;
  address2: string;
  is_warehouse?: number | boolean;
  default_whcode?: string | null;
  create_date?: string;
  modify_date?: string;
  [key: string]: string | number | boolean | null | undefined;
}


function ShopsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const bc = useMemo(() => getBreadcrumbLabels(lang), [lang]);
  const sl = useMemo(() => getAdminPagesTexts(lang).shopsList, [lang]);
  const { message } = App.useApp();

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
  } = useDataTable<Shop>({
    apiEndpoint: '/api/shops',
    defaultPageSize: 10
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Shop | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ shop_code: string; name: string }>>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [modalError, setModalError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    const messageText = params.get('message');
    const type = params.get('type') as 'success' | 'error' | null;
    
    if (messageText && type) {
      if (type === 'success') message.success(messageText);
      else message.error(messageText);
      // Remove the message from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [message]);

  // Create shop handler
  const handleCreate = () => {
    setCreateModalOpen(true);
    createForm.resetFields();
    setModalError(null);
  };

  useEffect(() => {
    if (!createModalOpen) return;
    if (warehouseOptions.length > 0) return;
    fetch('/api/shops?warehouseOnly=1&limit=1000&offset=0&sortColumn=name&sortDirection=asc', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && Array.isArray(j?.data)) {
          setWarehouseOptions(j.data as Array<{ shop_code: string; name: string }>);
        }
      })
      .catch(() => {});
  }, [createModalOpen, warehouseOptions.length]);

  const handleCreateSubmit = async (values: Record<string, unknown>) => {
    setCreating(true);
    setModalError(null);
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          is_warehouse: values.is_warehouse === true,
          default_whcode: typeof values.default_whcode === 'string' && values.default_whcode ? values.default_whcode : null,
        }),
      });
      const result = await res.json();

      if (result.success) {
        message.success(result.message || '店舖已成功建立');
        setTimeout(() => {
          setCreateModalOpen(false);
          createForm.resetFields();
          refreshData();
        }, 1000);
      } else {
        setModalError(result.error || 'Failed to create shop');
        message.error(result.error || 'Failed to create shop');
      }
    } catch (err) {
      console.error('Error creating shop:', err);
      setModalError('Error creating shop');
      message.error('Error creating shop');
    } finally {
      setCreating(false);
    }
  };

  // Delete handler
  const handleDelete = useCallback((shop: Shop) => {
    setItemToDelete(shop);
    setDeleteModalOpen(true);
  }, []);

  const displayColumns = useMemo(
    () => [
      {
        title: '',
        key: 'actions',
        width: 100,
        align: 'left' as const,
        render: (_: unknown, record: Shop) => (
          <div className="flex flex-row items-center justify-start gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
              title={sl.titleEdit}
              onClick={() => router.push(`/administration/settings/shops/detail/${encodeURIComponent(record.shop_code || '')}`)}
              style={{ verticalAlign: 'middle' }}
              type="button"
            >
              <EyeOutlined />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
              title={sl.titleDelete}
              onClick={() => handleDelete(record)}
              style={{ verticalAlign: 'middle' }}
              type="button"
            >
              <DeleteOutlined />
            </button>
          </div>
        ),
      },
      {
        title: sl.colShopCode,
        dataIndex: 'shop_code',
        key: 'shop_code',
        sorter: (a: Shop, b: Shop) => (a.shop_code || '').localeCompare(b.shop_code || ''),
        width: 140,
      },
      {
        title: sl.colShopName,
        dataIndex: 'name',
        key: 'name',
        sorter: (a: Shop, b: Shop) => (a.name || '').localeCompare(b.name || ''),
        width: 200,
      },
      {
        title: sl.colPhone,
        dataIndex: 'phone',
        key: 'phone',
        sorter: (a: Shop, b: Shop) => (a.phone || '').localeCompare(b.phone || ''),
        width: 150,
      },
      {
        title: sl.colAddress1,
        dataIndex: 'address1',
        key: 'address1',
        sorter: (a: Shop, b: Shop) => (a.address1 || '').localeCompare(b.address1 || ''),
        width: 250,
      },
      {
        title: sl.colAddress2,
        dataIndex: 'address2',
        key: 'address2',
        sorter: (a: Shop, b: Shop) => (a.address2 || '').localeCompare(b.address2 || ''),
        width: 200,
      },
      {
        title: sl.colDefaultWhcode,
        dataIndex: 'default_whcode',
        key: 'default_whcode',
        width: 260,
        sorter: (a: Shop, b: Shop) => String(a.default_whcode || '').localeCompare(String(b.default_whcode || '')),
        render: (v: string | null | undefined) => {
          const code = typeof v === 'string' ? v.trim() : '';
          if (!code) return '-';
          const whName = warehouseOptions.find((w) => w.shop_code === code)?.name;
          return whName ? `${code} - ${whName}` : code;
        },
      },
      {
        title: sl.colModified,
        dataIndex: 'modify_date',
        key: 'modify_date',
        width: 180,
        sorter: (a: Shop, b: Shop) => {
          if (!a.modify_date && !b.modify_date) return 0;
          if (!a.modify_date) return -1;
          if (!b.modify_date) return 1;
          return new Date(a.modify_date).getTime() - new Date(b.modify_date).getTime();
        },
        render: (date: string) => {
          if (!date) return '-';
          // Avoid hydration mismatch: server and client locale/timezone may differ.
          return mounted ? new Date(date).toLocaleString() : date;
        },
      },
    ],
    [router, sl, handleDelete, warehouseOptions]
  );

  // Button bar for shops actions
  const ShopsButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button 
        type="primary"
        icon={<PlusOutlined />}
        onClick={handleCreate}
      >
        {sl.add}
      </Button>
      <Button 
        icon={<FilterOutlined />}
        type={filters.search ? "primary" : "default"}
        onClick={() => setShowFilters(!showFilters)}
      >
        {sl.filters}
      </Button>
      <Button 
        icon={<ReloadOutlined />}
        onClick={refreshData}
        loading={loading}
      >
        {sl.refresh}
      </Button>
      <Button 
        onClick={() => {
          setFilters({});
        }}
      >
        {sl.clearAll}
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
            { label: bc.shops, current: true }
          ]} 
        />
      }
      buttonBar={ShopsButtonBar}
      title={sl.title}
      description={sl.description}
    >
      {/* Main Content Block */}
      <div className="px-8 py-6 bg-white">
        {/* Filter Section */}
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">{sl.filterOptions}</h4>
            <div className="flex gap-4 items-center flex-wrap mb-4">
              <div className="flex gap-2 items-center">
                <label className="font-bold text-gray-700 min-w-20">{sl.searchLabel}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={sl.searchPh}
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    type="primary"
                    onClick={() => {}}
                  >
                    {sl.search}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md text-red-800">
            <strong>{sl.errorLabel}</strong> {error}
          </div>
        )}

        {/* Data Display */}
        <Spin spinning={loading}>
          {!loading && data.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>{sl.noData}</p>
              {filters.search && <p>{sl.tryAdjustSearch}</p>}
            </div>
          ) : (
            <Table
              columns={displayColumns}
              dataSource={data}
              rowKey="shop_code"
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
        title={sl.deleteTitle}
        onOk={async () => {
          if (!itemToDelete) return;
          try {
            const res = await fetch('/api/shops', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                shop_code: itemToDelete.shop_code
              }),
            });
            const result = await res.json();
            
            if (result.success) {
              message.success(result.message || 'Shop deleted successfully');
              setItemToDelete(null);
              setDeleteModalOpen(false);
              refreshData();
            } else {
              message.error(result.error || 'Failed to delete shop');
            }
          } catch {
            message.error('Error deleting shop');
          }
        }}
        onCancel={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        okText={sl.okYes}
        cancelText={sl.cancel}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{itemToDelete ? sl.deleteConfirm(itemToDelete.shop_code) : ''}</span>
        </div>
      </Modal>

      {/* Create Shop Modal */}
      <Modal
        open={createModalOpen}
        title={sl.createTitle}
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
                <span className="text-red-600 font-medium">{sl.labelError}</span>
                <span className="ml-2 text-red-700">{modalError}</span>
              </div>
            </div>
          )}

          <Form.Item
            label={sl.labelShopCode}
            name="shop_code"
            rules={[{ required: true, message: sl.ruleShopCode }]}
          >
            <Input placeholder={sl.phShopCode} />
          </Form.Item>

          <Form.Item
            label={sl.labelShopName}
            name="name"
            rules={[{ required: true, message: sl.ruleShopName }]}
          >
            <Input placeholder={sl.phShopName} />
          </Form.Item>

          <Form.Item
            label={sl.labelPhone}
            name="phone"
            rules={[{ required: true, message: sl.rulePhone }]}
          >
            <Input placeholder={sl.phPhone} />
          </Form.Item>

          <Form.Item
            label={sl.labelAddress1}
            name="address1"
            rules={[{ required: true, message: sl.ruleAddress1 }]}
          >
            <Input placeholder={sl.phAddress1} />
          </Form.Item>

          <Form.Item
            label={sl.labelAddress2}
            name="address2"
          >
            <Input placeholder={sl.phAddress2} />
          </Form.Item>

          <Form.Item label={sl.labelDefaultWhcode} name="default_whcode">
            <Select
              placeholder={sl.phDefaultWhcode}
              allowClear
              showSearch
              optionFilterProp="label"
              options={warehouseOptions.map((w) => ({ value: w.shop_code, label: `${w.shop_code} - ${w.name}` }))}
            />
          </Form.Item>

          <Form.Item
            label={sl.labelIsWarehouse}
            name="is_warehouse"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch />
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
              {sl.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {creating ? sl.creating : sl.createShop}
            </button>
          </div>
        </Form>
      </Modal>
    </BasicPageLayout>
  );
}

export default function ShopsPage() {
  return (
    <Suspense
      fallback={
        <BasicPageLayout breadcrumb={null} buttonBar={null} title="" description="">
          <div className="px-8 py-12 text-center text-gray-500">Loading…</div>
        </BasicPageLayout>
      }
    >
      <ShopsPageContent />
    </Suspense>
  );
}
