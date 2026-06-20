'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Handles `/sales/quotations/create` without a transaction code — send users back to the list. */
export default function QuotationCreateIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/sales/quotations');
  }, [router]);
  return null;
}
