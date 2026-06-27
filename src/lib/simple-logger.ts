import fs from 'fs';
import path from 'path';
import { logDateKey, logTimestamp } from '@/lib/datetime';

// Define types for metadata
interface LogMeta {
  [key: string]: string | number | boolean | null | undefined | object;
}

// Simple logger without winston dependency
class SimpleLogger {
  private logsDir: string;

  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDir();
  }

  private ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private writeLog(type: string, level: string, message: string, meta?: LogMeta) {
    const now = new Date();
    const timestamp = logTimestamp(now);
    const logEntry = {
      timestamp,
      level,
      message,
      type,
      ...meta
    };

    const logFile = path.join(this.logsDir, `${type}-${logDateKey(now)}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  info(message: string, meta?: LogMeta) {
    this.writeLog('user-actions', 'info', message, meta);
  }

  error(message: string, error?: Error, meta?: LogMeta) {
    this.writeLog('errors', 'error', message, { 
      error: error?.message, 
      stack: error?.stack,
      ...meta 
    });
    // Only show errors in console in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`[ERROR] ${message}`, error || '', meta || '');
    }
  }

  warn(message: string, meta?: LogMeta) {
    this.writeLog('system', 'warn', message, meta);
    // Only show warnings in console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  }

  debug(message: string, meta?: LogMeta) {
    this.writeLog('system', 'debug', message, meta);
    // Debug logs only go to file, not console
  }
}

const simpleLogger = new SimpleLogger();

// User action logging interface
export interface UserAction {
  userId?: string;
  username?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: LogMeta;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  timestamp?: Date;
}

// User action logger
export const userActionLogger = {
  log: (action: UserAction) => {
    const logData = {
      ...action,
      timestamp: action.timestamp ? logTimestamp(action.timestamp) : logTimestamp(),
      type: 'USER_ACTION',
    };
    
    simpleLogger.info('User Action', logData);
  },
  
  // Convenience methods for common actions
  login: (userId: string, username: string, ipAddress?: string, userAgent?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'LOGIN',
      resource: 'AUTH',
      ipAddress,
      userAgent,
    });
  },
  
  logout: (userId: string, username: string, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'LOGOUT',
      resource: 'AUTH',
      ipAddress,
    });
  },
  
  create: (userId: string, username: string, resource: string, resourceId: string, details?: LogMeta, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'CREATE',
      resource,
      resourceId,
      details,
      ipAddress,
    });
  },
  
  update: (userId: string, username: string, resource: string, resourceId: string, details?: LogMeta, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'UPDATE',
      resource,
      resourceId,
      details,
      ipAddress,
    });
  },
  
  delete: (userId: string, username: string, resource: string, resourceId: string, details?: LogMeta, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'DELETE',
      resource,
      resourceId,
      details,
      ipAddress,
    });
  },
  
  view: (userId: string, username: string, resource: string, resourceId?: string, details?: LogMeta, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'VIEW',
      resource,
      resourceId,
      details,
      ipAddress,
    });
  },
  
  search: (userId: string, username: string, resource: string, query: string, resultsCount: number, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'SEARCH',
      resource,
      details: { query, resultsCount },
      ipAddress,
    });
  },
  
  export: (userId: string, username: string, resource: string, format: string, recordCount: number, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'EXPORT',
      resource,
      details: { format, recordCount },
      ipAddress,
    });
  },
  
  import: (userId: string, username: string, resource: string, format: string, recordCount: number, ipAddress?: string) => {
    userActionLogger.log({
      userId,
      username,
      action: 'IMPORT',
      resource,
      details: { format, recordCount },
      ipAddress,
    });
  },
};

// System event logger
export const systemLogger = {
  info: (message: string, meta?: LogMeta) => {
    simpleLogger.info(message, { type: 'SYSTEM', ...meta });
  },
  
  warn: (message: string, meta?: LogMeta) => {
    simpleLogger.warn(message, { type: 'SYSTEM', ...meta });
  },
  
  error: (message: string, error?: Error, meta?: LogMeta) => {
    simpleLogger.error(message, error, { type: 'SYSTEM', ...meta });
  },
  
  debug: (message: string, meta?: LogMeta) => {
    simpleLogger.debug(message, { type: 'SYSTEM', ...meta });
  },
};

export default simpleLogger; 