/**
 * Permission levels and tool filtering for Twitch MCP server
 */

export enum PermissionLevel {
  VIEWER = 'viewer',
  CHATBOT = 'chatbot', 
  MODERATOR = 'moderator',
  ADMIN = 'admin'
}

export interface PermissionConfig {
  level: PermissionLevel;
  requiredScopes: string[];
  description: string;
  allowedTools: string[];
}

/**
 * Permission configurations with required Twitch scopes and allowed tools
 */
export const PERMISSION_CONFIGS: Record<PermissionLevel, PermissionConfig> = {
  [PermissionLevel.VIEWER]: {
    level: PermissionLevel.VIEWER,
    requiredScopes: [],
    description: 'Read-only access to public stream information',
    allowedTools: [
      'get_stream_info_persistent',
      'get_channel_info_persistent',
      'start_stream_monitoring',
      'stop_stream_monitoring',
      'create_stream_link',
      'get_monitoring_status',
      'monitor_stream_persistent'
    ]
  },
  
  [PermissionLevel.CHATBOT]: {
    level: PermissionLevel.CHATBOT,
    requiredScopes: ['chat:read', 'chat:edit'],
    description: 'Chat interaction capabilities - read and send messages',
    allowedTools: [
      // Viewer tools
      'get_stream_info_persistent',
      'get_channel_info_persistent', 
      'start_stream_monitoring',
      'stop_stream_monitoring',
      'create_stream_link',
      'get_monitoring_status',
      'monitor_stream_persistent',
      // Chat tools
      'observe_twitch_chat_streaming',
      'send_twitch_message_with_confirmation',
      'detect_chat_commands',
      'start_chat_recording',
      'stop_chat_recording',
      'create_chat_history_link',
      'start_chat_analytics'
    ]
  },
  
  [PermissionLevel.MODERATOR]: {
    level: PermissionLevel.MODERATOR,
    requiredScopes: ['chat:read', 'chat:edit', 'channel:moderate', 'moderator:manage:chat_messages'],
    description: 'Moderation capabilities - manage chat, timeout users, delete messages',
    allowedTools: [
      // Chatbot tools
      'get_stream_info_persistent',
      'get_channel_info_persistent',
      'start_stream_monitoring', 
      'stop_stream_monitoring',
      'create_stream_link',
      'get_monitoring_status',
      'monitor_stream_persistent',
      'observe_twitch_chat_streaming',
      'send_twitch_message_with_confirmation',
      'detect_chat_commands',
      'start_chat_recording',
      'stop_chat_recording',
      'create_chat_history_link',
      'start_chat_analytics',
      // Moderation tools
      'moderate_chat_with_approval'
    ]
  },
  
  [PermissionLevel.ADMIN]: {
    level: PermissionLevel.ADMIN,
    requiredScopes: [
      'chat:read', 
      'chat:edit', 
      'channel:moderate', 
      'moderator:manage:chat_messages',
      'channel:read:subscriptions',
      'user:read:follows'
    ],
    description: 'Full access - all tools and advanced features',
    allowedTools: [
      // All tools available
      'get_stream_info_persistent',
      'get_channel_info_persistent',
      'start_stream_monitoring',
      'stop_stream_monitoring', 
      'create_stream_link',
      'get_monitoring_status',
      'monitor_stream_persistent',
      'observe_twitch_chat_streaming',
      'send_twitch_message_with_confirmation',
      'detect_chat_commands',
      'start_chat_recording',
      'stop_chat_recording',
      'create_chat_history_link',
      'start_chat_analytics',
      'moderate_chat_with_approval',
      'get_followers_batch'
    ]
  }
};

/**
 * Get permission level from environment variable
 */
export function getPermissionLevel(): PermissionLevel {
  const envLevel = process.env.TWITCH_PERMISSION_LEVEL?.toLowerCase();
  
  switch (envLevel) {
    case 'viewer':
      return PermissionLevel.VIEWER;
    case 'chatbot':
      return PermissionLevel.CHATBOT;
    case 'moderator':
      return PermissionLevel.MODERATOR;
    case 'admin':
      return PermissionLevel.ADMIN;
    default:
      // Default to chatbot if not specified
      return PermissionLevel.CHATBOT;
  }
}

/**
 * Get allowed tools for current permission level
 */
export function getAllowedTools(): string[] {
  const level = getPermissionLevel();
  return PERMISSION_CONFIGS[level].allowedTools;
}

/**
 * Check if a tool is allowed for current permission level
 */
export function isToolAllowed(toolName: string): boolean {
  const allowedTools = getAllowedTools();
  return allowedTools.includes(toolName);
}

/**
 * Get required scopes for current permission level
 */
export function getRequiredScopes(): string[] {
  const level = getPermissionLevel();
  return PERMISSION_CONFIGS[level].requiredScopes;
}

/**
 * Get permission configuration for current level
 */
export function getCurrentPermissionConfig(): PermissionConfig {
  const level = getPermissionLevel();
  return PERMISSION_CONFIGS[level];
}

/**
 * Validate that current OAuth token has required scopes
 * Note: This is a placeholder - actual scope validation would require 
 * checking the token against Twitch API
 */
export function validateTokenScopes(tokenScopes: string[]): boolean {
  const requiredScopes = getRequiredScopes();
  return requiredScopes.every(scope => tokenScopes.includes(scope));
}