'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Modal, Input, Button, Space } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getItemTypeListTexts } from '../../i18n';
import { getBreadcrumbLabels } from '@/lib/i18n/breadcrumbs';
import { invalidateItemTypesCache } from '@/hooks/useItemTypes';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';

interface DbItemType {
  type_code: string;
  name: string;
  [key: string]: string | number | null | undefined;
}

interface ItemTypeListResponse {
  success: boolean;
  data: DbItemType[];
  total: number;
  timestamp: string;
  error?: string;
}

interface FunctionBarProps {
  editMode: boolean;
  currentIndex: number;
  itemTypeList: DbItemType[];
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
    editItemType: string;
    save: string;
    cancel: string;
    delete: string;
  };
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  currentIndex,
  itemTypeList,
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
        <Button type="default" disabled={currentIndex <= 0} onClick={() => handleNavigate(currentIndex - 1)}>
          {L.previous}
        </Button>
      )}
      {!editMode && (
        <Button
          type="default"
          disabled={currentIndex === -1 || currentIndex >= itemTypeList.length - 1}
          onClick={() => handleNavigate(currentIndex + 1)}
        >
          {L.next}
        </Button>
      )}
      {!editMode && (
        <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
          {L.editItemType}
        </Button>
      )}
      {editMode && (
        <Button type="primary" onClick={handleSave}>
          {L.save}
        </Button>
      )}
      {editMode && <Button onClick={handleCancelEdit}>{L.cancel}</Button>}
      <Button danger type="primary" icon={<DeleteOutlined />} onClick={onDelete}>
        {L.delete}
      </Button>
    </Space>
  </div>
);

export default function ItemTypeDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getItemTypeListTexts(lang);
  const bc = getBreadcrumbLabels(lang);
  const params = useParams();
  const typeCode = decodeURIComponent(String(params.typeCode || ''));

  const [itemType, setItemType] = useState<DbItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({
    type: null,
    text: null,
  });
  const [allItemTypes, setAllItemTypes] = useState<DbItemType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [editItemType, setEditItemType] = useState<DbItemType | null>(null);

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

  const sameTypeCode = useCallback((a: string | number | null | undefined, b: string) => {
    return String(a ?? '').trim() === String(b ?? '').trim() || Number(a) === Number(b);
  }, []);

  const fetchItemTypeDetail = useCallback(async () => {
    if (!typeCode) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/item-types?search=${encodeURIComponent(typeCode)}&limit=1000`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result: ItemTypeListResponse = await res.json();

      if (result.success && result.data) {
        const found = result.data.find((row) => sameTypeCode(row.type_code, typeCode));
        if (found) {
          setItemType(found);
        } else {
          setPageMessage({
            type: 'error',
            text: t.detail.notFound,
          });
        }
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detail.failedFetch,
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detail.errorFetch,
      });
    } finally {
      setLoading(false);
    }
  }, [typeCode, sameTypeCode, t.detail.notFound, t.detail.failedFetch, t.detail.errorFetch]);

  const fetchAllItemTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/item-types?limit=1000');
      const result: ItemTypeListResponse = await res.json();

      if (result.success) {
        setAllItemTypes(result.data);
        const index = result.data.findIndex((row) => sameTypeCode(row.type_code, typeCode));
        setCurrentIndex(index);
      }
    } catch (err) {
      console.error('Error fetching all item types:', err);
    }
  }, [typeCode, sameTypeCode]);

  useEffect(() => {
    void fetchItemTypeDetail();
    void fetchAllItemTypes();
  }, [typeCode, fetchItemTypeDetail, fetchAllItemTypes]);

  const handleNavigate = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < allItemTypes.length) {
      const target = allItemTypes[newIndex];
      router.push(`/products/item-types/detail/${encodeURIComponent(target.type_code)}`);
    }
  };

  const handleEdit = () => {
    if (!itemType) return;
    setEditItemType({ ...itemType });
    setEditMode(true);
  };

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditItemType(null);
  }, []);

  const goToList = useCallback(() => {
    router.push('/products/item-types');
  }, [router]);

  const navigateBackFromDetail = useCallback(() => {
    if (editMode) {
      handleCancelEdit();
    } else {
      goToList();
    }
  }, [editMode, handleCancelEdit, goToList]);

  const backFromDetail = useBackNavigation(navigateBackFromDetail);

  const handleSave = async () => {
    if (!editItemType) return;

    try {
      const res = await fetch('/api/item-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_code: editItemType.type_code,
          name: editItemType.name,
        }),
      });
      const result = await res.json();

      if (result.success) {
        invalidateItemTypesCache();
        setPageMessage({
          type: 'success',
          text: t.detail.updated,
        });
        setEditMode(false);
        setEditItemType(null);
        void fetchItemTypeDetail();
        void fetchAllItemTypes();
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detail.failedUpdate,
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detail.errorUpdate,
      });
    }
  };

  const handleDelete = () => {
    if (!itemType) return;
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemType) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/item-types', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_code: itemType.type_code }),
      });
      const result = await res.json();

      if (result.success === false && result.error && String(result.error).includes('used by')) {
        setDeleteModalOpen(false);
        setShowCannotDelete(true);
      } else if (result.success) {
        invalidateItemTypesCache();
        setPageMessage({
          type: 'success',
          text: t.detail.deletedSuccess,
        });
        setDeleteModalOpen(false);
        setTimeout(() => {
          router.push('/products/item-types');
        }, 1200);
      } else {
        setPageMessage({
          type: 'error',
          text: result.error || t.detail.failedDelete,
        });
      }
    } catch {
      setPageMessage({
        type: 'error',
        text: t.detail.errorDelete,
      });
    } finally {
      setDeleting(false);
    }
  };

  const barLabels = {
    back: t.detail.back,
    previous: t.detail.previous,
    next: t.detail.next,
    editItemType: t.detail.editItemType,
    save: saveWithShortcutLabel(lang),
    cancel: t.detail.cancel,
    delete: t.detail.delete,
  };

  const breadcrumbItems = [
    { label: bc.home, href: '/' },
    { label: bc.products, href: '/products' },
    { label: bc.itemTypes, href: '/products/item-types' },
    { label: itemType?.type_code || t.detail.breadcrumbDetailFallback, current: true as const },
  ];

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={breadcrumbItems} />}
      buttonBar={
        <FunctionBar
          editMode={editMode}
          currentIndex={currentIndex}
          itemTypeList={allItemTypes}
          handleNavigate={handleNavigate}
          handleEdit={handleEdit}
          handleSave={() => void handleSave()}
          handleCancelEdit={handleCancelEdit}
          onBack={backFromDetail}
          onDelete={handleDelete}
          labels={barLabels}
        />
      }
      title={itemType?.name || t.detail.titleFallback}
      description={`${t.detail.descPrefix} ${itemType?.type_code || ''}`}
      actionBarSaveShortcut={{ onSave: () => void handleSave(), disabled: !editMode }}
    >
      {pageMessage.text && (
        <div
          className={`mb-4 p-4 rounded-md border ${
            pageMessage.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{pageMessage.text}</span>
            <button onClick={() => setPageMessage({ type: null, text: null })} className="text-gray-500 hover:text-gray-700">
              ×
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-600">{t.detail.loading}</p>
        </div>
      ) : itemType ? (
        <div className="px-8 py-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.detail.labelTypeCode}</label>
              {editMode && editItemType ? (
                <Input
                  value={editItemType.type_code}
                  disabled
                  className="p-3 bg-gray-50 border border-gray-200 rounded-md"
                />
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900">{itemType.type_code}</div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.detail.labelName}</label>
              {editMode && editItemType ? (
                <Input
                  value={editItemType.name || ''}
                  onChange={(e) => setEditItemType({ ...editItemType, name: e.target.value })}
                  className="p-3 border border-gray-200 rounded-md"
                />
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-900 min-h-[44px]">
                  {itemType.name || '-'}
                </div>
              )}
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
          <button
            key="exit"
            onClick={() => setShowCannotDelete(false)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            {t.detail.cancel}
          </button>,
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{t.detail.cannotDeleteBody(itemType?.type_code ?? '')}</p>
            <p className="text-gray-600 mt-1">{t.detail.cannotDeleteHint}</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        title={t.detail.deleteTitle}
        onCancel={() => setDeleteModalOpen(false)}
        onOk={() => void handleDeleteConfirm()}
        okText={t.detail.deleteOk}
        cancelText={t.detail.cancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{t.detail.deleteConfirm(itemType?.type_code ?? '')}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.detail.deleteCannotUndo}</p>
      </Modal>
    </BasicPageLayout>
  );
}
