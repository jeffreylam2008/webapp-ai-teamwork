'use client';

import { useMemo, useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Input, Space } from 'antd';
import {
  buildQuickItemCodeOptions,
  findProductByItemCode,
  type QuickItemProduct,
} from '@/lib/transactionLineItems';

type QuickItemCodeSearchBarProps = {
  products: QuickItemProduct[];
  placeholder: string;
  itemsButtonLabel: string;
  productsAvailable: boolean;
  formDataUnavailableMessage: string;
  itemNotFoundMessage: (code: string) => string;
  onAdd: (product: QuickItemProduct) => void;
  onOpenItemModal: () => void;
  onError: (message: string) => void;
  filterProduct?: (product: QuickItemProduct) => boolean;
  inputWidth?: number;
};

export default function QuickItemCodeSearchBar({
  products,
  placeholder,
  itemsButtonLabel,
  productsAvailable,
  formDataUnavailableMessage,
  itemNotFoundMessage,
  onAdd,
  onOpenItemModal,
  onError,
  filterProduct,
  inputWidth = 300,
}: QuickItemCodeSearchBarProps) {
  const [quickItemCode, setQuickItemCode] = useState('');

  const selectableProducts = useMemo(() => {
    if (!filterProduct) return products;
    return products.filter(filterProduct);
  }, [products, filterProduct]);

  const quickItemCodeOptions = useMemo(
    () => buildQuickItemCodeOptions(selectableProducts, quickItemCode),
    [selectableProducts, quickItemCode]
  );

  const addByCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!productsAvailable) {
      onError(formDataUnavailableMessage);
      return;
    }
    const product = findProductByItemCode(selectableProducts, trimmed);
    if (!product) {
      onError(itemNotFoundMessage(trimmed));
      return;
    }
    onAdd(product);
    setQuickItemCode('');
  };

  const handleSelect = (value: string) => {
    const product = findProductByItemCode(selectableProducts, String(value));
    if (product) {
      onAdd(product);
      setQuickItemCode('');
      return;
    }
    setQuickItemCode(String(value));
  };

  return (
    <Space wrap>
      <AutoComplete
        value={quickItemCode}
        options={quickItemCodeOptions}
        onChange={setQuickItemCode}
        onSelect={handleSelect}
        style={{ width: inputWidth }}
        defaultActiveFirstOption
      >
        <Input placeholder={placeholder} onPressEnter={() => addByCode(quickItemCode)} allowClear />
      </AutoComplete>
      <Button type="primary" icon={<SearchOutlined />} onClick={onOpenItemModal}>
        {itemsButtonLabel}
      </Button>
    </Space>
  );
}
