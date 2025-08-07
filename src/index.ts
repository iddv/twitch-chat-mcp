// Register path aliases for compiled JavaScript
const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Configure paths for the compiled output
tsConfigPaths.register({
  baseUrl: path.join(__dirname),
  paths: {
    '@/*': ['*'],
    '@/types/*': ['types/*'],
    '@/utils/*': ['utils/*'],
    '@/mcp/*': ['mcp/*'],
    '@/twitch/*': ['twitch/*'],
    '@/auth/*': ['auth/*'],
    '@/cache/*': ['cache/*']
  }
});

import dotenv from 'dotenv';
import { startMCPServer } from './mcp/server';
import { setupLogger } from './utils/logger';

// Load environment variables
dotenv.config();

// Set up logger
const logger = setupLogger();

async function main() {
  try {
    // Start the MCP server
    await startMCPServer();
    logger.info('MCP server started successfully');
    
    // Set up maximum process lifetime (7 days) to prevent infinite running
    const maxLifetime = 7 * 24 * 60 * 60 * 1000; // 7 days
    setTimeout(() => {
      logger.info('Maximum process lifetime reached, shutting down for health');
      gracefulShutdown('maxLifetime');
    }, maxLifetime);
    
  } catch (error) {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }
  
  isShuttingDown = true;
  logger.info(`${signal} signal received: shutting down gracefully`);
  
  try {
    // Import and run cleanup
    const { cleanup } = await import('@/mcp/resources');
    const { cleanupChatResources } = await import('@/mcp/chatResources');
    
    cleanup();
    cleanupChatResources();
    
    logger.info('Cleanup completed, exiting');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Start the server
main(); 