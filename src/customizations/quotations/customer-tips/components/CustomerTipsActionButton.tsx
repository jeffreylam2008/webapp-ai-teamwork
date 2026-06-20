'use client';

import { BulbOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { getCustomerTipsTexts, type CustomerTipsLang } from '../i18n';

interface CustomerTipsActionButtonProps {
  active: boolean;
  onClick: () => void;
  lang: CustomerTipsLang;
  disabled?: boolean;
}

export function CustomerTipsActionButton({
  active,
  onClick,
  lang,
  disabled = false,
}: CustomerTipsActionButtonProps) {
  const t = getCustomerTipsTexts(lang);

  return (
    <Button
      icon={<BulbOutlined />}
      type={active ? 'primary' : 'default'}
      onClick={onClick}
      disabled={disabled}
    >
      {t.tipsButton}
    </Button>
  );
}
