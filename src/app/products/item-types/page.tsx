'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDataTable } from '@/hooks/useDataTable';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { PlusOutlined, EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Modal, Form, Input, Button, Table, Tooltip, Spin } from 'antd';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getItemTypeListTexts } from './i18n';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { invalidateItemTypesCache } from '@/hooks/useItemTypes';

interface DbItemType {
  type_code: string;
  name: string;
  [key: string]: string | number | null | undefined;
}

export default function ProductsItemTypesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getItemTypeListTexts(lang);
  const bc = getBreadcrumbLabels(lang);
  const [showFilters, setShowFilters] = useState(false);

  const {
    data,
    loading,
    pagination,
    filters,
    setFilters,
    refreshData,
    handleTableChange,
  } = useDataTable<DbItemType>({
    apiEndpoint: '/api/item-types',
    defaultPageSize: 10,
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<DbItemType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({
    type: null,
    text: null,
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayColumns = useMemo(
    () => [
      {
        title: t.list.colActions,
        key: 'actions',
        width: 100,
        align: 'left' as const,
        render: (_: unknown, record: DbItemType) => (
          <div className="flex flex-row items-center justify-start gap-2">
            <Tooltip title={t.list.editTitle}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                  aria-label={t.list.editTitle}
                  onClick={() => handleEdit(record)}
                  style={{ verticalAlign: 'middle' }}
                >
                  <EyeOutlined />
                </button>
              </span>
            </Tooltip>
            <Tooltip title={t.list.deleteAction}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
                  aria-label={t.list.deleteAction}
                  onClick={() => handleDelete(record)}
                  style={{ verticalAlign: 'middle' }}
                >
                  <DeleteOutlined />
                </button>
              </span>
            </Tooltip>
          </div>
        ),
      },
      {
        title: t.list.colCode,
        dataIndex: 'type_code',
        key: 'type_code',
        sorter: (a: DbItemType, b: DbItemType) =>
          Number(a.type_code || 0) - Number(b.type_code || 0) ||
          String(a.type_code || '').localeCompare(String(b.type_code || '')),
        width: 150,
      },
      {
        title: t.list.colName,
        dataIndex: 'name',
        key: 'name',
        sorter: (a: DbItemType, b: DbItemType) => (a.name || '').localeCompare(b.name || ''),
        width: 300,
      },
    ],
    [t]
  );

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

  const handleSearch = (value: string) => {
    setFilters({ ...filters, search: value });
  };

  const handleCreate = () => {
    setModalError(null);
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (values: Record<string, string>) => {
    setCreating(true);
    setModalError(null);
    try {
      const res = await fetch('/api/item-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_code: values.type_code,
          name: values.name,
        }),
      });
      const result = await res.json();

      if (result.success) {
        invalidateItemTypesCache();
        setPageMessage({
          type: 'success',
          text: t.list.createdSuccess,
        });
        setCreateModalOpen(false);
        createForm.resetFields();
        refreshData();
      } else {
        setModalError(result.error || t.list.failedCreate);
      }
    } catch (err) {
      console.error('Error creating item type:', err);
      setModalError(t.list.errorCreate);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (itemType: DbItemType) => {
    router.push(`/products/item-types/detail/${encodeURIComponent(itemType.type_code)}`);
  };

  const handleDelete = (itemType: DbItemType) => {
    setTypeToDelete(itemType);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!typeToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/item-types', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_code: typeToDelete.type_code }),
      });
      const result = await res.json();

      if (result.success === false && result.error && String(result.error).includes('used by')) {
        setDeleteModalOpen(false);
        setShowCannotDelete(true);
      } else if (result.success) {
        invalidateItemTypesCache();
        setPageMessage({
          type: 'success',
          text: t.list.deletedSuccess,
        });
        setTypeToDelete(null);
        setDeleteModalOpen(false);
        refreshData();
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.list.failedDelete,
        });
        setDeleteModalOpen(false);
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.list.errorDelete,
      });
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const buttonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
        {t.list.add}
      </Button>
      <Button
        icon={<FilterOutlined />}
        type={filters.search ? 'primary' : 'default'}
        onClick={() => setShowFilters(!showFilters)}
      >
        {t.list.filters}
      </Button>
      <Button icon={<ReloadOutlined />} onClick={refreshData} loading={loading}>
        {t.list.refresh}
      </Button>
      <Button
        onClick={() => {
          setFilters({ search: '' });
        }}
      >
        {t.list.clearAll}
      </Button>
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: bc.home, href: '/' },
            { label: bc.products, href: '/products' },
            { label: bc.itemTypes, current: true },
          ]}
        />
      }
      buttonBar={buttonBar}
      title={t.list.title}
      description=""
    >
      {pageMessage.type && pageMessage.text && (
        <div className="px-8 py-4">
          <div
            className={`p-4 rounded-md border ${
              pageMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="font-medium">
                  {pageMessage.type === 'success' ? t.list.successPrefix : t.list.errorPrefix}
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
      <div className="px-8 py-6 bg-white">
        <div className="mb-6">
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-300 rounded-md">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">{t.list.filterOptions}</h4>
              <div className="flex gap-4 items-center flex-wrap mb-4">
                <div className="flex gap-2 items-center">
                  <label className="font-bold text-gray-700 min-w-20">{t.list.searchLabel}</label>
                  <input
                    type="text"
                    placeholder={t.list.searchPlaceholder}
                    value={filters.search || ''}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[500px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => {}}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    {t.list.search}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Spin spinning={loading}>
          {!loading && data.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>{t.list.noData}</p>
              {filters.search && <p>{t.list.adjustSearch}</p>}
            </div>
          ) : (
            <Table
              columns={displayColumns}
              dataSource={data}
              rowKey="type_code"
              pagination={pagination}
              loading={false}
              onChange={handleTableChange}
              scroll={{ x: 800 }}
            />
          )}
        </Spin>
      </div>

      <Modal
        open={createModalOpen}
        title={t.list.modalCreateTitle}
        onCancel={() => {
          setCreateModalOpen(false);
          setModalError(null);
        }}
        footer={null}
        width={500}
        maskClosable={false}
        keyboard={false}
        centered
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateSubmit}>
          {modalError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <span className="text-red-600 font-medium">{t.list.modalErrorPrefix}</span>
                <span className="ml-2 text-red-700">{modalError}</span>
              </div>
            </div>
          )}

          <Form.Item
            label={t.list.labelCode}
            name="type_code"
            rules={[
              { required: true, message: t.list.codeRequired },
              {
                pattern: /^[1-9]\d{0,9}$/,
                message: t.list.codeNumeric,
              },
            ]}
          >
            <Input placeholder={t.list.codePlaceholder} />
          </Form.Item>

          <Form.Item
            label={t.list.labelName}
            name="name"
            rules={[{ required: true, message: t.list.nameRequired }]}
          >
            <Input placeholder={t.list.namePlaceholder} />
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
              {t.list.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {creating ? t.list.creating : t.list.createSubmit}
            </button>
          </div>
        </Form>
      </Modal>

      <Modal
        open={showCannotDelete}
        title={t.list.cannotDeleteTitle}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <button
            key="exit"
            onClick={() => setShowCannotDelete(false)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            {t.list.cancel}
          </button>,
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{t.list.cannotDeleteBody(typeToDelete?.type_code ?? '')}</p>
            <p className="text-gray-600 mt-1">{t.list.cannotDeleteHint}</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        title={t.list.deleteTitle}
        onCancel={() => {
          setDeleteModalOpen(false);
          setTypeToDelete(null);
        }}
        onOk={() => void handleDeleteConfirm()}
        okText={t.list.deleteAction}
        cancelText={t.list.cancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{t.list.deleteConfirm(typeToDelete?.type_code ?? '')}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.list.deleteCannotUndo}</p>
      </Modal>
    </BasicPageLayout>
  );
}
