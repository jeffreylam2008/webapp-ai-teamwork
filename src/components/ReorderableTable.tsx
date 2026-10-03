'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HolderOutlined } from '@ant-design/icons';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '@/contexts/AuthContext';
import {
  PINNED_COLUMN_KEYS,
  applyColumnOrder,
  getColumnKey,
  getColumnOrderStorageKey,
  getDraggableColumnKeys,
  mergeColumnOrder,
  readColumnOrder,
  reorderColumnKeys,
  writeColumnOrder,
} from '@/lib/tableColumnOrder';

interface ReorderableTableProps<RecordType extends object>
  extends Omit<TableProps<RecordType>, 'columns'> {
  tableKey: string;
  columns: ColumnsType<RecordType>;
}

interface DraggableColumnTitleProps {
  columnKey: string;
  draggingKey: string | null;
  dropTargetKey: string | null;
  setDraggingKey: (key: string | null) => void;
  setDropTargetKey: (key: string | null) => void;
  onReorder: (dragKey: string, dropKey: string) => void;
  children: React.ReactNode;
}

function DraggableColumnTitle({
  columnKey,
  draggingKey,
  dropTargetKey,
  setDraggingKey,
  setDropTargetKey,
  onReorder,
  children,
}: DraggableColumnTitleProps) {
  const isDragging = draggingKey === columnKey;
  const isDropTarget = dropTargetKey === columnKey && draggingKey !== columnKey;

  return (
    <div
      className={`reorderable-table-header${isDragging ? ' reorderable-table-header--dragging' : ''}${
        isDropTarget ? ' reorderable-table-header--drop-target' : ''
      }`}
      draggable
      title="Drag to reorder column"
      onDragStart={(event) => {
        setDraggingKey(columnKey);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', columnKey);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (draggingKey && draggingKey !== columnKey) {
          setDropTargetKey(columnKey);
        }
      }}
      onDragLeave={() => {
        if (dropTargetKey === columnKey) {
          setDropTargetKey(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const dragKey = draggingKey ?? event.dataTransfer.getData('text/plain');
        if (dragKey && dragKey !== columnKey) {
          onReorder(dragKey, columnKey);
        }
        setDraggingKey(null);
        setDropTargetKey(null);
      }}
      onDragEnd={() => {
        setDraggingKey(null);
        setDropTargetKey(null);
      }}
    >
      <HolderOutlined className="reorderable-table-header__handle" aria-hidden />
      <span className="reorderable-table-header__label">{children}</span>
    </div>
  );
}

export default function ReorderableTable<RecordType extends object>({
  tableKey,
  columns,
  ...tableProps
}: ReorderableTableProps<RecordType>) {
  const { user } = useAuth();
  const storageKey = useMemo(
    () => getColumnOrderStorageKey(tableKey, user?.uid ?? user?.employee_code),
    [tableKey, user?.employee_code, user?.uid]
  );

  const defaultKeys = useMemo(() => getDraggableColumnKeys(columns), [columns]);
  const defaultKeysSignature = defaultKeys.join('|');

  const [orderKeys, setOrderKeys] = useState<string[]>(defaultKeys);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  useEffect(() => {
    const stored = readColumnOrder(storageKey);
    const nextKeys = stored?.length
      ? mergeColumnOrder(stored, defaultKeys)
      : defaultKeys;
    setOrderKeys(nextKeys);
  }, [defaultKeys, defaultKeysSignature, storageKey]);

  const handleReorder = useCallback(
    (dragKey: string, dropKey: string) => {
      setOrderKeys((previous) => {
        const base = previous.length ? previous : defaultKeys;
        const next = reorderColumnKeys(base, dragKey, dropKey);
        writeColumnOrder(storageKey, next);
        return next;
      });
    },
    [defaultKeys, storageKey]
  );

  const orderedColumns = useMemo(() => {
    const baseColumns = applyColumnOrder(columns, orderKeys);

    return baseColumns.map((column) => {
      const columnKey = getColumnKey(column);
      if (!columnKey || PINNED_COLUMN_KEYS.has(columnKey)) {
        return column;
      }

      const titleContent = column.title;
      if (typeof titleContent === 'function') {
        return column;
      }

      return {
        ...column,
        title: (
          <DraggableColumnTitle
            columnKey={columnKey}
            draggingKey={draggingKey}
            dropTargetKey={dropTargetKey}
            setDraggingKey={setDraggingKey}
            setDropTargetKey={setDropTargetKey}
            onReorder={handleReorder}
          >
            {titleContent}
          </DraggableColumnTitle>
        ),
      };
    });
  }, [columns, draggingKey, dropTargetKey, handleReorder, orderKeys]);

  return <Table {...tableProps} columns={orderedColumns} />;
}
