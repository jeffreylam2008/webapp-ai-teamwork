'use client';

import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Tag,
  Spin
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined,
  ShopOutlined
} from '@ant-design/icons';
import DataTableLayout from '@/components/DataTableLayout';
import { useDataTable } from '@/hooks/useDataTable';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { usePaymentTerms } from '@/hooks/usePaymentTerms';
import { useRouter } from 'next/navigation';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSupplierTexts } from './i18n';

interface Supplier {
  supp_code: string;
  name: string;
  attn_1: string;
  mail_addr: string;
  phone_1: string;
  fax_1?: string;
  email_1?: string;
  pm_code: string;
  pt_code?: string;
  remark?: string;
  status: string;
  [key: string]: string | undefined;
}

// Component that uses useSearchParams - needs to be wrapped in Suspense
const SuppliersContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSupplierTexts(lang), [lang]);
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
    data: suppliers,
    loading,
    pagination,
    refreshData,
    statistics,
    handleTableChange
  } = useDataTable<Supplier>({
    apiEndpoint: '/api/suppliers',
    defaultPageSize: 10,
    includeStats: true
  });

  // Fallback statistics if API doesn't return them
  const fallbackStats = {
    totalSuppliers: suppliers?.length || 0,
    activeSuppliers: suppliers?.filter(s => s.status === 'Active').length || 0,
    inactiveSuppliers: suppliers?.filter(s => s.status === 'Closed').length || 0
  };
  
  // Use API statistics if available, otherwise use fallback
  const displayStats = statistics || fallbackStats;

  // Get payment methods / terms for mapping codes to descriptions
  const { options: paymentMethodOptions } = usePaymentMethods();
  const { options: paymentTermOptions } = usePaymentTerms();

  const statusLabel = useCallback(
    (status: string) =>
      status === 'Active' ? t.status.active : status === 'Closed' ? t.status.closed : status,
    [t.status.active, t.status.closed]
  );

  const columns = useMemo(
    () => [
    {
      title: t.list.colCode,
      dataIndex: 'supp_code',
      key: 'supp_code',
      sorter: (a: Supplier, b: Supplier) => (a.supp_code || '').localeCompare(b.supp_code || ''),
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
      sorter: (a: Supplier, b: Supplier) => (a.name || '').localeCompare(b.name || ''),
      render: (name: string) => (
        <div style={{ fontWeight: '500' }}>
          {name}
        </div>
      ),
    },
    {
      title: t.list.colContact,
      dataIndex: 'attn_1',
      key: 'attn_1',
      sorter: (a: Supplier, b: Supplier) => (a.attn_1 || '').localeCompare(b.attn_1 || ''),
    },
    {
      title: t.list.colPhone,
      dataIndex: 'phone_1',
      key: 'phone_1',
      render: (phone: string) => phone || '-',
    },
    {
      title: t.list.colEmail,
      dataIndex: 'email_1',
      key: 'email_1',
      render: (email: string) => email || '-',
    },
    {
      title: t.list.colPaymentMethod,
      dataIndex: 'pm_code',
      key: 'pm_code',
      render: (pmCode: string) => {
        const paymentMethod = paymentMethodOptions.find(pm => pm.value === pmCode);
        return paymentMethod ? paymentMethod.label : pmCode;
      },
    },
    {
      title: t.list.colPaymentTerm,
      dataIndex: 'pt_code',
      key: 'pt_code',
      render: (_: string | undefined, record: Supplier) => {
        const ptCode = record.pt_code;
        if (!ptCode) return '-';
        const term = paymentTermOptions.find((p) => p.value === ptCode);
        return term ? term.label : ptCode;
      },
      sorter: (a: Supplier, b: Supplier) =>
        String(a.pt_code || '').localeCompare(String(b.pt_code || '')),
    },
    {
      title: t.list.colStatus,
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Active' ? 'green' : 'red'}>
          {statusLabel(status)}
        </Tag>
      ),
      sorter: (a: Supplier, b: Supplier) => (a.status || '').localeCompare(b.status || ''),
    },
  ],
    [t.list, paymentMethodOptions, paymentTermOptions, statusLabel]
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
    ],
    [t.list, t.status.active, t.status.closed]
  );

  // Action handlers
  const handleAdd = () => {
    router.push('/suppliers/add');
  };

  const handleEdit = (record: Supplier) => {
    router.push(`/suppliers/detail/${encodeURIComponent(record.supp_code)}`);
  };

  const handleDelete = (record: Supplier) => {
    router.push(`/suppliers/detail/${encodeURIComponent(record.supp_code)}`);
  };

  return (
    <div>
      <DataTableLayout
        uiLabels={t.dataTable}
        breadcrumbItems={[
          { label: t.list.breadcrumbHome, href: '/' },
          { label: t.list.breadcrumbSuppliers, current: true }
        ]}
        title={t.list.title}
        description={t.list.description}
        pageMessage={pageMessage}
        onMessageClose={() => setPageMessage({ type: null, text: null })}
        statistics={[
          {
            title: t.list.statTotal,
            value: Number(displayStats.totalSuppliers) || 0,
            prefix: <ShopOutlined />,
            valueStyle: { color: '#3f8600' }
          },
          {
            title: t.list.statActive,
            value: Number(displayStats.activeSuppliers) || 0,
            prefix: <TeamOutlined />,
            valueStyle: { color: '#1890ff' }
          },
          {
            title: t.list.statInactive,
            value: Number(displayStats.inactiveSuppliers) || 0,
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
        dataSource={suppliers}
        loading={loading}
        rowKey="supp_code"
        pagination={pagination}
        onChange={handleTableChange as (pagination: unknown, filters: unknown, sorter: unknown) => void}
        onRefresh={refreshData}
        onAdd={handleAdd}
        onEdit={handleEdit as (record: unknown) => void}
        onDelete={handleDelete as (record: unknown) => void}
      />
    </div>
  );
};

// Main page component with Suspense boundary
const SuppliersPage: React.FC = () => {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Spin size="large" />
      </div>
    }>
      <SuppliersContent />
    </Suspense>
  );
};

export default SuppliersPage;
