import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format,
  }),
  
  // User actions log file
  new DailyRotateFile({
    filename: path.join(process.cwd(), 'logs', 'user-actions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat,
    level: 'info',
  }),
  
  // Error log file
  new DailyRotateFile({
    filename: path.join(process.cwd(), 'logs', 'errors-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: fileFormat,
    level: 'error',
  }),
  
  // System events log file
  new DailyRotateFile({
    filename: path.join(process.cwd(), 'logs', 'system-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat,
    level: 'info',
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

// User action logging interface
export interface UserAction {
  userId?: string;
  username?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
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
      timestamp: action.timestamp || new Date(),
      type: 'USER_ACTION',
    };
    
    logger.info('User Action', logData);
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
  
  create: (userId: string, username: string, resource: string, resourceId: string, details?: Record<string, unknown>, ipAddress?: string) => {
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
  
  update: (userId: string, username: string, resource: string, resourceId: string, details?: Record<string, unknown>, ipAddress?: string) => {
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
  
  delete: (userId: string, username: string, resource: string, resourceId: string, details?: Record<string, unknown>, ipAddress?: string) => {
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
  
  view: (userId: string, username: string, resource: string, resourceId?: string, details?: Record<string, unknown>, ipAddress?: string) => {
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
  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, { type: 'SYSTEM', ...meta });
  },
  
  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, { type: 'SYSTEM', ...meta });
  },
  
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
    logger.error(message, { 
      type: 'SYSTEM', 
      error: error?.message, 
      stack: error?.stack,
      ...meta 
    });
  },
  
  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, { type: 'SYSTEM', ...meta });
  },
};



export default logger; 