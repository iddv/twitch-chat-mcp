import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Sets up the application logger
 */
export function setupLogger() {
  // Ensure logs directory exists
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logLevel = process.env.LOG_LEVEL || 'info';
  const logFile = process.env.LOG_FILE || path.join(logDir, 'mcp-server.log');

  // Create Winston logger
  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'mcp-server' },
    transports: [
      // Write to console
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
      // Write to log file
      new winston.transports.File({ 
        filename: logFile 
      }),
    ],
  });

  return logger;
}

// Export logger instance
export const logger = setupLogger(); 