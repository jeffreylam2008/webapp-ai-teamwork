'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, Space, Typography, Row, Col, Descriptions, Alert, Button, Spin, Input, InputNumber, Select, Upload, App, Modal, Table, Tag } from 'antd';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined, PictureOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getProductItemTexts } from '../../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatCurrency } from '@/utils/formatCurrency';
import { prepareItemImageFileForUpload } from '@/lib/itemImageUpload';
import { hasItemImage, imageBodyToDataUrl } from '@/lib/itemImageDisplay';

const { Text } = Typography;

/** File picker filter + validation: JPG, JPEG, PNG only. */
const ITEM_IMAGE_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';

function isAllowedItemImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/png') return true;
  const name = (file.name || '').toLowerCase();
  return /\.(jpe?g|png)$/.test(name);
}

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
  image_name?: string;
  image_body?: string | null;
  create_date?: string;
  modify_date?: string;
  [key: string]: string | number | null | undefined;
}

interface DbResponse {
  success: boolean;
  data: DbItem[];
  total: number;
  timestamp: string;
  message?: string;
  error?: string;
}

interface Category {
  cate_code: string;
  desc: string;
}

interface CategoriesResponse {
  success: boolean;
  data: Category[];
  timestamp: string;
  message?: string;
  error?: string;
}

interface Warehouse {
  uid: number;
  item_code: string;
  stock_on_hand: number; // This maps to qty from database
  type: string;
  create_date?: string;
  modify_date?: string;
}

interface WarehouseResponse {
  success: boolean;
  data: Warehouse[];
  total: number;
  timestamp: string;
  message?: string;
  error?: string;
}

type ItemPageTexts = ReturnType<typeof getProductItemTexts>;

interface FunctionBarProps {
  editMode: boolean;
  currentIndex: number;
  itemList: string[];
  handleNavigate: (index: number) => void;
  handleEdit: () => void;
  handleSave: () => void;
  handleCancelEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  texts: ItemPageTexts;
  saveLabel: string;
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  currentIndex,
  itemList,
  handleNavigate,
  handleEdit,
  handleSave,
  handleCancelEdit,
  onBack,
  onDelete,
  texts,
  saveLabel,
}) => {
  const d = texts.detail;
  return (
    <div className="px-8 py-4 bg-white border-b border-gray-200 mb-4">
      <Space size="small" wrap align="center">
        {!editMode && (
          <Button type="default" icon={<ArrowLeftOutlined />} onClick={onBack}>
            {d.back}
          </Button>
        )}
        {!editMode && (
          <Button
            type="default"
            disabled={currentIndex <= 0}
            onClick={() => handleNavigate(currentIndex - 1)}
          >
            {d.previous}
          </Button>
        )}
        {!editMode && (
          <Button
            type="default"
            disabled={currentIndex === -1 || currentIndex >= itemList.length - 1}
            onClick={() => handleNavigate(currentIndex + 1)}
          >
            {d.next}
          </Button>
        )}
        {!editMode && (
          <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
            {d.editItem}
          </Button>
        )}
        {editMode && (
          <Button type="primary" onClick={handleSave}>
            {saveLabel}
          </Button>
        )}
        {editMode && (
          <Button onClick={handleCancelEdit}>{d.cancel}</Button>
        )}
        <Button danger type="primary" icon={<DeleteOutlined />} onClick={onDelete}>
          {d.delete}
        </Button>
      </Space>
    </div>
  );
};

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getProductItemTexts(lang), [lang]);
  const { message: messageApi } = App.useApp();
  const itemCode = params.itemCode as string;
  const { token } = useAuth();

  const [item, setItem] = useState<DbItem | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemList, setItemList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [editMode, setEditMode] = useState(false);
  const [editItem, setEditItem] = useState<DbItem | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [categories, setCategories] = useState<{ cate_code: string; desc: string }[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalStockOnHand = useMemo(() => {
    return warehouses.reduce((sum, w) => sum + (Number(w.stock_on_hand) || 0), 0);
  }, [warehouses]);

  const beforeUploadItemImage = useCallback(
    (file: File) => {
      if (!isAllowedItemImageFile(file)) {
        messageApi.error(t.detail.invalidImageType);
        return Upload.LIST_IGNORE;
      }
      return false;
    },
    [messageApi, t]
  );

  // Fetch category information
  const fetchCategoryInfo = async (cateCode: string) => {
    try {
      const response = await fetch(`/api/categories?search=${encodeURIComponent(cateCode)}&limit=1`);
      const result: CategoriesResponse = await response.json();
      if (result.success && result.data.length > 0) {
        setCategory(result.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch category info:', err);
    }
  };

  // Fetch warehouse data for the item
  const fetchWarehouseData = useCallback(
    async (code: string) => {
      try {
        const response = await fetchWithAuth(
          `/api/warehouse?item_code=${encodeURIComponent(code)}`,
          token
        );
        const result: WarehouseResponse = await response.json();
        if (result.success) {
          setWarehouses(result.data);
        } else {
          console.error('Failed to fetch warehouse data:', result.error);
        }
      } catch (err) {
        console.error('Warehouse fetch error:', err);
      }
    },
    [token]
  );

  // Fetch item details
  const fetchItemDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch item by item_code
      const response = await fetch(`/api/products?item_code=${encodeURIComponent(itemCode)}&limit=1`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result: DbResponse = await response.json();
      
      if (result.success && result.data.length > 0) {
        const itemData = result.data[0];
        setItem(itemData);
        // Fetch category information if cate_code exists
        if (itemData.cate_code) {
          await fetchCategoryInfo(itemData.cate_code);
        }
        // Fetch warehouse data for the item
        if (itemData.item_code) {
          await fetchWarehouseData(itemData.item_code);
        }
      } else {
        setError(t.detail.itemNotFound);
      }
    } catch (err) {
      console.error('Error fetching item details:', err);
      setError(err instanceof Error ? err.message : t.detail.fetchError);
    } finally {
      setLoading(false);
    }
  }, [itemCode, t.detail.fetchError, t.detail.itemNotFound, fetchWarehouseData]);

  // Fetch all item codes for navigation
  const fetchItemList = async () => {
    try {
      // Fetch all item codes (adjust limit as needed)
      const response = await fetch('/api/products?limit=1000');
      const result: DbResponse = await response.json();
      if (result.success) {
        const codes = result.data
          .map((it) => it.item_code)
          .filter((code): code is string => typeof code === 'string');
        setItemList(codes);
      }
    } catch {
      // Ignore errors for navigation list
    }
  };

  // Update current index when itemList or itemCode changes
  useEffect(() => {
    if (itemList.length > 0 && itemCode) {
      setCurrentIndex(itemList.findIndex((code) => code === itemCode));
    }
  }, [itemList, itemCode]);

  useEffect(() => {
    setItem(null);
    setLoading(true);
  }, [itemCode]);

  useEffect(() => {
    fetchItemList();
  }, []);

  useEffect(() => {
    if (itemCode) {
      fetchItemDetails();
    }
  }, [itemCode, fetchItemDetails]);

  useEffect(() => {
    if (item && item.image_body) {
      // No debug logging
    }
  }, [item]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/categories?limit=1000');
        const result = await res.json();
        if (result.success) {
          setCategories(result.data.map((cat: { cate_code: string; desc: string }) => ({
            cate_code: cat.cate_code,
            desc: cat.desc,
          })));
        }
      } catch {
        // Optionally handle error
      }
    };
    fetchCategories();
  }, []);

  const formatDate = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  }, []);

  const warehouseColumns = useMemo(
    () => [
      {
        title: t.detail.warehouseColumns.qty,
        dataIndex: 'stock_on_hand',
        key: 'stock_on_hand',
        width: 120,
        render: (qty: number) => <Text strong>{Number(qty || 0).toFixed(2)}</Text>,
      },
      {
        title: t.detail.warehouseColumns.type,
        dataIndex: 'type',
        key: 'type',
        width: 120,
        render: (type: string) => {
          const ty = String(type || '').toLowerCase();
          const color = ty === 'in' ? 'green' : ty === 'out' ? 'red' : ty === 'hold' ? 'orange' : 'default';
          return <Tag color={color}>{type || '-'}</Tag>;
        },
      },
      {
        title: t.detail.warehouseColumns.updated,
        dataIndex: 'modify_date',
        key: 'modify_date',
        width: 160,
        render: (d: string) => formatDate(d),
      },
    ],
    [formatDate, t.detail.warehouseColumns]
  );

  // Helper function to format price
  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '-';
    return formatCurrency(price);
  };

  const getTypeDescription = useCallback(
    (type: number) => {
      const typeMap: { [key: number]: string } = {
        1: t.type.product,
        2: t.type.service,
        3: t.type.component,
        4: t.type.material,
      };
      return typeMap[type] ?? t.type.unknown(type);
    },
    [t.type]
  );

  // Replace navigation button handlers with shallow routing and state update
  const handleNavigate = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < itemList.length) {
      setCurrentIndex(newIndex);
      // Update the URL without a full reload (no shallow option)
      router.replace(`/products/items/detail/${encodeURIComponent(itemList[newIndex])}`);
      // Fetch new item details for the new item code
      fetchItemDetailsForCode(itemList[newIndex]);
    }
  };

  // Add this helper function (copy of fetchItemDetails, but takes itemCode as argument):
  const fetchItemDetailsForCode = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/products?item_code=${encodeURIComponent(code)}&limit=1`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const result: DbResponse = await response.json();
      if (result.success && result.data.length > 0) {
        const itemData = result.data[0];
        setItem(itemData);
        if (itemData.cate_code) {
          await fetchCategoryInfo(itemData.cate_code);
        }
        if (itemData.item_code) {
          await fetchWarehouseData(itemData.item_code);
        }
      } else {
        setError(t.detail.itemNotFound);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.detail.fetchError);
    } finally {
      setLoading(false);
    }
  };

  // When entering edit mode, copy item to editItem
  const handleEdit = () => {
    setEditItem(item ? { ...item } : null);
    setEditMode(true);
    setPreviewImage(null);
    setPendingImageFile(null);
  };

  // Cancel edit mode
  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditItem(null);
    setPreviewImage(null);
    setPendingImageFile(null);
  }, []);

  const goToItemsList = useCallback(() => {
    router.push('/products/items');
  }, [router]);

  /** Back / browser back / shortcuts: leave edit → stay on detail; otherwise → items list */
  const navigateBackFromDetail = useCallback(() => {
    if (editMode) {
      handleCancelEdit();
    } else {
      goToItemsList();
    }
  }, [editMode, handleCancelEdit, goToItemsList]);

  const backFromDetail = useBackNavigation(navigateBackFromDetail);

  // Handle input changes
  const handleFieldChange = (field: keyof DbItem, value: string | number | null) => {
    if (!editItem) return;
    setEditItem({ ...editItem, [field]: value });
  };

  // Handle image upload
  const handleImageChange = async (info: { file?: { originFileObj?: File } | File }) => {
    let file: File | undefined;

    if (info.file && typeof info.file === 'object' && 'originFileObj' in info.file) {
      file = info.file.originFileObj;
    } else if (info.file instanceof File) {
      file = info.file;
    }

    if (!file) return;
    if (!isAllowedItemImageFile(file)) {
      messageApi.error(t.detail.invalidImageType);
      return;
    }
    try {
      const prepared = await prepareItemImageFileForUpload(file);
      setPendingImageFile(prepared);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1];
        setPreviewImage(base64 ?? null);
      };
      reader.readAsDataURL(prepared);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FILE_TOO_LARGE') {
        messageApi.error(t.detail.imageTooLarge);
      } else {
        messageApi.error(t.detail.imageCompressFailed);
      }
    }
  };

  // Remove temp image
  const handleRemoveTempImage = () => {
    setPreviewImage(null);
    setPendingImageFile(null);
  };

  const handleSave = async () => {
    if (!editItem || !editItem.uid) {
      messageApi.error(t.messages.noItemToUpdate);
      return;
    }
    const appendFields = (target: FormData) => {
      target.append('uid', String(editItem.uid));
      if (editItem.item_code) target.append('item_code', editItem.item_code);
      target.append('eng_name', editItem.eng_name);
      target.append('chi_name', editItem.chi_name);
      target.append('desc', editItem.desc ?? '');
      target.append('price', editItem.price != null ? String(editItem.price) : '');
      target.append('price_special', editItem.price_special != null ? String(editItem.price_special) : '');
      target.append('cate_code', editItem.cate_code ?? '');
      target.append('type', String(editItem.type));
      target.append('unit', editItem.unit ?? '');
    };
    try {
      const response = pendingImageFile
        ? await (() => {
            const formData = new FormData();
            appendFields(formData);
            formData.append('image', pendingImageFile);
            return fetch('/api/products', { method: 'PATCH', body: formData });
          })()
        : await fetch('/api/products', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: editItem.uid,
              item_code: editItem.item_code,
              eng_name: editItem.eng_name,
              chi_name: editItem.chi_name,
              desc: editItem.desc ?? null,
              price: editItem.price ?? null,
              price_special: editItem.price_special ?? null,
              cate_code: editItem.cate_code ?? null,
              type: editItem.type,
              unit: editItem.unit ?? null,
            }),
          });
      const result = await response.json();
      if (result.success) {
        messageApi.success(t.messages.itemUpdated);
        router.push('/products/items');
      } else {
        messageApi.error(result.error || t.messages.failedSave);
      }
    } catch {
      messageApi.error(t.messages.errorSave);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    
    // First check if the item can be deleted
    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_code: item.item_code }),
      });
      const result = await res.json();
      
      if (result.success === true && result.canDelete === false) {
        // Item cannot be deleted - show cannot delete modal
        setShowCannotDelete(true);
      } else if (result.success === true && result.canDelete === true) {
        // Item can be deleted - show confirmation modal
        setDeleteModalOpen(true);
      } else {
        // Unexpected response or error
        messageApi.error(result.error || t.messages.unexpectedServer);
      }
    } catch {
      messageApi.error(t.messages.errorCheckDeleteDetail);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!item) return;
    
    setDeleting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          item_code: item.item_code,
          confirm: true 
        }),
      });
      const result = await res.json();
      
      if (result.success && result.deleted) {
        messageApi.success(result.message || t.messages.itemDeleted);
        setDeleteModalOpen(false);
        // Navigate back to items list after a short delay
        setTimeout(() => {
          router.push('/products/items');
        }, 1500);
      } else {
        messageApi.error(result.error || t.messages.failedDelete);
      }
    } catch {
      messageApi.error(t.messages.errorDelete);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: t.breadcrumb.home, href: '/' },
              { label: t.breadcrumb.products, current: true },
              { label: t.breadcrumb.items, href: '/products/items' },
              { label: t.breadcrumb.loading, current: true }
            ]} 
          />
        }
        buttonBar={null}
      >
        <div className="px-8 py-6 bg-gray-50">
          <div className="text-center py-8">
            <Spin size="large" />
            <p className="text-gray-600 mt-4">{t.detail.loadingDetails}</p>
          </div>
        </div>
      </BasicPageLayout>
    );
  }

  if (error || !item) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: t.breadcrumb.home, href: '/' },
              { label: t.breadcrumb.products, current: true },
              { label: t.breadcrumb.items, href: '/products/items' },
              { label: t.breadcrumb.error, current: true }
            ]} 
          />
        }
        buttonBar={null}
      >
        <Alert
          message={t.detail.notFoundTitle}
          description={error || t.detail.notFoundDescription}
          type="error"
          showIcon
          action={
            <Button 
              type="primary" 
              onClick={goToItemsList}
            >
              {t.detail.backToItems}
            </Button>
          }
        />
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb 
          items={[
            { label: t.breadcrumb.home, href: '/' },
            { label: t.breadcrumb.products, current: true },
            { label: t.breadcrumb.items, href: '/products/items' },
            { label: item.item_code || t.breadcrumb.itemDetail, current: true }
          ]} 
        />
      }
      buttonBar={
        <FunctionBar
          editMode={editMode}
          currentIndex={currentIndex}
          itemList={itemList}
          handleNavigate={handleNavigate}
          handleEdit={handleEdit}
          handleSave={handleSave}
          handleCancelEdit={handleCancelEdit}
          onBack={backFromDetail}
          onDelete={handleDelete}
          texts={t}
          saveLabel={saveWithShortcutLabel(lang)}
        />
      }
      title={t.detail.title(item.eng_name)}
      description={t.detail.description(item.item_code || '')}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: !editMode }}
    >
      {/* Main Content */}
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          {/* Product Image */}
          <Col xs={24} lg={8}>
            <Card title={t.detail.cardProductImage} size="small">
              <div className="text-center">
                <div className="w-[200px] h-[200px] bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mx-auto overflow-hidden">
                  {editMode ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <Upload
                        showUploadList={false}
                        beforeUpload={beforeUploadItemImage}
                        onChange={handleImageChange}
                        accept={ITEM_IMAGE_ACCEPT}
                        key={previewImage || (editItem?.image_body || '')} // force re-render on removal
                      >
                        {previewImage ? (
                          <img
                            src={`data:image/jpeg;base64,${previewImage}`}
                            alt={editItem?.eng_name}
                            className="w-full h-full object-cover"
                          />
                        ) : hasItemImage(editItem?.image_body) ? (
                          <img
                            src={imageBodyToDataUrl(editItem?.image_body, editItem?.image_name) || undefined}
                            alt={editItem?.eng_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-gray-500 text-center flex flex-col items-center justify-center h-full px-2">
                            <PictureOutlined style={{ fontSize: 48 }} />
                            <div className="text-sm">{t.detail.uploadImage}</div>
                            <div className="text-xs mt-1 opacity-80">{t.detail.imageFileTypesHint}</div>
                          </div>
                        )}
                      </Upload>
                      {/* Show remove button if a temp image is buffered */}
                      {previewImage && (
                        <Button
                          size="small"
                          danger
                          style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
                          onClick={handleRemoveTempImage}
                        >
                          {t.detail.remove}
                        </Button>
                      )}
                    </div>
                  ) : (
                    hasItemImage(item.image_body) ? (
                      <img
                        src={imageBodyToDataUrl(item.image_body, item.image_name) || undefined}
                        alt={item.eng_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-gray-500 text-center flex flex-col items-center justify-center h-full">
                        <PictureOutlined style={{ fontSize: 48 }} />
                        <div className="text-sm">{t.detail.noImage}</div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </Card>
          </Col>

          {/* Basic Information */}
          <Col xs={24} lg={8}>
            <Card title={t.detail.basicInfo} size="small">
              {editMode && editItem ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.itemCode}>
                    <Input value={editItem.item_code} disabled />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.engName}>
                    <Input value={editItem.eng_name} onChange={e => handleFieldChange('eng_name', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.chiName}>
                    <Input value={editItem.chi_name} onChange={e => handleFieldChange('chi_name', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.description}>
                    <Input.TextArea value={editItem.desc} onChange={e => handleFieldChange('desc', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.type}>
                    <Select
                      value={editItem.type}
                      onChange={value => handleFieldChange('type', value)}
                      style={{ width: '100%' }}
                      options={[
                        { value: 1, label: t.type.product },
                        { value: 2, label: t.type.service },
                        { value: 3, label: t.type.component },
                        { value: 4, label: t.type.material },
                      ]}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.unit}>
                    <Input value={editItem.unit} onChange={e => handleFieldChange('unit', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.stockOnHand}>
                    <Text strong style={{ color: totalStockOnHand > 0 ? '#52c41a' : '#999' }}>
                      {totalStockOnHand.toFixed(2)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.category}>
                    <Select
                      value={editItem.cate_code}
                      onChange={value => handleFieldChange('cate_code', value)}
                      style={{ width: '100%' }}
                      showSearch
                      optionFilterProp="children"
                      options={categories.map(cat => ({
                        value: cat.cate_code,
                        label: `${cat.desc} (${cat.cate_code})`,
                      }))}
                      placeholder={t.detail.labels.categoryPlaceholder}
                      filterOption={(input, option) =>
                        (option?.label as string).toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.itemCode}>
                    <Text strong>{item.item_code || '-'}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.engName}>
                    {item.eng_name}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.chiName}>
                    {item.chi_name}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.description}>
                    {item.desc || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.type}>
                    {getTypeDescription(item.type)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.unit}>
                    {item.unit || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.stockOnHand}>
                    <Text strong style={{ color: totalStockOnHand > 0 ? '#52c41a' : '#999' }}>
                      {totalStockOnHand.toFixed(2)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.category}>
                    {category ? (
                      <span>
                        {category.desc} <Text type="secondary">({category.cate_code})</Text>
                      </span>
                    ) : (
                      item.cate_code || '-'
                    )}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* Pricing Information */}
          <Col xs={24} lg={8}>
            <Card title={t.detail.pricingInfo} size="small">
              {editMode && editItem ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.regularPrice}>
                    <InputNumber
                      value={editItem.price}
                      onChange={value => handleFieldChange('price', value)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.specialPrice}>
                    <InputNumber
                      value={editItem.price_special}
                      onChange={value => handleFieldChange('price_special', value)}
                      min={0}
                      style={{ width: '100%' }}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.regularPrice}>
                    <Text strong style={{ color: '#1890ff' }}>
                      {formatPrice(item.price)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.specialPrice}>
                    <Text strong style={{ color: '#52c41a' }}>
                      {formatPrice(item.price_special)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* Warehouse Information */}
          <Col xs={24} lg={8}>
            <Card title={t.detail.warehouseStock} size="small">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {t.detail.totalStock} <Text strong>{totalStockOnHand.toFixed(2)}</Text>
                </div>
                <Tag color={totalStockOnHand > 0 ? 'green' : 'default'}>
                  {totalStockOnHand > 0 ? t.detail.inStock : t.detail.noStock}
                </Tag>
              </div>
              {warehouses.length > 0 ? (
                <Table<Warehouse>
                  columns={warehouseColumns}
                  dataSource={warehouses}
                  rowKey={(r) => String(r.uid)}
                  pagination={false}
                  size="small"
                  scroll={{ x: 450 }}
                />
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <div className="text-2xl mb-2">📦</div>
                  <div>{t.detail.noWarehouseData}</div>
                </div>
              )}
            </Card>
          </Col>

          {/* System Information */}
          <Col xs={24}>
            <Card title={t.detail.systemInfo} size="small">
              <Row gutter={[24, 0]}>
                <Col xs={24} md={12}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label={t.detail.uid}>
                      <Text code>{item.uid}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label={t.detail.createDate}>
                      {formatDate(item.create_date)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t.detail.modifyDate}>
                      {formatDate(item.modify_date)}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col xs={24} md={12}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label={t.detail.imageName}>
                      {item.image_name || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t.detail.hasImage}>
                      {hasItemImage(item.image_body) ? t.detail.yes : t.detail.no}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Raw Data (for debugging) */}
          {/* Debug section removed */}
        </Row>
      </div>

      {/* Modal for cannot delete */}
      <Modal
        open={showCannotDelete}
        title={t.detail.cannotDeleteModal.title}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <Button key="exit" type="primary" onClick={() => setShowCannotDelete(false)}>
            {t.detail.cannotDeleteModal.cancel}
          </Button>
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{item?.item_code != null ? t.detail.cannotDeleteModal.body(item.item_code) : ''}</p>
            <p className="text-gray-600 mt-1">{t.detail.cannotDeleteModal.explanation}</p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.detail.deleteModal.title}
        onCancel={() => {
          setDeleteModalOpen(false);
        }}
        onOk={handleDeleteConfirm}
        okText={t.detail.deleteModal.ok}
        cancelText={t.detail.deleteModal.cancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{item?.item_code != null ? t.detail.deleteModal.confirm(item.item_code) : ''}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.detail.deleteModal.cannotUndo}</p>
      </Modal>
    </BasicPageLayout>
  );
} 