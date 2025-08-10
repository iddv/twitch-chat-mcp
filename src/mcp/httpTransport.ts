/**
 * HTTP Transport Implementation for MCP Protocol
 * 
 * Simplified version for initial implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupLogger } from '../utils/logger';
import { startHttpServer, HttpServerOptions } from './httpServer';
import { ParsedConfig } from './configParser';

const logger = setupLogger();

export interface HttpTransportOptions extends HttpServerOptions {
  sessionTimeout?: number;
}

/**
 * HTTP Transport for MCP Protocol
 */
export class HttpTransport {
  private server?: any;
  private mcpServer?: Server;
  private sessions: Map<string, SessionData> = new Map();
  private options: HttpTransportOptions;
  
  constructor(options: HttpTransportOptions = {}) {
    this.options = {
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      ...options
    };
    
    // Start session cleanup timer
    this.startSessionCleanup();
  }
  
  /**
   * Start the HTTP transport
   */
  async start(mcpServer: Server): Promise<void> {
    this.mcpServer = mcpServer;
    
    try {
      const { server, port } = await startHttpServer(mcpServer, this.options);
      this.server = server;
      
      logger.info('HTTP transport started successfully', { 
        port,
        transport: 'http',
        sessionTimeout: this.options.sessionTimeout 
      });
    } catch (error) {
      logger.error('Failed to start HTTP transport', { error });
      throw error;
    }
  }
  
  /**
   * Stop the HTTP transport
   */
  async close(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('HTTP transport closed');
          resolve();
        });
      });
    }
  }
  
  /**
   * Create or update session data
   */
  private updateSession(sessionId: string, config: ParsedConfig): void {
    const now = Date.now();
    
    this.sessions.set(sessionId, {
      id: sessionId,
      config,
      createdAt: this.sessions.get(sessionId)?.createdAt || now,
      lastAccessedAt: now,
      twitchClient: null // Will be created lazily
    });
    
    logger.debug('Session updated', { 
      sessionId, 
      totalSessions: this.sessions.size 
    });
  }
  
  /**
   * Get session data
   */
  getSession(sessionId: string): SessionData | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session;
  }
  
  /**
   * Remove session
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // TODO: Cleanup Twitch client if exists
      this.sessions.delete(sessionId);
      logger.debug('Session removed', { sessionId });
    }
  }
  
  /**
   * Start session cleanup timer
   */
  private startSessionCleanup(): void {
    const cleanupInterval = Math.min(this.options.sessionTimeout! / 4, 5 * 60 * 1000); // Max 5 minutes
    
    setInterval(() => {
      const now = Date.now();
      const expiredSessions: string[] = [];
      
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastAccessedAt > this.options.sessionTimeout!) {
          expiredSessions.push(sessionId);
        }
      }
      
      for (const sessionId of expiredSessions) {
        this.removeSession(sessionId);
      }
      
      if (expiredSessions.length > 0) {
        logger.info('Cleaned up expired sessions', { 
          expired: expiredSessions.length,
          remaining: this.sessions.size 
        });
      }
    }, cleanupInterval);
    
    logger.debug('Session cleanup timer started', { 
      cleanupInterval,
      sessionTimeout: this.options.sessionTimeout 
    });
  }
}

/**
 * Session data interface
 */
export interface SessionData {
  id: string;
  config: ParsedConfig;
  createdAt: number;
  lastAccessedAt: number;
  twitchClient: any; // Will be TwitchClient when implemented
}

/**
 * Create HTTP transport instance
 */
export function createHttpTransport(options: HttpTransportOptions = {}): HttpTransport {
  return new HttpTransport(options);
}
