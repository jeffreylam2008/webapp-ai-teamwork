'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useDistricts } from '@/hooks/useDistricts';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { Card, Space, Typography, Row, Col, Descriptions, Alert, Button, Spin, Input, Select, App, Modal, TimePicker } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeftOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import Breadcrumb from '@/components/Breadcrumb';
import BasicPageLayout from '@/components/BasicPageLayout';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCustomerTexts } from '../../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const { Text } = Typography;

// Update Customer interface (payment_method, payment_term from API JOIN with t_payment_method, t_payment_term)
interface Customer {
  cust_code: string;
  name: string;
  attn_1: string;
  attn_2?: string;
  delivery_addr: string;
  phone_1: string;
  phone_2?: string;
  fax_2?: string;
  pm_code: string;
  pt_code: string;
  status: string;
  district_code?: string;
  from_time?: string;
  to_time?: string;
  delivery_remark?: string;
  create_date?: string;
  modify_date?: string;
  remark?: string;
  statement_remark?: string;
  email_1?: string;
  email_2?: string;
  payment_method?: string | null;
  payment_term?: string | null;
  [key: string]: string | number | null | undefined;
}



interface DbResponse {
  success: boolean;
  data: Customer[];
  total: number;
  timestamp: string;
  message?: string;
  error?: string;
}

/** Must match fields supported by GET /api/customers (there is no /api/customers/detail/... route). */
const CUSTOMER_DETAIL_FIELDS =
  'cust_code,name,attn_1,attn_2,delivery_addr,phone_1,phone_2,fax_2,pm_code,pt_code,status,district_code,from_time,to_time,delivery_remark,create_date,modify_date,remark,statement_remark,email_1,email_2';

// Function Bar Props
type CustomerTexts = ReturnType<typeof getCustomerTexts>;

interface FunctionBarProps {
  editMode: boolean;
  currentIndex: number;
  customerList: string[];
  handleNavigate: (index: number) => void;
  handleEdit: () => void;
  handleSave: () => void;
  handleCancelEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  texts: CustomerTexts;
  saveLabel: string;
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  currentIndex,
  customerList,
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
    <Space size="middle">
      {!editMode && (
        <Button 
          type="default"
          icon={<ArrowLeftOutlined />} 
          onClick={onBack}
        >
          {d.back}
        </Button>
      )}
      {!editMode && (
        <Space size="small">
          <Button
            type="default"
            disabled={currentIndex <= 0}
            onClick={() => handleNavigate(currentIndex - 1)}
          >
            {d.previous}
          </Button>
          <Button
            type="default"
            disabled={currentIndex === -1 || currentIndex >= customerList.length - 1}
            onClick={() => handleNavigate(currentIndex + 1)}
          >
            {d.next}
          </Button>
        </Space>
      )}
      {!editMode && (
        <Button 
          type="primary"
          icon={<EditOutlined />} 
          onClick={handleEdit}
        >
          {d.editCustomer}
        </Button>
      )}
      {editMode && (
        <Space size="small">
          <Button type="primary" onClick={handleSave}>{saveLabel}</Button>
          <Button onClick={handleCancelEdit}>{d.cancel}</Button>
        </Space>
      )}
      <Button 
        danger
        type="primary"
        icon={<DeleteOutlined />} 
        onClick={onDelete}
      >
        {d.delete}
      </Button>
    </Space>
  </div>
  );
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getCustomerTexts(lang), [lang]);
  const { token } = useAuth();
  const { message: messageApi } = App.useApp();
  const custCode = params.custCode as string;
  const goBackToCustomers = useBackNavigation(() => router.push('/customers'));

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerList, setCustomerList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [editMode, setEditMode] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { options: paymentTermOptions, loading: loadingTerms } = usePaymentTerms();
  const { options: paymentMethodOptions, loading: loadingMethods } = usePaymentMethods();
  const { districts, options: districtOptions, loading: districtsLoading } = useDistricts();

  const loadCustomerByCode = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuth(
          `/api/customers?search=${encodeURIComponent(code)}&limit=1&fields=${CUSTOMER_DETAIL_FIELDS}`,
          token,
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
        );
        const result: DbResponse = await response.json();
        if (result.success && result.data.length > 0) {
          setCustomer(result.data[0]);
        } else {
          setError(t.detail.customerNotFound);
        }
      } catch (err) {
        console.error('Error fetching customer details:', err);
        setError(err instanceof Error ? err.message : t.detail.fetchError);
      } finally {
        setLoading(false);
      }
    },
    [t.detail.customerNotFound, t.detail.fetchError, token]
  );

  const fetchCustomerDetails = useCallback(() => {
    if (custCode) void loadCustomerByCode(custCode);
  }, [custCode, loadCustomerByCode]);

  // Fetch all customer codes for navigation
  const fetchCustomerList = async () => {
    try {
      const response = await fetchWithAuth('/api/customers?fields=cust_code', token, { cache: 'no-store' });
      const result: DbResponse = await response.json();
      if (result.success) {
        const codes = result.data
          .map((cust) => cust.cust_code)
          .filter((code): code is string => typeof code === 'string');
        setCustomerList(codes);
      }
    } catch {
      // Ignore errors for navigation list
    }
  };

  // Update current index when customerList or custCode changes
  useEffect(() => {
    if (customerList.length > 0 && custCode) {
      setCurrentIndex(customerList.findIndex((code) => code === custCode));
    }
  }, [customerList, custCode]);

  useEffect(() => {
    setCustomer(null);
    setLoading(true);
  }, [custCode]);

  useEffect(() => {
    fetchCustomerList();
  }, []);

  useEffect(() => {
    if (custCode) {
      fetchCustomerDetails();
    }
  }, [custCode, fetchCustomerDetails]);

  // Helper function to format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return dateString;
    }
  };

  // Replace navigation button handlers with shallow routing and state update
  const handleNavigate = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < customerList.length) {
      setCurrentIndex(newIndex);
      router.replace(`/customers/detail/${encodeURIComponent(customerList[newIndex])}`);
    }
  };

  // When entering edit mode, copy customer to editCustomer
  const handleEdit = () => {
    setEditCustomer(customer ? { ...customer } : null);
    setEditMode(true);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditCustomer(null);
  };

  // Handle input changes
  const handleFieldChange = (field: keyof Customer, value: string | number | null) => {
    if (!editCustomer) return;
    setEditCustomer({ ...editCustomer, [field]: value });
  };

  // Handle save
  const handleSave = async () => {
    if (!editCustomer || !editCustomer.cust_code) {
      messageApi.error(t.detail.noCustomerToUpdate);
      return;
    }
    
    try {
      const payload = {
        ...editCustomer,
        remark: editCustomer.remark || null
      };

      const response = await fetchWithAuth('/api/customers', token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      if (result.success) {
        messageApi.success(t.detail.saved);
        setEditMode(false);
        fetchCustomerDetails();
      } else {
        messageApi.error(result.error || t.detail.saveFailed);
      }
    } catch {
      messageApi.error(t.detail.saveError);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    
    // First check if the customer can be deleted
    try {
      const res = await fetchWithAuth('/api/customers', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cust_code: customer.cust_code }),
      });
      const result = await res.json();
      
      if (result.success === true && result.canDelete === false) {
        setShowCannotDelete(true);
      } else if (result.success === true && result.canDelete === true) {
        setDeleteModalOpen(true);
      } else {
        messageApi.error(result.error || t.detail.unexpectedServer);
      }
    } catch {
      messageApi.error(t.detail.errorCheckDelete);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!customer) return;
    
    setDeleting(true);
    try {
      const res = await fetchWithAuth('/api/customers', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cust_code: customer.cust_code,
          confirm: true 
        }),
      });
      const result = await res.json();
      
      if (result.success && result.deleted) {
        messageApi.success(result.message || t.detail.deleted);
        setDeleteModalOpen(false);
        setTimeout(() => {
          router.push('/customers');
        }, 1500);
      } else {
        messageApi.error(result.error || t.detail.deleteFailed);
      }
    } catch {
      messageApi.error(t.detail.deleteError);
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
              { label: t.list.breadcrumbHome, href: '/' },
              { label: t.list.breadcrumbCustomers, href: '/customers' },
              { label: t.detail.breadcrumbLoading, current: true }
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

  if (error || !customer) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: t.list.breadcrumbHome, href: '/' },
              { label: t.list.breadcrumbCustomers, href: '/customers' },
              { label: t.detail.breadcrumbError, current: true }
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
              onClick={goBackToCustomers}
            >
              {t.detail.backToCustomers}
            </Button>
          }
        />
      </BasicPageLayout>
    );
  }

  return (
    <div>
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb 
            items={[
              { label: t.list.breadcrumbHome, href: '/' },
              { label: t.list.breadcrumbCustomers, href: '/customers' },
              { label: customer.cust_code || t.detail.itemDetailFallback, current: true }
            ]} 
          />
        }
        buttonBar={
          <FunctionBar
            editMode={editMode}
            currentIndex={currentIndex}
            customerList={customerList}
            handleNavigate={handleNavigate}
            handleEdit={handleEdit}
            handleSave={handleSave}
            handleCancelEdit={handleCancelEdit}
            onBack={goBackToCustomers}
            onDelete={handleDelete}
            texts={t}
            saveLabel={saveWithShortcutLabel(lang)}
          />
        }
        title={t.detail.title(customer.name)}
        description={t.detail.description(customer.cust_code || '')}
        actionBarSaveShortcut={{ onSave: handleSave, disabled: !editMode }}
      >
      {/* Main Content */}
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          {/* Basic Information */}
          <Col xs={24} lg={12}>
            <Card title={t.detail.basicInfo} size="small">
              {editMode && editCustomer ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.customerCode}>
                    <Input value={editCustomer.cust_code} disabled />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.customerName}>
                    <Input value={editCustomer.name} onChange={e => handleFieldChange('name', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.contactPerson1}>
                    <Input value={editCustomer.attn_1} onChange={e => handleFieldChange('attn_1', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.phone}>
                    <Input 
                      value={editCustomer.phone_1} 
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                        handleFieldChange('phone_1', value);
                      }}
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.email1}>
                    <Input 
                      value={editCustomer.email_1 || ''} 
                      onChange={e => handleFieldChange('email_1', e.target.value)}
                      placeholder={t.detail.placeholders.primaryEmail}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.email2}>
                    <Input 
                      value={editCustomer.email_2 || ''} 
                      onChange={e => handleFieldChange('email_2', e.target.value)}
                      placeholder={t.detail.placeholders.secondaryEmail}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.fax}>
                    <Input 
                      value={editCustomer.fax_2} 
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                        handleFieldChange('fax_2', value);
                      }}
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.remark}>
                    <Input.TextArea 
                      value={editCustomer.remark} 
                      onChange={e => handleFieldChange('remark', e.target.value)}
                      rows={2}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.status}>
                    <Select
                      value={editCustomer.status}
                      onChange={value => handleFieldChange('status', value)}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'Active', label: t.status.active },
                        { value: 'Closed', label: t.status.closed }
                      ]}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.customerCode}>
                    <Text strong>{customer.cust_code || '-'}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.customerName}>
                    {customer.name}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.contactPerson1}>
                    {customer.attn_1}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.phone}>
                    {customer.phone_1}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.email1}>
                    {customer.email_1 || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.email2}>
                    {customer.email_2 || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.fax}>
                    {customer.fax_2 || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.remark}>
                    {customer.remark || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.status}>
                    {customer.status === 'Active' ? t.status.active : customer.status === 'Closed' ? t.status.closed : customer.status}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* Delivery Information */}
          <Col xs={24} lg={12}>
            <Card title={t.detail.deliveryInfo} size="small">
              {editMode && editCustomer ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.district}>
                    <Select
                      value={editCustomer.district_code}
                      onChange={value => handleFieldChange('district_code', value)}
                      style={{ width: '100%' }}
                      options={districts}
                      loading={districtsLoading}
                      placeholder={t.detail.placeholders.selectDistrict}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryAddress}>
                    <Input.TextArea 
                      value={editCustomer.delivery_addr} 
                      onChange={e => handleFieldChange('delivery_addr', e.target.value)}
                      rows={4}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.contactPerson2}>
                    <Input value={editCustomer.attn_2} onChange={e => handleFieldChange('attn_2', e.target.value)} />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.altPhone}>
                    <Input 
                      value={editCustomer.phone_2} 
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                        handleFieldChange('phone_2', value);
                      }}
                      maxLength={8}
                      onKeyPress={(e) => {
                        if (!/[0-9]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryTime}>
                    <Space>
                      <TimePicker 
                        value={editCustomer.from_time ? dayjs(editCustomer.from_time, 'HH:mm') : null}
                        onChange={(time) => handleFieldChange('from_time', time ? time.format('HH:mm') : null)}
                        format="HH:mm"
                        placeholder={t.detail.timeFrom}
                      />
                      <TimePicker 
                        value={editCustomer.to_time ? dayjs(editCustomer.to_time, 'HH:mm') : null}
                        onChange={(time) => handleFieldChange('to_time', time ? time.format('HH:mm') : null)}
                        format="HH:mm"
                        placeholder={t.detail.timeTo}
                      />
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryRemarks}>
                    <Input.TextArea 
                      value={editCustomer.delivery_remark} 
                      onChange={e => handleFieldChange('delivery_remark', e.target.value)}
                      rows={2}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.district}>
                    {districtOptions.find(d => d.value === customer.district_code)?.label || customer.district_code || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryAddress}>
                    {customer.delivery_addr || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.contactPerson2}>
                    {customer.attn_2 || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.altPhone}>
                    {customer.phone_2 || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryTime}>
                    {customer.from_time && customer.to_time ? `${customer.from_time} - ${customer.to_time}` : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.deliveryRemarks}>
                    {customer.delivery_remark || '-'}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* Payment Information */}
          <Col xs={24} lg={12}>
            <Card title={t.detail.paymentInfo} size="small">
              {editMode && editCustomer ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.paymentMethod}>
                    <Select
                      value={editCustomer.pm_code}
                      onChange={value => handleFieldChange('pm_code', value)}
                      style={{ width: '100%' }}
                      loading={loadingMethods}
                      options={paymentMethodOptions}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.paymentTerms}>
                    <Select
                      value={editCustomer.pt_code}
                      onChange={value => handleFieldChange('pt_code', value)}
                      style={{ width: '100%' }}
                      loading={loadingTerms}
                      options={paymentTermOptions}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.paymentRemark}>
                    <Input.TextArea 
                      value={editCustomer.statement_remark} 
                      onChange={e => handleFieldChange('statement_remark', e.target.value)}
                      rows={2}
                      placeholder={t.detail.placeholders.paymentRemarks}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.detail.labels.paymentMethod}>
                    <Text>
                      {customer.payment_method ?? paymentMethodOptions.find(opt => opt.value === customer.pm_code)?.label ?? customer.pm_code ?? '-'}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.paymentTerms}>
                    <Text>
                      {customer.payment_term ?? paymentTermOptions.find(opt => opt.value === customer.pt_code)?.label ?? customer.pt_code ?? '-'}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.detail.labels.paymentRemark}>
                    {customer.statement_remark || '-'}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* System Information */}
          <Col xs={24}>
            <Card title={t.detail.systemInfo} size="small">
              <Row gutter={[24, 0]}>
                <Col xs={24} md={12}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label={t.detail.labels.createDate}>
                      {formatDate(customer.create_date)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t.detail.labels.modifyDate}>
                      {formatDate(customer.modify_date)}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Modal for cannot delete */}
      <Modal
        open={showCannotDelete}
        title={t.detail.cannotDeleteTitle}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <Button key="exit" onClick={() => setShowCannotDelete(false)}>
            {t.detail.cancel}
          </Button>
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">{customer?.cust_code != null ? t.detail.cannotDeleteBody(customer.cust_code) : ''}</p>
            <p className="text-gray-600 mt-1">{t.detail.cannotDeleteExplanation}</p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.detail.deleteTitle}
        onCancel={() => setDeleteModalOpen(false)}
        onOk={handleDeleteConfirm}
        okText={t.detail.deleteOk}
        cancelText={t.detail.cancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{customer?.cust_code != null ? t.detail.deleteConfirm(customer.cust_code) : ''}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.detail.deleteCannotUndo}</p>
      </Modal>
      </BasicPageLayout>
    </div>
  );
}