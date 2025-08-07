import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TwitchAPIClient } from '../twitch/apiClient';
import { setupLogger } from '../utils/logger';
import { StreamInfo } from '../types/twitch';
import NodeCache from 'node-cache';
import { EventEmitter } from 'events';

const logger = setupLogger();

// Cache for stream data with TTL
const streamCache = new NodeCache({ 
  stdTTL: 30, // 30 seconds TTL for stream data
  checkperiod: 10, // Check for expired keys every 10 seconds
  useClones: false
});

// Event emitter for resource updates
const resourceEmitter = new EventEmitter();

// Active stream monitoring sessions
const activeMonitoringSessions = new Map<string, {
  channelName: string;
  intervalId: NodeJS.Timeout;
  lastUpdate: Date;
  subscribers: Set<string>;
  cleanupTimeout?: NodeJS.Timeout;
  errorCount?: number;
}>();

// Resource links for persistent access
const resourceLinks = new Map<string, {
  uri: string;
  channelName: string;
  createdAt: Date;
  lastAccessed: Date;
}>();

export interface StreamResourceData {
  isLive: boolean;
  viewerCount?: number | undefined;
  game?: string | undefined;
  title?: string | undefined;
  startedAt?: string | undefined;
  language?: string | undefined;
  thumbnailUrl?: string | undefined;
  lastUpdated: string;
  cacheHit: boolean;
}

export interface StreamMonitoringSession {
  sessionId: string;
  channelName: string;
  isActive: boolean;
  startedAt: Date;
  lastUpdate: Date;
  updateCount: number;
  subscribers: number;
}

/**
 * Setup MCP resources for stream information with streaming updates
 */
export function setupStreamResources(server: Server, twitchClient: TwitchAPIClient | null) {
  // Set the global client reference
  setTwitchClient(twitchClient);
  
  if (!twitchClient) {
    logger.warn('Twitch client not available, stream resources will be limited');
    return;
  }

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      {
        uri: "twitch://streams/live",
        name: "Live Streams Monitor",
        description: "Monitor multiple live streams with real-time updates",
        mimeType: "application/json"
      }
    ];

    // Add individual stream resources for active monitoring sessions
    for (const [sessionId, session] of activeMonitoringSessions) {
      resources.push({
        uri: `twitch://stream/${session.channelName}`,
        name: `Stream: ${session.channelName}`,
        description: `Real-time stream information for ${session.channelName}`,
        mimeType: "application/json"
      });
    }

    // Add persistent resource links
    for (const [linkId, link] of resourceLinks) {
      resources.push({
        uri: link.uri,
        name: `Persistent Stream Link: ${link.channelName}`,
        description: `Persistent access to stream data for ${link.channelName}`,
        mimeType: "application/json"
      });
    }

    return { resources };
  });

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    try {
      if (uri === "twitch://streams/live") {
        return await handleLiveStreamsResource();
      }
      
      if (uri.startsWith("twitch://stream/")) {
        const channelName = uri.replace("twitch://stream/", "");
        return await handleStreamResource(channelName, twitchClient);
      }
      
      if (uri.startsWith("twitch://stream-link/")) {
        const linkId = uri.replace("twitch://stream-link/", "");
        return await handlePersistentStreamLink(linkId, twitchClient);
      }
      
      throw new Error(`Unknown resource URI: ${uri}`);
    } catch (error) {
      logger.error(`Failed to read resource ${uri}`, { error });
      throw error;
    }
  });

  // Setup automatic cache warming and monitoring
  setupStreamMonitoring(twitchClient);
  
  logger.info('Stream resources initialized with caching and monitoring');
}

/**
 * Handle live streams resource - shows all active monitoring sessions
 */
async function handleLiveStreamsResource() {
  const sessions: StreamMonitoringSession[] = [];
  
  for (const [sessionId, session] of activeMonitoringSessions) {
    sessions.push({
      sessionId,
      channelName: session.channelName,
      isActive: true,
      startedAt: session.lastUpdate,
      lastUpdate: session.lastUpdate,
      updateCount: 0, // TODO: Track this
      subscribers: session.subscribers.size
    });
  }
  
  return {
    contents: [{
      uri: "twitch://streams/live",
      mimeType: "application/json",
      text: JSON.stringify({
        activeSessions: sessions,
        totalSessions: sessions.length,
        cacheStats: {
          keys: streamCache.keys().length,
          hits: streamCache.getStats().hits,
          misses: streamCache.getStats().misses
        },
        lastUpdated: new Date().toISOString()
      }, null, 2)
    }]
  };
}

/**
 * Handle individual stream resource with caching
 */
async function handleStreamResource(channelName: string, twitchClient: TwitchAPIClient): Promise<any> {
  const cacheKey = `stream:${channelName.toLowerCase()}`;
  
  // Try to get from cache first
  let streamData = streamCache.get<StreamResourceData>(cacheKey);
  let cacheHit = !!streamData;
  
  if (!streamData) {
    // Fetch fresh data from Twitch API with timeout protection
    try {
      // Add timeout to API call
      const apiCallPromise = twitchClient.getStreamInfo(channelName);
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout')), 8000);
      });
      
      const streamInfo = await Promise.race([apiCallPromise, timeoutPromise]);
      
      streamData = {
        isLive: streamInfo?.isLive || false,
        viewerCount: streamInfo?.viewerCount,
        game: streamInfo?.game,
        title: streamInfo?.title,
        startedAt: streamInfo?.startedAt?.toISOString(),
        language: streamInfo?.language,
        lastUpdated: new Date().toISOString(),
        cacheHit: false
      };
      
      // Cache the data
      streamCache.set(cacheKey, streamData);
      
      // Emit update event for subscribers
      resourceEmitter.emit('streamUpdate', {
        channelName,
        data: streamData,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error(`Failed to fetch stream data for ${channelName}`, { error });
      
      // Return error state
      streamData = {
        isLive: false,
        lastUpdated: new Date().toISOString(),
        cacheHit: false
      };
    }
  } else {
    streamData.cacheHit = true;
  }
  
  return {
    contents: [{
      uri: `twitch://stream/${channelName}`,
      mimeType: "application/json",
      text: JSON.stringify({
        channelName,
        ...streamData,
        resourceInfo: {
          cacheHit,
          hasActiveMonitoring: activeMonitoringSessions.has(channelName.toLowerCase()),
          lastCacheUpdate: streamCache.getTtl(cacheKey) ? new Date(Date.now() - (streamCache.getTtl(cacheKey) || 0)) : null
        }
      }, null, 2)
    }]
  };
}

/**
 * Handle persistent stream links
 */
async function handlePersistentStreamLink(linkId: string, twitchClient: TwitchAPIClient): Promise<any> {
  const link = resourceLinks.get(linkId);
  
  if (!link) {
    throw new Error(`Persistent link ${linkId} not found`);
  }
  
  // Update last accessed time
  link.lastAccessed = new Date();
  
  // Get stream data using the regular handler
  return await handleStreamResource(link.channelName, twitchClient);
}

// Store reference to twitchClient for monitoring
let globalTwitchClient: TwitchAPIClient | null = null;

/**
 * Set the global Twitch client reference for monitoring
 */
export function setTwitchClient(client: TwitchAPIClient | null) {
  globalTwitchClient = client;
}

/**
 * Start monitoring a stream with real-time updates
 */
export function startStreamMonitoring(channelName: string, updateIntervalMs: number = 30000): string {
  const sessionKey = channelName.toLowerCase();
  
  // Stop existing monitoring if any
  stopStreamMonitoring(channelName);
  
  // Add error handling and timeout protection
  const intervalId = setInterval(async () => {
    const session = activeMonitoringSessions.get(sessionKey);
    if (!session) {
      // Session was removed, clear this interval
      clearInterval(intervalId);
      return;
    }
    
    try {
      const cacheKey = `stream:${sessionKey}`;
      
      // Force refresh from API with timeout
      streamCache.del(cacheKey);
      
      // This will fetch fresh data and emit update events
      if (globalTwitchClient) {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Stream update timeout')), 10000);
        });
        
        await Promise.race([
          handleStreamResource(channelName, globalTwitchClient),
          timeoutPromise
        ]);
      }
      
      // Update session info
      session.lastUpdate = new Date();
      
    } catch (error) {
      logger.error(`Failed to update stream monitoring for ${channelName}`, { error });
      
      // If we have too many consecutive errors, stop monitoring
      const session = activeMonitoringSessions.get(sessionKey);
      if (session) {
        const errorCount = (session as any).errorCount || 0;
        (session as any).errorCount = errorCount + 1;
        
        if (errorCount > 5) {
          logger.warn(`Stopping monitoring for ${channelName} due to consecutive errors`);
          stopStreamMonitoring(channelName);
        }
      }
    }
  }, updateIntervalMs);
  
  // Set up interval cleanup after 24 hours to prevent infinite monitoring
  const maxMonitoringTime = 24 * 60 * 60 * 1000; // 24 hours
  const cleanupTimeout = setTimeout(() => {
    logger.info(`Auto-stopping monitoring for ${channelName} after 24 hours`);
    stopStreamMonitoring(channelName);
  }, maxMonitoringTime);
  
  const session = {
    channelName,
    intervalId,
    lastUpdate: new Date(),
    subscribers: new Set<string>(),
    cleanupTimeout,
    errorCount: 0
  };
  
  activeMonitoringSessions.set(sessionKey, session);
  
  logger.info(`Started stream monitoring for ${channelName}`, {
    updateInterval: updateIntervalMs,
    sessionKey,
    maxDuration: '24 hours'
  });
  
  return sessionKey;
}

/**
 * Stop monitoring a stream
 */
export function stopStreamMonitoring(channelName: string): boolean {
  const sessionKey = channelName.toLowerCase();
  const session = activeMonitoringSessions.get(sessionKey);
  
  if (session) {
    clearInterval(session.intervalId);
    
    // Clear cleanup timeout if it exists
    if (session.cleanupTimeout) {
      clearTimeout(session.cleanupTimeout);
    }
    
    activeMonitoringSessions.delete(sessionKey);
    
    logger.info(`Stopped stream monitoring for ${channelName}`);
    return true;
  }
  
  return false;
}

/**
 * Create a persistent resource link
 */
export function createPersistentStreamLink(channelName: string): string {
  const linkId = `${channelName.toLowerCase()}-${Date.now()}`;
  const link = {
    uri: `twitch://stream-link/${linkId}`,
    channelName,
    createdAt: new Date(),
    lastAccessed: new Date()
  };
  
  resourceLinks.set(linkId, link);
  
  logger.info(`Created persistent stream link for ${channelName}`, { linkId });
  
  return linkId;
}

// Store cleanup intervals for proper cleanup
const cleanupIntervals: NodeJS.Timeout[] = [];

/**
 * Setup automatic stream monitoring and cache management
 */
function setupStreamMonitoring(twitchClient: TwitchAPIClient) {
  // Clean up expired resource links every hour
  const linkCleanupInterval = setInterval(() => {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [linkId, link] of resourceLinks) {
      if (now.getTime() - link.lastAccessed.getTime() > maxAge) {
        resourceLinks.delete(linkId);
        logger.debug(`Cleaned up expired resource link ${linkId}`);
      }
    }
  }, 60 * 60 * 1000); // Every hour
  
  cleanupIntervals.push(linkCleanupInterval);
  
  // Log cache statistics and health check
  const statsInterval = setInterval(() => {
    const stats = streamCache.getStats();
    const activeSessions = activeMonitoringSessions.size;
    
    logger.debug('Stream monitoring health check', {
      cacheKeys: streamCache.keys().length,
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0,
      activeSessions,
      persistentLinks: resourceLinks.size
    });
    
    // Health check: if we have too many stale sessions, clean them up
    const now = new Date();
    const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours
    
    for (const [sessionKey, session] of activeMonitoringSessions) {
      if (now.getTime() - session.lastUpdate.getTime() > staleThreshold) {
        logger.warn(`Cleaning up stale monitoring session: ${sessionKey}`);
        stopStreamMonitoring(session.channelName);
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  cleanupIntervals.push(statsInterval);
  
  // Emergency cleanup interval - runs every hour to prevent resource leaks
  const emergencyCleanupInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    // If memory usage is high, force cleanup
    if (heapUsedMB > 500) { // 500MB threshold
      logger.warn('High memory usage detected, forcing cleanup', {
        heapUsedMB: Math.round(heapUsedMB),
        activeSessions: activeMonitoringSessions.size,
        cacheKeys: streamCache.keys().length
      });
      
      // Clear old cache entries
      streamCache.flushAll();
      
      // Stop sessions with high error counts
      for (const [sessionKey, session] of activeMonitoringSessions) {
        if ((session.errorCount || 0) > 3) {
          logger.info(`Stopping error-prone session: ${sessionKey}`);
          stopStreamMonitoring(session.channelName);
        }
      }
    }
  }, 60 * 60 * 1000); // Every hour
  
  cleanupIntervals.push(emergencyCleanupInterval);
}

/**
 * Get monitoring session status
 */
export function getMonitoringStatus(): {
  activeSessions: number;
  totalCacheKeys: number;
  persistentLinks: number;
  cacheStats: any;
} {
  return {
    activeSessions: activeMonitoringSessions.size,
    totalCacheKeys: streamCache.keys().length,
    persistentLinks: resourceLinks.size,
    cacheStats: streamCache.getStats()
  };
}

/**
 * Subscribe to stream updates
 */
export function subscribeToStreamUpdates(callback: (update: any) => void): () => void {
  resourceEmitter.on('streamUpdate', callback);
  
  return () => {
    resourceEmitter.off('streamUpdate', callback);
  };
}

/**
 * Clean up all resources and intervals (for testing)
 */
export function cleanup(): void {
  // Stop all monitoring sessions
  for (const [sessionKey] of activeMonitoringSessions) {
    stopStreamMonitoring(sessionKey);
  }
  
  // Clear cleanup intervals
  cleanupIntervals.forEach(interval => clearInterval(interval));
  cleanupIntervals.length = 0;
  
  // Clear all caches
  streamCache.flushAll();
  
  // Clear resource links
  resourceLinks.clear();
  
  // Remove all event listeners
  resourceEmitter.removeAllListeners();
}