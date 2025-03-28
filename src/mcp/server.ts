import express from 'express';
import session from 'express-session';
import path from 'path';
import { setupLogger } from '../utils/logger';
import { setupTwitchIntegration } from '../twitch/twitchIntegration';
import { registerToolRoutes } from '../claude/toolRoutes';
import { createTwitchAuthRouter } from '../twitch/auth';

const logger = setupLogger();

/**
 * Creates and configures the MCP server
 */
export async function createServer() {
  const app = express();

  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'twitch-chat-mcp-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));
  
  // Basic health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Set up Twitch auth routes
  app.use('/auth/twitch', createTwitchAuthRouter());

  // Home page with auth status
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  // Initialize Twitch integration
  try {
    // Get token either from session or env vars
    const twitchToken = process.env.TWITCH_OAUTH_TOKEN;
    
    // Only set up Twitch if we have a token
    let twitchClient = null;
    if (twitchToken) {
      twitchClient = await setupTwitchIntegration();
      
      // Register Claude tool routes
      registerToolRoutes(app, twitchClient);
      
      logger.info('MCP server configured successfully with Twitch integration');
    } else {
      logger.info('MCP server started without Twitch integration - auth required');
    }
  } catch (error) {
    logger.error('Failed to configure MCP server', { error });
    throw error;
  }

  return app;
} 