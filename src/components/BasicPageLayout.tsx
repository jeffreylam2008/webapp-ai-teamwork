'use client';

import React, { useEffect, useRef } from 'react';
import { Typography, Space } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * When set, Ctrl+Enter (Windows/Linux) or Cmd+Enter (macOS) triggers the same
 * action as the primary save control in the page button bar. Ignored while
 * {@link ActionBarSaveShortcutConfig.disabled} is true, when focus is inside
 * an Ant Design modal, or when the event target is not a normal field (e.g. skips contenteditable).
 */
export type ActionBarSaveShortcutConfig = {
  onSave: () => void;
  /** When true, the shortcut is ignored (e.g. already saving, view mode). */
  disabled?: boolean;
};

interface BasicPageLayoutProps {
  breadcrumb: React.ReactNode;
  buttonBar?: React.ReactNode;
  title?: string;
  description?: string;
  message?: React.ReactNode;
  children: React.ReactNode;
  actionBarSaveShortcut?: ActionBarSaveShortcutConfig;
}

const BasicPageLayout: React.FC<BasicPageLayoutProps> = ({
  breadcrumb,
  buttonBar,
  title,
  description,
  message,
  children,
  actionBarSaveShortcut,
}) => {
  const shortcutActive = Boolean(actionBarSaveShortcut);
  const callbackRef = useRef(actionBarSaveShortcut?.onSave);
  const disabledRef = useRef(actionBarSaveShortcut?.disabled ?? false);

  callbackRef.current = actionBarSaveShortcut?.onSave;
  disabledRef.current = actionBarSaveShortcut?.disabled ?? false;

  useEffect(() => {
    if (!shortcutActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || (!e.ctrlKey && !e.metaKey)) return;

      const target = e.target;
      if (target instanceof Element && target.closest('.ant-modal')) return;
      if (
        target instanceof HTMLElement &&
        target.isContentEditable
      ) {
        return;
      }

      if (disabledRef.current) return;

      e.preventDefault();
      callbackRef.current?.();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [shortcutActive]);

  return (
    <div className="w-full">
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        {breadcrumb}
      </div>

      {buttonBar}

      {(title || description) && (
        <div className="px-4 py-1 bg-gray-50 border-b border-gray-200">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {title && <Title level={2} style={{ margin: 0 }}>{title}</Title>}
            {description && <Paragraph style={{ margin: 0, color: '#666' }}>{description}</Paragraph>}
          </Space>
        </div>
      )}

      {message}

      {children}
    </div>
  );
};

export default BasicPageLayout;
