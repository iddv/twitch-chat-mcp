import tmi from 'tmi.js';
import { setupLogger } from '../utils/logger';

const logger = setupLogger();

// Interface for storing chat messages
export interface ChatMessage {
  channel: string;
  username: string;
  message: string;
  timestamp: Date;
}

// Interface for the Twitch client with our additional methods
export interface TwitchClient extends tmi.Client {
  observeChat: (channel: string, duration: number) => Promise<ChatMessage[]>;
  sendChatMessage: (channel: string, message: string) => Promise<void>;
}

/**
 * Sets up the Twitch integration
 */
export async function setupTwitchIntegration(): Promise<TwitchClient> {
  // Get configuration from environment
  const username = process.env.TWITCH_USERNAME || '';
  const token = process.env.TWITCH_OAUTH_TOKEN || '';
  const channels = process.env.TWITCH_CHANNELS?.split(',') || [];
  
  if (!username || !token) {
    throw new Error('Missing Twitch credentials. Please set TWITCH_USERNAME and TWITCH_OAUTH_TOKEN.');
  }

  // Create TMI client
  const client = new tmi.Client({
    options: { debug: process.env.NODE_ENV === 'development' },
    identity: {
      username,
      password: token
    },
    channels
  }) as TwitchClient;

  // Add chat message storage
  const messageBuffer = new Map<string, ChatMessage[]>();
  
  // Connect to Twitch
  try {
    await client.connect();
    logger.info('Connected to Twitch', { channels });

    // Listen for messages
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
    
    // Add send message method with rate limiting
    const messageQueue: {channel: string, message: string, resolve: () => void, reject: (err: Error) => void}[] = [];
    let processing = false;
    
    // Rate limited message sender
    const processQueue = async () => {
      if (processing || messageQueue.length === 0) return;
      
      processing = true;
      const { channel, message, resolve, reject } = messageQueue.shift()!;
      
      try {
        await client.say(channel, message);
        logger.debug(`Sent message to ${channel}`);
        resolve();
      } catch (error) {
        logger.error(`Failed to send message to ${channel}`, { error });
        reject(new Error(`Failed to send message to ${channel}`));
      }
      
      processing = false;
      
      // Add delay for rate limiting (default: 2 messages per second)
      setTimeout(() => {
        processQueue();
      }, 500);
    };
    
    // Process the queue every 500ms
    setInterval(processQueue, 500);
    
    // Add send chat message method
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
        messageQueue.push({ channel: channelName, message, resolve, reject });
        processQueue();
      });
    };
    
    return client;
  } catch (error) {
    logger.error('Failed to connect to Twitch', { error });
    throw error;
  }
} 