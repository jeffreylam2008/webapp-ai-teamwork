'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Descriptions, Modal, Table, Typography, message } from 'antd';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { formatCurrency } from '@/utils/formatCurrency';
import { getCustomerTipsTexts, type CustomerTipsLang } from '../i18n';
import type { CustomerPreviousItem, CustomerTipsProduct } from '../types';

const { Text } = Typography;

interface CustomerTipsModalProps {
  open: boolean;
  onClose: () => void;
  custCode: string;
  customerName?: string;
  transCode: string;
  token: string | null;
  lang: CustomerTipsLang;
  onAddItem: (product: CustomerTipsProduct) => void;
  detailLabels: {
    itemCode: string;
    englishName: string;
    chineseName: string;
    unit: string;
    price: string;
    qty: string;
    discount: string;
  };
}

export function CustomerTipsModal({
  open,
  onClose,
  custCode,
  customerName = '',
  transCode,
  token,
  lang,
  onAddItem,
  detailLabels,
}: CustomerTipsModalProps) {
  const t = getCustomerTipsTexts(lang);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CustomerPreviousItem[]>([]);

  const loadItems = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !token) {
        setItems([]);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          cust_code: trimmed,
          exclude_trans_code: transCode,
        });
        const res = await fetchWithAuth(
          `/api/customizations/quotations/customer-previous-items?${params.toString()}`,
          token,
          { cache: 'no-store' }
        );
        const result = await res.json();
        if (!result?.success) {
          message.error(result?.error || t.loadFailed);
          setItems([]);
          return;
        }
        setItems(result.data?.items || []);
      } catch (error) {
        console.error(error);
        message.error(t.loadFailed);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [token, transCode, t]
  );

  useEffect(() => {
    if (!open) return;
    const code = custCode.trim();
    if (code && token) {
      void loadItems(code);
    } else {
      setItems([]);
    }
  }, [open, custCode, token, loadItems]);

  const handleAdd = (record: CustomerPreviousItem, e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onAddItem({
      item_code: record.item_code,
      eng_name: record.eng_name,
      chi_name: record.chi_name,
      unit: record.unit,
      price: record.price,
    });
    message.success(t.itemAdded.replace('{code}', record.item_code));
  };

  const trimmedCustCode = custCode.trim();

  return (
    <Modal
      title={t.panelTitle}
      open={open}
      onCancel={onClose}
      width={1000}
      footer={
        <Button type="default" onClick={onClose}>
          {t.close}
        </Button>
      }
      destroyOnClose
    >
      <Text type="secondary" className="block mb-4">
        {t.panelDescription}
      </Text>

      {!trimmedCustCode ? (
        <div className="text-center py-8 text-gray-500">{t.noCustomer}</div>
      ) : (
        <>
          <Descriptions size="small" bordered column={1} className="mb-4 max-w-xl">
            <Descriptions.Item label={t.customerCode}>{trimmedCustCode}</Descriptions.Item>
            {customerName ? (
              <Descriptions.Item label={t.customerName}>{customerName}</Descriptions.Item>
            ) : null}
          </Descriptions>

          {items.length === 0 && !loading ? (
            <div className="text-center py-8 text-gray-500">{t.noItems}</div>
          ) : (
            <>
              <Text type="secondary" className="block mb-3">
                {t.clickRowHint}
              </Text>
              <Table
                size="small"
                rowKey="item_code"
                loading={loading}
                dataSource={items}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ y: 360 }}
                columns={[
                  {
                    title: detailLabels.itemCode,
                    dataIndex: 'item_code',
                    key: 'item_code',
                    width: '14%',
                    render: (code: string, record: CustomerPreviousItem) => (
                      <Button
                        type="link"
                        size="small"
                        className="!p-0 !h-auto font-medium"
                        onClick={(e) => handleAdd(record, e)}
                      >
                        {code}
                      </Button>
                    ),
                  },
                  { title: detailLabels.englishName, dataIndex: 'eng_name', key: 'eng_name', width: '20%' },
                  { title: detailLabels.chineseName, dataIndex: 'chi_name', key: 'chi_name', width: '16%' },
                  { title: detailLabels.qty, dataIndex: 'qty', key: 'qty', width: '7%' },
                  { title: detailLabels.unit, dataIndex: 'unit', key: 'unit', width: '7%' },
                  {
                    title: detailLabels.price,
                    dataIndex: 'price',
                    key: 'price',
                    width: '9%',
                    render: (price: number) => formatCurrency(price),
                  },
                  { title: detailLabels.discount, dataIndex: 'discount', key: 'discount', width: '7%' },
                  {
                    title: t.lastTransCode,
                    dataIndex: 'last_trans_code',
                    key: 'last_trans_code',
                    width: '11%',
                  },
                  {
                    title: t.addItem,
                    key: 'action',
                    width: '12%',
                    render: (_: unknown, record: CustomerPreviousItem) => (
                      <Button
                        type="link"
                        size="small"
                        icon={<PlusOutlined />}
                        className="!p-0 !h-auto"
                        onClick={(e) => handleAdd(record, e)}
                      >
                        {t.addToQuotation}
                      </Button>
                    ),
                  },
                ]}
              />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
