'use client';

import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Avatar, 
  Space, 
  Tag,
  Modal,
  App,
  Spin,
  Button
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import DataTableLayout from '@/components/DataTableLayout';
import { useDataTable } from '@/hooks/useDataTable';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
// import { useDistricts } from '@/hooks/useDistricts';
import { useRouter } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getCustomerTexts } from './i18n';

interface Customer {
  cust_code: string;
  name: string;
  attn_1: string;
  delivery_addr: string;
  phone_1: string;
  phone_2?: string;
  fax_2?: string;
  pm_code: string;
  pt_code?: string;
  status: string;
  district_code?: string;
  from_time?: string;
  to_time?: string;
  delivery_remark?: string;
  /** From t_payment_method (JOIN) */
  payment_method?: string | null;
  /** From t_payment_term (JOIN) */
  payment_term?: string | null;
  [key: string]: string | number | null | undefined;
}

// Component that uses useSearchParams - needs to be wrapped in Suspense
const CustomersContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getCustomerTexts(lang), [lang]);
  const { token } = useAuth();
  const { message: messageApi } = App.useApp();
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error' | null; text: string | null }>({ type: null, text: null });
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for message in URL params when page loads
  useEffect(() => {
    const message = searchParams.get('message');
    const type = searchParams.get('type');
    if (message && (type === 'success' || type === 'error')) {
      setPageMessage({ type: type as 'success' | 'error', text: message });
    }
  }, [searchParams]);

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


  // Use the optimized data table hook with statistics
  const {
    data: customers,
    loading,
    pagination,
    refreshData,
    handleTableChange,
    statistics,
    setFilters,
  } = useDataTable<Customer>({
    apiEndpoint: '/api/customers',
    defaultPageSize: 10,
    includeStats: true
  });


  
  // Fallback statistics if API doesn't return them
  const fallbackStats = {
    totalCustomers: customers?.length || 0,
    activeCustomers: customers?.filter(c => c.status === 'Active').length || 0,
    inactiveCustomers: customers?.filter(c => c.status === 'Closed').length || 0
  };
  
  // Use API statistics if available, otherwise use fallback
  const displayStats = (statistics && Object.keys(statistics).length > 0) ? statistics : fallbackStats;

  // Get payment methods for mapping codes to descriptions
  const { options: paymentMethodOptions } = usePaymentMethods();



  // Get unique values for filters

  // Get districts for the dropdown (unused but kept for future use)
  // const { options: districtOptions, loading: districtsLoading } = useDistricts();


  const statusLabel = useCallback(
    (status: string) =>
      status === 'Active' ? t.status.active : status === 'Closed' ? t.status.closed : status,
    [t.status.active, t.status.closed]
  );

  const columns = useMemo(
    () => [
    {
      title: t.list.colCode,
      dataIndex: 'cust_code',
      key: 'cust_code',
      sorter: (a: Customer, b: Customer) => (a.cust_code || '').localeCompare(b.cust_code || ''),
      render: (code: string) => (
        <div style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {code}
        </div>
      ),
    },
    {
      title: t.list.colName,
      dataIndex: 'name',
      key: 'name',
      sorter: (a: Customer, b: Customer) => (a.name || '').localeCompare(b.name || ''),
      render: (name: string, record: Customer) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 'bold' }}>{name}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {record.attn_1}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: t.list.colContact,
      dataIndex: 'attn_1',
      key: 'attn_1',
      sorter: (a: Customer, b: Customer) => (a.attn_1 || '').localeCompare(b.attn_1 || ''),
    },
    {
      title: t.list.colPhone,
      dataIndex: 'phone_1',
      key: 'phone_1',
      sorter: (a: Customer, b: Customer) => (a.phone_1 || '').localeCompare(b.phone_1 || ''),
    },
    {
      title: t.list.colPaymentMethod,
      dataIndex: 'pm_code',
      key: 'pm_code',
      sorter: (a: Customer, b: Customer) => {
        const aMethod = paymentMethodOptions.find(opt => opt.value === a.pm_code)?.label || a.pm_code || '';
        const bMethod = paymentMethodOptions.find(opt => opt.value === b.pm_code)?.label || b.pm_code || '';
        return aMethod.localeCompare(bMethod);
      },
      render: (pmCode: string, record: Customer) => {
        const label = record.payment_method ?? paymentMethodOptions.find(opt => opt.value === pmCode)?.label ?? pmCode;
        return (
          <Tag color={pmCode === 'PM001' ? 'green' : pmCode === 'PM004' ? 'blue' : 'default'}>
            {label || pmCode}
          </Tag>
        );
      },
    },
    {
      title: t.list.colStatus,
      dataIndex: 'status',
      key: 'status',
      sorter: (a: Customer, b: Customer) => (a.status || '').localeCompare(b.status || ''),
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'Active': 'green',
          'Closed': 'red'
        };
        return (
          <Tag color={colorMap[status] || 'default'}>
            {statusLabel(status)}
          </Tag>
        );
      },
    },
  ],
    [t.list, paymentMethodOptions, statusLabel]
  );

  const filterOptions = useMemo(
    () => [
      {
        key: 'search',
        label: t.list.filterSearch,
        type: 'search' as const,
        placeholder: t.list.filterSearchPlaceholder,
      },
      {
        key: 'status',
        label: t.list.filterStatus,
        type: 'select' as const,
        options: [
          { value: 'Active', label: t.status.active },
          { value: 'Closed', label: t.status.closed },
        ],
      },
      {
        key: 'pm_code',
        label: t.list.filterPaymentMethod,
        type: 'select' as const,
        options: paymentMethodOptions,
      },
    ],
    [t.list, t.status.active, t.status.closed, paymentMethodOptions]
  );

  // Event handlers
  const handleAdd = () => {
    router.push('/customers/add');
  };

  const handleEdit = (customer: Customer) => {
    router.push(`/customers/detail/${customer.cust_code}`);
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showCannotDelete, setShowCannotDelete] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (customer: Customer) => {
    setCustomerToDelete(customer);
    
    // First check if the customer can be deleted
    try {
      const res = await fetchWithAuth('/api/customers', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cust_code: customer.cust_code }),
      });
      const result = await res.json();
      
      if (result.success === true && result.canDelete === false) {
        // Customer cannot be deleted - show cannot delete modal
        setShowCannotDelete(true);
      } else if (result.success === true && result.canDelete === true) {
        // Customer can be deleted - show confirmation modal
        setDeleteModalOpen(true);
      } else {
        // Unexpected response or error
        messageApi.error(result.error || t.list.unexpectedResponse);
      }
    } catch {
      messageApi.error(t.list.errorCheckDelete);
    }
  };





  return (
    <div>
      <DataTableLayout
        pageMessage={pageMessage}
        onMessageClose={() => {
          if (messageTimeoutRef.current) {
            clearTimeout(messageTimeoutRef.current);
          }
          setPageMessage({ type: null, text: null });
        }}
        uiLabels={t.dataTable}
        breadcrumbItems={[
          { label: t.list.breadcrumbHome, href: '/' },
          { label: t.list.breadcrumbCustomers, current: true }
        ]}
        title={t.list.title}
        description={t.list.description}
        statistics={[
          {
            title: t.list.statTotal,
            value: Number(displayStats.totalCustomers) || 0,
            prefix: <UserOutlined />,
            valueStyle: { color: '#3f8600' }
          },
          {
            title: t.list.statActive,
            value: Number(displayStats.activeCustomers) || 0,
            prefix: <TeamOutlined />,
            valueStyle: { color: '#1890ff' }
          },
          {
            title: t.list.statInactive,
            value: Number(displayStats.inactiveCustomers) || 0,
            prefix: <UserOutlined />,
            valueStyle: { color: '#fa8c16' }
          }
        ]}
        filters={filterOptions}
        columns={columns as unknown as Array<{
          title: string;
          dataIndex?: string;
          key: string;
          width?: number;
          render?: (value: unknown, record: unknown) => React.ReactNode;
          sorter?: (a: unknown, b: unknown) => number;
        }>}
        dataSource={customers}
        loading={loading}
        rowKey="cust_code"
        pagination={pagination}
        onChange={handleTableChange as (pagination: unknown, filters: unknown, sorter: unknown) => void}
        onRefresh={refreshData}
        onFilterChange={(f) =>
          setFilters({
            ...(f.search ? { search: String(f.search) } : {}),
            ...(f.status ? { status: String(f.status) } : {}),
            ...(f.pm_code ? { pm_code: String(f.pm_code) } : {}),
          })
        }
        onAdd={handleAdd}
        onView={handleEdit as (record: unknown) => void}
        onDelete={handleDelete as (record: unknown) => void}
      />

      {/* Modal for cannot delete */}
      <Modal
        open={showCannotDelete}
        title={t.list.cannotDeleteTitle}
        onCancel={() => setShowCannotDelete(false)}
        footer={[
          <Button key="exit" type="primary" onClick={() => setShowCannotDelete(false)}>
            {t.list.cannotDeleteCancel}
          </Button>
        ]}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-red-500" />
          <div>
            <p className="font-semibold">
              {customerToDelete?.cust_code != null ? t.list.cannotDeleteBody(customerToDelete.cust_code) : ''}
            </p>
            <p className="text-gray-600 mt-1">{t.list.cannotDeleteExplanation}</p>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        title={t.list.deleteTitle}
        onCancel={() => {
          setDeleteModalOpen(false);
          setCustomerToDelete(null);
        }}
        onOk={async () => {
          if (!customerToDelete) return;
          setDeleting(true);
          try {
            const res = await fetchWithAuth('/api/customers', token, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                cust_code: customerToDelete.cust_code,
                confirm: true 
              }),
            });
            const result = await res.json();
            
            if (result.success && result.deleted) {
              messageApi.success(result.message || t.list.deleted);
              setCustomerToDelete(null);
              setDeleteModalOpen(false);
              refreshData();
            } else {
              messageApi.error(result.error || t.list.failedDelete);
            }
          } catch {
            messageApi.error(t.list.errorDelete);
          } finally {
            setDeleting(false);
          }
        }}
        okText={t.list.deleteOk}
        cancelText={t.list.deleteCancel}
        okButtonProps={{ danger: true, loading: deleting }}
      >
        <div className="flex items-center gap-2">
          <ExclamationCircleOutlined className="text-xl text-yellow-500" />
          <span>
            {customerToDelete?.cust_code != null ? t.list.deleteConfirm(customerToDelete.cust_code) : ''}
          </span>
        </div>
        <p className="text-gray-600 mt-2">{t.list.deleteCannotUndo}</p>
      </Modal>
    </div>
  );
};

// Main page component with Suspense boundary
const CustomersPage: React.FC = () => {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Spin size="large" />
      </div>
    }>
      <CustomersContent />
    </Suspense>
  );
};

export default CustomersPage; 