'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Breadcrumb target `/purchasing` — default to purchase orders. */
export default function PurchasingIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/purchasing/purchases');
  }, [router]);
  return null;
}
