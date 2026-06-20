'use client';
import React from 'react';
import { Breadcrumb as AntBreadcrumb, Dropdown } from 'antd';
import { DownOutlined, HomeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
  menuItems?: Array<{ label: string; href: string }>;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate?: (href: string) => void;
}

export default function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  const router = useRouter();

  const handleNavigation = (href: string) => {
    if (onNavigate) {
      onNavigate(href);
    } else {
      router.push(href);
    }
  };

  // Convert custom items to Ant Design breadcrumb items format
  const breadcrumbItems = items.map((item, index) => ({
    title: item.current ? (
      <span style={{ color: '#8c8c8c' }}>{item.label}</span>
    ) : (
      (() => {
        const content = (
          <span
            onClick={() => item.href && handleNavigation(item.href)}
            style={{
              color: '#1890ff',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {index === 0 ? <HomeOutlined /> : null} {item.label}
            {item.menuItems?.length ? (
              <>
                {' '}
                <DownOutlined style={{ fontSize: 12 }} />
              </>
            ) : null}
          </span>
        );

        if (!item.menuItems?.length) return content;

        return (
          <Dropdown
            menu={{
              items: item.menuItems.map((m) => ({
                key: m.href,
                label: m.label,
                onClick: () => handleNavigation(m.href),
              })),
            }}
            trigger={['click']}
          >
            {content}
          </Dropdown>
        );
      })()
    )
  }));

  return <AntBreadcrumb items={breadcrumbItems} />;
} 