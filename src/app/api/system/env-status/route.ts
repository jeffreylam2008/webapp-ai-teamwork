import { NextResponse } from 'next/server';
import { getApplicationEnvStatus } from '@/lib/env-config.server';

export async function GET() {
  const status = getApplicationEnvStatus();
  return NextResponse.json({
    success: status.ok,
    locked: status.locked,
    message: status.message,
    missingFile: status.missingFile ?? false,
    missingVars: status.missingVars ?? [],
  });
}
