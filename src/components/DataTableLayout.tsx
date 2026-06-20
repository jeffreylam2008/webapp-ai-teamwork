'use client';

import React, { useState } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Button, 
  Table, 
  Space,
  Modal,
  Spin,
} from 'antd';
import { 
  PlusOutlined, 
  FilterOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined
} from '@ant-design/icons';
import BasicPageLayout from '@/components/BasicPageLayout';
import Breadcrumb from '@/components/Breadcrumb';
import type { TablePaginationConfig, FilterValue, SorterResult } from 'antd/es/table/interface';

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface StatisticCard {
  title: string;
  value: number;
  prefix?: React.ReactNode;
  valueStyle?: React.CSSProperties;
  color?: string;
}

interface ActionButton {
  key: string;
  label: string;
  icon?: React.ReactNode;
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  onClick: () => void;
  loading?: boolean;
}

interface FilterOption {
  key: string;
  label: string;
  type: 'search' | 'select' | 'date' | 'number';
  placeholder?: string;
  options?: { value: string; label: string }[];
  value?: string | number;
  onChange?: (value: string | number) => void;
}

interface TableRecord {
  [key: string]: unknown;
}

/** Optional labels for toolbar, table chrome, and filter panel (defaults are English). */
export interface DataTableLayoutUiLabels {
  add: string;
  filters: string;
  refresh: string;
  clearAll: string;
  actionsColumn: string;
  viewDetails: string;
  edit: string;
  delete: string;
  filterOptionsTitle: string;
  activeFilters: string;
  successPrefix: string;
  errorPrefix: string;
  /** Prepended to filter label for the empty select option, e.g. "All" + " " + "Status" */
  allPrefix: string;
  addModalCancel: string;
  addModalSubmit: string;
}

export const defaultDataTableLayoutUiLabels: DataTableLayoutUiLabels = {
  add: 'Add',
  filters: 'Filters',
  refresh: 'Refresh',
  clearAll: 'Clear All',
  actionsColumn: 'Actions',
  viewDetails: 'View Details',
  edit: 'Edit',
  delete: 'Delete',
  filterOptionsTitle: 'Filter Options',
  activeFilters: 'Active filters:',
  successPrefix: 'Success:',
  errorPrefix: 'Error:',
  allPrefix: 'All',
  addModalCancel: 'Cancel',
  addModalSubmit: 'Add',
};

interface DataTableLayoutProps {
  // Layout props
  breadcrumbItems: BreadcrumbItem[];
  title: string;
  description?: string;
  
  // Message
  pageMessage?: {
    type: 'success' | 'error' | null;
    text: string | null;
  };
  onMessageClose?: () => void;
  
  // Statistics
  statistics?: StatisticCard[];
  
  // Actions
  actionButtons?: ActionButton[];
  
  // Filters
  filters?: FilterOption[];
  showFilters?: boolean;
  onFilterChange?: (filters: Record<string, string | number>) => void;
  
  // Table
  columns: Array<{
    title: string;
    dataIndex?: string;
    key: string;
    width?: number;
    render?: (value: unknown, record: TableRecord) => React.ReactNode;
    sorter?: (a: TableRecord, b: TableRecord) => number;
  }>;
  dataSource: TableRecord[];
  loading?: boolean;
  rowKey?: string;
  pagination?: TablePaginationConfig;
  onChange?: (pagination: TablePaginationConfig, filters: Record<string, FilterValue | null>, sorter: SorterResult<TableRecord> | SorterResult<TableRecord>[]) => void;
  
  // Data management
  onRefresh?: () => void;
  onAdd?: () => void;
  onEdit?: (record: TableRecord) => void;
  onDelete?: (record: TableRecord) => void;
  onView?: (record: TableRecord) => void;
  
  // Modals
  addModal?: {
    title: string;
    open: boolean;
    onOk: () => void;
    onCancel: () => void;
    children: React.ReactNode;
  };
  
  // Custom content
  children?: React.ReactNode;

  uiLabels?: Partial<DataTableLayoutUiLabels>;
}

const DataTableLayout: React.FC<DataTableLayoutProps> = ({
  breadcrumbItems,
  title,
  description,
  pageMessage,
  onMessageClose,
  statistics = [],
  actionButtons = [],
  filters = [],
  showFilters = false,
  onFilterChange,
  columns,
  dataSource,
  loading = false,
  rowKey = 'id',
  pagination,
  onChange,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
  onView,
  addModal,
  children,
  uiLabels: uiLabelsProp = {},
}) => {
  const ui = { ...defaultDataTableLayoutUiLabels, ...uiLabelsProp };
  const [localShowFilters, setLocalShowFilters] = useState(showFilters);
  const [localFilters, setLocalFilters] = useState<Record<string, string | number>>({});

  // Default action buttons
  const defaultActionButtons: ActionButton[] = [];
  
  // Add button
  if (onAdd) {
    defaultActionButtons.push({
      key: 'add',
      label: ui.add,
      icon: <PlusOutlined />,
      type: 'primary',
      onClick: onAdd
    });
  }

  // Filters button
  defaultActionButtons.push({
    key: 'filters',
    label: ui.filters,
    icon: <FilterOutlined />,
    type: Object.keys(localFilters).some(key => localFilters[key]) ? 'primary' : 'default',
    onClick: () => setLocalShowFilters(!localShowFilters)
  });

  // Refresh button
  if (onRefresh) {
    defaultActionButtons.push({
      key: 'refresh',
      label: ui.refresh,
      icon: <ReloadOutlined />,
      onClick: onRefresh,
      loading
    });
  }

  // Clear button
  defaultActionButtons.push({
    key: 'clear',
    label: ui.clearAll,
    onClick: () => {
      setLocalFilters({});
      onFilterChange?.({});
    }
  });

  // Merge default and custom action buttons
  const allActionButtons = [...defaultActionButtons, ...actionButtons];

  // Enhanced columns with action buttons
  const enhancedColumns = React.useMemo(() => {
    if (!onView && !onEdit && !onDelete) {
      return columns;
    }

    const actionColumn = {
      title: ui.actionsColumn,
      key: 'actions',
      width: 120,
      align: 'left' as const,
      render: (record: TableRecord) => (
        <div className="flex flex-row items-center justify-start gap-2">
          {onView && (
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
              title={ui.viewDetails}
              onClick={() => onView(record)}
              style={{ verticalAlign: 'middle' }}
            >
              <EyeOutlined />
            </button>
          )}
          {onEdit && (
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition"
              title={ui.edit}
              onClick={() => onEdit(record)}
              style={{ verticalAlign: 'middle' }}
            >
              <EditOutlined />
            </button>
          )}
          {onDelete && (
            <button
              className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 text-red-600 hover:text-red-800 transition"
              title={ui.delete}
              onClick={() => onDelete(record)}
              style={{ verticalAlign: 'middle' }}
            >
              <DeleteOutlined />
            </button>
          )}
        </div>
      ),
    };

    return [actionColumn, ...columns];
  }, [columns, onView, onEdit, onDelete, ui]);

  // Button bar
  const buttonBar = (
    <div className="px-4 py-3 bg-white border-b border-gray-200">
      <Space>
        {allActionButtons.map(button => (
          <Button
            key={button.key}
            type={button.type}
            icon={button.icon}
            onClick={button.onClick}
            loading={button.loading}
          >
            {button.label}
          </Button>
        ))}
      </Space>
    </div>
  );

  // Filter section
  const renderFilterSection = () => {
    if (!localShowFilters || filters.length === 0) return null;

    return (
      <div className="mb-6 p-4 bg-gray-50 border border-gray-300 rounded-md">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">{ui.filterOptionsTitle}</h4>
        
        <div className="flex gap-4 items-center flex-wrap mb-4">
          {filters.map(filter => (
            <div key={filter.key} className="flex gap-2 items-center">
              <label className="font-bold text-gray-700 min-w-20">{filter.label}:</label>
              {filter.type === 'search' && (
                <input
                  type="text"
                  placeholder={filter.placeholder}
                  value={localFilters[filter.key] || ''}
                  onChange={(e) => {
                    const newFilters = { ...localFilters, [filter.key]: e.target.value };
                    setLocalFilters(newFilters);
                    onFilterChange?.(newFilters);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md min-w-[300px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
              {filter.type === 'select' && (
                <select
                  value={localFilters[filter.key] || ''}
                  onChange={(e) => {
                    const newFilters = { ...localFilters, [filter.key]: e.target.value };
                    setLocalFilters(newFilters);
                    onFilterChange?.(newFilters);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{ui.allPrefix} {filter.label}</option>
                  {filter.options?.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Active Filters Display */}
        {Object.keys(localFilters).some(key => localFilters[key]) && (
          <div className="p-3 bg-blue-50 border border-blue-300 rounded-md">
            <strong className="text-blue-900">{ui.activeFilters}</strong>
            {Object.entries(localFilters).map(([key, value]) => {
              if (!value) return null;
              const filter = filters.find(f => f.key === key);
              return (
                <span key={key} className="ml-2 px-2 py-1 bg-blue-200 rounded text-sm">
                  {filter?.label}: {value}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <BasicPageLayout
      breadcrumb={<Breadcrumb items={breadcrumbItems} />}
      buttonBar={buttonBar}
      title={title}
      description={description}
      message={pageMessage?.type && pageMessage?.text && (
        <div className="px-8 py-4">
          <div className={`p-4 rounded-md border ${
            pageMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="font-medium">
                  {pageMessage.type === 'success' ? `✅ ${ui.successPrefix}` : `❌ ${ui.errorPrefix}`}
                </span>
                <span className="ml-2">{pageMessage.text}</span>
              </div>
              <button
                onClick={onMessageClose}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <Spin spinning={loading}>
        <div className="px-4 py-6 bg-white">
          {/* Statistics Cards */}
          {statistics.length > 0 && (
            <Row gutter={16} style={{ marginBottom: '24px' }}>
              {statistics.map((stat, index) => (
                <Col key={index} span={24 / statistics.length}>
                  <Card>
                    <Statistic
                      title={stat.title}
                      value={stat.value}
                      prefix={stat.prefix}
                      valueStyle={stat.valueStyle}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          {/* Filter Section */}
          {renderFilterSection()}

          {/* Custom Content */}
          {children}

          {/* Data Table */}
          <Card>
            <Table
              columns={enhancedColumns}
              dataSource={dataSource}
              loading={false}
              rowKey={rowKey}
              pagination={pagination}
              onChange={onChange}
              scroll={{ x: 1200 }}
            />
          </Card>
        </div>
      </Spin>

      {/* Add Modal */}
      {addModal && (
        <Modal
          title={addModal.title}
          open={addModal.open}
          onOk={addModal.onOk}
          onCancel={addModal.onCancel}
          width={600}
          footer={[
            <Button key="cancel" onClick={addModal.onCancel}>
              {ui.addModalCancel}
            </Button>,
            <Button key="submit" type="primary" onClick={addModal.onOk}>
              {ui.addModalSubmit}
            </Button>,
          ]}
        >
          {addModal.children}
        </Modal>
      )}
    </BasicPageLayout>
  );
};

export default DataTableLayout; 