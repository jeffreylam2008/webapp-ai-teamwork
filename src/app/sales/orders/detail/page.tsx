'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SalesOrderDetailIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/sales/orders');
  }, [router]);

  return null;
}

