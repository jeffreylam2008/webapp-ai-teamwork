'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDataTable } from '@/hooks/useDataTable';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getProductItemTexts } from './i18n';
import { useCategories } from '@/hooks/useCategories';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, PictureOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import { Modal, message, Form, Input, InputNumber, Select, Upload, Button, Table, Tooltip, Spin } from 'antd';
import { formatCurrency } from '@/utils/formatCurrency';
import { prepareItemImageFileForUpload } from '@/lib/itemImageUpload';

interface DbItem {
  uid: number;
  item_code?: string;
  chi_name: string;
  eng_name: string;
  desc?: string;
  price?: number;
  price_special?: number;
  cate_code?: string;
  type: number;
  unit?: string;
  stock_on_hand?: number;
  image_name?: string;
  image_body?: string | null;
  create_date?: string;
  modify_date?: string;
  [key: string]: string | number | null | undefined;
}


export default function ProductsItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getProductItemTexts(lang), [lang]);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Use the optimized data table hook
  const {
    data,
    loading,
    pagination,
    filters,
    setFilters,
    refreshData,
    handleTableChange
  } = useDataTable<DbItem>({
    apiEndpoint: '/api/products',
    defaultPageSize: 10
  });

  // Get categories using the shared hook
  const { categories, loading: categoriesLoading } = useCategories();
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DbItem | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const [modalError, setModalError] = useState<string | null>(null);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDelete = useCallback(
    (record: DbItem) => {
      setItemToDelete(record);
      fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_code: record.item_code }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success === true && result.canDelete === false) {
            setShowCannotDelete(true);
          } else if (result.success === true && result.canDelete === true) {
            setDeleteModalOpen(true);
          } else {
            setPageMessage({
              type: 'error',
              text: result.error || t.messages.unexpectedResponse,
            });
          }
        })
        .catch(() => {
          setPageMessage({
            type: 'error',
            text: t.messages.errorCheckDelete,
          });
        });
    },
    [t.messages.errorCheckDelete, t.messages.unexpectedResponse]
  );

  const displayColumns = useMemo(
    () => [
    {
      title: '',
      key: 'actions',
      width: 100,
      align: 'left' as const,
      render: (_: unknown, record: DbItem) => (
        <div className="flex flex-row items-center justify-start gap-2">
          <Tooltip title={t.actions.edit}>
            <span className="inline-flex">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
                aria-label={t.actions.edit}
                onClick={() =>
                  router.push(`/products/items/detail/${encodeURIComponent(record.item_code || '')}`)
                }
                style={{ verticalAlign: 'middle' }}
              >
                <EyeOutlined />
              </button>
            </span>
          </Tooltip>
          <Tooltip title={t.actions.delete}>
            <span className="inline-flex">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
                aria-label={t.actions.delete}
                onClick={() => handleDelete(record)}
                style={{ verticalAlign: 'middle' }}
              >
                <DeleteOutlined />
              </button>
            </span>
          </Tooltip>
        </div>
      )
    },
    {
      title: t.columns.itemCode,
      dataIndex: 'item_code',
      key: 'item_code',
      sorter: (a: DbItem, b: DbItem) => (a.item_code || '').localeCompare(b.item_code || ''),
      width: 140,
    },
    {
      title: t.columns.engName,
      dataIndex: 'eng_name',
      key: 'eng_name',
      sorter: (a: DbItem, b: DbItem) => (a.eng_name || '').localeCompare(b.eng_name || ''),
      width: 250,
    },
    {
      title: t.columns.chiName,
      dataIndex: 'chi_name',
      key: 'chi_name',
      sorter: (a: DbItem, b: DbItem) => (a.chi_name || '').localeCompare(b.chi_name || ''),
      width: 250,
    },
    {
      title: t.columns.description,
      dataIndex: 'desc',
      key: 'desc',
      sorter: (a: DbItem, b: DbItem) => (a.desc || '').localeCompare(b.desc || ''),
      width: 200,
    },
    {
      title: t.columns.price,
      dataIndex: 'price',
      key: 'price',
      sorter: (a: DbItem, b: DbItem) => {
        const aPrice = a.price || 0;
        const bPrice = b.price || 0;
        return aPrice - bPrice;
      },
      width: 120,
      render: (price: number) => {
        if (price === null || price === undefined) return '-';
        return formatCurrency(price);
      },
    },
    {
      title: t.columns.unit,
      dataIndex: 'unit',
      key: 'unit',
      sorter: (a: DbItem, b: DbItem) => (a.unit || '').localeCompare(b.unit || ''),
      width: 180,
    },
    {
      title: t.columns.stockOnHand,
      dataIndex: 'stock_on_hand',
      key: 'stock_on_hand',
      sorter: (a: DbItem, b: DbItem) => (Number(a.stock_on_hand) || 0) - (Number(b.stock_on_hand) || 0),
      width: 120,
      align: 'right' as const,
      render: (val: number | string | null | undefined) => {
        const n = Number(val);
        if (Number.isNaN(n)) return '-';
        return (
          <span className="text-blue-600 font-medium tabular-nums">{n.toFixed(2)}</span>
        );
      },
    },
    {
      title: t.columns.created,
      dataIndex: 'create_date',
      key: 'create_date',
      sorter: (a: DbItem, b: DbItem) => {
        if (!a.create_date && !b.create_date) return 0;
        if (!a.create_date) return -1;
        if (!b.create_date) return 1;
        return new Date(a.create_date).getTime() - new Date(b.create_date).getTime();
      },
      width: 140,
      render: (dateString: string) => {
        if (!dateString) return '-';
        try {
          return new Date(dateString).toLocaleDateString();
        } catch {
          return dateString;
        }
      },
    },
    {
      title: t.columns.lastModified,
      dataIndex: 'modify_date',
      key: 'modify_date',
      sorter: (a: DbItem, b: DbItem) => {
        if (!a.modify_date && !b.modify_date) return 0;
        if (!a.modify_date) return -1;
        if (!b.modify_date) return 1;
        return new Date(a.modify_date).getTime() - new Date(b.modify_date).getTime();
      },
      width: 140,
      render: (dateString: string) => {
        if (!dateString) return '-';
        try {
          return new Date(dateString).toLocaleDateString();
        } catch {
          return dateString;
        }
      },
    }
  ],
    [t, router, handleDelete]
  );

  const handleAdd = () => {
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (values: Record<string, unknown>) => {
    setCreating(true);
    setModalError(null);
    
    try {
      const formData = new FormData();
      
      // Add form fields
      Object.keys(values).forEach(key => {
        if (values[key] !== undefined && values[key] !== null) {
          formData.append(key, String(values[key]));
        }
      });
      
      // Add image file if present
      if (imageFile) {
        formData.append('image', imageFile);
      }
      
      const response = await fetch('/api/products', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(t.messages.itemCreated);
        setCreateModalOpen(false);
        setImageFile(null);
        setPreviewImage(null);
        createForm.resetFields();
        refreshData();
      } else {
        setModalError(result.error || t.messages.failedCreate);
      }
    } catch {
      setModalError(t.messages.errorCreate);
    } finally {
      setCreating(false);
    }
  };

  const handleImageChange = async (info: { file?: { originFileObj?: File } | File }) => {
    let file: File | undefined;
    if (info.file && typeof info.file === 'object' && 'originFileObj' in info.file) {
      file = info.file.originFileObj;
    } else if (info.file instanceof File) {
      file = info.file;
    }

    if (!file) return;
    try {
      const prepared = await prepareItemImageFileForUpload(file);
      setImageFile(prepared);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(prepared);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      message.error(code === 'FILE_TOO_LARGE' ? t.detail.imageTooLarge : t.detail.imageCompressFailed);
    }
  };

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

  // Function bar for product items actions
  const ProductItemsButtonBar = (
    <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4 flex gap-2">
      <Button 
        type="primary"
        icon={<PlusOutlined />}
        onClick={handleAdd}
      >
        {t.buttonBar.addItem}
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
          setFilters({ search: '' });
        }}
      >
        {t.buttonBar.clearAll}
      </Button>
    </div>
  );

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={[
        { label: t.breadcrumb.home, href: '/' },
        { label: t.breadcrumb.products, href: '/products' },
        { label: t.breadcrumb.items, current: true }
      ]} />}
      buttonBar={ProductItemsButtonBar}
      title={
        typeof pagination.total === 'number'
          ? t.page.titleWithCount(pagination.total)
          : t.page.title
      }
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
                onClick={() => setPageMessage({ type: null, text: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <Spin spinning={loading}>
      <div className="px-8 py-6 bg-white">
        {/* Filter Section */}
        <div className="mb-6">
          <div className="flex gap-4 items-center flex-wrap mb-4">
            <div className="flex gap-2 items-center">
              <label className="font-bold text-gray-700 min-w-20">{t.filters.searchLabel}</label>
              <input
                type="text"
                placeholder={t.filters.searchPlaceholder}
                value={filters.search || ''}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2 items-center">
              <label className="font-bold text-gray-700 min-w-20">{t.filters.categoryLabel}</label>
              <select
                value={filters.cate_code || ''}
                onChange={(e) => setFilters({ ...filters, cate_code: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t.filters.allCategories}</option>
                {categories.map(cat => (
                  <option key={cat.cate_code} value={cat.cate_code}>
                    {cat.desc} ({cat.cate_code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Filter Section */}
        <div className="mb-6">
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-300 rounded-md">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">{t.filters.filterOptionsTitle}</h4>
              
              {/* Search Controls */}
              <div className="flex gap-4 items-center flex-wrap mb-4">
                <div className="flex gap-2 items-center">
                  <label className="font-bold text-gray-700 min-w-20">{t.filters.searchLabel}</label>
                  <input
                    type="text"
                    placeholder={t.filters.searchPlaceholderLong}
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-md min-w-[500px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => {}}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    {t.filters.search}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Data Table */}
        <Table
          columns={displayColumns}
          dataSource={data}
          rowKey="uid"
          pagination={pagination}
          loading={false}
          scroll={{ x: 1200 }}
          onChange={handleTableChange}
        />
      </div>
      </Spin>
      {/* Modal for cannot delete */}
      <Modal
        open={showCannotDelete}
        title={t.cannotDeleteModal.title}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <Button key="exit" onClick={() => setShowCannotDelete(false)}>{t.cannotDeleteModal.cancel}</Button>
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{itemToDelete?.item_code != null ? t.cannotDeleteModal.body(itemToDelete.item_code) : ''}</p>
            <p className="text-gray-600 mt-1">{t.cannotDeleteModal.explanation}</p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.deleteModal.title}
        onOk={async () => {
          if (!itemToDelete) return;
          try {
            const res = await fetch('/api/products', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                item_code: itemToDelete.item_code,
                confirm: true 
              }),
            });
            const result = await res.json();
            
            if (result.success && result.deleted) {
              setPageMessage({
                type: 'success',
                text: result.message || t.messages.itemDeleted
              });
              setItemToDelete(null);
              setDeleteModalOpen(false);
              refreshData();
            } else {
              setPageMessage({
                type: 'error',
                text: result.error || t.messages.failedDelete
              });
            }
          } catch {
            setPageMessage({
              type: 'error',
              text: t.messages.errorDelete
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
          <span>{itemToDelete?.item_code != null ? t.deleteModal.confirm(itemToDelete.item_code) : ''}</span>
        </div>
      </Modal>

      {/* Create Item Modal */}
      <Modal
        open={createModalOpen}
        title={t.createModal.title}
        onCancel={() => {
          setCreateModalOpen(false);
          setImageFile(null);
          setPreviewImage(null);
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
          initialValues={{ type: 1 }}
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
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              label={t.createModal.form.itemCode}
              name="item_code"
              rules={[{ required: true, message: t.createModal.form.itemCodeRequired }]}
            >
              <Input placeholder={t.createModal.form.itemCodePlaceholder} />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.type}
              name="type"
              rules={[{ required: true, message: t.createModal.form.typeRequired }]}
            >
              <Select>
                <Select.Option value={1}>{t.type.product}</Select.Option>
                <Select.Option value={2}>{t.type.service}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              label={t.createModal.form.engName}
              name="eng_name"
              rules={[{ required: true, message: t.createModal.form.engNameRequired }]}
            >
              <Input placeholder={t.createModal.form.engNamePlaceholder} />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.chiName}
              name="chi_name"
              rules={[{ required: true, message: t.createModal.form.chiNameRequired }]}
            >
              <Input placeholder={t.createModal.form.chiNamePlaceholder} />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.description}
              name="desc"
            >
              <Input.TextArea rows={2} placeholder={t.createModal.form.descriptionPlaceholder} />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.unit}
              name="unit"
            >
              <Input placeholder={t.createModal.form.unitPlaceholder} />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.price}
              name="price"
            >
              <InputNumber
                min={0}
                step={0.01}
                placeholder={t.createModal.form.pricePlaceholder}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.specialPrice}
              name="price_special"
            >
              <InputNumber
                min={0}
                step={0.01}
                placeholder={t.createModal.form.specialPricePlaceholder}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              label={t.createModal.form.category}
              name="cate_code"
            >
              <Select
                placeholder={t.createModal.form.categoryPlaceholder}
                loading={categoriesLoading}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={categories.map(cat => ({ value: cat.cate_code, label: `${cat.desc} (${cat.cate_code})` }))}
              />
            </Form.Item>
          </div>
          
          <Form.Item
            label={t.createModal.productImage}
            name="image"
          >
            <Upload
              beforeUpload={() => false}
              onChange={handleImageChange}
              showUploadList={false}
              accept="image/*"
            >
              <Button icon={<PictureOutlined />}>{t.createModal.chooseImage}</Button>
            </Upload>
            {previewImage && (
              <div className="mt-2">
                <img
                  src={previewImage}
                  alt=""
                  style={{ maxWidth: '200px', maxHeight: '200px' }}
                  className="border rounded"
                />
              </div>
            )}
          </Form.Item>
          
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setCreateModalOpen(false)}>
              {t.createModal.cancel}
            </Button>
            <Button type="primary" htmlType="submit" loading={creating}>
              {t.createModal.create}
            </Button>
          </div>
        </Form>
      </Modal>
    </BasicPageLayout>
  );
}