import { NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { resolvedDbConfig } from '@/lib/db-connection-config';

export async function GET() {
  try {
    // Test basic query
    const testResult = await dbService.query('SELECT 1 as test, NOW() as timestamp');
    
    // Test table existence
    const tablesResult = await dbService.query('SHOW TABLES');
    const configInfo = {
      host: resolvedDbConfig.host,
      database: resolvedDbConfig.database,
      port: resolvedDbConfig.port,
    };
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      data: {
        test: testResult.data,
        tables: tablesResult.data,
        config: configInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
} 
