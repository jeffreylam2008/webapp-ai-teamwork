'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, Descriptions } from 'antd';
import type { DescriptionsProps } from 'antd';

/** Header flags shared by transaction detail APIs (SO / QTA / INV / GRN / PO, etc.) */
export function transactionDetailReferenceLink(ref: string | undefined): ReactNode {
  const r = String(ref || '').trim();
  if (!r) return '-';
  const upper = r.toUpperCase();
  if (upper.startsWith('PO')) {
    return (
      <Link href={`/purchasing/purchases/detail/${encodeURIComponent(r)}`} className="text-blue-600 hover:text-blue-800 hover:underline">
        {r}
      </Link>
    );
  }
  if (upper.startsWith('SO')) {
    return (
      <Link href={`/sales/orders/detail/${encodeURIComponent(r)}`} className="text-blue-600 hover:text-blue-800 hover:underline">
        {r}
      </Link>
    );
  }
  if (upper.startsWith('QTA')) {
    return (
      <Link href={`/sales/quotations/detail/${encodeURIComponent(r)}`} className="text-blue-600 hover:text-blue-800 hover:underline">
        {r}
      </Link>
    );
  }
  return r;
}

export type TransactionHeaderStatusSource = {
  is_void?: number;
  is_settle?: number;
  is_convert?: number;
};

export function getTransactionDetailStatusKey(h: TransactionHeaderStatusSource): 'Void' | 'Settled' | 'Converted' | 'Active' {
  if (h.is_void === 1) return 'Void';
  if (h.is_settle === 1) return 'Settled';
  if (h.is_convert === 1) return 'Converted';
  return 'Active';
}

export function transactionDetailStatusBadgeClassName(statusKey: string): string {
  const base = 'px-2 py-1 rounded text-xs font-medium ';
  if (statusKey === 'Active') return `${base}bg-green-100 text-green-800`;
  if (statusKey === 'Void') return `${base}bg-red-100 text-red-800`;
  if (statusKey === 'Settled') return `${base}bg-blue-100 text-blue-800`;
  if (statusKey === 'Converted') return `${base}bg-purple-100 text-purple-800`;
  return `${base}bg-gray-100 text-gray-800`;
}

export function TransactionDetailInfoCard({
  title,
  className,
  children,
}: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} size="small" className={className}>
      {children}
    </Card>
  );
}

/** Matches warehouse stock detail “交易資料” bordered table style */
export const TransactionDetailBorderedDescriptions = Object.assign(
  (props: DescriptionsProps) => <Descriptions column={1} size="small" bordered {...props} />,
  { Item: Descriptions.Item }
);
