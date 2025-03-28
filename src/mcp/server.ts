import express from 'express';
import { setupLogger } from '../utils/logger';
import { setupTwitchIntegration } from '../twitch/twitchIntegration';
import { registerToolRoutes } from '../claude/toolRoutes';

const logger = setupLogger();

/**
 * Creates and configures the MCP server
 */
export async function createServer() {
  const app = express();

  // Middleware
  app.use(express.json());
  
  // Basic health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Initialize Twitch integration
  try {
    const twitchClient = await setupTwitchIntegration();
    
    // Register Claude tool routes
    registerToolRoutes(app, twitchClient);
    
    // Log success
    logger.info('MCP server configured successfully');
  } catch (error) {
    logger.error('Failed to configure MCP server', { error });
    throw error;
  }

  return app;
} 