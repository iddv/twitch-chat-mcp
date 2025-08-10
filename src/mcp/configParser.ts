/**
 * Configuration Parser for HTTP Transport
 * 
 * Handles parsing of Smithery's dot-notation query parameters
 * into nested configuration objects.
 * 
 * Example: ?server.host=localhost&apiKey=secret123&TWITCH_CLIENT_ID=abc
 * Becomes: { server: { host: "localhost" }, apiKey: "secret123", TWITCH_CLIENT_ID: "abc" }
 */

import { setupLogger } from '../utils/logger';

const logger = setupLogger();

export interface ParsedConfig {
  TWITCH_CLIENT_ID?: string | undefined;
  TWITCH_OAUTH_TOKEN?: string | undefined;
  TWITCH_PERMISSION_LEVEL?: 'viewer' | 'chatbot' | 'moderator' | 'admin';
  [key: string]: any;
}

/**
 * Parse query parameters into nested configuration object
 */
export function parseQueryConfig(queryParams: Record<string, string>): ParsedConfig {
  const config: ParsedConfig = {};
  
  for (const [key, value] of Object.entries(queryParams)) {
    if (!value) continue;
    
    // Handle dot notation (e.g., "server.host" -> { server: { host: value } })
    if (key.includes('.')) {
      setNestedProperty(config, key, value);
    } else {
      // Direct property
      config[key] = value;
    }
  }
  
  // Apply defaults
  if (config.TWITCH_PERMISSION_LEVEL && !isValidPermissionLevel(config.TWITCH_PERMISSION_LEVEL)) {
    logger.warn(`Invalid permission level: ${config.TWITCH_PERMISSION_LEVEL}, defaulting to 'viewer'`);
    config.TWITCH_PERMISSION_LEVEL = 'viewer';
  }
  
  if (!config.TWITCH_PERMISSION_LEVEL) {
    config.TWITCH_PERMISSION_LEVEL = 'viewer';
  }
  
  logger.debug('Parsed configuration', { 
    configKeys: Object.keys(config),
    permissionLevel: config.TWITCH_PERMISSION_LEVEL 
  });
  
  return config;
}

/**
 * Set nested property using dot notation
 */
function setNestedProperty(obj: any, path: string, value: string): void {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue; // Skip empty keys
    
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

/**
 * Validate permission level
 */
function isValidPermissionLevel(level: string): level is 'viewer' | 'chatbot' | 'moderator' | 'admin' {
  return ['viewer', 'chatbot', 'moderator', 'admin'].includes(level);
}

/**
 * Validate required configuration for Twitch integration
 */
export function validateTwitchConfig(config: ParsedConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.TWITCH_CLIENT_ID) {
    errors.push('TWITCH_CLIENT_ID is required');
  }
  
  if (!config.TWITCH_OAUTH_TOKEN) {
    errors.push('TWITCH_OAUTH_TOKEN is required');
  } else if (!config.TWITCH_OAUTH_TOKEN.startsWith('oauth:')) {
    // Auto-fix OAuth token format
    config.TWITCH_OAUTH_TOKEN = `oauth:${config.TWITCH_OAUTH_TOKEN}`;
    logger.info('Auto-corrected OAuth token format');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create configuration from environment variables (for stdio transport)
 */
export function createConfigFromEnv(): ParsedConfig {
  return {
    TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID || undefined,
    TWITCH_OAUTH_TOKEN: process.env.TWITCH_OAUTH_TOKEN || undefined,
    TWITCH_PERMISSION_LEVEL: (process.env.TWITCH_PERMISSION_LEVEL as any) || 'viewer'
  };
}
