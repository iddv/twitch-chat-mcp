import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupLogger } from '../utils/logger';
import { setupTwitchIntegration } from '../twitch/twitchIntegration';
import { setupStreamResources } from './resources';
import { setupChatResources } from './chatResources';
import { setupStreamTools } from './tools';
import { setupStreamPrompts } from './prompts';
import { createHttpTransport, HttpTransport } from './httpTransport';
import { createConfigFromEnv } from './configParser';

const logger = setupLogger();

/**
 * Transport type detection
 */
export type TransportType = 'stdio' | 'http';

/**
 * Detect which transport to use based on environment
 */
function detectTransportType(): TransportType {
  // If PORT is set, use HTTP transport (Smithery/hosted environment)
  if (process.env.PORT) {
    return 'http';
  }
  
  // If running in a container or explicitly requested HTTP
  if (process.env.MCP_TRANSPORT === 'http' || process.env.CONTAINER === 'true') {
    return 'http';
  }
  
  // Default to stdio for local usage
  return 'stdio';
}

/**
 * Creates and configures the MCP server with transport detection
 */
export async function createMCPServer() {
  const transportType = detectTransportType();
  
  logger.info(`Starting MCP server with ${transportType} transport`, {
    port: process.env.PORT,
    mcpTransport: process.env.MCP_TRANSPORT,
    container: process.env.CONTAINER
  });
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

  // Initialize without Twitch integration for fast startup
  // Twitch integration will be initialized lazily when first needed
  let twitchAPIClient: any = null;
  let twitchClient: any = null;
  
  logger.info('MCP server starting with lazy Twitch integration');

  // Setup MCP components
  setupStreamResources(server, twitchAPIClient);
  setupChatResources(server, twitchClient);
  setupStreamTools(server, twitchAPIClient, twitchClient);
  setupStreamPrompts(server, twitchAPIClient);

  // Lazy initialization function for Twitch integration
  const initializeTwitchIfNeeded = async (config?: any) => {
    if (twitchClient) {
      return { twitchAPIClient, twitchClient };
    }

    // For stdio transport, use environment variables
    // For HTTP transport, use provided config
    const twitchConfig = config || createConfigFromEnv();
    
    if (!twitchConfig.TWITCH_OAUTH_TOKEN) {
      logger.debug('No Twitch credentials available for initialization');
      return { twitchAPIClient: null, twitchClient: null };
    }

    try {
      logger.info('Initializing Twitch integration on first use');
      
      // Set environment variables temporarily for setupTwitchIntegration
      const originalEnv = {
        TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
        TWITCH_OAUTH_TOKEN: process.env.TWITCH_OAUTH_TOKEN,
        TWITCH_PERMISSION_LEVEL: process.env.TWITCH_PERMISSION_LEVEL
      };
      
      process.env.TWITCH_CLIENT_ID = twitchConfig.TWITCH_CLIENT_ID;
      process.env.TWITCH_OAUTH_TOKEN = twitchConfig.TWITCH_OAUTH_TOKEN;
      process.env.TWITCH_PERMISSION_LEVEL = twitchConfig.TWITCH_PERMISSION_LEVEL;
      
      twitchClient = await setupTwitchIntegration();
      twitchAPIClient = twitchClient.apiClient;
      
      // Restore original environment
      process.env.TWITCH_CLIENT_ID = originalEnv.TWITCH_CLIENT_ID;
      process.env.TWITCH_OAUTH_TOKEN = originalEnv.TWITCH_OAUTH_TOKEN;
      process.env.TWITCH_PERMISSION_LEVEL = originalEnv.TWITCH_PERMISSION_LEVEL;
      
      // Re-setup components with the new clients
      setupStreamResources(server, twitchAPIClient);
      setupChatResources(server, twitchClient);
      setupStreamTools(server, twitchAPIClient, twitchClient);
      setupStreamPrompts(server, twitchAPIClient);
      
      logger.info('Twitch integration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Twitch integration', { error });
    }

    return { twitchAPIClient, twitchClient };
  };

  // Store the lazy initializer on the server for tools to use
  (server as any).initializeTwitchIfNeeded = initializeTwitchIfNeeded;
  (server as any).transportType = transportType;

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

  // Handle shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

  return { server, transportType };
}

/**
 * Starts the MCP server with appropriate transport
 */
export async function startMCPServer() {
  const { server, transportType } = await createMCPServer();
  
  if (transportType === 'http') {
    // Start HTTP transport
    const httpTransport = createHttpTransport({
      port: parseInt(process.env.PORT || '3000'),
      enableLogging: true
    });
    
    await httpTransport.start(server);
    logger.info('MCP server started with HTTP transport');
    
    return { server, transport: httpTransport };
  } else {
    // Start stdio transport (original behavior)
    const transport = new StdioServerTransport();
    logger.info('Starting MCP server with stdio transport');
    
    await server.connect(transport);
    logger.info('MCP server connected and ready');
    
    return { server, transport };
  }
} 