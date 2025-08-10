/**
 * JWT Authentication Middleware
 * 
 * Validates JWT tokens and adds user context to requests
 */

import { Request, Response, NextFunction } from 'express';
import { getJWTService } from '../auth/jwtService';
import { getCredentialStore } from '../storage/credentialStore';
import { setupLogger } from '../utils/logger';
import { JWTPayload, StoredCredentials } from '../types/oauth';

const logger = setupLogger();

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  credentials?: StoredCredentials;
  sessionId?: string;
}

/**
 * JWT authentication middleware
 */
export function authenticateJWT(required: boolean = true) {
  const jwtService = getJWTService();
  const credentialStore = getCredentialStore();

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = jwtService.extractTokenFromHeader(authHeader);

      if (!token) {
        if (required) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a valid JWT token in Authorization header'
          });
        } else {
          return next(); // Optional auth, continue without user context
        }
      }

      // Verify and decode JWT
      const payload = jwtService.verifyToken(token);
      
      // Add user context to request
      req.user = payload;
      req.sessionId = payload.sessionId;

      // Optionally load user credentials
      const credentials = await credentialStore.getCredentials(payload.userId);
      if (credentials) {
        req.credentials = credentials;
      } else if (required) {
        logger.warn('User credentials not found', { 
          userId: payload.userId,
          sessionId: payload.sessionId 
        });
        
        return res.status(401).json({
          error: 'Credentials not found',
          message: 'User credentials have expired or been revoked'
        });
      }

      logger.debug('JWT authentication successful', {
        userId: payload.userId,
        username: payload.username,
        permissionLevel: payload.permissionLevel,
        sessionId: payload.sessionId
      });

      next();
    } catch (error) {
      logger.warn('JWT authentication failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        hasAuthHeader: !!req.headers.authorization
      });

      if (required) {
        if (error instanceof Error && error.message === 'Token expired') {
          return res.status(401).json({
            error: 'Token expired',
            message: 'Please re-authenticate to get a new token'
          });
        } else {
          return res.status(401).json({
            error: 'Invalid token',
            message: 'Please provide a valid JWT token'
          });
        }
      } else {
        return next(); // Optional auth, continue without user context
      }
    }
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(requiredLevel: 'viewer' | 'chatbot' | 'moderator' | 'admin') {
  const permissionLevels = {
    viewer: 0,
    chatbot: 1,
    moderator: 2,
    admin: 3
  };

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first'
      });
    }

    const userLevel = permissionLevels[req.user.permissionLevel];
    const requiredLevelValue = permissionLevels[requiredLevel];

    if (userLevel < requiredLevelValue) {
      logger.warn('Insufficient permissions', {
        userId: req.user.userId,
        userLevel: req.user.permissionLevel,
        requiredLevel,
        sessionId: req.sessionId
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires ${requiredLevel} level access`,
        userLevel: req.user.permissionLevel,
        requiredLevel
      });
    }

    logger.debug('Permission check passed', {
      userId: req.user.userId,
      userLevel: req.user.permissionLevel,
      requiredLevel,
      sessionId: req.sessionId
    });

    return next();
  };
}

/**
 * Session validation middleware (checks if session is still valid)
 */
export function validateSession() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.sessionId) {
      return next(); // No session to validate
    }

    try {
      // Check if credentials are still valid
      if (req.credentials && req.credentials.expiresAt) {
        const now = new Date();
        if (now > req.credentials.expiresAt) {
          logger.warn('Session credentials expired', {
            userId: req.user.userId,
            expiresAt: req.credentials.expiresAt,
            sessionId: req.sessionId
          });

          return res.status(401).json({
            error: 'Session expired',
            message: 'Your Twitch credentials have expired. Please re-authenticate.'
          });
        }
      }

      logger.debug('Session validation passed', {
        userId: req.user.userId,
        sessionId: req.sessionId
      });

      next();
    } catch (error) {
      logger.error('Session validation failed', { 
        error, 
        userId: req.user.userId,
        sessionId: req.sessionId 
      });

      res.status(500).json({
        error: 'Session validation failed',
        message: 'Unable to validate session'
      });
    }
  };
}

/**
 * Rate limiting middleware (simple implementation)
 */
export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const identifier = req.user?.userId || req.ip || 'anonymous';
    const now = Date.now();
    
    const userRequests = requests.get(identifier);
    
    if (!userRequests || now > userRequests.resetTime) {
      // Reset or initialize counter
      requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (userRequests.count >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        identifier,
        count: userRequests.count,
        maxRequests,
        userId: req.user?.userId
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 1000} seconds`,
        retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
      });
    }

    userRequests.count++;
    next();
  };
}

/**
 * Audit logging middleware
 */
export function auditLog(action: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Log request using enhanced audit logging
    logger.addAuditLog(action, req.user?.userId || 'anonymous', {
      sessionId: req.sessionId,
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      method: req.method,
      path: req.path,
      username: req.user?.username,
      permissionLevel: req.user?.permissionLevel
    });

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      
      // Log completion with audit logging
      logger.addAuditLog(`${action}_completed`, req.user?.userId || 'anonymous', {
        sessionId: req.sessionId,
        statusCode: res.statusCode,
        duration,
        success: res.statusCode < 400,
        action
      });

      // Log security events for failed requests
      if (res.statusCode >= 400) {
        logger.addSecurityEvent('api_request_failed', {
          action,
          userId: req.user?.userId,
          statusCode: res.statusCode,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          path: req.path
        });
      }

      return originalJson.call(this, body);
    };

    next();
  };
}
