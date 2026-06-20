'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MonthlyInvoiceDetailIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/sales/monthly-invoices');
  }, [router]);
  return null;
}
