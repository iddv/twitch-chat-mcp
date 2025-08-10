import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Sets up the application logger with CloudWatch support
 */
export function setupLogger() {
  // Ensure logs directory exists
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logLevel = process.env.LOG_LEVEL || 'info';
  const logFile = process.env.LOG_FILE || path.join(logDir, 'mcp-server.log');
  const cloudWatchLogGroup = process.env.CLOUDWATCH_LOG_GROUP;

  // Base transports
  const transports: winston.transport[] = [
    // Write to console (structured JSON for container logging)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          // Structured logging for CloudWatch
          const logEntry = {
            timestamp,
            level,
            message,
            service: service || 'mcp-server',
            cloudWatchLogGroup: cloudWatchLogGroup || 'not-configured',
            ...meta
          };
          return JSON.stringify(logEntry);
        })
      ),
    }),
    // Write to local file (for development)
    new winston.transports.File({ 
      filename: logFile,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
  ];

  // Create Winston logger
  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { 
      service: 'mcp-server',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      cloudWatchEnabled: !!cloudWatchLogGroup
    },
    transports,
  });

  // Add security event logging
  (logger as any).addSecurityEvent = (event: string, details: any) => {
    logger.warn('SECURITY_EVENT', {
      event,
      details,
      timestamp: new Date().toISOString(),
      severity: 'security'
    });
  };

  // Add audit logging
  (logger as any).addAuditLog = (action: string, userId: string, details: any) => {
    logger.info('AUDIT_LOG', {
      action,
      userId,
      details,
      timestamp: new Date().toISOString(),
      severity: 'audit'
    });
  };

  return logger;
}

// Export logger instance
export const logger = setupLogger();

// Type augmentation for custom methods
declare module 'winston' {
  interface Logger {
    addSecurityEvent(event: string, details: any): void;
    addAuditLog(action: string, userId: string, details: any): void;
  }
} 