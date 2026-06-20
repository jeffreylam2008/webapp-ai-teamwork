import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { systemLogger } from '@/lib/simple-logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const logType = searchParams.get('type') || 'user-actions';
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const logsDir = path.join(process.cwd(), 'logs');
    const logFile = path.join(logsDir, `${logType}-${date}.log`);
    // Check if log file exists
    if (!fs.existsSync(logFile)) {
      return NextResponse.json({
        success: false,
        error: 'Log file not found',
        timestamp: new Date().toISOString()
      }, { status: 404 });
    }
    // Read log file
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    // Parse JSON logs
    const logs = logLines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(log => log !== null)
      .reverse(); // Most recent first
    // Apply pagination
    const paginatedLogs = logs.slice(offset, offset + limit);
    // Log this access
    systemLogger.info('Logs accessed', {
      logType,
      date,
      limit,
      offset,
      totalLogs: logs.length,
      returnedLogs: paginatedLogs.length
    });
    return NextResponse.json({
      success: true,
      data: paginatedLogs,
      total: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    systemLogger.error('Error accessing logs', error as Error);
    return NextResponse.json({
      success: false,
      error: 'Failed to access logs',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const logType = searchParams.get('type');
    const date = searchParams.get('date');
    
    if (!logType || !date) {
      return NextResponse.json({
        success: false,
        error: 'Log type and date are required',
      }, { status: 400 });
    }
    
    const logsDir = path.join(process.cwd(), 'logs');
    const logFile = path.join(logsDir, `${logType}-${date}.log`);
    
    // Delete the log file
    fs.unlinkSync(logFile);
    systemLogger.info('Log file deleted', { logType, date });
    
    return NextResponse.json({
      success: true,
      message: 'Log file deleted successfully',
    });
  } catch (error) {
    systemLogger.error('Error deleting log file', error as Error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete log file',
    }, { status: 500 });
  }
} 
