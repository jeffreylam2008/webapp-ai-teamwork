'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Modal, Input, Button, Space } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCategoryListTexts } from '../../i18n';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { invalidateCategoriesCache } from '@/hooks/useCategories';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';

interface DbCategory {
  cate_code: string;
  desc: string;
  create_date?: string;
  modify_date?: string;
  [key: string]: string | number | null | undefined;
}

interface CategoryListResponse {
  success: boolean;
  data: DbCategory[];
  total: number;
  timestamp: string;
  error?: string;
}

interface FunctionBarProps {
  editMode: boolean;
  currentIndex: number;
  categoryList: DbCategory[];
  handleNavigate: (index: number) => void;
  handleEdit: () => void;
  handleSave: () => void;
  handleCancelEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  labels: {
    back: string;
    previous: string;
    next: string;
    editCategory: string;
    save: string;
    cancel: string;
    delete: string;
  };
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  currentIndex,
  categoryList,
  handleNavigate,
  handleEdit,
  handleSave,
  handleCancelEdit,
  onBack,
  onDelete,
  labels: L,
}) => (
  <div className="px-8 py-4 bg-white border-b border-gray-200 mb-4">
    <Space size="small" wrap align="center">
      {!editMode && (
        <Button type="default" icon={<ArrowLeftOutlined />} onClick={onBack}>
          {L.back}
        </Button>
      )}
      {!editMode && (
        <Button
          type="default"
          disabled={currentIndex <= 0}
          onClick={() => handleNavigate(currentIndex - 1)}
        >
          {L.previous}
        </Button>
      )}
      {!editMode && (
        <Button
          type="default"
          disabled={currentIndex === -1 || currentIndex >= categoryList.length - 1}
          onClick={() => handleNavigate(currentIndex + 1)}
        >
          {L.next}
        </Button>
      )}
      {!editMode && (
        <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
          {L.editCategory}
        </Button>
      )}
      {editMode && (
        <Button type="primary" onClick={handleSave}>
          {L.save}
        </Button>
      )}
      {editMode && (
        <Button onClick={handleCancelEdit}>{L.cancel}</Button>
      )}
      <Button danger type="primary" icon={<DeleteOutlined />} onClick={onDelete}>
        {L.delete}
      </Button>
    </Space>
  </div>
);

export default function CategoryDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getCategoryListTexts(lang);
  const bc = getBreadcrumbLabels(lang);
  const params = useParams();
  const cateCode = params.cateCode as string;

  const [category, setCategory] = useState<DbCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const [allCategories, setAllCategories] = useState<DbCategory[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [editCategory, setEditCategory] = useState<DbCategory | null>(null);

  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pageMessage.text) {
      messageTimeoutRef.current = setTimeout(() => {
        setPageMessage({ type: null, text: null });
      }, 10000);
    }
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [pageMessage]);

  const fetchCategoryDetail = useCallback(async () => {
    if (!cateCode) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/categories?search=${encodeURIComponent(cateCode)}&limit=1000`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result: CategoryListResponse = await res.json();

      if (result.success && result.data) {
        const foundCategory = result.data.find(cat => cat.cate_code === cateCode);
        if (foundCategory) {
          setCategory(foundCategory);
          // Do not set allCategories / currentIndex here: search= limits rows to a LIKE subset
          // and would break Previous/Next. The full list comes from fetchAllCategories only.
        } else {
          setPageMessage({
            type: 'error',
            text: t.detail.notFound
          });
        }
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detail.failedFetch
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detail.errorFetch
      });
    } finally {
      setLoading(false);
    }
  }, [cateCode, t.detail.notFound, t.detail.failedFetch, t.detail.errorFetch]);

  const fetchAllCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?limit=1000');
      const result: CategoryListResponse = await res.json();

      if (result.success) {
        setAllCategories(result.data);
        const index = result.data.findIndex(cat => cat.cate_code === cateCode);
        setCurrentIndex(index);
      }
    } catch (err) {
      console.error('Error fetching all categories:', err);
    }
  }, [cateCode]);

  useEffect(() => {
    fetchCategoryDetail();
    fetchAllCategories();
  }, [cateCode, fetchCategoryDetail, fetchAllCategories]);

  const handleNavigate = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < allCategories.length) {
      const targetCategory = allCategories[newIndex];
      router.push(
        `/products/categories/detail/${encodeURIComponent(targetCategory.cate_code)}`
      );
    }
  };

  const handleEdit = () => {
    if (!category) return;
    setEditCategory({ ...category });
    setEditMode(true);
  };

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditCategory(null);
  }, []);

  const goToCategoriesList = useCallback(() => {
    router.push('/products/categories');
  }, [router]);

  const navigateBackFromDetail = useCallback(() => {
    if (editMode) {
      handleCancelEdit();
    } else {
      goToCategoriesList();
    }
  }, [editMode, handleCancelEdit, goToCategoriesList]);

  const backFromDetail = useBackNavigation(navigateBackFromDetail);

  const handleSave = async () => {
    if (!editCategory) return;

    setEditMode(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCategory),
      });
      const result = await res.json();

      if (result.success) {
        invalidateCategoriesCache();
        setPageMessage({
          type: 'success',
          text: t.detail.updated
        });
        setEditMode(false);
        setEditCategory(null);
        fetchCategoryDetail();
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detail.failedUpdate
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detail.errorUpdate
      });
    } finally {
      setEditMode(false);
    }
  };

  const handleDelete = async () => {
    if (!category) return;

    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cate_code: category.cate_code }),
      });
      const result = await res.json();

      if (result.success === false && result.error && result.error.includes('used by')) {
        setShowCannotDelete(true);
      } else if (result.success === true) {
        setDeleteModalOpen(true);
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.list.unexpectedResponse
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.list.errorCheckDelete
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!category) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cate_code: category.cate_code }),
      });
      const result = await res.json();

      if (result.success) {
        invalidateCategoriesCache();
        setPageMessage({
          type: 'success',
          text: t.list.deletedSuccess
        });
        setDeleteModalOpen(false);
        setTimeout(() => {
          router.push('/products/categories');
        }, 1500);
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.list.failedDelete
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.list.errorDelete
      });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const barLabels = {
    back: t.detail.back,
    previous: t.detail.previous,
    next: t.detail.next,
    editCategory: t.detail.editCategory,
    save: saveWithShortcutLabel(lang),
    cancel: t.detail.cancel,
    delete: t.detail.delete,
  };

  const breadcrumbItems = [
    { label: bc.home, href: '/' },
    { label: bc.products, href: '/products' },
    { label: bc.categories, href: '/products/categories' },
    { label: category?.cate_code || t.detail.breadcrumbDetailFallback, current: true as const }
  ];

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb items={breadcrumbItems} />
      }
      buttonBar={
        <FunctionBar
          editMode={editMode}
          currentIndex={currentIndex}
          categoryList={allCategories}
          handleNavigate={handleNavigate}
          handleEdit={handleEdit}
          handleSave={handleSave}
          handleCancelEdit={handleCancelEdit}
          onBack={backFromDetail}
          onDelete={handleDelete}
          labels={barLabels}
        />
      }
      title={`📂 ${category?.desc || t.detail.titleFallback}`}
      description={`${t.detail.descPrefix} ${category?.cate_code || ''}`}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: !editMode }}
    >
      {pageMessage.text && (
        <div className={`mb-4 p-4 rounded-md border ${
          pageMessage.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <span>{pageMessage.text}</span>
            <button
              onClick={() => setPageMessage({ type: null, text: null })}
              className="text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600">{t.detail.loading}</p>
        </div>
      ) : category ? (
        <div className="px-8 py-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.detail.labelCategoryCode}
              </label>
              {editMode && editCategory ? (
                <Input
                  value={editCategory.cate_code}
                  disabled
                  className="p-3 bg-gray-50 border border-gray-200 rounded-md"
                />
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
                  {category.cate_code}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.detail.labelDescription}
              </label>
              {editMode && editCategory ? (
                <Input.TextArea
                  value={editCategory.desc || ''}
                  onChange={(e) => setEditCategory({ ...editCategory, desc: e.target.value })}
                  rows={3}
                  className="p-3 border border-gray-200 rounded-md"
                />
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900 min-h-[44px]">
                  {category.desc || '-'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.detail.labelCreateDate}
              </label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
                {formatDate(category.create_date)}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.detail.labelModifyDate}
              </label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
                {formatDate(category.modify_date)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-600">
          <p>{t.detail.notFoundDot}</p>
        </div>
      )}

      <Modal
        open={showCannotDelete}
        title={t.detail.cannotDeleteTitle}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <button key="exit" onClick={() => setShowCannotDelete(false)} className="px-4 py-2 bg-blue-600 text-white rounded-md">{t.detail.cancel}</button>
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{t.detail.cannotDeleteBody(category?.cate_code ?? '')}</p>
            <p className="text-gray-600 mt-1">{t.detail.cannotDeleteHint}</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        title={t.detail.deleteTitle}
        onCancel={() => {
          setDeleteModalOpen(false);
        }}
        onOk={handleDeleteConfirm}
        okText={t.detail.deleteOk}
        cancelText={t.detail.cancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{t.detail.deleteConfirm(category?.cate_code ?? '')}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.detail.deleteCannotUndo}</p>
      </Modal>
    </BasicPageLayout>
  );
}
