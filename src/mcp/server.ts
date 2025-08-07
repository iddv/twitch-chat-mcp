import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupLogger } from '../utils/logger';
import { setupTwitchIntegration } from '../twitch/twitchIntegration';
import { setupStreamResources } from './resources';
import { setupChatResources } from './chatResources';
import { setupStreamTools } from './tools';
import { setupStreamPrompts } from './prompts';

const logger = setupLogger();

/**
 * Creates and configures the MCP server
 */
export async function createMCPServer() {
  // Create MCP server instance
  const server = new Server(
    {
      name: 'twitch-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
        logging: {},
      },
    }
  );

  // Initialize Twitch integration
  let twitchAPIClient = null;
  let twitchClient = null;
  const twitchToken = process.env.TWITCH_OAUTH_TOKEN;
  
  if (twitchToken) {
    try {
      twitchClient = await setupTwitchIntegration();
      twitchAPIClient = twitchClient.apiClient;
      logger.info('MCP server configured successfully with Twitch integration');
    } catch (error) {
      logger.error('Failed to configure Twitch integration', { error });
      // Continue without Twitch integration
    }
  } else {
    logger.info('MCP server started without Twitch integration - auth required');
  }

  // Setup MCP components
  setupStreamResources(server, twitchAPIClient);
  setupChatResources(server, twitchClient);
  setupStreamTools(server, twitchAPIClient, twitchClient);
  setupStreamPrompts(server, twitchAPIClient);

  // Error handling
  server.onerror = (error) => {
    logger.error('MCP Server error', { error });
  };

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down MCP server gracefully...`);
    
    try {
      // Stop all monitoring sessions and cleanup resources
      const { cleanup } = await import('./resources');
      const { cleanupChatResources } = await import('./chatResources');
      
      cleanup();
      cleanupChatResources();
      
      // Close the MCP server
      await server.close();
      logger.info('MCP server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    shutdown('unhandledRejection');
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer() {
  const server = await createMCPServer();
  const transport = new StdioServerTransport();
  
  logger.info('Starting MCP server with stdio transport');
  
  await server.connect(transport);
  logger.info('MCP server connected and ready');
  
  return server;
} 