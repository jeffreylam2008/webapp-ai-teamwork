'use client';

import { Button, Collapse, Form, Switch, Table } from 'antd';
import type { FormInstance } from 'antd/es/form';
import {
  FUNCTION_ACCESS_AREAS,
  getFunctionRowsForAccessArea,
  isViewOnlyPermissionRow,
  type FunctionPermissionRow,
} from '@/config/transactionPermissions';

export type FunctionAccessMatrixLabels = {
  colFunction: string;
  colView: string;
  colCreate: string;
  colEdit: string;
  colDelete: string;
  linkAll: string;
  linkNone: string;
  /** Optional area title overrides (keyed by area id). */
  areaLabels?: Partial<Record<string, string>>;
};

type Props = {
  form: FormInstance;
  labels: FunctionAccessMatrixLabels;
  /** When set, switches that cannot be granted are disabled. */
  canEnablePermissionKey?: (key: string) => boolean;
  /** Called when user clicks All but is not allowed to grant. */
  onGrantDenied?: () => void;
  showRowQuickActions?: boolean;
};

/**
 * Access matrix grouped into Sales / Purchase Order / Warehouse / System.
 * Preview layout for roles & users function-access forms.
 */
export default function FunctionAccessMatrix({
  form,
  labels,
  canEnablePermissionKey,
  onGrantDenied,
  showRowQuickActions = true,
}: Props) {
  const canEnable = canEnablePermissionKey ?? (() => true);

  const columns = [
    {
      title: labels.colFunction,
      dataIndex: 'label',
      key: 'label',
      width: 220,
      render: (label: string, row: FunctionPermissionRow) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{label}</span>
          {showRowQuickActions ? (
            <>
              <Button
                type="link"
                size="small"
                className="p-0 h-auto text-xs"
                onClick={() => {
                  const keys = isViewOnlyPermissionRow(row)
                    ? [row.view]
                    : [row.view, row.create, row.edit, row.delete];
                  if (keys.some((k) => !canEnable(k))) {
                    onGrantDenied?.();
                    return;
                  }
                  if (isViewOnlyPermissionRow(row)) {
                    form.setFieldsValue({
                      [row.view]: true,
                      [row.create]: false,
                      [row.edit]: false,
                      [row.delete]: false,
                    });
                  } else {
                    form.setFieldsValue({
                      [row.create]: true,
                      [row.view]: true,
                      [row.edit]: true,
                      [row.delete]: true,
                    });
                  }
                }}
              >
                {labels.linkAll}
              </Button>
              <Button
                type="link"
                size="small"
                className="p-0 h-auto text-xs"
                onClick={() => {
                  form.setFieldsValue({
                    [row.create]: false,
                    [row.view]: false,
                    [row.edit]: false,
                    [row.delete]: false,
                  });
                }}
              >
                {labels.linkNone}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
    {
      title: labels.colView,
      key: 'view',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, row: FunctionPermissionRow) => (
        <Form.Item name={row.view} valuePropName="checked" noStyle>
          <Switch size="small" disabled={!canEnable(row.view)} />
        </Form.Item>
      ),
    },
    {
      title: labels.colCreate,
      key: 'create',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, row: FunctionPermissionRow) =>
        isViewOnlyPermissionRow(row) ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <Form.Item name={row.create} valuePropName="checked" noStyle>
            <Switch size="small" disabled={!canEnable(row.create)} />
          </Form.Item>
        ),
    },
    {
      title: labels.colEdit,
      key: 'edit',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, row: FunctionPermissionRow) =>
        isViewOnlyPermissionRow(row) ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <Form.Item name={row.edit} valuePropName="checked" noStyle>
            <Switch size="small" disabled={!canEnable(row.edit)} />
          </Form.Item>
        ),
    },
    {
      title: labels.colDelete,
      key: 'delete',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, row: FunctionPermissionRow) =>
        isViewOnlyPermissionRow(row) ? (
          <span className="text-neutral-400">—</span>
        ) : (
          <Form.Item name={row.delete} valuePropName="checked" noStyle>
            <Switch size="small" disabled={!canEnable(row.delete)} />
          </Form.Item>
        ),
    },
  ];

  const items = FUNCTION_ACCESS_AREAS.map((area) => {
    const rows = getFunctionRowsForAccessArea(area);
    const title = labels.areaLabels?.[area.id] ?? area.label;
    return {
      key: area.id,
      label: (
        <span className="font-medium text-neutral-800">
          {title}
          <span className="ml-2 text-neutral-400 font-normal text-xs">({rows.length})</span>
        </span>
      ),
      children: (
        <Table
          dataSource={rows}
          rowKey="id"
          pagination={false}
          size="small"
          columns={columns}
        />
      ),
    };
  });

  return (
    <Collapse
      defaultActiveKey={FUNCTION_ACCESS_AREAS.map((a) => a.id)}
      items={items}
      size="small"
      className="bg-white"
    />
  );
}
