import { NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { tryGetResolvedDbConfig } from '@/lib/db-connection-config';

export async function GET() {
  try {
    // Test basic query
    const testResult = await dbService.query('SELECT 1 as test, NOW() as timestamp');
    
    // Test table existence
    const tablesResult = await dbService.query('SHOW TABLES');
    const config = tryGetResolvedDbConfig();
    const configInfo = config
      ? { host: config.host, database: config.database, port: config.port }
      : { host: null, database: null, port: null };
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
