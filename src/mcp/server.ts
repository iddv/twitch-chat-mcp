import express from 'express';
import session from 'express-session';
import path from 'path';
import open from 'open';
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

  // Generate a random session secret if not provided
  const sessionSecret = process.env.SESSION_SECRET || 
    require('crypto').randomBytes(32).toString('hex');

  // Session middleware
  app.use(session({
    secret: sessionSecret,
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

  // Initialize Twitch integration only if we have a token
  const twitchToken = process.env.TWITCH_OAUTH_TOKEN;
  let twitchClient = null;
  
  if (twitchToken) {
    try {
      twitchClient = await setupTwitchIntegration();
      logger.info('MCP server configured successfully with Twitch integration');
    } catch (error) {
      logger.error('Failed to configure Twitch integration', { error });
      // Continue without Twitch integration
    }
  } else {
    logger.info('MCP server started without Twitch integration - auth required');
  }
  
  // Register Claude tool routes (will handle null twitchClient)
  registerToolRoutes(app, twitchClient);

  return app;
} 