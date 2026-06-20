import { NextRequest, NextResponse } from 'next/server';
import { userActionLogger, systemLogger } from '@/lib/simple-logger';
import { getUserFromRequest } from '@/lib/user-context';

export async function GET(request: NextRequest) {
  try {
    const userContext = getUserFromRequest(request);
    
    // Test different types of logging
    systemLogger.info('Test logging endpoint accessed', {
      endpoint: '/api/test-logging',
      timestamp: new Date().toISOString()
    });
    userActionLogger.view(
      userContext.userId || 'test-user',
      userContext.username || 'test-user',
      'TEST_LOGGING',
      'test-resource',
      { test: true, message: 'Testing logging system' },
      userContext.ipAddress
    );
    return NextResponse.json({
      success: true,
      message: 'Logging test completed successfully',
      userContext,
    });
  } catch (error) {
    systemLogger.error('Error in test logging endpoint', error as Error);
    return NextResponse.json({
      success: false,
      error: 'Test logging failed',
    }, { status: 500 });
  }
} 
