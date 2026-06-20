'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Select, DatePicker, Button, Space, Tag, Modal, message } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import type { LogsPageTexts } from '@/lib/i18n/logsPage';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const { Option } = Select;

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  type: string;
  userId?: string;
  username?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  details?: Record<string, unknown>;
}

interface LogViewerProps {
  className?: string;
  texts: LogsPageTexts;
}

const LogViewer: React.FC<LogViewerProps> = ({ className, texts: t }) => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [logType, setLogType] = useState('user-actions');
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchLogs = useCallback(async (page = 1, pageSize = 50) => {
    setLoading(true);
    try {
      const date = selectedDate.format('YYYY-MM-DD');
      const offset = (page - 1) * pageSize;
      
      const response = await fetchWithAuth(
        `/api/logs?type=${logType}&date=${date}&limit=${pageSize}&offset=${offset}`,
        token
      );
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
        setPagination({
          current: page,
          pageSize,
          total: data.total || 0,
        });
      } else {
        message.error(t.failedFetch);
      }
    } catch {
      message.error(t.errorFetch);
    } finally {
      setLoading(false);
    }
  }, [logType, selectedDate, token, t.failedFetch, t.errorFetch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleDeleteLog = async () => {
    try {
      const date = selectedDate.format('YYYY-MM-DD');
      const response = await fetchWithAuth(`/api/logs?type=${logType}&date=${date}`, token, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        message.success(t.deleteSuccess);
        fetchLogs();
      } else {
        message.error(t.deleteFailed);
      }
    } catch {
      message.error(t.deleteError);
    }
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: 'green',
      UPDATE: 'blue',
      DELETE: 'red',
      VIEW: 'orange',
      LOGIN: 'purple',
      LOGOUT: 'gray',
      SEARCH: 'cyan',
      EXPORT: 'magenta',
      IMPORT: 'volcano',
    };
    return colors[action] || 'default';
  };

  const columns = [
    {
      title: t.colTimestamp,
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: t.colType,
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'USER_ACTION' ? 'blue' : type === 'HTTP_REQUEST' ? 'green' : 'orange'}>
          {type}
        </Tag>
      ),
    },
    {
      title: t.colAction,
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => action ? (
        <Tag color={getActionColor(action)}>{action}</Tag>
      ) : '-',
    },
    {
      title: 'User',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (username: string, record: LogEntry) => username || record.userId || t.anonymous,
    },
    {
      title: t.colResource,
      dataIndex: 'resource',
      key: 'resource',
      width: 120,
      render: (resource: string) => resource || '-',
    },
    {
      title: t.colIp,
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 140,
      render: (ip: string) => ip || '-',
    },
    {
      title: t.colStatus,
      dataIndex: 'statusCode',
      key: 'statusCode',
      width: 80,
      render: (status: number) => status ? (
        <Tag color={status >= 400 ? 'red' : status >= 300 ? 'orange' : 'green'}>
          {status}
        </Tag>
      ) : '-',
    },
    {
      title: t.colActions,
      key: 'actions',
      width: 100,
      render: (_: unknown, record: LogEntry) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedLog(record);
            setDetailModalVisible(true);
          }}
        />
      ),
    },
  ];

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    fetchLogs(newPagination.current || 1, newPagination.pageSize || 50);
  };

  return (
    <div className={className}>
      <Card title={t.cardTitle} extra={
        <Space>
          <Select
            value={logType}
            onChange={setLogType}
            style={{ width: 150 }}
          >
            <Option value="user-actions">{t.typeUserActions}</Option>
            <Option value="errors">{t.typeErrors}</Option>
            <Option value="system">{t.typeSystem}</Option>
          </Select>
          
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            format="YYYY-MM-DD"
          />
          
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={handleDeleteLog}
          >
            {t.deleteLog}
          </Button>
        </Space>
      }>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey={(record) => `${record.timestamp}-${record.type}-${record.action || ''}`}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => t.paginationTotal(range[0], range[1], total),
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={t.modalTitle}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedLog && (
          <div>
            <pre style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              maxHeight: '400px',
              overflow: 'auto'
            }}>
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LogViewer; 