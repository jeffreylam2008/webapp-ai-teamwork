# Logging System Documentation

## Overview

This application implements a comprehensive logging system using Winston to track all user actions, system events, and errors. The logging system provides detailed audit trails for security, debugging, and monitoring purposes.

## Features

### 1. Multi-Level Logging
- **User Actions**: Track all user interactions with the system
- **System Events**: Monitor system operations and database connections
- **Error Logging**: Capture and store all errors with stack traces
- **HTTP Requests**: Log all incoming HTTP requests with performance metrics

### 2. Log Rotation
- Daily log file rotation
- Automatic compression of old logs
- Configurable retention periods
- Size-based rotation (20MB max file size)

### 3. Structured Logging
- JSON format for easy parsing
- Timestamped entries
- Categorized log types
- Detailed metadata for each action

## Log Files

The system creates three types of log files in the `logs/` directory:

### 1. User Actions (`user-actions-YYYY-MM-DD.log`)
Tracks all user interactions including:
- Login/Logout events
- CRUD operations (Create, Read, Update, Delete)
- Search operations
- Export/Import activities
- Resource access

### 2. Errors (`errors-YYYY-MM-DD.log`)
Captures all system errors including:
- Database connection errors
- API errors
- Validation failures
- System exceptions

### 3. System Events (`system-YYYY-MM-DD.log`)
Records system-level events:
- Database connection status
- Application startup/shutdown
- Configuration changes
- Performance metrics

## Logged Information

Each log entry includes:

### User Actions
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "message": "User Action",
  "type": "USER_ACTION",
  "userId": "user123",
  "username": "john.doe",
  "action": "CREATE",
  "resource": "PRODUCTS",
  "resourceId": "PROD001",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "eng_name": "Product Name",
    "price": 99.99
  }
}
```

### HTTP Requests
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "http",
  "message": "HTTP Request",
  "type": "HTTP_REQUEST",
  "method": "GET",
  "path": "/api/products",
  "statusCode": 200,
  "duration": 45,
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "userId": "user123",
  "username": "john.doe"
}
```

## API Endpoints

### View Logs
```
GET /api/logs?type=user-actions&date=2024-01-15&limit=100&offset=0
```

Parameters:
- `type`: Log type (user-actions, errors, system)
- `date`: Date in YYYY-MM-DD format
- `limit`: Number of logs to return (default: 100)
- `offset`: Pagination offset (default: 0)

### Delete Logs
```
DELETE /api/logs?type=user-actions&date=2024-01-15
```

Parameters:
- `type`: Log type to delete
- `date`: Date of logs to delete

## Frontend Integration

### Log Viewer Component
The `LogViewer` component provides a user interface for:
- Viewing logs by type and date
- Filtering and searching logs
- Viewing detailed log information
- Deleting log files
- Pagination and sorting

### Usage
```tsx
import LogViewer from '@/components/LogViewer';

function AdminPage() {
  return (
    <div>
      <h1>System Administration</h1>
      <LogViewer />
    </div>
  );
}
```

## Logging in API Routes

### Automatic Logging
All API routes automatically log user actions when using the logging utilities:

```typescript
import { userActionLogger } from '@/lib/logger';
import { getUserFromRequest } from '@/lib/user-context';

export async function POST(request: NextRequest) {
  const userContext = getUserFromRequest(request);
  
  // ... API logic ...
  
  // Log the action
  userActionLogger.create(
    userContext.userId || 'anonymous',
    userContext.username || 'anonymous',
    'PRODUCTS',
    itemCode,
    { name, price },
    userContext.ipAddress
  );
}
```

### Available Logging Methods

#### User Actions
- `userActionLogger.login(userId, username, ipAddress, userAgent)`
- `userActionLogger.logout(userId, username, ipAddress)`
- `userActionLogger.create(userId, username, resource, resourceId, details, ipAddress)`
- `userActionLogger.update(userId, username, resource, resourceId, details, ipAddress)`
- `userActionLogger.delete(userId, username, resource, resourceId, details, ipAddress)`
- `userActionLogger.view(userId, username, resource, resourceId, details, ipAddress)`
- `userActionLogger.search(userId, username, resource, query, resultsCount, ipAddress)`
- `userActionLogger.export(userId, username, resource, format, recordCount, ipAddress)`
- `userActionLogger.import(userId, username, resource, format, recordCount, ipAddress)`

#### System Events
- `systemLogger.info(message, meta)`
- `systemLogger.warn(message, meta)`
- `systemLogger.error(message, error, meta)`
- `systemLogger.debug(message, meta)`

## Configuration

### Environment Variables
```bash
NODE_ENV=development  # Controls log level (debug in dev, warn in prod)
```

### Log Retention
- User Actions: 14 days
- Errors: 30 days
- System Events: 14 days
- Max file size: 20MB

### Log Levels
- `error`: 0 (highest priority)
- `warn`: 1
- `info`: 2
- `http`: 3
- `debug`: 4 (lowest priority)

## Security Considerations

### Sensitive Data
The logging system automatically excludes sensitive information:
- Passwords are never logged
- Credit card numbers are masked
- Personal identification data is anonymized when possible

### Access Control
- Log viewing requires administrative privileges
- Log files are stored securely on the server
- API endpoints include proper authentication checks

### Data Privacy
- IP addresses are logged for security purposes
- User agent strings are logged for debugging
- Log retention follows data protection regulations

## Monitoring and Alerts

### Log Analysis
The structured JSON format allows for easy log analysis:
- Parse logs with standard JSON tools
- Import into log analysis platforms (ELK Stack, Splunk)
- Create custom dashboards and alerts

### Performance Monitoring
- Track API response times
- Monitor database query performance
- Identify slow operations

### Security Monitoring
- Detect suspicious login patterns
- Monitor failed authentication attempts
- Track resource access patterns

## Troubleshooting

### Common Issues

1. **Log files not created**
   - Check if `logs/` directory exists
   - Verify write permissions
   - Check disk space

2. **High log volume**
   - Adjust log levels
   - Implement log filtering
   - Increase rotation frequency

3. **Performance impact**
   - Use async logging
   - Implement log buffering
   - Consider log aggregation

### Debug Mode
Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will log all levels including debug information.

## Best Practices

1. **Log Levels**: Use appropriate log levels for different types of information
2. **Structured Data**: Always include relevant metadata in log entries
3. **Performance**: Log asynchronously to avoid blocking operations
4. **Retention**: Regularly review and clean up old log files
5. **Monitoring**: Set up alerts for critical errors and unusual patterns
6. **Security**: Never log sensitive information like passwords or tokens

## Future Enhancements

- Real-time log streaming
- Advanced log filtering and search
- Log analytics and reporting
- Integration with external monitoring systems
- Custom log formats and destinations 