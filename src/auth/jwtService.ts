/**
 * JWT Service for Session Management
 * 
 * Handles creation and validation of JWT tokens for user sessions
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { setupLogger } from '../utils/logger';
import { JWTPayload } from '../types/oauth';

const logger = setupLogger();

export class JWTService {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly issuer: string = 'twitch-mcp-server';

  constructor() {
    this.secret = process.env.JWT_SECRET || this.generateSecret();
    this.expiresIn = process.env.JWT_EXPIRES_IN || '30m';

    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET not set, using generated secret (not suitable for production)');
    }
  }

  /**
   * Generate a secure random secret (fallback only)
   */
  private generateSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Create a JWT token for a user session
   */
  createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    try {
      const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
        ...payload,
        // Ensure we have a session ID
        sessionId: payload.sessionId || this.generateSessionId()
      };

      const token = jwt.sign(tokenPayload, this.secret, {
        expiresIn: this.expiresIn,
        issuer: this.issuer,
        algorithm: 'HS256'
      } as jwt.SignOptions);

      logger.debug('JWT token created', {
        userId: payload.userId,
        sessionId: tokenPayload.sessionId,
        permissionLevel: payload.permissionLevel,
        expiresIn: this.expiresIn
      });

      return token;
    } catch (error) {
      logger.error('Failed to create JWT token', { error });
      throw new Error('Token creation failed');
    }
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        algorithms: ['HS256']
      }) as JWTPayload;

      logger.debug('JWT token verified', {
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        permissionLevel: decoded.permissionLevel
      });

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('JWT token expired', { error: error.message });
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('JWT token invalid', { error: error.message });
        throw new Error('Invalid token');
      } else {
        logger.error('JWT verification failed', { error });
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.debug('Failed to decode JWT token', { error });
      return null;
    }
  }

  /**
   * Check if token is expired without throwing
   */
  isTokenExpired(token: string): boolean {
    try {
      this.verifyToken(token);
      return false;
    } catch (error) {
      return error instanceof Error && error.message === 'Token expired';
    }
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId(): string {
    return `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1] || null;
  }

  /**
   * Create a refresh token (longer-lived, for token refresh)
   */
  createRefreshToken(userId: string): string {
    try {
      const payload = {
        userId,
        type: 'refresh',
        sessionId: this.generateSessionId()
      };

      return jwt.sign(payload, this.secret, {
        expiresIn: '7d', // Refresh tokens last longer
        issuer: this.issuer,
        algorithm: 'HS256'
      });
    } catch (error) {
      logger.error('Failed to create refresh token', { error });
      throw new Error('Refresh token creation failed');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { userId: string; sessionId: string } {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        algorithms: ['HS256']
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Not a refresh token');
      }

      return {
        userId: decoded.userId,
        sessionId: decoded.sessionId
      };
    } catch (error) {
      logger.error('Refresh token verification failed', { error });
      throw new Error('Invalid refresh token');
    }
  }
}

/**
 * Global JWT service instance
 */
let jwtServiceInstance: JWTService | null = null;

export function getJWTService(): JWTService {
  if (!jwtServiceInstance) {
    jwtServiceInstance = new JWTService();
  }
  return jwtServiceInstance;
}
