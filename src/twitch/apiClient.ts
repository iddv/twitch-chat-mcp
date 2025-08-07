import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { setupLogger } from '../utils/logger';
import { StreamInfo, TwitchUser, TwitchChannel } from '../types/twitch';

const logger = setupLogger();

// Rate limiting configuration
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfter?: number;
}

// Request queue item
interface QueuedRequest {
  url: string;
  config: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  retryCount: number;
}

// Stream data from Twitch API
interface TwitchStreamData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
  is_mature: boolean;
}

// Channel data from Twitch API
interface TwitchChannelData {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  delay: number;
}

// Follower data from Twitch API
interface TwitchFollowerData {
  total: number;
  data: Array<{
    from_id: string;
    from_login: string;
    from_name: string;
    to_id: string;
    to_login: string;
    to_name: string;
    followed_at: string;
  }>;
}

// Subscriber data from Twitch API
interface TwitchSubscriberData {
  total: number;
  points: number;
  data: Array<{
    broadcaster_id: string;
    broadcaster_login: string;
    broadcaster_name: string;
    gifter_id: string;
    gifter_login: string;
    gifter_name: string;
    is_gift: boolean;
    tier: string;
    plan_name: string;
    user_id: string;
    user_name: string;
    user_login: string;
  }>;
}

export class TwitchAPIClient {
  private axiosInstance: AxiosInstance;
  private clientId: string;
  private accessToken: string;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private rateLimitConfig: RateLimitConfig;
  private requestTimestamps: Date[] = [];

  constructor(clientId: string, accessToken: string) {
    this.clientId = clientId;
    this.accessToken = accessToken.replace('oauth:', '');
    
    // Twitch API rate limits: 800 requests per minute
    this.rateLimitConfig = {
      maxRequests: 800,
      windowMs: 60000, // 1 minute
    };

    this.axiosInstance = axios.create({
      baseURL: 'https://api.twitch.tv/helix',
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Add response interceptor for rate limit handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
          this.rateLimitConfig.retryAfter = retryAfter * 1000; // Convert to milliseconds
          logger.warn('Rate limit exceeded', { retryAfter });
        }
        return Promise.reject(error);
      }
    );

    this.startQueueProcessor();
  }

  /**
   * Check if we're within rate limits
   */
  private isWithinRateLimit(): boolean {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.rateLimitConfig.windowMs);
    
    // Remove old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => timestamp > windowStart
    );
    
    return this.requestTimestamps.length < this.rateLimitConfig.maxRequests;
  }

  /**
   * Add request to queue for rate limiting
   */
  private async queueRequest<T>(url: string, config: any = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const queueItem: QueuedRequest = {
        url,
        config,
        resolve,
        reject,
        timestamp: new Date(),
        retryCount: 0
      };
      
      this.requestQueue.push(queueItem);
      
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      // Check rate limits
      if (!this.isWithinRateLimit()) {
        const delay = this.rateLimitConfig.retryAfter || 1000;
        logger.debug(`Rate limit reached, waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      const queueItem = this.requestQueue.shift()!;
      
      try {
        this.requestTimestamps.push(new Date());
        const response = await this.axiosInstance.get(queueItem.url, queueItem.config);
        queueItem.resolve(response.data);
        
        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error: any) {
        logger.error(`API request failed: ${queueItem.url}`, { 
          error: error.message,
          status: error.response?.status,
          retryCount: queueItem.retryCount 
        });
        
        // Retry logic for certain errors
        if (this.shouldRetry(error) && queueItem.retryCount < 3) {
          queueItem.retryCount++;
          const retryDelay = Math.pow(2, queueItem.retryCount) * 1000; // Exponential backoff
          
          logger.info(`Retrying request in ${retryDelay}ms (attempt ${queueItem.retryCount}/3)`);
          
          setTimeout(() => {
            this.requestQueue.unshift(queueItem);
          }, retryDelay);
        } else {
          queueItem.reject(error);
        }
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    // Process queue every 100ms
    setInterval(() => {
      if (!this.isProcessingQueue && this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, 100);
  }

  /**
   * Determine if a request should be retried
   */
  private shouldRetry(error: any): boolean {
    if (!error.response) return true; // Network errors
    
    const status = error.response.status;
    return status === 429 || status >= 500; // Rate limits and server errors
  }

  /**
   * Get stream information for a channel
   */
  async getStreamInfo(channelName: string): Promise<StreamInfo | null> {
    try {
      const response = await this.queueRequest<{ data: TwitchStreamData[] }>(
        `/streams?user_login=${encodeURIComponent(channelName)}`
      );
      
      if (response.data.length === 0) {
        return {
          channelName,
          isLive: false
        };
      }
      
      const stream = response.data[0];
      if (!stream) {
        return {
          channelName,
          isLive: false
        };
      }
      
      return {
        channelName: stream.user_login,
        isLive: true,
        title: stream.title,
        game: stream.game_name,
        viewerCount: stream.viewer_count,
        startedAt: new Date(stream.started_at),
        language: stream.language
      };
      
    } catch (error) {
      logger.error(`Failed to get stream info for ${channelName}`, { error });
      throw new Error(`Failed to get stream information for ${channelName}`);
    }
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelName: string): Promise<TwitchChannel> {
    try {
      // First get user ID
      const userResponse = await this.queueRequest<{ data: TwitchUser[] }>(
        `/users?login=${encodeURIComponent(channelName)}`
      );
      
      if (userResponse.data.length === 0) {
        throw new Error(`Channel ${channelName} not found`);
      }
      
      const user = userResponse.data[0];
      if (!user) {
        throw new Error(`Channel ${channelName} not found`);
      }
      
      // Get channel information
      const channelResponse = await this.queueRequest<{ data: TwitchChannelData[] }>(
        `/channels?broadcaster_id=${user.id}`
      );
      
      if (channelResponse.data.length === 0) {
        throw new Error(`Channel information not found for ${channelName}`);
      }
      
      const channel = channelResponse.data[0];
      
      return {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        type: user.type,
        broadcasterType: user.broadcasterType,
        description: user.description,
        profileImageUrl: user.profileImageUrl,
        offlineImageUrl: user.offlineImageUrl,
        viewCount: user.viewCount,
        createdAt: user.createdAt
      };
      
    } catch (error) {
      logger.error(`Failed to get channel info for ${channelName}`, { error });
      throw new Error(`Failed to get channel information for ${channelName}`);
    }
  }

  /**
   * Get recent followers for a channel
   */
  async getRecentFollowers(channelName: string, count: number = 20): Promise<TwitchFollowerData> {
    try {
      // First get user ID
      const userResponse = await this.queueRequest<{ data: TwitchUser[] }>(
        `/users?login=${encodeURIComponent(channelName)}`
      );
      
      if (userResponse.data.length === 0) {
        throw new Error(`Channel ${channelName} not found`);
      }
      
      const user = userResponse.data[0];
      if (!user) {
        throw new Error(`Channel ${channelName} not found`);
      }
      const userId = user.id;
      
      // Get followers (requires appropriate scope)
      const followersResponse = await this.queueRequest<TwitchFollowerData>(
        `/channels/followers?broadcaster_id=${userId}&first=${Math.min(count, 100)}`
      );
      
      return followersResponse;
      
    } catch (error) {
      logger.error(`Failed to get followers for ${channelName}`, { error });
      throw new Error(`Failed to get followers for ${channelName}`);
    }
  }

  /**
   * Get subscriber information for a channel
   */
  async getSubscriberInfo(channelName: string): Promise<TwitchSubscriberData> {
    try {
      // First get user ID
      const userResponse = await this.queueRequest<{ data: TwitchUser[] }>(
        `/users?login=${encodeURIComponent(channelName)}`
      );
      
      if (userResponse.data.length === 0) {
        throw new Error(`Channel ${channelName} not found`);
      }
      
      const user = userResponse.data[0];
      if (!user) {
        throw new Error(`Channel ${channelName} not found`);
      }
      const userId = user.id;
      
      // Get subscriber information (requires appropriate scope)
      const subscribersResponse = await this.queueRequest<TwitchSubscriberData>(
        `/subscriptions?broadcaster_id=${userId}&first=100`
      );
      
      return subscribersResponse;
      
    } catch (error) {
      logger.error(`Failed to get subscriber info for ${channelName}`, { error });
      throw new Error(`Failed to get subscriber information for ${channelName}`);
    }
  }

  /**
   * Get multiple streams information
   */
  async getMultipleStreamsInfo(channelNames: string[]): Promise<StreamInfo[]> {
    try {
      if (channelNames.length === 0) return [];
      
      // Twitch API allows up to 100 channels per request
      const chunks = [];
      for (let i = 0; i < channelNames.length; i += 100) {
        chunks.push(channelNames.slice(i, i + 100));
      }
      
      const results: StreamInfo[] = [];
      
      for (const chunk of chunks) {
        const userLogins = chunk.map(name => `user_login=${encodeURIComponent(name)}`).join('&');
        const response = await this.queueRequest<{ data: TwitchStreamData[] }>(
          `/streams?${userLogins}`
        );
        
        // Create map of live streams
        const liveStreams = new Map<string, TwitchStreamData>();
        response.data.forEach(stream => {
          liveStreams.set(stream.user_login.toLowerCase(), stream);
        });
        
        // Create results for all requested channels
        for (const channelName of chunk) {
          const stream = liveStreams.get(channelName.toLowerCase());
          
          if (stream) {
            results.push({
              channelName: stream.user_login,
              isLive: true,
              title: stream.title,
              game: stream.game_name,
              viewerCount: stream.viewer_count,
              startedAt: new Date(stream.started_at),
              language: stream.language
            });
          } else {
            results.push({
              channelName,
              isLive: false
            });
          }
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Failed to get multiple streams info', { error, channelNames });
      throw new Error('Failed to get multiple streams information');
    }
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus() {
    return {
      pending: this.requestQueue.length,
      processing: this.isProcessingQueue,
      recentRequests: this.requestTimestamps.length,
      rateLimitWindow: this.rateLimitConfig.windowMs,
      maxRequests: this.rateLimitConfig.maxRequests
    };
  }

  /**
   * Update access token
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken.replace('oauth:', '');
    this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
    logger.info('Updated Twitch API access token');
  }
}