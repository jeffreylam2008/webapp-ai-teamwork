'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Breadcrumb target `/warehouse` — default to stock list. */
export default function WarehouseIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/warehouse/stock');
  }, [router]);
  return null;
}
