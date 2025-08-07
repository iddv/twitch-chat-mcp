import tmi from 'tmi.js';
import { setupLogger } from '../utils/logger';
import { TwitchAPIClient } from './apiClient';
import { StreamInfo, TwitchChannel } from '../types/twitch';

const logger = setupLogger();

// Interface for storing chat messages
export interface ChatMessage {
  channel: string;
  username: string;
  message: string;
  timestamp: Date;
}

// Connection health status
export interface ConnectionHealth {
  isConnected: boolean;
  lastPingTime?: Date;
  lastPongTime?: Date;
  reconnectAttempts: number;
  lastReconnectTime?: Date;
  connectionUptime: number;
}

// Message queue item for rate limiting
interface QueuedMessage {
  channel: string;
  message: string;
  resolve: () => void;
  reject: (err: Error) => void;
  timestamp: Date;
  retryCount: number;
}

// Interface for the enhanced Twitch client
export interface TwitchClient extends tmi.Client {
  observeChat: (channel: string, duration: number) => Promise<ChatMessage[]>;
  sendChatMessage: (channel: string, message: string) => Promise<void>;
  getConnectionHealth: () => ConnectionHealth;
  getQueueStatus: () => { pending: number; processing: boolean };
  apiClient: TwitchAPIClient;
  getStreamInfo: (channel: string) => Promise<StreamInfo | null>;
  getChannelInfo: (channel: string) => Promise<TwitchChannel>;
  getMultipleStreamsInfo: (channels: string[]) => Promise<StreamInfo[]>;
}

/**
 * Enhanced Twitch integration with reliability improvements
 */
export async function setupTwitchIntegration(): Promise<TwitchClient> {
  // Get configuration from environment
  const username = process.env.TWITCH_USERNAME || '';
  const token = process.env.TWITCH_OAUTH_TOKEN || '';
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  const channels = process.env.TWITCH_CHANNELS?.split(',').filter(Boolean) || [];
  
  if (!token) {
    throw new Error('Missing Twitch OAuth token. Please authenticate with Twitch first.');
  }

  if (!clientId) {
    throw new Error('Missing Twitch Client ID. Please set TWITCH_CLIENT_ID environment variable.');
  }

  // Ensure token has oauth: prefix
  const formattedToken = token.startsWith('oauth:') ? token : `oauth:${token}`;

  // Connection health tracking
  const connectionHealth: ConnectionHealth = {
    isConnected: false,
    reconnectAttempts: 0,
    connectionUptime: 0
  };

  // Exponential backoff configuration
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const MAX_RETRY_DELAY = 30000; // 30 seconds
  const MAX_RETRY_ATTEMPTS = 10;

  // Message queue for rate limiting
  const messageQueue: QueuedMessage[] = [];
  let isProcessingQueue = false;
  const RATE_LIMIT_DELAY = 500; // 500ms between messages (2 messages per second)
  const MAX_RETRY_COUNT = 3;

  // Create TMI client with enhanced options
  const client = new tmi.Client({
    options: { 
      debug: process.env.NODE_ENV === 'development',
      messagesLogLevel: 'info'
    },
    connection: {
      reconnect: false, // We'll handle reconnection manually
      secure: true,
      timeout: 180000,
      reconnectDecay: 1.5,
      reconnectInterval: 1000,
      maxReconnectAttempts: 0 // Disable built-in reconnection
    },
    identity: {
      username: username || 'justinfan12345',
      password: formattedToken
    },
    channels
  }) as TwitchClient;

  // Add chat message storage
  const messageBuffer = new Map<string, ChatMessage[]>();
  
  // Exponential backoff reconnection function
  const reconnectWithBackoff = async (attempt: number = 0): Promise<void> => {
    if (attempt >= MAX_RETRY_ATTEMPTS) {
      logger.error('Max reconnection attempts reached, giving up');
      connectionHealth.isConnected = false;
      return;
    }

    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      connectionHealth.reconnectAttempts = attempt + 1;
      connectionHealth.lastReconnectTime = new Date();
      
      await client.connect();
      logger.info('Successfully reconnected to Twitch');
      connectionHealth.isConnected = true;
      connectionHealth.reconnectAttempts = 0;
    } catch (error) {
      logger.error(`Reconnection attempt ${attempt + 1} failed`, { error });
      connectionHealth.isConnected = false;
      await reconnectWithBackoff(attempt + 1);
    }
  };

  // Connection health monitoring
  const startConnectionMonitoring = () => {
    const connectionStartTime = new Date();
    
    // Update connection uptime every 30 seconds
    const uptimeInterval = setInterval(() => {
      if (connectionHealth.isConnected) {
        connectionHealth.connectionUptime = new Date().getTime() - connectionStartTime.getTime();
      }
    }, 30000);

    // Ping monitoring every 60 seconds
    const pingInterval = setInterval(() => {
      if (connectionHealth.isConnected) {
        connectionHealth.lastPingTime = new Date();
        client.ping();
      }
    }, 60000);

    // Clean up intervals when client disconnects
    client.on('disconnected', () => {
      clearInterval(uptimeInterval);
      clearInterval(pingInterval);
    });
  };

  // Enhanced message queue processing with retry logic
  const processMessageQueue = async (): Promise<void> => {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (messageQueue.length > 0) {
      const queueItem = messageQueue.shift()!;
      
      try {
        if (!connectionHealth.isConnected) {
          throw new Error('Not connected to Twitch');
        }
        
        await client.say(queueItem.channel, queueItem.message);
        logger.debug(`Sent message to ${queueItem.channel}`, { 
          message: queueItem.message.substring(0, 50) + '...',
          queueLength: messageQueue.length 
        });
        queueItem.resolve();
        
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        
      } catch (error) {
        logger.error(`Failed to send message to ${queueItem.channel}`, { 
          error, 
          retryCount: queueItem.retryCount 
        });
        
        // Retry logic with exponential backoff
        if (queueItem.retryCount < MAX_RETRY_COUNT) {
          queueItem.retryCount++;
          const retryDelay = RATE_LIMIT_DELAY * Math.pow(2, queueItem.retryCount);
          
          logger.info(`Retrying message in ${retryDelay}ms (attempt ${queueItem.retryCount}/${MAX_RETRY_COUNT})`);
          
          setTimeout(() => {
            messageQueue.unshift(queueItem); // Add back to front of queue
          }, retryDelay);
        } else {
          queueItem.reject(new Error(`Failed to send message after ${MAX_RETRY_COUNT} attempts`));
        }
      }
    }
    
    isProcessingQueue = false;
  };

  // Connect to Twitch with enhanced error handling
  try {
    await client.connect();
    logger.info('Connected to Twitch', { channels });
    connectionHealth.isConnected = true;
    startConnectionMonitoring();

    // Enhanced event handlers
    client.on('connected', (addr, port) => {
      logger.info('Connected to Twitch IRC', { addr, port });
      connectionHealth.isConnected = true;
      connectionHealth.reconnectAttempts = 0;
    });

    client.on('disconnected', (reason) => {
      logger.warn('Disconnected from Twitch IRC', { reason });
      connectionHealth.isConnected = false;
      
      // Attempt reconnection with exponential backoff
      setTimeout(() => {
        reconnectWithBackoff();
      }, INITIAL_RETRY_DELAY);
    });

    client.on('reconnect', () => {
      logger.info('Attempting to reconnect to Twitch IRC');
    });

    client.on('pong', (latency) => {
      connectionHealth.lastPongTime = new Date();
      logger.debug('Received pong from Twitch', { latency });
    });

    // If we're using anonymous login but got a valid token, attempt to get username from Twitch
    if (!username && token) {
      try {
        // The tmi.js client will update its own username on successful auth
        // We should store it in the env var for persistence
        if (client.getUsername) {
          const connectedUsername = client.getUsername();
          if (connectedUsername && connectedUsername !== 'justinfan12345') {
            process.env.TWITCH_USERNAME = connectedUsername;
            logger.info(`Updated username from Twitch: ${connectedUsername}`);
          }
        }
      } catch (error) {
        logger.warn('Could not determine username from token', { error });
      }
    }

    // Enhanced message handler
    client.on('message', (channel, tags, message, self) => {
      if (self) return; // Ignore messages from the bot
      
      const chatMsg: ChatMessage = {
        channel: channel.replace('#', ''),
        username: tags['display-name'] || tags.username || 'Anonymous',
        message,
        timestamp: new Date()
      };
      
      // Store message in buffer for the channel
      const channelKey = channel.toLowerCase();
      if (!messageBuffer.has(channelKey)) {
        messageBuffer.set(channelKey, []);
      }
      
      messageBuffer.get(channelKey)?.push(chatMsg);
      
      // Keep buffer at a reasonable size (max 1000 messages per channel)
      const buffer = messageBuffer.get(channelKey) || [];
      if (buffer.length > 1000) {
        messageBuffer.set(channelKey, buffer.slice(buffer.length - 1000));
      }
    });
    
    // Add observe chat method
    client.observeChat = async (channel: string, duration: number = 60000): Promise<ChatMessage[]> => {
      const channelName = channel.startsWith('#') ? channel : `#${channel}`;
      const normalizedChannel = channelName.toLowerCase();
      
      // Check if already in this channel
      if (!client.getChannels().includes(normalizedChannel)) {
        try {
          await client.join(normalizedChannel);
          logger.info(`Joined channel: ${channel}`);
          
          // Initialize buffer for this channel
          if (!messageBuffer.has(normalizedChannel)) {
            messageBuffer.set(normalizedChannel, []);
          }
        } catch (error) {
          logger.error(`Failed to join channel: ${channel}`, { error });
          throw new Error(`Failed to join channel: ${channel}`);
        }
      }
      
      // Observe for the specified duration
      const startTime = new Date();
      const messages: ChatMessage[] = [];
      
      // Return promise that resolves after the duration
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = new Date().getTime() - startTime.getTime();
          
          // Get all messages since start time
          const channelBuffer = messageBuffer.get(normalizedChannel) || [];
          const newMessages = channelBuffer.filter(
            msg => msg.timestamp >= startTime && !messages.includes(msg)
          );
          
          // Add new messages to result
          messages.push(...newMessages);
          
          // Check if duration has elapsed
          if (elapsed >= duration) {
            clearInterval(checkInterval);
            resolve(messages);
          }
        }, 1000); // Check every second
      });
    };
    
    // Enhanced send chat message method with queue management
    client.sendChatMessage = async (channel: string, message: string): Promise<void> => {
      const channelName = channel.startsWith('#') ? channel : `#${channel}`;
      
      // Check if in this channel
      if (!client.getChannels().includes(channelName.toLowerCase())) {
        try {
          await client.join(channelName);
          logger.info(`Joined channel: ${channel}`);
        } catch (error) {
          logger.error(`Failed to join channel: ${channel}`, { error });
          throw new Error(`Failed to join channel: ${channel}`);
        }
      }
      
      // Add to queue and return promise
      return new Promise((resolve, reject) => {
        const queueItem: QueuedMessage = {
          channel: channelName,
          message,
          resolve,
          reject,
          timestamp: new Date(),
          retryCount: 0
        };
        
        messageQueue.push(queueItem);
        
        // Start processing if not already running
        if (!isProcessingQueue) {
          processMessageQueue();
        }
      });
    };

    // Connection health getter
    client.getConnectionHealth = (): ConnectionHealth => {
      return { ...connectionHealth };
    };

    // Queue status getter
    client.getQueueStatus = () => {
      return {
        pending: messageQueue.length,
        processing: isProcessingQueue
      };
    };

    // Initialize API client
    client.apiClient = new TwitchAPIClient(clientId, token);

    // Add API convenience methods
    client.getStreamInfo = async (channel: string): Promise<StreamInfo | null> => {
      return client.apiClient.getStreamInfo(channel);
    };

    client.getChannelInfo = async (channel: string): Promise<TwitchChannel> => {
      return client.apiClient.getChannelInfo(channel);
    };

    client.getMultipleStreamsInfo = async (channels: string[]): Promise<StreamInfo[]> => {
      return client.apiClient.getMultipleStreamsInfo(channels);
    };
    
    return client;
  } catch (error) {
    logger.error('Failed to connect to Twitch', { error });
    connectionHealth.isConnected = false;
    
    // Attempt reconnection after initial failure
    setTimeout(() => {
      reconnectWithBackoff();
    }, INITIAL_RETRY_DELAY);
    
    throw error;
  }
} 