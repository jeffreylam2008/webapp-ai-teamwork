'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { 
  Card, 
  Descriptions, 
  Tag, 
  Space, 
  Button, 
  App, 
  Spin,
  Input,
  Select,
  Row,
  Col,
  Typography,
  Modal
} from 'antd';
import { 
  EditOutlined, 
  ArrowLeftOutlined, 
  CreditCardOutlined,
  CalendarOutlined,
  SaveOutlined,
  CloseOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCustomerTexts } from '../i18n';
import { saveWithShortcutLabel } from '@/lib/i18n/saveShortcutLabel';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const { Text } = Typography;

interface Customer {
  cust_code: string;
  name: string;
  attn_1: string;
  attn_2?: string;  // Add optional attn_2
  delivery_addr: string;
  phone_1: string;
  pm_code: string;
  payment_method_name?: string;
  pt_code?: string;
  payment_terms?: string;
  status: string;
  email_1?: string;
  email_2?: string;
  email?: string;
  [key: string]: string | number | null | undefined;
}


type CustTexts = ReturnType<typeof getCustomerTexts>;

interface FunctionBarProps {
  editMode: boolean;
  handleEdit: () => void;
  handleSave: () => void;
  handleCancelEdit: () => void;
  onBack: () => void;
  onDelete: () => void | Promise<void>;
  loading?: boolean;
  canDelete?: boolean;
  deleteReason?: string;
  texts: CustTexts;
  saveLabel: string;
}

const FunctionBar: React.FC<FunctionBarProps> = ({
  editMode,
  handleEdit,
  handleSave,
  handleCancelEdit,
  onBack,
  onDelete,
  loading = false,
  canDelete = true,
  deleteReason,
  texts,
  saveLabel,
}) => {
  const L = texts.legacy;
  return (
  <div className="px-8 py-3 bg-white border-b border-gray-200 mb-4">
    <Space>
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={onBack}
      >
        {L.back}
      </Button>
      
      {!editMode ? (
        <>
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            onClick={handleEdit}
          >
            {L.editCustomer}
          </Button>
          <Button 
            danger
            icon={<DeleteOutlined />} 
            onClick={async () => await onDelete()}
            disabled={!canDelete}
            title={!canDelete ? deleteReason || L.cannotDeleteTooltip : L.deleteTooltip}
          >
            {L.delete}
          </Button>
        </>
      ) : (
        <>
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={handleSave}
            loading={loading}
          >
            {saveLabel}
          </Button>
          <Button 
            icon={<CloseOutlined />} 
            onClick={handleCancelEdit}
          >
            {L.cancel}
          </Button>
        </>
      )}
    </Space>
  </div>
  );
};

const EditCustomerContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getCustomerTexts(lang), [lang]);
  const { token } = useAuth();
  const { message: messageApi } = App.useApp();
  const goBackToCustomers = useBackNavigation(() => router.push('/customers'));
  const params = useParams();
  const customerId = params.id as string;
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Use hooks for payment terms and methods
  const { options: paymentTermOptions, loading: loadingTerms } = usePaymentTerms();
  const { options: paymentMethodOptions, loading: loadingMethods } = usePaymentMethods();

  // Fetch customer data
  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setLoading(true);
        const response = await fetchWithAuth(`/api/customers/${customerId}`, token, { cache: 'no-store' });
        const result = await response.json();
        
        console.log('Full API Response:', result);
        
        if (result.success) {
          const customerData = result.customer || result.data?.[0];
          
          // Ensure email is added if not present
          const processedCustomerData = {
            ...customerData,
            email_1: customerData.email_1 || '' // Add empty string if email is undefined
          };
          
          console.log('Processed Customer Data:', processedCustomerData);
          
          setCustomer(processedCustomerData);
          setEditCustomer(processedCustomerData);
        } else {
          messageApi.error(t.legacy.fetchFailed);
          router.push('/customers');
        }
      } catch (error) {
        console.error('Error fetching customer:', error);
        messageApi.error(t.legacy.fetchError);
        router.push('/customers');
      } finally {
        setLoading(false);
      }
    };

    if (customerId) {
      fetchCustomer();
    }
  }, [customerId, router, messageApi, t.legacy.fetchFailed, t.legacy.fetchError, token]);



  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditCustomer(customer);
  };

  const handleFieldChange = (field: keyof Customer, value: string | number) => {
    if (editCustomer) {
      setEditCustomer({
        ...editCustomer,
        [field]: value
      });
    }
  };

  const handleSave = async () => {
    if (!editCustomer) return;

    try {
      setEditLoading(true);
      const response = await fetchWithAuth(`/api/customers/${customerId}`, token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editCustomer),
      });

      const result = await response.json();

      if (result.success) {
        messageApi.success(t.legacy.updated);
        setCustomer(result.customer);
        setEditCustomer(result.customer);
        setEditMode(false);
      } else {
        messageApi.error(result.error || t.legacy.updateFailed);
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      messageApi.error(t.legacy.updateError);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    // First check if the customer can be deleted
    try {
      const res = await fetchWithAuth('/api/customers', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cust_code: customerId }),
      });
      const result = await res.json();
      
      if (result.success === true && result.canDelete === false) {
        // Customer cannot be deleted - show message with only Cancel button
        const dependencyList = result.dependencies?.map((dep: { table: string; name: string; count: number }) => 
          t.legacy.recordLine(dep.name, dep.count)
        ).join(', ');
        
        messageApi.error(
          <div>
            <div><strong>{t.legacy.cannotDeleteTitle} &quot;{customer?.name}&quot;</strong></div>
            <div>{t.legacy.dependentIntro}</div>
            <div>{dependencyList}</div>
            <div>{t.legacy.deleteRecordsFirst}</div>
          </div>,
          10
        );
        return;
      } else if (result.success === true && result.canDelete === true) {
        // Customer can be deleted - show confirmation modal
        setDeleteModalOpen(true);
      } else {
        // Unexpected response or error
        messageApi.error(result.error || t.legacy.unexpectedResponse);
      }
    } catch {
      messageApi.error(t.legacy.errorCheckDelete);
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
          cust_code: customerId,
          confirm: true 
        }),
      });
      const result = await res.json();
      
      if (result.success && result.deleted) {
        messageApi.success(result.message || t.legacy.deleted);
        setDeleteModalOpen(false);
        setTimeout(() => {
          router.push('/customers');
        }, 1500);
      } else {
        messageApi.error(result.error || t.legacy.failedDelete);
      }
    } catch {
      messageApi.error(t.legacy.errorDelete);
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
              { label: t.legacy.loading, current: true }
            ]}
          />
        }
      >
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <p>{t.legacy.loadingDetails}</p>
        </div>
      </BasicPageLayout>
    );
  }

  if (!customer) {
    return (
      <BasicPageLayout
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t.list.breadcrumbHome, href: '/' },
              { label: t.list.breadcrumbCustomers, href: '/customers' },
              { label: t.legacy.notFound, current: true }
            ]}
          />
        }
      >
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>{t.legacy.customerNotFound}</p>
          <Button onClick={goBackToCustomers}>{t.detail.backToCustomers}</Button>
        </div>
      </BasicPageLayout>
    );
  }

  return (
    <BasicPageLayout
      breadcrumb={
        <Breadcrumb
          items={[
            { label: t.list.breadcrumbHome, href: '/' },
            { label: t.list.breadcrumbCustomers, href: '/customers' },
            { label: customer.name, current: true }
          ]}
        />
      }
      buttonBar={
        <FunctionBar
          editMode={editMode}
          handleEdit={handleEdit}
          handleSave={handleSave}
          handleCancelEdit={handleCancelEdit}
          onBack={goBackToCustomers}
          onDelete={handleDelete}
          loading={editLoading}
          texts={t}
          saveLabel={saveWithShortcutLabel(lang)}
        />
      }
      title={t.detail.title(customer.name)}
      description={t.detail.description(customer.cust_code)}
      actionBarSaveShortcut={{ onSave: handleSave, disabled: !editMode || editLoading }}
    >
      {/* Main Content */}
      <div className="px-8 py-6 bg-white">
        <Row gutter={[24, 24]}>
          {/* Basic Information */}
          <Col xs={24} lg={12}>
            <Card title={t.legacy.basicInfo} size="small">
              {editMode && editCustomer ? (
                <Descriptions 
                  column={1} 
                  size="small" 
                  layout="vertical"
                  bordered
                >
                  <Descriptions.Item label={t.legacy.labels.customerCode}>
                    <Input value={editCustomer.cust_code} disabled />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.customerName}>
                    <Input 
                      value={editCustomer.name} 
                      onChange={e => handleFieldChange('name', e.target.value)}
                      placeholder={t.legacy.placeholders.name}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.contactPerson}>
                    <Input 
                      value={editCustomer.attn_1} 
                      onChange={e => handleFieldChange('attn_1', e.target.value)}
                      placeholder={t.legacy.placeholders.contact}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.altContact}>
                    <Input 
                      value={editCustomer.attn_2 || ''} 
                      onChange={e => handleFieldChange('attn_2', e.target.value)}
                      placeholder={t.legacy.placeholders.altContact}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.phoneNumber}>
                    <Input 
                      value={editCustomer.phone_1} 
                      onChange={e => handleFieldChange('phone_1', e.target.value)}
                      placeholder={t.legacy.placeholders.phone}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.email1}>
                    <Input 
                      value={editCustomer.email_1 || ''} 
                      onChange={e => handleFieldChange('email_1', e.target.value)}
                      placeholder={t.legacy.placeholders.email1}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.email2}>
                    <Input 
                      value={editCustomer.email_2 || ''} 
                      onChange={e => handleFieldChange('email_2', e.target.value)}
                      placeholder={t.legacy.placeholders.email2}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.deliveryAddress}>
                    <Input.TextArea 
                      value={editCustomer.delivery_addr} 
                      onChange={e => handleFieldChange('delivery_addr', e.target.value)}
                      placeholder={t.legacy.placeholders.delivery}
                      rows={3}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions 
                  title={t.legacy.customerInfoTitle} 
                  column={2} 
                  bordered 
                  size="small"
                >
                  
                  <Descriptions.Item label={t.legacy.labels.customerCode}>{customer.cust_code}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.customerName}>{customer.name}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.attention}>{customer.attn_1}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.altContact}>{customer.attn_2 || t.legacy.na}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.phoneNumber}>{customer.phone_1}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.deliveryAddress}>{customer.delivery_addr}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.paymentMethod}>{customer.payment_method_name || t.legacy.na}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.paymentTerms}>{customer.payment_terms || t.legacy.na}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.email1}>{customer.email_1 || t.legacy.na}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.email2}>{customer.email_2 || t.legacy.na}</Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.status}>
                    <Tag color={customer.status === 'Active' ? 'green' : 'red'}>
                      {customer.status === 'Active' ? t.status.active : customer.status === 'Closed' ? t.status.closed : customer.status}
                    </Tag>
                  </Descriptions.Item>
                  
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* Payment Information */}
          <Col xs={24} lg={12}>
            <Card title={t.legacy.paymentInfo} size="small">
              {editMode && editCustomer ? (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.legacy.labels.paymentMethod}>
                    <Select
                      value={editCustomer.pm_code}
                      onChange={value => handleFieldChange('pm_code', value)}
                      style={{ width: '100%' }}
                      placeholder={t.legacy.placeholders.pm}
                      options={paymentMethodOptions}
                      loading={loadingMethods}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.paymentTerms}>
                    <Select
                      value={editCustomer.pt_code}
                      onChange={value => handleFieldChange('pt_code', value)}
                      style={{ width: '100%' }}
                      placeholder={t.legacy.placeholders.pt}
                      allowClear
                      options={paymentTermOptions}
                      loading={loadingTerms}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.status}>
                    <Select
                      value={editCustomer.status}
                      onChange={value => handleFieldChange('status', value)}
                      style={{ width: '100%' }}
                      placeholder={t.legacy.placeholders.status}
                      options={[
                        { label: t.status.active, value: 'Active' },
                        { label: t.status.closed, value: 'Closed' }
                      ]}
                    />
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t.legacy.labels.paymentMethod}>
                    <Space>
                      <CreditCardOutlined />
                      {customer.payment_method_name || customer.pm_code}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.paymentTerms}>
                    <Space>
                      <CalendarOutlined />
                      {customer.payment_terms || customer.pt_code || t.legacy.notSpecified}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label={t.legacy.labels.status}>
                    <Tag color={customer.status === 'Active' ? 'green' : 'red'}>
                      {customer.status === 'Active' ? t.status.active : customer.status === 'Closed' ? t.status.closed : customer.status}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          </Col>

          {/* System Information */}
          <Col xs={24}>
            <Card title={t.legacy.systemInfo} size="small">
              <Descriptions column={2} size="small">
                <Descriptions.Item label={t.legacy.labels.customerCode}>
                  <Text code>{customer.cust_code}</Text>
                </Descriptions.Item>
                <Descriptions.Item label={t.legacy.labels.status}>
                  <Tag color={customer.status === 'Active' ? 'green' : 'red'}>
                    {customer.status === 'Active' ? t.status.active : customer.status === 'Closed' ? t.status.closed : customer.status}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.legacy.deleteTitle}
        onCancel={() => setDeleteModalOpen(false)}
        onOk={handleDeleteConfirm}
        okText={t.legacy.deleteOk}
        cancelText={t.legacy.deleteCancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>{customer?.name != null ? t.legacy.deleteConfirm(customer.name) : ''}</span>
        </div>
        <p className="text-gray-600 mt-2">{t.legacy.deleteCannotUndo}</p>
      </Modal>
    </BasicPageLayout>
  );
};

const EditCustomerPage = () => (
  <Suspense
    fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    }
  >
    <EditCustomerContent />
  </Suspense>
);

export default EditCustomerPage; 