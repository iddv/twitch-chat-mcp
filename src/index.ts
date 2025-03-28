import dotenv from 'dotenv';
import { createServer } from './mcp/server';
import { setupLogger } from './utils/logger';

// Load environment variables
dotenv.config();

// Set up logger
const logger = setupLogger();

async function startServer() {
  try {
    const server = await createServer();
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || 'localhost';
    
    server.listen(port, () => {
      logger.info(`MCP Server listening at http://${host}:${port}`);
    });
  } catch (error) {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start the server
startServer(); 