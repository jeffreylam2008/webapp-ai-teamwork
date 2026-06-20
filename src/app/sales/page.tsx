'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Breadcrumb target `/sales` — default to the main sales orders list. */
export default function SalesIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/sales/orders');
  }, [router]);
  return null;
}
