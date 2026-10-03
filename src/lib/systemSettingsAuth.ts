import type { NextRequest } from 'next/server';
import { requirePermissionKey } from '@/lib/transactionPermissionAuth';

/** Auth required to open/save Administration → System settings. */
export async function requireViewSystem(request: NextRequest) {
  return requirePermissionKey(request, 'view_system');
}
