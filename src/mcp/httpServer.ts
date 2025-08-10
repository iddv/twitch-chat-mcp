/**
 * HTTP Server Setup for MCP Streamable HTTP Transport
 * 
 * Implements the Smithery requirements:
 * - Listen on PORT environment variable
 * - Handle GET, POST, DELETE on /mcp endpoint
 * - Parse configuration from query parameters
 * - Support CORS for browser clients
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupLogger } from '../utils/logger';
import { parseQueryConfig, ParsedConfig } from './configParser';
import { initializeCredentialStore } from '../storage/credentialStore';
import oauthRoutes from '../auth/oauthRoutes';

const logger = setupLogger();

export interface HttpServerOptions {
  port?: number;
  corsOrigin?: string | string[];
  enableLogging?: boolean;
}

export interface McpHttpRequest extends Request {
  mcpConfig?: ParsedConfig;
  sessionId?: string;
}

/**
 * Create and configure Express server for MCP HTTP transport
 */
export function createHttpServer(mcpServer: Server, options: HttpServerOptions = {}) {
  const app = express();
  const port = options.port || parseInt(process.env.PORT || '3000');
  
  // Initialize credential store with cleanup timer
  const credentialStore = initializeCredentialStore({
    fallbackToMemory: true
  });
  
  logger.info('HTTP server initializing', { 
    port, 
    credentialStore: 'initialized'
  });
  
  // Middleware setup
  app.use(cors({
    origin: options.corsOrigin || '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
    credentials: true
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Request logging middleware
  if (options.enableLogging !== false) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent']
        }
      });
      next();
    });
  }
  
  // Configuration parsing middleware
  app.use('/mcp', (req: McpHttpRequest, res: Response, next: NextFunction) => {
    try {
      // Parse configuration from query parameters
      req.mcpConfig = parseQueryConfig(req.query as Record<string, string>);
      
      // Extract session ID from headers or generate one
      req.sessionId = req.headers['x-session-id'] as string || 
                     req.query.sessionId as string ||
                     generateSessionId();
      
      logger.debug('Parsed MCP request', {
        sessionId: req.sessionId,
        configKeys: Object.keys(req.mcpConfig),
        method: req.method
      });
      
      next();
    } catch (error) {
      logger.error('Failed to parse MCP configuration', { error });
      res.status(400).json({
        error: 'Invalid configuration parameters',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Health check endpoint
  app.get('/health', async (req: Request, res: Response) => {
    const storeStats = credentialStore.getStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      transport: 'http',
      oauth: {
        configured: !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
        endpoints: ['/auth/twitch', '/auth/callback', '/auth/status']
      },
      security: {
        jwtEnabled: !!process.env.JWT_SECRET,
        credentialStore: storeStats
      }
    });
  });

  // OAuth routes
  app.use('/auth', oauthRoutes);
  
  // MCP endpoint handlers
  app.get('/mcp', handleMcpGet);
  app.post('/mcp', handleMcpPost);
  app.delete('/mcp', handleMcpDelete);
  
  // Error handling middleware
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('HTTP server error', { 
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  });
  
  // 404 handler
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      message: `Endpoint ${req.method} ${req.path} not found`,
      availableEndpoints: [
        'GET /health',
        'GET /mcp',
        'POST /mcp',
        'DELETE /mcp'
      ]
    });
  });
  
  return { app, port };
}

/**
 * Handle GET requests to /mcp endpoint
 * Used for initial handshake and capability discovery
 */
async function handleMcpGet(req: McpHttpRequest, res: Response) {
  try {
    logger.info('MCP GET request received', { 
      sessionId: req.sessionId,
      query: req.query 
    });
    
    // For now, return basic server info
    // TODO: Implement proper MCP handshake
    res.json({
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {}
        },
        serverInfo: {
          name: 'twitch-mcp-server',
          version: '1.0.0'
        }
      }
    });
  } catch (error) {
    logger.error('Error handling MCP GET', { error, sessionId: req.sessionId });
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Handle POST requests to /mcp endpoint
 * Used for MCP method calls and tool execution
 */
async function handleMcpPost(req: McpHttpRequest, res: Response) {
  try {
    logger.info('MCP POST request received', { 
      sessionId: req.sessionId,
      method: req.body?.method,
      id: req.body?.id
    });
    
    // TODO: Implement proper MCP message handling
    // For now, return a basic response
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      result: {
        message: 'MCP POST handler not yet implemented',
        sessionId: req.sessionId,
        config: req.mcpConfig
      }
    });
  } catch (error) {
    logger.error('Error handling MCP POST', { error, sessionId: req.sessionId });
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Handle DELETE requests to /mcp endpoint
 * Used for cleanup and session termination
 */
async function handleMcpDelete(req: McpHttpRequest, res: Response) {
  try {
    logger.info('MCP DELETE request received', { 
      sessionId: req.sessionId 
    });
    
    // TODO: Implement session cleanup
    res.json({
      jsonrpc: '2.0',
      result: {
        message: 'Session cleanup requested',
        sessionId: req.sessionId
      }
    });
  } catch (error) {
    logger.error('Error handling MCP DELETE', { error, sessionId: req.sessionId });
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start the HTTP server
 */
export function startHttpServer(mcpServer: Server, options: HttpServerOptions = {}) {
  const { app, port } = createHttpServer(mcpServer, options);
  
  return new Promise<{ server: any; port: number }>((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info(`MCP HTTP server listening on port ${port}`, {
        endpoints: ['/health', '/mcp'],
        transport: 'http'
      });
      resolve({ server, port });
    });
    
    server.on('error', (error: Error) => {
      logger.error('Failed to start HTTP server', { error, port });
      reject(error);
    });
  });
}
