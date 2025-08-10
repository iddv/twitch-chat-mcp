/**
 * OAuth Routes for HTTP Server
 * 
 * Handles OAuth 2.0 authentication endpoints
 */

import { Request, Response, Router } from 'express';
import { setupLogger } from '../utils/logger';
import { getOAuthFlow } from './oauthFlow';

const logger = setupLogger();
const router = Router();

// Lazy-load OAuth flow to avoid requiring credentials at startup
function getOAuthFlowSafe() {
  try {
    return getOAuthFlow();
  } catch (error) {
    logger.warn('OAuth flow not configured', { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
}

/**
 * Start OAuth flow - redirect to Twitch
 * GET /auth/twitch?permission_level=chatbot
 */
router.get('/twitch', (req: Request, res: Response) => {
  try {
    const oauthFlow = getOAuthFlowSafe();
    if (!oauthFlow) {
      res.status(503).json({
        error: 'OAuth not configured',
        message: 'Twitch OAuth credentials not set. Please configure TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.'
      });
      return;
    }

    const permissionLevel = req.query.permission_level as string || 'chatbot';
    
    // Validate permission level
    const validLevels = ['viewer', 'chatbot', 'moderator', 'admin'];
    if (!validLevels.includes(permissionLevel)) {
      res.status(400).json({
        error: 'Invalid permission level',
        validLevels
      });
      return;
    }

    const { url, state } = oauthFlow.generateAuthUrl(permissionLevel);
    
    logger.info('OAuth flow initiated', {
      permissionLevel,
      state,
      userAgent: req.headers['user-agent']
    });

    // Redirect to Twitch OAuth
    res.redirect(url);
  } catch (error) {
    logger.error('Failed to initiate OAuth flow', { error });
    res.status(500).json({
      error: 'Failed to initiate authentication',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * OAuth callback - handle authorization code
 * GET /auth/callback?code=...&state=...
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const oauthFlow = getOAuthFlowSafe();
    if (!oauthFlow) {
      res.status(503).json({
        error: 'OAuth not configured',
        message: 'Twitch OAuth credentials not set.'
      });
      return;
    }

    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.warn('OAuth authorization denied', { 
        error, 
        error_description,
        state 
      });

      res.status(400).json({
        error: 'Authorization denied',
        description: error_description || 'User denied authorization',
        code: error
      });
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      res.status(400).json({
        error: 'Missing required parameters',
        required: ['code', 'state']
      });
      return;
    }

    // Exchange code for tokens and create session
    const { jwt, user } = await oauthFlow.handleCallback(
      code as string, 
      state as string
    );

    logger.info('OAuth callback successful', {
      userId: user.id,
      username: user.login,
      displayName: user.display_name
    });

    // Return JWT token and user info
    // In production, you might want to set this as an HTTP-only cookie
    res.json({
      success: true,
      token: jwt,
      user: {
        id: user.id,
        username: user.login,
        displayName: user.display_name,
        profileImage: user.profile_image_url
      },
      message: 'Authentication successful'
    });

  } catch (error) {
    logger.error('OAuth callback failed', { 
      error,
      code: typeof req.query.code === 'string' ? req.query.code.substring(0, 10) : undefined,
      state: req.query.state
    });

    res.status(400).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get current user info (requires JWT)
 * GET /auth/me
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    // TODO: Add JWT validation middleware
    // For now, return placeholder
    res.json({
      error: 'Not implemented',
      message: 'JWT validation middleware not yet implemented'
    });
  } catch (error) {
    logger.error('Failed to get user info', { error });
    res.status(500).json({
      error: 'Failed to get user information'
    });
  }
});

/**
 * Logout - invalidate session
 * POST /auth/logout
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // TODO: Add JWT validation and session cleanup
    // For now, return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout failed', { error });
    res.status(500).json({
      error: 'Logout failed'
    });
  }
});

/**
 * Refresh token endpoint
 * POST /auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token required'
      });
      return;
    }

    // TODO: Implement token refresh logic
    res.json({
      error: 'Not implemented',
      message: 'Token refresh not yet implemented'
    });
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(400).json({
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * OAuth status endpoint - check if OAuth is configured
 * GET /auth/status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const hasClientId = !!process.env.TWITCH_CLIENT_ID;
    const hasClientSecret = !!process.env.TWITCH_CLIENT_SECRET;
    const hasRedirectUri = !!process.env.TWITCH_REDIRECT_URI;

    res.json({
      configured: hasClientId && hasClientSecret && hasRedirectUri,
      clientId: hasClientId ? process.env.TWITCH_CLIENT_ID?.substring(0, 8) + '...' : null,
      redirectUri: process.env.TWITCH_REDIRECT_URI,
      availableScopes: [
        'user:read:email',
        'chat:read',
        'chat:edit',
        'channel:moderate',
        'moderator:manage:chat_messages',
        'user:read:follows',
        'channel:read:subscriptions'
      ],
      permissionLevels: ['viewer', 'chatbot', 'moderator', 'admin']
    });
  } catch (error) {
    logger.error('Failed to get OAuth status', { error });
    res.status(500).json({
      error: 'Failed to get OAuth status'
    });
  }
});

export default router;
