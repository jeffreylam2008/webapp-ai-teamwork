'use client';

import { useCallback, useState } from 'react';

export function useCustomerTipsToggle() {
  const [tipsOpen, setTipsOpen] = useState(false);

  const openTips = useCallback(() => {
    setTipsOpen(true);
  }, []);

  const closeTips = useCallback(() => {
    setTipsOpen(false);
  }, []);

  return { tipsOpen, openTips, closeTips, setTipsOpen };
}
