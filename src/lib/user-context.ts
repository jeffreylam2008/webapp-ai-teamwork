import type { NextRequest } from 'next/server';

export type UserContext = {
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
};

function firstHeader(request: NextRequest, names: string[]): string | undefined {
  for (const n of names) {
    const v = request.headers.get(n);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function getUserFromRequest(request: NextRequest): UserContext {
  const userId = firstHeader(request, ['x-user-id', 'x-userid', 'x-employee-id', 'x-employee_code']);
  const username = firstHeader(request, ['x-username', 'x-user-name', 'x-user']);
  const ipAddress =
    firstHeader(request, ['x-forwarded-for'])?.split(',')?.[0]?.trim() ||
    firstHeader(request, ['x-real-ip']) ||
    undefined;
  const userAgent = firstHeader(request, ['user-agent']);

  return {
    userId,
    username,
    ipAddress,
    userAgent,
  };
}

