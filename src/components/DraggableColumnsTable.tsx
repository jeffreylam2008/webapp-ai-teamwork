'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Table } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import type { TableProps, ColumnsType } from 'antd/es/table';
import { useAuth } from '@/contexts/AuthContext';
import { getColumnKey, useOrderedColumns } from '@/hooks/useOrderedColumns';

type DraggableColumnsTableProps<T extends object> = TableProps<T> & {
  tableId: string;
  pinnedColumnKeys?: string[];
};

function buildStorageKey(tableId: string, userKey: string | number | undefined): string {
  const userPart = userKey != null ? String(userKey) : 'anon';
  return `table-column-order:${userPart}:${tableId}`;
}

const DraggableColumnsTable = <T extends object>({
  tableId,
  columns,
  pinnedColumnKeys,
  components: componentsProp,
  ...tableProps
}: DraggableColumnsTableProps<T>) => {
  const { user } = useAuth();
  const storageKey = buildStorageKey(tableId, user?.employee_code ?? user?.username);
  const dragKeyRef = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const { orderedColumns, moveColumn, pinnedColumnKeys: resolvedPinnedKeys } = useOrderedColumns(
    columns ?? [],
    storageKey,
    pinnedColumnKeys
  );

  const handleDragStart = useCallback(
    (columnKey: string) => (event: React.DragEvent<HTMLTableCellElement>) => {
      dragKeyRef.current = columnKey;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', columnKey);
    },
    []
  );

  const handleDragOver = useCallback(
    (columnKey: string) => (event: React.DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverKey((prev) => (prev === columnKey ? prev : columnKey));
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverKey(null);
  }, []);

  const handleDrop = useCallback(
    (targetKey: string) => (event: React.DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      const sourceKey = dragKeyRef.current ?? event.dataTransfer.getData('text/plain');
      dragKeyRef.current = null;
      setDragOverKey(null);
      if (sourceKey) moveColumn(sourceKey, targetKey);
    },
    [moveColumn]
  );

  const handleDragEnd = useCallback(() => {
    dragKeyRef.current = null;
    setDragOverKey(null);
  }, []);

  const columnsWithDrag = useMemo(
    () =>
      orderedColumns.map((col, index) => {
        const columnKey = getColumnKey(col, index);
        const draggable = !resolvedPinnedKeys.includes(columnKey);
        const originalOnHeaderCell = col.onHeaderCell;

        return {
          ...col,
          title: draggable ? (
            <span className="draggable-column-title">
              <HolderOutlined className="draggable-column-handle" aria-hidden />
              <span>{col.title as React.ReactNode}</span>
            </span>
          ) : (
            col.title
          ),
          onHeaderCell: (column: ColumnsType<T>[number]) => {
            const base = (originalOnHeaderCell as ((col: ColumnsType<T>[number]) => Record<string, unknown>) | undefined)?.(column) ?? {};
            if (!draggable) return base;
            return {
              ...base,
              draggable: true,
              onDragStart: handleDragStart(columnKey),
              onDragOver: handleDragOver(columnKey),
              onDragLeave: handleDragLeave,
              onDrop: handleDrop(columnKey),
              onDragEnd: handleDragEnd,
              className: [
                base.className,
                'draggable-table-header',
                dragOverKey === columnKey ? 'drag-over' : '',
              ]
                .filter(Boolean)
                .join(' '),
              title: 'Drag to reorder column',
            };
          },
        };
      }),
    [
      orderedColumns,
      resolvedPinnedKeys,
      dragOverKey,
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
    ]
  );

  const components = useMemo(
    () => ({
      ...componentsProp,
      header: {
        ...componentsProp?.header,
        cell: DraggableHeaderCell,
      },
    }),
    [componentsProp]
  );

  return (
    <Table<T>
      {...tableProps}
      columns={columnsWithDrag}
      components={components}
    />
  );
};

function DraggableHeaderCell(props: React.HTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} />;
}

export default DraggableColumnsTable;
