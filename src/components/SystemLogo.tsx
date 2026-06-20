'use client';

import React from 'react';
import {
  AppstoreAddOutlined,
  AppstoreOutlined,
  HomeOutlined,
  ShopOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, React.ReactNode> = {
  AppstoreAddOutlined: <AppstoreAddOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  HomeOutlined: <HomeOutlined />,
  ShopOutlined: <ShopOutlined />,
  SettingOutlined: <SettingOutlined />,
  UserOutlined: <UserOutlined />,
};

const DEFAULT_ICON = <AppstoreAddOutlined />;

function isImageUrl(value: string): boolean {
  const v = value.trim();
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/');
}

interface SystemLogoProps {
  logo: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
  imageSize?: number;
}

/**
 * Renders logo from t_systems: image URL (http/https or /) or Ant Design icon name.
 * Defaults to AppstoreAddOutlined when no logo or unknown value.
 */
export default function SystemLogo({
  logo,
  className,
  style,
  iconStyle,
  imageSize = 32,
}: SystemLogoProps) {
  const containerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', ...style };

  if (!logo || typeof logo !== 'string' || logo.trim() === '') {
    return (
      <span className={className} style={containerStyle}>
        <span style={{ fontSize: 'inherit', color: 'inherit', ...iconStyle }}>{DEFAULT_ICON}</span>
      </span>
    );
  }

  const trimmed = logo.trim();

  if (isImageUrl(trimmed)) {
    return (
      <span className={className} style={containerStyle}>
        <img
          src={trimmed}
          alt=""
          style={{ width: imageSize, height: imageSize, objectFit: 'contain' }}
        />
      </span>
    );
  }

  const iconName = trimmed.replace(/\s/g, '');
  const icon = ICON_MAP[iconName] ?? DEFAULT_ICON;
  return (
    <span className={className} style={containerStyle}>
      <span style={{ fontSize: 'inherit', color: 'inherit', ...iconStyle }}>{icon}</span>
    </span>
  );
}
