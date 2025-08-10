/**
 * Centralized Error Codes for Twitch MCP Server
 * RFC 2119 Compliant Error Handling
 */

export enum TwitchMCPErrorCode {
  // Channel/Stream Errors
  CHANNEL_NOT_FOUND = 'ChannelNotFoundError',
  CHANNEL_OFFLINE = 'ChannelOfflineError',
  STREAM_UNAVAILABLE = 'StreamUnavailableError',
  
  // Authentication/Permission Errors
  AUTH_FAILURE = 'AuthFailureError',
  INSUFFICIENT_PERMISSIONS = 'InsufficientPermissionsError',
  TOKEN_EXPIRED = 'TokenExpiredError',
  
  // API/Rate Limiting Errors
  API_RATE_LIMIT = 'APIRateLimitError',
  API_TIMEOUT = 'APITimeoutError',
  API_UNAVAILABLE = 'APIUnavailableError',
  
  // Chat Errors
  CHAT_UNAVAILABLE = 'ChatUnavailableError',
  CHAT_RESTRICTED = 'ChatRestrictedError',
  MESSAGE_TOO_LONG = 'MessageTooLongError',
  
  // Monitoring Errors
  MONITORING_ALREADY_ACTIVE = 'MonitoringAlreadyActiveError',
  MONITORING_NOT_FOUND = 'MonitoringNotFoundError',
  INVALID_INTERVAL = 'InvalidIntervalError',
  
  // Command Detection Errors
  NO_COMMANDS_DETECTED = 'NoCommandsDetectedError',
  INVALID_COMMAND_PREFIX = 'InvalidCommandPrefixError',
  
  // General Errors
  INVALID_PARAMETER = 'InvalidParameterError',
  OPERATION_FAILED = 'OperationFailedError',
  TIMEOUT = 'TimeoutError'
}

export interface ErrorResponse {
  success: false;
  error: {
    code: TwitchMCPErrorCode;
    message: string;
    details?: any;
    retryAfter?: number; // seconds
    suggestedAction?: string;
  };
  timestamp: string;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
  metadata?: {
    cached?: boolean;
    source?: string;
    rateLimit?: {
      remaining: number;
      resetAt: string;
    };
  };
}

/**
 * Standard error messages and recovery actions
 */
export const ERROR_MESSAGES: Record<TwitchMCPErrorCode, { message: string; suggestedAction: string; retryAfter?: number }> = {
  [TwitchMCPErrorCode.CHANNEL_NOT_FOUND]: {
    message: 'Channel does not exist or name is misspelled',
    suggestedAction: 'Verify channel name spelling and try again'
  },
  [TwitchMCPErrorCode.CHANNEL_OFFLINE]: {
    message: 'Stream went offline during operation',
    suggestedAction: 'Check stream status with get_stream_info_persistent before retrying'
  },
  [TwitchMCPErrorCode.API_RATE_LIMIT]: {
    message: 'Too many API requests',
    suggestedAction: 'Wait before retrying',
    retryAfter: 60
  },
  [TwitchMCPErrorCode.CHAT_UNAVAILABLE]: {
    message: 'Chat is in subscriber-only or followers-only mode',
    suggestedAction: 'Check channel chat settings or try again later'
  },
  [TwitchMCPErrorCode.MESSAGE_TOO_LONG]: {
    message: 'Message exceeds 500 character limit',
    suggestedAction: 'Shorten message and try again'
  },
  [TwitchMCPErrorCode.MONITORING_ALREADY_ACTIVE]: {
    message: 'Monitoring session already running for this channel',
    suggestedAction: 'Stop existing monitoring or use get_monitoring_status to check active sessions'
  },
  [TwitchMCPErrorCode.INVALID_INTERVAL]: {
    message: 'Update interval must be at least 5000ms (5 seconds)',
    suggestedAction: 'Increase updateIntervalMs to 5000 or higher'
  },
  [TwitchMCPErrorCode.NO_COMMANDS_DETECTED]: {
    message: 'No bot commands found during monitoring period',
    suggestedAction: 'Increase monitoring duration or check if channel uses different command prefix'
  },
  [TwitchMCPErrorCode.INSUFFICIENT_PERMISSIONS]: {
    message: 'Token lacks required scopes for this operation',
    suggestedAction: 'Check token permissions and required scopes for current permission level'
  },
  [TwitchMCPErrorCode.AUTH_FAILURE]: {
    message: 'Authentication failed',
    suggestedAction: 'Check credentials and token validity'
  },
  [TwitchMCPErrorCode.STREAM_UNAVAILABLE]: {
    message: 'Stream information temporarily unavailable',
    suggestedAction: 'Try again in a few moments'
  },
  [TwitchMCPErrorCode.TOKEN_EXPIRED]: {
    message: 'OAuth token has expired',
    suggestedAction: 'Refresh token or re-authenticate'
  },
  [TwitchMCPErrorCode.API_TIMEOUT]: {
    message: 'API request timed out',
    suggestedAction: 'Check network connection and retry'
  },
  [TwitchMCPErrorCode.API_UNAVAILABLE]: {
    message: 'Twitch API is temporarily unavailable',
    suggestedAction: 'Wait and retry later'
  },
  [TwitchMCPErrorCode.CHAT_RESTRICTED]: {
    message: 'User lacks permission to send messages in this channel',
    suggestedAction: 'Check if account is banned, timed out, or channel has restrictions'
  },
  [TwitchMCPErrorCode.MONITORING_NOT_FOUND]: {
    message: 'No monitoring session found for this channel',
    suggestedAction: 'Start monitoring first or check active sessions'
  },
  [TwitchMCPErrorCode.INVALID_COMMAND_PREFIX]: {
    message: 'Invalid command prefix specified',
    suggestedAction: 'Use a valid single character prefix like ! or ?'
  },
  [TwitchMCPErrorCode.INVALID_PARAMETER]: {
    message: 'Invalid parameter value provided',
    suggestedAction: 'Check parameter requirements and try again'
  },
  [TwitchMCPErrorCode.OPERATION_FAILED]: {
    message: 'Operation failed due to unexpected error',
    suggestedAction: 'Try again or contact support if problem persists'
  },
  [TwitchMCPErrorCode.TIMEOUT]: {
    message: 'Operation timed out',
    suggestedAction: 'Try again with shorter duration or check network connection'
  }
};