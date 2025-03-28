import dotenv from 'dotenv';
import { createServer } from './mcp/server';
import { setupLogger } from './utils/logger';
import open from 'open';

// Load environment variables
dotenv.config();

// Set up logger
const logger = setupLogger();

async function startServer() {
  try {
    const server = await createServer();
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || 'localhost';
    const url = `http://${host}:${port}`;
    
    server.listen(port, () => {
      logger.info(`MCP Server listening at ${url}`);
      
      // Auto-open browser if no auth token exists
      const hasToken = !!process.env.TWITCH_OAUTH_TOKEN;
      if (!hasToken) {
        logger.info('No Twitch token found. Opening browser for authentication...');
        setTimeout(() => {
          open(url).catch(err => {
            logger.warn('Failed to open browser automatically', { error: err });
            logger.info(`Please open ${url} in your browser to authenticate with Twitch.`);
          });
        }, 1000); // Short delay to make sure server is ready
      }
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