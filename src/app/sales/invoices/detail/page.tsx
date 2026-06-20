'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InvoiceDetailIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/sales/invoices');
  }, [router]);
  return null;
}
